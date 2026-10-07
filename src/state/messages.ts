import type { BossMode, BossRemark } from '@core/ai/bossBrain';
import { METALS } from '@core/content/metals';
import { NPCS } from '@core/content/npcs';
import type { ShiftEvents } from '@core/session/types';
import type { ToastTone } from './shiftStore';

export interface Message {
  text: string;
  tone: ToastTone;
}

const boss = NPCS.boss.name;

const BOSS_MODE_MESSAGES: Partial<Record<BossMode, Message>> = {
  chase: { text: `${boss} is onto you — RUN!`, tone: 'bad' },
};

/** What Mr. Gravy says out loud, a few ways each (shown in a speech bubble over him). */
const BOSS_LINES: Record<BossRemark, readonly string[]> = {
  huh: ['Hm?', 'Wait a minute…', "What's that?"],
  spotted: ['HEY! YOU!', 'Stop right there!', 'Got you now!'],
  lost: ["Where'd you go?!", "I know you're in here…", 'Come out, come out…'],
  noise: ["Who's running in my halls?", 'What was that?', 'I heard that!'],
  evidence: ['Somebody stripped this {detail}!', 'My {detail}! Who did this?!'],
  report: ['On my way!', "I'll handle it.", 'Where? Show me!'],
  guard: ["I'll just wait by the door…", "They'll have to come this way."],
  giveUp: ["Hmph. Must've been nothing.", 'Next time…'],
};

/** A line for Mr. Gravy's speech bubble; `n` varies which one. */
export function bossLine(remark: BossRemark, detail = 'thing', n = 0): string {
  const lines = BOSS_LINES[remark];
  return lines[n % lines.length]!.replace('{detail}', detail.toLowerCase());
}

const GADGET_MESSAGES: Record<string, Message> = {
  'energy-drink': { text: 'Glug glug — free sprinting for a few seconds!', tone: 'good' },
  'whoopee-cushion': { text: `PFFFT! ${boss} wants to know who did that…`, tone: 'info' },
  'bolt-cutters': { text: 'Snip! Lock cut.', tone: 'good' },
};

