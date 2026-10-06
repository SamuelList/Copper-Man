import type { ShiftSession } from '@core/session/ShiftSession';
import type { ShiftEvents, ShiftSummary } from '@core/session/types';
import { describeEvent } from '@state/messages';
import { useShiftStore } from '@state/shiftStore';

const TOAST_EVENTS = [
  'scrap:collected',
  'scrap:sold',
  'door:unlocked',
  'player:caught',
  'player:excused',
  'boss:mode',
  'boss:escalated',
  'student:alert',
  'student:laughed',
  'teacher:report',
  'room:discovered',
  'boss:remark',
  'coworker:found',
  'ability:ready',
  'player:talkedOut',
  'gadget:used',
  'gadget:failed',
] as const satisfies readonly (keyof ShiftEvents)[];

/** HUD refresh rate for continuous values (timer, stamina, progress). */
const SNAPSHOT_INTERVAL_MS = 100;

export interface SessionBridge {
  /** Push a HUD snapshot if enough time passed (or immediately when `force`). */
  publish(now: number, force?: boolean): void;
  dispose(): void;
}

/**
 * One-way link from the simulation to React: session events become toasts, state becomes
 * throttled snapshots, and the UI gets a controller for commands like clocking out.
 */
export function connectSession(
  session: ShiftSession,
  onEnd: (summary: ShiftSummary) => void,
): SessionBridge {
  const store = useShiftStore.getState();
  store.reset();
  const controller = { clockOut: () => session.clockOut() };
  store.setController(controller);

  let lastPublish = -Infinity;
  let dirty = true;
  const offs = TOAST_EVENTS.map((type) =>
    session.events.on(type, (payload) => {
      dirty = true;
      const msg = describeEvent(type, payload);
      if (msg) useShiftStore.getState().pushToast(msg.text, msg.tone);
    }),
  );
  offs.push(
    session.events.on('shift:ended', (summary) => {
      const store = useShiftStore.getState();
      store.setSnapshot(session.getSnapshot());
      store.setResult(summary);
      onEnd(summary);
    }),
  );

  const publish = (now: number, force = false) => {
    if (!force && !dirty && now - lastPublish < SNAPSHOT_INTERVAL_MS) return;
    lastPublish = now;
    dirty = false;
    useShiftStore.getState().setSnapshot(session.getSnapshot());
  };
  publish(0, true);

  return {
    publish,
    dispose() {
      offs.forEach((off) => off());
      // Only detach our own controller; a newer game may already have registered.
      if (useShiftStore.getState().controller === controller) {
        useShiftStore.getState().setController(null);
      }
    },
  };
}
