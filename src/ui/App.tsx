import { useAppStore, type Screen } from '@state/appStore';
import type { ComponentType } from 'react';
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

export function App() {
  const screen = useAppStore((s) => s.screen);
  const shiftNonce = useAppStore((s) => s.shiftNonce);
  const Current = SCREENS[screen];
  // Keying by shift guarantees a fresh game instance per shift.
  return <Current key={screen === 'shift' ? `shift-${shiftNonce}` : screen} />;
}
