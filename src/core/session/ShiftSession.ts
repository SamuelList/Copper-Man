import {
  createBoss,
  sendBossBackToPatrol,
  updateBoss,
  type BossState,
  type GuardSpot,
  type PatrolPoint,
  type Stimulus,
} from '../ai/bossBrain';
import type { NavContext } from '../ai/navigation';
import {
  createStudent,
  isAwake,
  rollPersonality,
  updateStudent,
  type StudentState,
} from '../ai/studentBrain';
import {
  createCustodian,
  isMopping,
  updateCustodian,
  type CleaningJob,
  type CustodianState,
  type Sighting,
} from '../ai/custodianBrain';
import { createTeacher, updateTeacher, type TeacherState } from '../ai/teacherBrain';
import { ABILITIES } from '../content/abilities';
import { BALANCE, TILE_SIZE } from '../content/balance';
import { CHARACTERS } from '../content/characters';
import { CONSUMABLES } from '../content/consumables';
import { FIXTURES } from '../content/fixtures';
import { emptyContents, METAL_IDS } from '../content/metals';
import { CUSTODIAN, NPCS, TEACHERS } from '../content/npcs';
import { Emitter } from '../events/emitter';
import { lightAt, roomAt } from '../level/asciiLevel';
import { boxCenter, distanceToBox, tileBox, tileCenter, worldToTile } from '../level/grid';
import type { LevelDef } from '../level/types';
import type {
  AbilityDef,
  Bag,
  Box,
  BagContents,
  CharacterDef,
  EffectiveStats,
  SuspicionSignal,
  TilePos,
  Vec2,
} from '../model/types';
import { addToBag, bagFree, bagTotal, createBag, emptyBag } from '../systems/bag';
import { saleValue } from '../systems/economy';
import { bossSpeedMult, escalationLevel } from '../systems/escalation';
import { steerMove, type Detour } from '../systems/movement';
import {
  rollRecharge,
  rollScrapOutcome,
  rollYield,
  scrapDuration,
  scrapEfficiency,
} from '../systems/scrapping';
import { deriveStats } from '../systems/stats';
import { detectionRate, effectiveRange } from '../systems/detection';
import { ExploredMap, tilesInView } from '../systems/exploration';
import { unmetRequirement } from '../systems/requirements';
import {
  castRay,
  hasLineOfSight,
  inCone,
  visibilityOutline,
  type ViewCone,
} from '../systems/vision';
import { addWarning, recoverHeart } from '../systems/warnings';
import { angleTo, deg, dist, round2 } from '../util/math';
import { createRng, type Rng } from '../util/rng';
import { LevelGrid } from './levelGrid';
import { cleaningJobs, guardSpots, hideSpots, patrolPoints, teacherPosts } from './npcPlaces';
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
  XpLine,
} from './types';

interface ActiveInteraction {
  target: InteractionTarget;
  elapsed: number;
}

