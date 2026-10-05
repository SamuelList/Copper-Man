import { createBoss, sendBossBackToPatrol, updateBoss, type BossState } from '../ai/bossBrain';
import type { NavContext } from '../ai/navigation';
import { createStudent, updateStudent, type StudentState } from '../ai/studentBrain';
import { ABILITIES } from '../content/abilities';
import { BALANCE, TILE_SIZE } from '../content/balance';
import { CHARACTERS } from '../content/characters';
import { FIXTURES } from '../content/fixtures';
import { emptyContents, METAL_IDS } from '../content/metals';
import { NPCS } from '../content/npcs';
import { Emitter } from '../events/emitter';
import { roomAt } from '../level/asciiLevel';
import { tileCenter, worldToTile } from '../level/grid';
import type { LevelDef } from '../level/types';
import type {
  AbilityDef,
  Bag,
  BagContents,
  CharacterDef,
  EffectiveStats,
  SuspicionSignal,
  Vec2,
} from '../model/types';
import { addToBag, bagFree, bagTotal, createBag, emptyBag } from '../systems/bag';
import { saleValue } from '../systems/economy';
import { bossSpeedMult, escalationLevel } from '../systems/escalation';
import { moveWithCollision } from '../systems/movement';
import { rollRecharge, rollYield, scrapDuration } from '../systems/scrapping';
import { deriveStats } from '../systems/stats';
import { canSee, type ViewCone } from '../systems/vision';
import { addWarning, recoverHeart } from '../systems/warnings';
import { deg, dist, round2 } from '../util/math';
import { createRng, type Rng } from '../util/rng';
import { LevelGrid } from './levelGrid';
import type {
  CoworkerState,
  DoorState,
  FixtureState,
  InteractionTarget,
  PlayerInput,
  PlayerState,
  ShiftConfig,
  ShiftEndReason,
  ShiftEvents,
  ShiftSnapshot,
  ShiftStatus,
  ShiftSummary,
} from './types';

interface ActiveInteraction {
  target: InteractionTarget;
  elapsed: number;
}

const P = BALANCE.player;
const V = BALANCE.npc.vision;

/**
 * Authoritative simulation of one work shift. Pure TypeScript: the renderer feeds it input and
 * delta time, reads its state to draw, and listens to `events` for things that happened.
 */
export class ShiftSession {
  readonly events = new Emitter<ShiftEvents>();
  readonly level: LevelDef;
  readonly grid: LevelGrid;
  readonly character: CharacterDef;
  readonly ability: AbilityDef | null;
  readonly stats: EffectiveStats;
  readonly day: number;
  readonly duration: number;

  readonly player: PlayerState;
  readonly boss: BossState;
  readonly students: StudentState[];
  readonly fixtures: FixtureState[];
  readonly doors: DoorState[];
  readonly coworker: CoworkerState;
  readonly vanPositions: Vec2[];

  status: ShiftStatus = 'running';
  elapsed = 0;
  warnings: number;
  bag: Bag;
  interaction: ActiveInteraction | null = null;
  /** Interact must be released between completed actions (prevents accidental chains). */
  private interactLatched = false;
  private focus: InteractionTarget | null = null;
  private suspicion = { carrying: false, scrapping: false };
  private escalation = 0;
  private summary: ShiftSummary | null = null;
  private readonly rng: Rng;
  private readonly bossNav: NavContext;
  private readonly studentNav: NavContext;
  private tally = {
    earned: 0,
    unitsSold: 0,
    soldByMetal: emptyContents(),
    unitsCollected: 0,
    timesCaught: 0,
    coworkerFound: false,
    maxEscalation: 0,
  };

