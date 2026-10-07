import type { Bag } from '@core/model/types';
import { useInputMode } from '@state/inputMode';
import { useShiftStore } from '@state/shiftStore';
import { useShallow } from 'zustand/react/shallow';

/**
 * HUD slices shared by the desktop cards and the phone bar. Each picks just the values it
 * shows (rounded where the HUD can't show the difference) so a card only re-renders when
 * something on it changes.
 */

export const useTouch = () => useInputMode((s) => s.mode === 'touch');

/** Seconds left at which the clock turns red. */
export const LOW_TIME = 30;

export const useShiftClock = () =>
  useShiftStore(
    useShallow((s) => ({
      timeLeft: Math.ceil(s.snapshot?.timeLeft ?? 0),
      day: s.snapshot?.day ?? 1,
      roomName: s.snapshot?.roomName ?? '',
    })),
  );

export const useStatus = () =>
  useShiftStore(
    useShallow((s) => ({
      earned: s.snapshot?.earned ?? 0,
      warnings: s.snapshot?.warnings ?? 0,
      max: s.snapshot?.maxWarnings ?? 3,
    })),
  );

/** The bag, or null before the first snapshot. */
export function useBag(): Bag | null {
  const flat = useShiftStore(
    useShallow((s) => {
      const b = s.snapshot?.bag;
      return b ? { capacity: b.capacity, ...b.contents } : null;
    }),
  );
  if (!flat) return null;
  const { capacity, ...contents } = flat;
  return { capacity, contents };
}

export function useDetection() {
  const d = useShiftStore(
    useShallow((s) => ({
      detection: Math.round((s.snapshot?.detection ?? 0) * 20) / 20,
      bossMode: s.snapshot?.bossMode ?? 'patrol',
      suspicious: s.snapshot?.suspicious ?? false,
      escalation: s.snapshot?.escalation ?? 0,
      grace: (s.snapshot?.grace ?? 0) > 0,
    })),
  );
  const spotted = d.bossMode === 'chase';
  const tone: 'bad' | 'warn' | 'good' = spotted
    ? 'bad'
    : d.detection > 0 || d.suspicious
      ? 'warn'
      : 'good';
  return { ...d, spotted, tone };
}

/** Light where you stand, 0 (dark) to 1 (lit), in steps of 0.05. */
export const useLight = () => useShiftStore((s) => Math.round((s.snapshot?.light ?? 1) * 20) / 20);

export const lightLabel = (light: number) =>
  light >= 0.75
    ? { label: 'Bright', hint: 'easy to spot' }
    : light >= 0.45
      ? { label: 'Dim', hint: 'harder to spot' }
      : { label: 'Dark', hint: 'hard to spot' };