const P = BALANCE.player;
const V = BALANCE.npc.vision;
const B = BALANCE.boss;
const TCH = BALANCE.teacher;
const CUST = BALANCE.custodian;

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
  readonly teachers: TeacherState[];
  /** The head custodian (null on levels without a custodian's closet). */
  readonly custodian: CustodianState | null;
  /** Freshly mopped floor: tile index → seconds until dry. Walking on it squeaks. */
  readonly wet = new Map<number, number>();
  readonly fixtures: FixtureState[];
  readonly doors: DoorState[];
  readonly coworker: CoworkerState;
  /** Hitbox of each van tile (interaction reach is measured from these). */
  readonly vanBoxes: Box[];
  /** Every tile ever seen on this level (unexplored tiles render pitch black). */
  readonly explored: ExploredMap;
  /** Career level, for technical fixtures. */
  readonly workerLevel: number;

  status: ShiftStatus = 'running';
  elapsed = 0;
  warnings: number;
  bag: Bag;
  interaction: ActiveInteraction | null = null;
  /** Interact must be released between completed actions (prevents accidental chains). */
  private interactLatched = false;
  /** In-progress sidestep around an object (see steerMove). */
  private detour: Detour | null = null;
  private focus: InteractionTarget | null = null;
  private suspicion = { carrying: false, scrapping: false };
  private escalation = 0;
  private summary: ShiftSummary | null = null;
  private readonly rng: Rng;
  private readonly bossNav: NavContext;
  private readonly studentNav: NavContext;
  /** Gadgets on hand this shift. */
  readonly inventory: Record<string, number>;
  /** A noise (whoopee cushion) for the boss to investigate next tick. */
  private pendingNoise: Vec2 | null = null;
  /** Catches left this shift that end in a talking-to (Smooth Talker). */
  private forgiveness: number;
  private readonly patrol: PatrolPoint[];
  private readonly guards: GuardSpot[];
  private readonly hides: TilePos[];
  private readonly discoveredRooms = new Set<string>();
  private readonly newRooms: string[] = [];
  private exploreTimer = 0;
  private evidenceTimer = 0;
  private hearCooldown = 0;
  private readonly teacherNav: NavContext;
  private readonly jobs: CleaningJob[];
  private custodianLook = 0;
  private custodianSight: Sighting | null = null;
  private wetTimer = 0;
  private squeakCooldown = 0;
  private tally = {
    earned: 0,
    unitsSold: 0,
    soldByMetal: emptyContents(),
    unitsCollected: 0,
    timesCaught: 0,
    coworkerFound: false,
    maxEscalation: 0,
    xp: [] as XpLine[],
  };

  constructor(config: ShiftConfig) {
    this.level = config.level;
    this.day = config.day;
    this.warnings = config.warnings;
    this.rng = createRng(config.seed);
    this.grid = new LevelGrid(config.level, TILE_SIZE);
    this.character = CHARACTERS.get(config.characterId);
    this.ability = this.character.abilityId ? ABILITIES.get(this.character.abilityId) : null;
    this.stats = deriveStats(this.character, config.ownedUpgrades, config.skills ?? []);
    this.duration = config.durationSeconds ?? this.stats.shiftSeconds;
    this.forgiveness = this.stats.catchForgiveness;
    this.inventory = { ...(config.inventory ?? {}) };
    this.bag = createBag(this.stats.bagCapacity);

    this.workerLevel = config.workerLevel ?? 1;
    const nav = { cols: this.grid.cols, rows: this.grid.rows, tileSize: TILE_SIZE };
    this.bossNav = { ...nav, passable: this.grid.bossPassable };
    this.studentNav = { ...nav, passable: this.grid.studentPassable };
    // Teachers have keys too.
    this.teacherNav = { ...nav, passable: this.grid.bossPassable };
    this.patrol = patrolPoints(this.level);
    this.guards = guardSpots(this.level);
    this.hides = hideSpots(this.level);
    this.explored = new ExploredMap(this.level.cols, this.level.rows, config.explored);
    for (const room of this.level.rooms) {
      const { col, row, w, h } = room.rect;
      let seen = false;
      for (let r = row; r < row + h && !seen; r++) {
        for (let c = col; c < col + w && !seen; c++) seen = this.explored.has(c, r);
      }
      if (seen) this.discoveredRooms.add(room.id);
    }

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
      boost: 0,
      vel: { x: 0, y: 0 },
    };
    this.boss = createBoss(
      this.level.bossRoute[0] ?? this.patrol[0]?.tile ?? spawn,
      this.patrol.length,
      TILE_SIZE,
      this.rng,
    );
    this.students = this.level.studentSpawns.map((s, i) => {
      const room = roomAt(this.level, s.col, s.row);
      const area = room?.rect ?? { col: s.col - 2, row: s.row - 2, w: 5, h: 5 };
      return createStudent(`student-${i}`, s, area, TILE_SIZE, this.rng, rollPersonality(this.rng));
    });
    this.jobs = cleaningJobs(this.level);
    const closet = this.level.custodianSpawn;
    this.custodian = closet ? createCustodian(closet, this.jobs.length, TILE_SIZE, this.rng) : null;
    this.teachers = this.level.teacherSpawns.map((spawnTile, i) => {
      const def = TEACHERS.all[i % TEACHERS.all.length]!;
      const posts = teacherPosts(this.level, spawnTile);
      return createTeacher(
        `teacher-${i}`,
        def,
        posts.front,
        posts.hall,
        posts.lounge,
        TILE_SIZE,
        this.rng,
      );
    });
    this.fixtures = this.level.fixtures.map((f) => {
      const box = this.grid.objectBoxes.get(f.id)!;
      return {
        id: f.id,
        def: FIXTURES.get(f.defId),
        tile: f.tile,
        box,
        pos: boxCenter(box),
        rechargeLeft: 0,
        rechargeTotal: 0,
        noticed: false,
      };
    });
    this.doors = this.level.doors.map((d) => ({
      id: d.id,
      tile: d.tile,
      locked: d.locked,
      security: d.security === true,
    }));
    const spot = this.rng.pick(this.level.coworkerSpots);
    const spotCenter = tileCenter(TILE_SIZE, spot.col, spot.row);
    const half = TILE_SIZE * 0.4;
    this.coworker = {
      tile: spot,
      pos: spotCenter,
      box: {
        minX: spotCenter.x - half,
        maxX: spotCenter.x + half,
        minY: spotCenter.y - half,
        maxY: spotCenter.y + half,
      },
      found: false,
    };
    this.vanBoxes = this.level.vanTiles.map((t) => tileBox(TILE_SIZE, t.col, t.row));
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

  /** Light level (0 dark..1 lit) where the player is standing. */
  get playerLight(): number {
    const t = worldToTile(TILE_SIZE, this.player.pos.x, this.player.pos.y);
    return lightAt(this.level, t.col, t.row);
  }

  /** Fog of war: can the worker see this point from where they stand? */
  isVisibleToPlayer(pos: Vec2): boolean {
    return (
      dist(this.player.pos, pos) <= P.sightRange && hasLineOfSight(this.grid, this.player.pos, pos)
    );
  }

  /** Out of sight but close enough to hear (footsteps). Radios extend the range. */
  canHear(pos: Vec2): boolean {
    return dist(this.player.pos, pos) <= this.stats.hearingRange;
  }

  get maxWarnings() {
    return this.stats.maxWarnings;
  }

  get xpEarned() {
    return this.tally.xp.reduce((sum, l) => sum + l.amount, 0);
  }

  /** Award XP. Lines with the same label are merged so the summary stays short. */
  private gainXp(amount: number, label: string) {
    const rounded = Math.round(amount);
    if (rounded <= 0) return;
    const line = this.tally.xp.find((l) => l.label === label);
    if (line) line.amount += rounded;
    else this.tally.xp.push({ label, amount: rounded });
    this.events.emit('xp:gained', { amount: rounded, reason: label });
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
    if (input.use) this.useGadget(input.use);
    this.updatePlayerMovement(dt, input);
    this.updateInteraction(dt, input);
    this.updateFixtures(dt);
    this.updateSuspicion();
    this.updateExploration(dt);
    const students = this.updateStudents(dt);
    const report =
      this.updateTeachers(dt, students.tips) ?? this.updateCustodian(dt) ?? students.report;
    this.updateWetFloors(dt);
    this.updateBoss(dt, report);
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

  // ---------------------------------------------------------------------------------------------
  // Gadgets
  // ---------------------------------------------------------------------------------------------

  private useGadget(id: string) {
    if ((this.inventory[id] ?? 0) <= 0 || !CONSUMABLES.has(id)) return;
    const p = this.player;
    switch (id) {
      case 'energy-drink':
        p.stamina = this.stats.staminaSeconds;
        p.boost = BALANCE.gadgets.energyDrinkSeconds;
        break;
      case 'whoopee-cushion': {
        // Lands up to a few tiles ahead, stopping short of walls.
        const range = BALANCE.gadgets.throwRange;
        const d = Math.max(0, castRay(this.grid, p.pos, p.facing, range) - TILE_SIZE * 0.4);
        this.pendingNoise = {
          x: p.pos.x + Math.cos(p.facing) * d,
          y: p.pos.y + Math.sin(p.facing) * d,
        };
        this.events.emit('noise:made', { pos: { ...this.pendingNoise } });
        break;
      }
      case 'bolt-cutters': {
        const target = this.focus;
        if (target?.kind !== 'door') {
          this.events.emit('gadget:failed', { id, reason: 'Stand next to a locked door first' });
          return;
        }
        this.unlockDoor(target.id, 'player');
        break;
      }
      default:
        return;
    }
    this.inventory[id] = (this.inventory[id] ?? 0) - 1;
    this.events.emit('gadget:used', { id, pos: { ...p.pos } });
  }

  private updatePlayerMovement(dt: number, input: PlayerInput) {
    const p = this.player;
    p.grace = Math.max(0, p.grace - dt);
    p.boost = Math.max(0, p.boost - dt);
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
      // Energy drinks make sprinting free while they last.
      if (p.boost <= 0) p.stamina = Math.max(0, p.stamina - dt);
      p.staminaDelay = P.staminaRegenDelay;
    } else if (p.staminaDelay > 0) {
      p.staminaDelay = Math.max(0, p.staminaDelay - dt);
    } else {
      p.stamina = Math.min(
        this.stats.staminaSeconds,
        p.stamina + P.staminaRegenPerSecond * this.stats.staminaRegenMult * dt,
      );
    }

    if (!p.moving) {
      this.detour = null;
      p.vel = { x: 0, y: 0 };
      return;
    }
    const speed = p.sprinting ? this.stats.sprintSpeed : this.stats.walkSpeed;
    const before = p.pos;
    const moved = steerMove(
      this.grid,
      p.pos,
      P.radius,
      mx * speed * dt,
      my * speed * dt,
      this.detour,
    );
    p.pos = moved.pos;
    this.detour = moved.detour;
    // Face where you actually went (sliding along a wall turns you to run along it).
    const mdx = p.pos.x - before.x;
    const mdy = p.pos.y - before.y;
    p.vel = { x: mdx / dt, y: mdy / dt };
    p.facing = Math.hypot(mdx, mdy) > speed * dt * 0.2 ? Math.atan2(mdy, mdx) : Math.atan2(my, mx);
  }

  // ---------------------------------------------------------------------------------------------
  // Interaction (hold to scrap / unlock / deposit / wake)
  // ---------------------------------------------------------------------------------------------

  private findTarget(): InteractionTarget | null {
    const candidates: InteractionTarget[] = [];
    const pos = this.player.pos;
    // Reach is measured from the object's edge, so big and small things feel the same.
    const near = (box: Box) => distanceToBox(box, pos.x, pos.y) <= P.reach;

    for (const f of this.fixtures) {
      if (!near(f.box)) continue;
      const ready = f.rechargeLeft <= 0;
      const room = bagFree(this.bag) > 0;
      const unmet = unmetRequirement(f.def.requires, {
        level: this.workerLevel,
        gearTiers: this.stats.gearTiers,
      });
      candidates.push({
        kind: 'fixture',
        id: f.id,
        label: f.def.name,
        verb: 'Scrap',
        duration: scrapDuration(this.character, f.def, this.stats.scrapRateMult),
        enabled: ready && room && !unmet,
        reason:
          unmet ??
          (!ready
            ? `Recharging (${Math.ceil(f.rechargeLeft)}s)`
            : !room
              ? 'Bag is full'
              : undefined),
        pos: f.pos,
      });
    }
    for (const d of this.doors) {
      if (!d.locked) continue;
      const doorBox = tileBox(TILE_SIZE, d.tile.col, d.tile.row);
      if (!near(doorBox)) continue;
      const doorPos = boxCenter(doorBox);
      const unmet = d.security
        ? unmetRequirement(
            { gear: { keys: 2 } },
            { level: this.workerLevel, gearTiers: this.stats.gearTiers },
          )
        : null;
      candidates.push({
        kind: 'door',
        id: d.id,
        label: d.security ? 'Security Door' : 'Locked Door',
        verb: 'Unlock',
        duration: this.stats.unlockSeconds,
        enabled: !unmet,
        reason: unmet ? `${unmet} (or bolt cutters)` : undefined,
        pos: doorPos,
      });
    }
    const vanBox = this.vanBoxes.find(near);
    if (vanBox) {
      const hasScrap = bagTotal(this.bag) > 0;
      candidates.push({
        kind: 'van',
        id: 'van',
        label: 'Van',
        verb: 'Sell scrap',
        duration: BALANCE.van.depositSeconds,
        enabled: hasScrap,
        reason: hasScrap ? undefined : 'Bag is empty',
        pos: boxCenter(vanBox),
      });
    }
    if (!this.coworker.found && near(this.coworker.box)) {
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
    // Turn to face whatever you're working on.
    if (dist(this.player.pos, target.pos) > 1)
      this.player.facing = angleTo(this.player.pos, target.pos);
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
    // How well the job went: tools, skills and know-how make clean pulls and bonus finds likelier.
    const outcome = rollScrapOutcome(
      scrapEfficiency(this.character, f.def, this.stats),
      this.stats,
      this.rng,
    );
    const amount = round2(rollYield(f.def, this.rng) * outcome.fraction);
    const result = addToBag(this.bag, f.def.metal, amount);
    this.bag = result.bag;
    this.tally.unitsCollected = round2(this.tally.unitsCollected + result.added);
    f.rechargeTotal = rollRecharge(f.def, this.rng) * this.stats.rechargeMult;
    f.rechargeLeft = f.rechargeTotal;
    this.events.emit('scrap:collected', {
      fixtureId: f.id,
      fixtureName: f.def.name,
      metal: f.def.metal,
      amount: result.added,
      overflow: result.overflow,
      quality: outcome.quality,
      fraction: outcome.fraction,
    });
    this.gainXp(BALANCE.xp.perScrap, 'Scrapping');
  }

  private unlockDoor(doorId: string, by: 'player' | 'boss') {
    const door = this.doors.find((d) => d.id === doorId);
    if (!door || !door.locked) return;
    door.locked = false;
    this.grid.unlock(door.tile.col, door.tile.row);
    this.events.emit('door:unlocked', { doorId, by });
    if (by === 'player') this.gainXp(BALANCE.xp.perDoor, 'Locked doors');
  }

  private sellScrap() {
    const contents: BagContents = { ...this.bag.contents };
    const units = bagTotal(this.bag);
    if (units <= 0) return;
    const value = saleValue(contents, this.stats.saleMult);
    this.bag = emptyBag(this.bag);
    const s = this.tally;
    s.earned += value;
    s.unitsSold = round2(s.unitsSold + units);
    for (const m of METAL_IDS) s.soldByMetal[m] = round2(s.soldByMetal[m] + contents[m]);
    this.events.emit('scrap:sold', { units, value, contents });
    this.gainXp(value * BALANCE.xp.perDollar, 'Sales');
  }

  private wakeCoworker() {
    if (this.coworker.found) return;
    this.coworker.found = true;
    this.tally.coworkerFound = true;
    this.warnings = recoverHeart(this.warnings);
    this.events.emit('coworker:found', { warnings: this.warnings });
    this.gainXp(BALANCE.xp.coworker, 'Woke your coworker');
  }

  private updateFixtures(dt: number) {
    for (const f of this.fixtures) {
      if (f.rechargeLeft <= 0) continue;
      f.rechargeLeft = Math.max(0, f.rechargeLeft - dt);
      if (f.rechargeLeft === 0) {
        f.noticed = false;
        this.custodian?.known.delete(f.id);
        this.events.emit('fixture:recharged', { fixtureId: f.id });
      }
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

  /**
   * How quickly this observer is filling its detection meter on the player right now
   * (0 when the player isn't in view). Accounts for range, cone, walls and tall furniture, the
   * near/far zones, and how dark it is where the player stands.
   */
  private perceive(
    cone: ViewCone,
    fillRate: number,
    signals: { carrying: boolean; scrapping: boolean },
  ): { sees: boolean; rate: number } {
    const st = this.stats;
    // Night Owl etc.: darkness counts for more.
    const raw = this.playerLight;
    const light = Math.max(0, raw - st.darkBonus * (1 - raw));
    const range = effectiveRange(cone.range, light);
    const target = this.player.pos;
    const distance = dist(cone.pos, target);
    const sees =
      distance <= range &&
      inCone({ ...cone, range }, target) &&
      hasLineOfSight(this.grid, cone.pos, target);
    if (!sees) return { sees, rate: 0 };
    // Gear and skills that make what you're doing less noticeable; the most visible signal wins.
    const signalMult = Math.max(
      signals.carrying ? st.carryNoticeMult : 0,
      signals.scrapping ? st.scrapNoticeMult : 0,
    );
    const base = detectionRate({ distance, range, fillRate, light });
    return { sees, rate: base * st.noticeMult * signalMult };
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

  /** A student's view, shaped by their personality. Asleep: they see nothing. */
  studentCone(s: StudentState): ViewCone {
    const lvl = NPCS.student.awareness;
    const sight = s.personality.sight;
    return {
      pos: s.pos,
      facing: s.facing,
      fov: deg(V.fovDegrees[lvl] * sight.fovMult),
      range: isAwake(s) ? V.range[lvl] * sight.rangeMult : 0,
    };
  }

  teacherCone(t: TeacherState): ViewCone {
    return { pos: t.pos, facing: t.facing, fov: deg(TCH.fovDegrees), range: TCH.visionRange };
  }

  roomIdAt(pos: Vec2): string | null {
    const t = worldToTile(TILE_SIZE, pos.x, pos.y);
    return roomAt(this.level, t.col, t.row)?.id ?? null;
  }

  // ---------------------------------------------------------------------------------------------
  // Exploration
  // ---------------------------------------------------------------------------------------------

  /** Add what the worker can see to the remembered map; first sight of a room earns XP. */
  private updateExploration(dt: number) {
    this.exploreTimer -= dt;
    if (this.exploreTimer > 0) return;
    this.exploreTimer = BALANCE.explore.sampleSeconds;
    const outline = visibilityOutline(
      this.grid,
      this.grid.sightCorners,
      this.player.pos,
      P.sightRange,
    );
    for (const t of tilesInView(outline, this.grid)) {
      if (!this.explored.mark(t.col, t.row)) continue;
      const room = roomAt(this.level, t.col, t.row);
      if (!room || this.discoveredRooms.has(room.id)) continue;
      this.discoveredRooms.add(room.id);
      if (room.kind === 'exterior') continue;
      this.newRooms.push(room.name);
      this.events.emit('room:discovered', { roomId: room.id, name: room.name });
      this.gainXp(BALANCE.xp.newRoom, 'Exploring');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // NPCs
  // ---------------------------------------------------------------------------------------------

  /**
   * Students watch for scrapping (some also for a full bag). A snitch becomes a report for the
   * boss; a teacher's pet also tips off nearby teachers.
   */
  private updateStudents(dt: number): { report: Stimulus | null; tips: Vec2[] } {
    let report: Stimulus | null = null;
    const tips: Vec2[] = [];
    const baseFill = V.fillRate[NPCS.student.awareness];
    const tuning = { walkSpeed: BALANCE.npc.walkSpeed[NPCS.student.speed] };
    for (const s of this.students) {
      const p = s.personality;
      const watching =
        this.suspicion.scrapping || (p.snitchesOnCarrying && this.suspicion.carrying);
      const seen = watching
        ? this.perceive(this.studentCone(s), baseFill * p.sight.fillMult, {
            carrying: p.snitchesOnCarrying && this.suspicion.carrying,
            scrapping: this.suspicion.scrapping,
          })
        : { sees: false, rate: 0 };
      const outcome = updateStudent(s, {
        dt,
        nav: this.studentNav,
        sees: seen.sees,
        rate: seen.rate,
        decay: V.decayRate * this.stats.decayMult,
        playerPos: this.player.pos,
        rng: this.rng,
        tuning,
      });
      if (outcome === 'snitch') {
        const pos = { ...this.player.pos };
        report = { kind: 'report', pos };
        if (p.tellsTeachers) tips.push(pos);
        this.events.emit('student:alert', { studentId: s.id, personality: p.name, pos });
      } else if (outcome === 'laugh') {
        this.events.emit('student:laughed', { studentId: s.id, personality: p.name });
      }
    }
    return { report, tips };
  }

  /** Teachers notice scrapping and carrying; when sure, they radio Mr. Gravy. */
  private updateTeachers(dt: number, tips: Vec2[]): Stimulus | null {
    let report: Stimulus | null = null;
    const reach = TCH.petReachTiles * TILE_SIZE;
    for (const t of this.teachers) {
      const seen = this.isSuspicious
        ? this.perceive(this.teacherCone(t), TCH.fillRate * t.def.strictness, this.suspicion)
        : { sees: false, rate: 0 };
      const tip = tips.find((pos) => dist(pos, t.pos) <= reach) ?? null;
      const outcome = updateTeacher(t, {
        dt,
        nav: this.teacherNav,
        rng: this.rng,
        sees: seen.sees,
        rate: seen.rate,
        decay: V.decayRate * this.stats.decayMult,
        playerPos: this.player.pos,
        tip,
      });
      if (outcome === 'report') {
        const pos = { ...this.player.pos };
        report = { kind: 'report', pos };
        this.events.emit('teacher:report', { teacherId: t.id, name: t.def.name, pos });
      }
    }
    return report;
  }

  custodianCone(c: CustodianState): ViewCone {
    return { pos: c.pos, facing: c.facing, fov: deg(CUST.fovDegrees), range: CUST.visionRange };
  }

  /**
   * The head custodian works his schedule. He notices someone scrapping, and stripped
   * fixtures; when he calls one in, Mr. Gravy gets a report.
   */
  private updateCustodian(dt: number): Stimulus | null {
    const c = this.custodian;
    if (!c) return null;
    const seen = this.suspicion.scrapping
      ? this.perceive(this.custodianCone(c), CUST.fillRate, { carrying: false, scrapping: true })
      : { sees: false, rate: 0 };
    const event = updateCustodian(c, {
      dt,
      nav: this.teacherNav,
      rng: this.rng,
      jobs: this.jobs,
      home: this.level.custodianSpawn!,
      sees: seen.sees,
      rate: seen.rate,
      decay: V.decayRate * this.stats.decayMult,
      playerPos: this.player.pos,
      spotted: this.custodianSpots(c, dt),
    });
    if (!event) return null;
    const fixtureName = this.fixtures.find((f) => f.id === event.fixtureId)?.def.name ?? 'fixture';
    switch (event.kind) {
      case 'inspecting':
        this.events.emit('custodian:inspecting', { fixtureName, pos: { ...c.pos } });
        return null;
      case 'shrug':
        this.events.emit('custodian:shrug', { fixtureName, pos: { ...c.pos } });
        return null;
      case 'report':
        this.events.emit('custodian:report', {
          name: CUSTODIAN.name,
          about: event.about,
          fixtureName: event.about === 'fixture' ? fixtureName : undefined,
          pos: { ...event.pos },
        });
        return { kind: 'report', pos: event.pos };
    }
  }

  /** A stripped fixture in the custodian's view that he hasn't looked at yet (sampled). */
  private custodianSpots(c: CustodianState, dt: number): Sighting | null {
    this.custodianLook -= dt;
    if (this.custodianLook > 0) return this.custodianSight;
    this.custodianLook = 0.25;
    this.custodianSight = null;
    const cone = this.custodianCone(c);
    const range = CUST.spotTiles * TILE_SIZE;
    for (const f of this.fixtures) {
      if (f.rechargeLeft <= 0 || c.known.has(f.id)) continue;
      if (dist(cone.pos, f.pos) > range || !inCone({ ...cone, range }, f.pos)) continue;
      if (!hasLineOfSight(this.grid, cone.pos, f.pos)) continue;
      this.custodianSight = {
        id: f.id,
        pos: { ...f.pos },
        fresh: f.rechargeLeft / f.rechargeTotal >= CUST.freshFraction,
      };
      break;
    }
    return this.custodianSight;
  }

  /**
   * Mopping leaves wet floor behind the custodian; it dries after a while. Walking on it
   * (unless you're creeping) squeaks, and Mr. Gravy hears that if he's close.
   */
  private updateWetFloors(dt: number) {
    for (const [k, left] of this.wet) {
      if (left <= dt) this.wet.delete(k);
      else this.wet.set(k, left - dt);
    }
    const c = this.custodian;
    this.wetTimer -= dt;
    if (c && isMopping(c) && this.wetTimer <= 0) {
      this.wetTimer = CUST.wetEverySeconds;
      const t = worldToTile(TILE_SIZE, c.pos.x, c.pos.y);
      const k = t.row * this.level.cols + t.col;
      this.wet.delete(k);
      this.wet.set(k, CUST.wetSeconds);
      // Oldest patch dries first if there's too much.
      if (this.wet.size > CUST.maxWetTiles) this.wet.delete(this.wet.keys().next().value!);
    }

    this.squeakCooldown = Math.max(0, this.squeakCooldown - dt);
    const p = this.player;
    if (!p.moving || this.squeakCooldown > 0) return;
    const t = worldToTile(TILE_SIZE, p.pos.x, p.pos.y);
    if (!this.wet.has(t.row * this.level.cols + t.col)) return;
    this.squeakCooldown = CUST.squeakCooldownSeconds;
    this.events.emit('player:squeak', { pos: { ...p.pos } });
    const through = hasLineOfSight(this.grid, this.boss.pos, p.pos) ? 1 : 0.5;
    if (
      dist(this.boss.pos, p.pos) <=
      CUST.squeakTiles * TILE_SIZE * through * this.stats.noiseMult
    ) {
      this.pendingNoise = { ...p.pos };
    }
  }

  /** Is this tile freshly mopped? */
  isWet(col: number, row: number) {
    return this.wet.has(row * this.level.cols + col);
  }

  /** Sprinting is loud: he hears it nearby (less through walls). */
  private heardSprint(dt: number): Stimulus | null {
    this.hearCooldown = Math.max(0, this.hearCooldown - dt);
    const p = this.player;
    if (!p.sprinting || this.hearCooldown > 0) return null;
    const through = hasLineOfSight(this.grid, this.boss.pos, p.pos) ? 1 : 0.5;
    const range =
      B.hearSprintTiles * TILE_SIZE * through * this.stats.noticeMult * this.stats.noiseMult;
    if (dist(this.boss.pos, p.pos) > range) return null;
    this.hearCooldown = B.hearCooldownSeconds;
    return { kind: 'noise', pos: { ...p.pos } };
  }

  /** On his rounds he notices fixtures that have been stripped. */
  private spotEvidence(dt: number): { stimulus: Stimulus; name: string } | null {
    this.evidenceTimer -= dt;
    if (this.evidenceTimer > 0) return null;
    this.evidenceTimer = 0.25;
    const mode = this.boss.mode;
    if (mode !== 'patrol' && mode !== 'inspect' && mode !== 'guard' && mode !== 'search') {
      return null;
    }
    const cone = this.bossCone();
    const range = cone.range * B.evidenceRangeMult;
    for (const f of this.fixtures) {
      if (f.rechargeLeft <= 0 || f.noticed) continue;
      if (dist(cone.pos, f.pos) > range) continue;
      if (!inCone({ ...cone, range }, f.pos) || !hasLineOfSight(this.grid, cone.pos, f.pos))
        continue;
      f.noticed = true;
      return { stimulus: { kind: 'evidence', pos: { ...f.pos } }, name: f.def.name };
    }
    return null;
  }

  private updateBoss(dt: number, report: Stimulus | null) {
    const seen = this.isSuspicious
      ? this.perceive(this.bossCone(), V.fillRate[NPCS.boss.awareness], this.suspicion)
      : { sees: false, rate: 0 };
    // Strongest stimulus wins: a report, then something he found, then a noise.
    const evidence = this.spotEvidence(dt);
    const noise = this.pendingNoise ? { kind: 'noise' as const, pos: this.pendingNoise } : null;
    this.pendingNoise = null;
    const stimulus = report ?? evidence?.stimulus ?? noise ?? this.heardSprint(dt);
    const result = updateBoss(this.boss, {
      dt,
      now: this.elapsed,
      nav: this.bossNav,
      rng: this.rng,
      points: this.patrol,
      guardSpots: this.guards,
      hideSpots: this.hides,
      roomAt: (pos) => this.roomIdAt(pos),
      sees: seen.sees,
      rate: seen.rate,
      playerPos: this.player.pos,
      playerVel: this.player.vel,
      stimulus,
      decay: V.decayRate * this.stats.decayMult,
      speedMult: bossSpeedMult(this.escalationInput()),
      tuning: { walkSpeed: BALANCE.npc.walkSpeed[NPCS.boss.speed] },
    });
    if (result.modeChanged) {
      this.events.emit('boss:mode', { mode: this.boss.mode, previous: result.previousMode });
    }
    if (result.remark) {
      this.events.emit('boss:remark', {
        remark: result.remark,
        pos: { ...this.boss.pos },
        detail: result.remark === 'evidence' ? evidence?.name : undefined,
      });
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
    sendBossBackToPatrol(this.boss);
    if (this.forgiveness > 0) {
      // Smooth Talker: the scrap is gone, but the warning isn't written up.
      this.forgiveness--;
      this.events.emit('player:talkedOut', { confiscated });
    } else {
      const { warnings, fired } = addWarning(this.warnings, this.stats.maxWarnings);
      this.warnings = warnings;
      this.tally.timesCaught++;
      this.events.emit('player:caught', { warnings, fired, confiscated });
      if (fired) {
        this.end('fired');
        return;
      }
    }
    // Escorted back to the van.
    const spawn = this.level.playerSpawn;
    p.pos = tileCenter(TILE_SIZE, spawn.col, spawn.row);
    p.grace = P.caughtGraceSeconds;
    this.detour = null;
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
    if (reason !== 'fired') {
      this.gainXp(BALANCE.xp.shiftComplete, 'Finished the shift');
      if (s.timesCaught === 0) this.gainXp(BALANCE.xp.cleanShift, 'Never caught');
    }
    this.summary = {
      levelId: this.level.id,
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
      xp: s.xp.map((l) => ({ ...l })),
      xpTotal: this.xpEarned,
      inventory: { ...this.inventory },
      explored: this.explored.encode(),
      exploredFraction: this.explored.fraction,
      roomsDiscovered: [...this.newRooms],
    };
    this.events.emit('shift:ended', this.summary);
  }

  getSummary(): ShiftSummary | null {
    return this.summary;
  }

  /** Highest detection level among NPCs currently interested in the player. */
  private detectionLevel(): number {
    const bossLevel = this.boss.mode === 'chase' ? 1 : this.boss.detection;
    return Math.max(
      bossLevel,
      ...this.students.map((s) => s.detection),
      ...this.teachers.map((t) => (t.mode === 'confront' ? 1 : t.detection)),
      this.custodian?.detection ?? 0,
    );
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
      maxWarnings: this.stats.maxWarnings,
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
      light: this.playerLight,
      xp: this.xpEarned,
      inventory: { ...this.inventory },
      boost: p.boost,
    };
  }
}