  constructor(config: ShiftConfig) {
    this.level = config.level;
    this.day = config.day;
    this.warnings = config.warnings;
    this.duration = config.durationSeconds ?? BALANCE.shift.durationSeconds;
    this.rng = createRng(config.seed);
    this.grid = new LevelGrid(config.level, TILE_SIZE);
    this.character = CHARACTERS.get(config.characterId);
    this.ability = this.character.abilityId ? ABILITIES.get(this.character.abilityId) : null;
    this.stats = deriveStats(this.character, config.ownedUpgrades);
    this.bag = createBag(this.stats.bagCapacity);

    const nav = { cols: this.grid.cols, rows: this.grid.rows, tileSize: TILE_SIZE };
    this.bossNav = { ...nav, passable: this.grid.bossPassable };
    this.studentNav = { ...nav, passable: this.grid.studentPassable };

    const spawn = this.level.playerSpawn;
    this.player = {
      pos: tileCenter(TILE_SIZE, spawn.col, spawn.row),
      facing: 0,
      moving: false,
      sprinting: false,
      stamina: this.stats.staminaSeconds,
      staminaDelay: 0,
      grace: 0,
      abilityActive: 0,
      abilityCooldown: 0,
    };
    this.boss = createBoss(this.level.bossRoute, TILE_SIZE);
    this.students = this.level.studentSpawns.map((s, i) => {
      const room = roomAt(this.level, s.col, s.row);
      const area = room?.rect ?? { col: s.col - 2, row: s.row - 2, w: 5, h: 5 };
      return createStudent(`student-${i}`, s, area, TILE_SIZE, this.rng);
    });
    this.fixtures = this.level.fixtures.map((f) => ({
      id: f.id,
      def: FIXTURES.get(f.defId),
      tile: f.tile,
      pos: tileCenter(TILE_SIZE, f.tile.col, f.tile.row),
      rechargeLeft: 0,
      rechargeTotal: 0,
    }));
    this.doors = this.level.doors.map((d) => ({ id: d.id, tile: d.tile, locked: d.locked }));
    const spot = this.rng.pick(this.level.coworkerSpots);
    this.coworker = { tile: spot, pos: tileCenter(TILE_SIZE, spot.col, spot.row), found: false };
    this.vanPositions = this.level.vanTiles.map((t) => tileCenter(TILE_SIZE, t.col, t.row));
  }

  get timeLeft() {
    return Math.max(0, this.duration - this.elapsed);
  }

  /** Is the player currently giving NPCs a reason to look twice? */
  get isSuspicious() {
    return this.suspicion.carrying || this.suspicion.scrapping;
  }

  get currentTarget(): InteractionTarget | null {
    return this.focus;
  }

  // ---------------------------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------------------------

  tick(dt: number, input: PlayerInput): void {
    if (this.status !== 'running' || dt <= 0) return;
    // Clamp huge frames (tab switches) so nothing tunnels or skips a state.
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;

    this.updateAbility(dt, input);
    this.updatePlayerMovement(dt, input);
    this.updateInteraction(dt, input);
    this.updateFixtures(dt);
    this.updateSuspicion();
    const alert = this.updateStudents(dt);
    this.updateBoss(dt, alert);
    if (this.status !== 'running') return;
    this.updateEscalation();

    if (this.elapsed >= this.duration) this.end('time');
  }

  /** Leave early. Unsold scrap is lost, earnings are kept. */
  clockOut(): void {
    if (this.status === 'running') this.end('clockOut');
  }

  private updateAbility(dt: number, input: PlayerInput) {
    const p = this.player;
    const ability = this.ability;
    if (!ability || ability.kind !== 'active') return;
    const wasCooling = p.abilityCooldown > 0;
    p.abilityActive = Math.max(0, p.abilityActive - dt);
    p.abilityCooldown = Math.max(0, p.abilityCooldown - dt);
    if (wasCooling && p.abilityCooldown === 0)
      this.events.emit('ability:ready', { abilityId: ability.id });
    if (input.ability && p.abilityCooldown === 0) {
      p.abilityActive = ability.durationSeconds;
      p.abilityCooldown = ability.durationSeconds + ability.cooldownSeconds;
      this.events.emit('ability:activated', { abilityId: ability.id });
    }
  }

  private updatePlayerMovement(dt: number, input: PlayerInput) {
    const p = this.player;
    p.grace = Math.max(0, p.grace - dt);
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    p.moving = len > 0.1;
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    p.sprinting = p.moving && input.sprint && p.stamina > 0;
    if (p.sprinting) {
      p.stamina = Math.max(0, p.stamina - dt);
      p.staminaDelay = P.staminaRegenDelay;
    } else if (p.staminaDelay > 0) {
      p.staminaDelay = Math.max(0, p.staminaDelay - dt);
    } else {
      p.stamina = Math.min(this.stats.staminaSeconds, p.stamina + P.staminaRegenPerSecond * dt);
    }

    if (!p.moving) return;
    p.facing = Math.atan2(my, mx);
    const speed = p.sprinting ? this.stats.sprintSpeed : this.stats.walkSpeed;
    p.pos = moveWithCollision(this.grid, p.pos, P.radius, mx * speed * dt, my * speed * dt);
  }

