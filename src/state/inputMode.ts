import { create } from 'zustand';

export type InputMode = 'keyboard' | 'touch';

/** `?touch` forces touch controls on (handy for testing on a desktop). */
function initialMode(): InputMode {
  if (typeof window === 'undefined') return 'keyboard';
  if (new URLSearchParams(window.location.search).has('touch')) return 'touch';
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  return coarse ? 'touch' : 'keyboard';
}

interface InputModeStore {
  /** Which controls to show: on-screen touch controls or keyboard hints. */
  mode: InputMode;
  setMode(mode: InputMode): void;
}

/** Follows whatever the player last used: a touch shows touch controls, a key press hides them. */
export const useInputMode = create<InputModeStore>()((set) => ({
  mode: initialMode(),
  setMode: (mode) => set((s) => (s.mode === mode ? s : { mode })),
}));
