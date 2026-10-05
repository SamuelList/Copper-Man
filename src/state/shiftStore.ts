import type { ShiftSnapshot, ShiftSummary } from '@core/session/types';
import { create } from 'zustand';

export type ToastTone = 'info' | 'good' | 'warn' | 'bad';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

/** Commands the UI can send to whatever is running the shift (implemented by the game layer). */
export interface ShiftController {
  clockOut(): void;
}

interface ShiftStore {
  snapshot: ShiftSnapshot | null;
  /** Set when the shift ends (before the summary screen takes over). */
  result: ShiftSummary | null;
  paused: boolean;
  toasts: Toast[];
  controller: ShiftController | null;

  setSnapshot(snapshot: ShiftSnapshot): void;
  setResult(result: ShiftSummary): void;
  setPaused(paused: boolean): void;
  togglePause(): void;
  pushToast(text: string, tone?: ToastTone): void;
  dismissToast(id: number): void;
  setController(controller: ShiftController | null): void;
  reset(): void;
}

const MAX_TOASTS = 5;
let nextToastId = 1;

/** Transient HUD mirror of the running shift. Written by the game bridge, read by React. */
export const useShiftStore = create<ShiftStore>()((set) => ({
  snapshot: null,
  result: null,
  paused: false,
  toasts: [],
  controller: null,

  setSnapshot: (snapshot) => set({ snapshot }),
  setResult: (result) => set({ result, paused: false }),
  setPaused: (paused) => set({ paused }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  pushToast: (text, tone = 'info') =>
    set((s) => ({ toasts: [...s.toasts, { id: nextToastId++, text, tone }].slice(-MAX_TOASTS) })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setController: (controller) => set({ controller }),
  reset: () => set({ snapshot: null, result: null, paused: false, toasts: [], controller: null }),
}));