  // ---------------------------------------------------------------------------------------------
  // Interaction (hold to scrap / unlock / deposit / wake)
  // ---------------------------------------------------------------------------------------------

  private findTarget(): InteractionTarget | null {
    const candidates: InteractionTarget[] = [];
    const pos = this.player.pos;
    const near = (target: Vec2) => dist(pos, target) <= P.reach;

    for (const f of this.fixtures) {
      if (!near(f.pos)) continue;
      const ready = f.rechargeLeft <= 0;
      const room = bagFree(this.bag) > 0;
      candidates.push({
        kind: 'fixture',
        id: f.id,
        label: f.def.name,
        verb: 'Scrap',
        duration: scrapDuration(this.character, f.def, this.stats.scrapRateMult),
        enabled: ready && room,
        reason: !ready
          ? `Recharging (${Math.ceil(f.rechargeLeft)}s)`
          : !room
            ? 'Bag is full'
            : undefined,
        pos: f.pos,
      });
    }
    for (const d of this.doors) {
      if (!d.locked) continue;
      const doorPos = tileCenter(TILE_SIZE, d.tile.col, d.tile.row);
      if (!near(doorPos)) continue;
      candidates.push({
        kind: 'door',
        id: d.id,
        label: 'Locked Door',
        verb: 'Unlock',
        duration: this.stats.unlockSeconds,
        enabled: true,
        pos: doorPos,
      });
    }
    const vanPos = this.vanPositions.find(near);
    if (vanPos) {
      const hasScrap = bagTotal(this.bag) > 0;
      candidates.push({
        kind: 'van',
        id: 'van',
        label: 'Van',
        verb: 'Sell scrap',
        duration: BALANCE.van.depositSeconds,
        enabled: hasScrap,
        reason: hasScrap ? undefined : 'Bag is empty',
        pos: vanPos,
      });
    }
    if (!this.coworker.found && near(this.coworker.pos)) {
      const hurt = this.warnings > 0;
      candidates.push({
        kind: 'coworker',
        id: 'coworker',
        label: 'Sleepy Coworker',
        verb: 'Check on',
        duration: BALANCE.coworker.wakeSeconds,
        enabled: hurt,
        reason: hurt ? undefined : 'Snoring peacefully (full hearts)',
        pos: this.coworker.pos,
      });
    }

    candidates.sort(
      (a, b) => Number(b.enabled) - Number(a.enabled) || dist(pos, a.pos) - dist(pos, b.pos),
    );
    return candidates[0] ?? null;
  }

  private updateInteraction(dt: number, input: PlayerInput) {
    this.focus = this.findTarget();
    if (!input.interact) this.interactLatched = false;

    const cancel = !input.interact || this.player.moving || !this.focus?.enabled;
    if (cancel) {
      this.interaction = null;
      return;
    }
    const target = this.focus!;
    if (this.interactLatched) return;
    if (!this.interaction || this.interaction.target.id !== target.id) {
      this.interaction = { target, elapsed: 0 };
    }
    this.interaction.target = target;
    this.interaction.elapsed += dt;
    if (this.interaction.elapsed >= target.duration) {
      this.interaction = null;
      this.interactLatched = true;
      this.complete(target);
      this.focus = this.findTarget();
    }
  }

  private complete(target: InteractionTarget) {
    switch (target.kind) {
      case 'fixture':
        return this.completeScrap(target.id);
      case 'door':
        return this.unlockDoor(target.id, 'player');
      case 'van':
        return this.sellScrap();
      case 'coworker':
        return this.wakeCoworker();
    }
  }

  private completeScrap(fixtureId: string) {
    const f = this.fixtures.find((x) => x.id === fixtureId);
    if (!f) return;
    const amount = rollYield(f.def, this.rng);
    const result = addToBag(this.bag, f.def.metal, amount);
    this.bag = result.bag;
    this.tally.unitsCollected = round2(this.tally.unitsCollected + result.added);
    f.rechargeTotal = rollRecharge(f.def, this.rng);
    f.rechargeLeft = f.rechargeTotal;
    this.events.emit('scrap:collected', {
      fixtureId: f.id,
      fixtureName: f.def.name,
      metal: f.def.metal,
      amount: result.added,
      overflow: result.overflow,
    });
  }

