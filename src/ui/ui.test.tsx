/** @vitest-environment jsdom */
import { BALANCE } from '@core/content/balance';
import type { ShiftSnapshot } from '@core/session/types';
import { useAppStore } from '@state/appStore';
import { initialCareer, useCareerStore } from '@state/careerStore';
import { useShiftStore } from '@state/shiftStore';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Hud } from './hud/Hud';
import { CharacterSelectScreen } from './screens/CharacterSelectScreen';
import { ShopScreen } from './screens/ShopScreen';

beforeEach(() => {
  useCareerStore.setState(initialCareer());
  useAppStore.setState({ screen: 'title', shiftNonce: 0 });
  useShiftStore.getState().reset();
});
afterEach(cleanup);

describe('CharacterSelectScreen', () => {
  it('lists the crew and hires the chosen worker', () => {
    render(<CharacterSelectScreen />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: /Tomothy/ }));
    fireEvent.click(screen.getByRole('button', { name: /Hire Tomothy/ }));
    expect(useCareerStore.getState()).toMatchObject({
      active: true,
      characterId: 'tomothy',
      day: 1,
    });
    expect(useAppStore.getState()).toMatchObject({ screen: 'shift', shiftNonce: 1 });
  });
});

describe('ShopScreen', () => {
  it('buys an affordable upgrade and locks the next tier until then', () => {
    useCareerStore.setState({ ...initialCareer(), active: true, characterId: 'dunkin', cash: 100 });
    render(<ShopScreen />);
    expect(screen.getByRole('button', { name: 'Buy Backpack' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Buy Cardboard Box' }));
    expect(useCareerStore.getState().cash).toBe(50);
    expect(useCareerStore.getState().ownedUpgrades).toContain('cardboard-box');
    expect(screen.getByTestId('cash')).toHaveTextContent('$50');
    expect(screen.getByRole('button', { name: 'Buy Cardboard Box' })).toHaveTextContent('Owned');
  });
});

describe('Hud', () => {
  const snapshot: ShiftSnapshot = {
    status: 'running',
    day: 2,
    timeLeft: 125.4,
    duration: 300,
    warnings: 1,
    maxWarnings: BALANCE.warnings.max,
    earned: 65,
    bag: { capacity: 2, contents: { copper: 0.25, brass: 0, aluminum: 0, steel: 0 } },
    roomName: 'Boiler Room',
    prompt: { kind: 'fixture', label: 'Wall Heater', verb: 'Scrap', enabled: true, progress: 0.5 },
    stamina: 2,
    staminaMax: 2.5,
    ability: null,
    bossMode: 'patrol',
    detection: 0,
    escalation: 0,
    suspicious: true,
    grace: 0,
    crouching: true,
    light: 0.25,
  };

  it('renders the shift snapshot (board example: bag 2, holding 0.25, left 1.75)', () => {
    render(<Hud />);
    act(() => useShiftStore.getState().setSnapshot(snapshot));
    expect(screen.getByTestId('shift-timer')).toHaveTextContent('2:06');
    expect(screen.getByTestId('shift-earned')).toHaveTextContent('$65');
    expect(screen.getByTestId('bag')).toHaveTextContent('Holding 0.25 / 2.00');
    expect(screen.getByTestId('bag')).toHaveTextContent('Left 1.75');
    expect(screen.getByTestId('interact-prompt')).toHaveTextContent('Scrap — Wall Heater');
    expect(screen.getByLabelText('2 of 3 hearts left')).toBeInTheDocument();
    expect(screen.getByTestId('visibility')).toHaveTextContent('Dark');
    expect(screen.getByTestId('visibility')).toHaveTextContent('Crouching');
  });

  it('shows toasts and the end-of-shift banner', () => {
    render(<Hud />);
    act(() => {
      useShiftStore.getState().setSnapshot(snapshot);
      useShiftStore.getState().pushToast('Sold 1.00 scrap for $40', 'good');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Sold 1.00 scrap');
    act(() =>
      useShiftStore.getState().setResult({
        day: 2,
        endedBy: 'fired',
        fired: true,
        warnings: 3,
        earned: 0,
        unitsSold: 0,
        soldByMetal: { copper: 0, brass: 0, aluminum: 0, steel: 0 },
        unitsCollected: 0,
        unitsLost: 0,
        timesCaught: 1,
        coworkerFound: false,
        maxEscalation: 0,
      }),
    );
    expect(screen.getByTestId('end-banner')).toHaveTextContent("YOU'RE FIRED!");
  });
});
