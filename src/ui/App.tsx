import { useAppStore, type Screen } from '@state/appStore';
import { useInputMode } from '@state/inputMode';
import { useEffect, type ComponentType } from 'react';
import { CharacterSelectScreen } from './screens/CharacterSelectScreen';
import { FiredScreen } from './screens/FiredScreen';
import { ShiftScreen } from './screens/ShiftScreen';
import { ShiftSummaryScreen } from './screens/ShiftSummaryScreen';
import { ShopScreen } from './screens/ShopScreen';
import { TitleScreen } from './screens/TitleScreen';

const SCREENS: Record<Screen, ComponentType> = {
  title: TitleScreen,
  characterSelect: CharacterSelectScreen,
  shift: ShiftScreen,
  summary: ShiftSummaryScreen,
  shop: ShopScreen,
  fired: FiredScreen,
};

/**
 * Show touch controls after a touch and keyboard hints after a key press, so a tablet with a
 * keyboard (or a laptop with a touchscreen) gets whichever the player is actually using. Also
 * stops iOS pinch-zoom gestures from zooming the page mid-shift.
 */
function useInputModeTracking() {
  useEffect(() => {
    const setMode = useInputMode.getState().setMode;
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setMode('touch');
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.repeat && e.key !== 'Escape') setMode('keyboard');
    };
    const noZoom = (e: Event) => e.preventDefault();
    window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    window.addEventListener('keydown', onKey, { capture: true });
    document.addEventListener('gesturestart', noZoom);
    return () => {
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      window.removeEventListener('keydown', onKey, { capture: true });
      document.removeEventListener('gesturestart', noZoom);
    };
  }, []);
}

export function App() {
  useInputModeTracking();
  const screen = useAppStore((s) => s.screen);
  const shiftNonce = useAppStore((s) => s.shiftNonce);
  const Current = SCREENS[screen];
  // Keying by shift guarantees a fresh game instance per shift.
  return <Current key={screen === 'shift' ? `shift-${shiftNonce}` : screen} />;
}
