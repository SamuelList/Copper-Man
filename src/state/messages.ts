import type { BossMode } from '@core/ai/bossBrain';
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
  investigate: { text: `${boss} is coming to check something out…`, tone: 'warn' },
};

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
      return {
        text: `+${p.amount.toFixed(2)} ${metal} from ${p.fixtureName}${spill}`,
        tone: 'info',
      };
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
    case 'student:alert':
      return { text: 'A student snitched! The boss heard about it.', tone: 'warn' };
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