  private unlockDoor(doorId: string, by: 'player' | 'boss') {
    const door = this.doors.find((d) => d.id === doorId);
    if (!door || !door.locked) return;
    door.locked = false;
    this.grid.unlock(door.tile.col, door.tile.row);
    this.events.emit('door:unlocked', { doorId, by });
  }

  private sellScrap() {
    const contents: BagContents = { ...this.bag.contents };
    const units = bagTotal(this.bag);
    if (units <= 0) return;
    const value = saleValue(contents);
    this.bag = emptyBag(this.bag);
    const s = this.tally;
    s.earned += value;
    s.unitsSold = round2(s.unitsSold + units);
    for (const m of METAL_IDS) s.soldByMetal[m] = round2(s.soldByMetal[m] + contents[m]);
    this.events.emit('scrap:sold', { units, value, contents });
  }

  private wakeCoworker() {
    if (this.coworker.found) return;
    this.coworker.found = true;
    this.tally.coworkerFound = true;
    this.warnings = recoverHeart(this.warnings);
    this.events.emit('coworker:found', { warnings: this.warnings });
  }

  private updateFixtures(dt: number) {
    for (const f of this.fixtures) {
      if (f.rechargeLeft <= 0) continue;
      f.rechargeLeft = Math.max(0, f.rechargeLeft - dt);
      if (f.rechargeLeft === 0) this.events.emit('fixture:recharged', { fixtureId: f.id });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Stealth
  // ---------------------------------------------------------------------------------------------

  private conceals(signal: SuspicionSignal) {
    return this.ability?.conceals(signal, this.player.abilityActive > 0) ?? false;
  }

  private updateSuspicion() {
    const graced = this.player.grace > 0;
    this.suspicion = {
      carrying: !graced && bagTotal(this.bag) > 0 && !this.conceals('carrying'),
      scrapping:
        !graced && this.interaction?.target.kind === 'fixture' && !this.conceals('scrapping'),
    };
  }

  bossCone(): ViewCone {
    const lvl = NPCS.boss.awareness;
    return {
      pos: this.boss.pos,
      facing: this.boss.facing,
      fov: deg(V.fovDegrees[lvl]),
      range: V.range[lvl],
    };
  }

  studentCone(s: StudentState): ViewCone {
    const lvl = NPCS.student.awareness;
    return { pos: s.pos, facing: s.facing, fov: deg(V.fovDegrees[lvl]), range: V.range[lvl] };
  }

  private updateStudents(dt: number): Vec2 | null {
    let alert: Vec2 | null = null;
    const lvl = NPCS.student.awareness;
    const tuning = {
      walkSpeed: BALANCE.npc.walkSpeed[NPCS.student.speed],
      range: V.range[lvl],
      fillRate: V.fillRate[lvl],
    };
    for (const s of this.students) {
      // Students snitch on scrapping, not on someone walking by with a bag.
      const sees =
        this.suspicion.scrapping && canSee(this.grid, this.studentCone(s), this.player.pos);
      const shouted = updateStudent(s, {
        dt,
        nav: this.studentNav,
        sees,
        playerPos: this.player.pos,
        rng: this.rng,
        tuning,
      });
      if (shouted) {
        alert = { ...this.player.pos };
        this.events.emit('student:alert', { studentId: s.id, pos: alert });
      }
    }
    return alert;
  }

  private updateBoss(dt: number, alert: Vec2 | null) {
    const lvl = NPCS.boss.awareness;
    const sees = this.isSuspicious && canSee(this.grid, this.bossCone(), this.player.pos);
    const result = updateBoss(this.boss, {
      dt,
      nav: this.bossNav,
      route: this.level.bossRoute,
      sees,
      playerPos: this.player.pos,
      alert,
      speedMult: bossSpeedMult(this.escalationInput()),
      tuning: {
        walkSpeed: BALANCE.npc.walkSpeed[NPCS.boss.speed],
        range: V.range[lvl],
        fillRate: V.fillRate[lvl],
      },
    });
    if (result.modeChanged) {
      this.events.emit('boss:mode', { mode: this.boss.mode, previous: result.previousMode });
    }

    // The boss has keys: walking through a locked door opens it.
    const bt = worldToTile(TILE_SIZE, this.boss.pos.x, this.boss.pos.y);
    if (this.grid.isLocked(bt.col, bt.row)) {
      const door = this.doors.find((d) => d.tile.col === bt.col && d.tile.row === bt.row);
      if (door) this.unlockDoor(door.id, 'boss');
    }

    if (result.caught && this.player.grace <= 0) this.handleCaught();
  }

  private handleCaught() {
    const p = this.player;
    this.interaction = null;
    // Recompute ignoring grace — evidence is what matters at the moment of the catch.
    const evidence =
      (bagTotal(this.bag) > 0 && !this.conceals('carrying')) || this.suspicion.scrapping;
    if (!evidence) {
      // "Only sees PC if they are carrying scrap": empty-handed workers get waved off.
      sendBossBackToPatrol(this.boss);
      p.grace = 1.5;
      this.events.emit('player:excused', {});
      return;
    }
    const confiscated = bagTotal(this.bag);
    this.bag = emptyBag(this.bag);
    const { warnings, fired } = addWarning(this.warnings);
    this.warnings = warnings;
    this.tally.timesCaught++;
    sendBossBackToPatrol(this.boss);
    this.events.emit('player:caught', { warnings, fired, confiscated });
    if (fired) {
      this.end('fired');
      return;
    }
    // Escorted back to the van.
    const spawn = this.level.playerSpawn;
    p.pos = tileCenter(TILE_SIZE, spawn.col, spawn.row);
    p.grace = P.caughtGraceSeconds;
  }

  private escalationInput() {
    return {
      timeFraction: this.elapsed / this.duration,
      securedUnits: this.tally.unitsSold,
      day: this.day,
    };
  }

  private updateEscalation() {
    const level = escalationLevel(this.escalationInput());
    if (level > this.escalation) {
      this.escalation = level;
      this.tally.maxEscalation = level;
      this.events.emit('boss:escalated', { level });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // End + snapshots
  // ---------------------------------------------------------------------------------------------

  private end(reason: ShiftEndReason) {
    this.status = 'ended';
    this.interaction = null;
    const s = this.tally;
    this.summary = {
      day: this.day,
      endedBy: reason,
      fired: reason === 'fired',
      warnings: this.warnings,
      earned: s.earned,
      unitsSold: s.unitsSold,
      soldByMetal: { ...s.soldByMetal },
      unitsCollected: s.unitsCollected,
      unitsLost: bagTotal(this.bag),
      timesCaught: s.timesCaught,
      coworkerFound: s.coworkerFound,
      maxEscalation: s.maxEscalation,
    };
    this.events.emit('shift:ended', this.summary);
  }

  getSummary(): ShiftSummary | null {
    return this.summary;
  }

  /** Highest detection level among NPCs currently interested in the player. */
  private detectionLevel(): number {
    const bossLevel = this.boss.mode === 'chase' ? 1 : this.boss.detection;
    return Math.max(bossLevel, ...this.students.map((s) => s.detection));
  }

  getSnapshot(): ShiftSnapshot {
    const p = this.player;
    const tile = worldToTile(TILE_SIZE, p.pos.x, p.pos.y);
    const focus = this.focus;
    const ability = this.ability;
    return {
      status: this.status,
      day: this.day,
      timeLeft: this.timeLeft,
      duration: this.duration,
      warnings: this.warnings,
      maxWarnings: BALANCE.warnings.max,
      earned: this.tally.earned,
      bag: { capacity: this.bag.capacity, contents: { ...this.bag.contents } },
      roomName: roomAt(this.level, tile.col, tile.row)?.name ?? 'Doorway',
      prompt: focus
        ? {
            kind: focus.kind,
            label: focus.label,
            verb: focus.verb,
            enabled: focus.enabled,
            reason: focus.reason,
            progress:
              this.interaction && this.interaction.target.id === focus.id
                ? Math.min(1, this.interaction.elapsed / focus.duration)
                : 0,
          }
        : null,
      stamina: p.stamina,
      staminaMax: this.stats.staminaSeconds,
      ability: ability
        ? {
            id: ability.id,
            name: ability.name,
            kind: ability.kind,
            active: p.abilityActive,
            duration: ability.durationSeconds,
            cooldown: p.abilityCooldown,
            cooldownMax: ability.durationSeconds + ability.cooldownSeconds,
          }
        : null,
      bossMode: this.boss.mode,
      detection: this.detectionLevel(),
      escalation: this.escalation,
      suspicious: this.isSuspicious,
      grace: p.grace,
    };
  }
}
