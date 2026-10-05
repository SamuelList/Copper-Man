import { create } from 'zustand';

export type Screen = 'title' | 'characterSelect' | 'shift' | 'summary' | 'shop' | 'fired';

interface AppStore {
  screen: Screen;
  /** Bumped each time a shift starts so the game view remounts cleanly. */
  shiftNonce: number;
  go(screen: Screen): void;
  startShift(): void;
}

/** Top-level screen flow. Game screens aren't URLs, so a tiny state machine beats a router. */
export const useAppStore = create<AppStore>()((set) => ({
  screen: 'title',
  shiftNonce: 0,
  go: (screen) => set({ screen }),
  startShift: () => set((s) => ({ screen: 'shift', shiftNonce: s.shiftNonce + 1 })),
}));