/** Player-facing copy for simulation events. Returns null for events that shouldn't toast. */
export function describeEvent<K extends keyof ShiftEvents>(
  type: K,
  payload: ShiftEvents[K],
): Message | null {
  switch (type) {
    case 'scrap:collected': {
      const p = payload as ShiftEvents['scrap:collected'];
      const metal = METALS[p.metal].name.toLowerCase();
      const spill = p.overflow > 0 ? ` (bag full — left ${p.overflow.toFixed(2)} behind)` : '';
      switch (p.quality) {
        case 'botched':
          return { text: `Botched the ${p.fixtureName}: nothing usable`, tone: 'warn' };
        case 'rough':
          return {
            text: `Rough job: +${p.amount.toFixed(2)} ${metal} from the ${p.fixtureName}${spill}`,
            tone: 'info',
          };
        case 'bonus':
          return {
            text: `Bonus find! +${p.amount.toFixed(2)} ${metal} from the ${p.fixtureName}${spill}`,
            tone: 'good',
          };
        default:
          return {
            text: `+${p.amount.toFixed(2)} ${metal} from the ${p.fixtureName}${spill}`,
            tone: 'info',
          };
      }
    }
    case 'scrap:sold': {
      const p = payload as ShiftEvents['scrap:sold'];
      return { text: `Sold ${p.units.toFixed(2)} scrap for $${p.value}`, tone: 'good' };
    }
    case 'door:unlocked': {
      const p = payload as ShiftEvents['door:unlocked'];
      return p.by === 'player' ? { text: 'Door unlocked', tone: 'info' } : null;
    }
    case 'player:caught': {
      const p = payload as ShiftEvents['player:caught'];
      return p.fired
        ? { text: `${boss}: "That's it. You're FIRED."`, tone: 'bad' }
        : {
            text: `Caught! Warning ${p.warnings} — ${p.confiscated.toFixed(2)} scrap confiscated`,
            tone: 'bad',
          };
    }
    case 'player:excused':
      return { text: `${boss}: "Hmph. Get back to work."`, tone: 'warn' };
    case 'boss:mode': {
      const p = payload as ShiftEvents['boss:mode'];
      return BOSS_MODE_MESSAGES[p.mode] ?? null;
    }
    case 'boss:escalated':
      return { text: `${boss} is getting suspicious… and faster.`, tone: 'warn' };
    case 'student:alert': {
      const p = payload as ShiftEvents['student:alert'];
      const who = p.personality === 'Student' ? 'A student' : `The ${p.personality.toLowerCase()}`;
      return { text: `${who} snitched! ${boss} is on his way.`, tone: 'warn' };
    }
    case 'student:laughed':
      return { text: 'The class clown just laughed at you. Phew.', tone: 'info' };
    case 'teacher:report': {
      const p = payload as ShiftEvents['teacher:report'];
      return { text: `${p.name} radioed ${boss}!`, tone: 'bad' };
    }
    case 'custodian:inspecting': {
      const p = payload as ShiftEvents['custodian:inspecting'];
      return {
        text: `The head custodian is looking at the stripped ${p.fixtureName.toLowerCase()}…`,
        tone: 'warn',
      };
    }
    case 'custodian:shrug':
      return { text: 'The head custodian let it go. This time.', tone: 'info' };
    case 'custodian:report': {
      const p = payload as ShiftEvents['custodian:report'];
      const what =
        p.about === 'player'
          ? 'about you'
          : `about the ${p.fixtureName?.toLowerCase() ?? 'damage'}`;
      return { text: `${p.name} the custodian radioed ${boss} ${what}!`, tone: 'bad' };
    }
    case 'room:discovered': {
      const p = payload as ShiftEvents['room:discovered'];
      return { text: `Discovered: ${p.name}`, tone: 'info' };
    }
    case 'boss:remark': {
      const p = payload as ShiftEvents['boss:remark'];
      if (p.remark === 'guard') return { text: `${boss} is staking out the exit…`, tone: 'warn' };
      if (p.remark === 'evidence') {
        return {
          text: `${boss} found the stripped ${p.detail?.toLowerCase() ?? 'fixture'}!`,
          tone: 'warn',
        };
      }
      return null;
    }
    case 'coworker:found':
      return { text: 'Found your sleepy coworker — they cover for you. +1 heart', tone: 'good' };
    case 'ability:ready':
      return { text: 'Ability ready', tone: 'info' };
    case 'player:talkedOut': {
      const p = payload as ShiftEvents['player:talkedOut'];
      return {
        text: `Smooth talk! No warning, but ${p.confiscated.toFixed(2)} scrap confiscated`,
        tone: 'warn',
      };
    }
    case 'gadget:used': {
      const p = payload as ShiftEvents['gadget:used'];
      return GADGET_MESSAGES[p.id] ?? null;
    }
    case 'gadget:failed': {
      const p = payload as ShiftEvents['gadget:failed'];
      return { text: p.reason, tone: 'warn' };
    }
    default:
      return null;
  }
}

/** What the head custodian mutters, by situation; `n` varies the line. */
const CUSTODIAN_LINES = {
  inspecting: ['Hmm? Who did this?', 'Now what happened here…', "That's not right."],
  reportFixture: ['Mr. Gravy? Got a problem here.', 'Somebody gutted this thing!'],
  reportPlayer: ['HEY! Put that back!', 'Mr. Gravy! Get over here!'],
  shrug: ['Kids these days…', 'Add it to the list.', 'Not my problem.'],
  mopping: ['♪ whistling ♪', 'Floor’s wet!', 'Mind the floor!'],
} as const;

export function custodianLine(kind: keyof typeof CUSTODIAN_LINES, n = 0): string {
  const lines = CUSTODIAN_LINES[kind];
  return lines[n % lines.length]!;
}
