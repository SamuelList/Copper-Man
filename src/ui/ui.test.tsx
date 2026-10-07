/** @vitest-environment jsdom */
import { BALANCE } from '@core/content/balance';
import type { ShiftSnapshot } from '@core/session/types';
import { useAppStore } from '@state/appStore';
import { initialCareer, useCareerStore } from '@state/careerStore';
import { useInputMode } from '@state/inputMode';
import { useShiftStore } from '@state/shiftStore';
import { virtualInput } from '@state/virtualInput';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Hud } from './hud/Hud';
import { CharacterSelectScreen } from './screens/CharacterSelectScreen';
import { ShiftSummaryScreen } from './screens/ShiftSummaryScreen';
import { ShopScreen } from './screens/ShopScreen';

beforeEach(() => {
  useCareerStore.setState(initialCareer());
  useAppStore.setState({ screen: 'title', shiftNonce: 0 });
  useShiftStore.getState().reset();
  useInputMode.setState({ mode: 'keyboard' });
  virtualInput.reset();
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

describe('ShopScreen tabs', () => {
  it('opens on skills when there are points to spend, then buys gadgets', () => {
    useCareerStore.setState({
      ...initialCareer(),
      active: true,
      characterId: 'dalton',
      cash: 100,
      level: 2,
      skillPoints: 1,
    });
    render(<ShopScreen />);
    expect(screen.getByRole('tab', { name: /Skills/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /^Night Owl/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Soft Steps/ }));
    expect(useCareerStore.getState()).toMatchObject({ skills: ['soft-steps'], skillPoints: 0 });

    fireEvent.click(screen.getByRole('tab', { name: 'Gadgets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy Energy Drink' }));
    expect(useCareerStore.getState()).toMatchObject({ cash: 80, inventory: { 'energy-drink': 1 } });
  });

  it('shows all eight gear categories', () => {
    useCareerStore.setState({ ...initialCareer(), active: true, characterId: 'dalton' });
    render(<ShopScreen />);
    for (const name of ['Boots', 'Gloves', 'Disguise', 'Radio', 'Scrapyard Deal']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });
});

describe('ShiftSummaryScreen', () => {
  it('lists XP and celebrates a level up', () => {
    useCareerStore.setState({
      ...initialCareer(),
      active: true,
      characterId: 'dalton',
      level: 2,
      xp: 20,
      skillPoints: 1,
      lastLevelsGained: 1,
      lastSummary: {
        levelId: 'school',
        day: 1,
        endedBy: 'time',
        fired: false,
        warnings: 0,
        earned: 60,
        unitsSold: 2,
        soldByMetal: { copper: 1, brass: 1, aluminum: 0, steel: 0 },
        unitsCollected: 2,
        unitsLost: 0,
        timesCaught: 0,
        coworkerFound: false,
        maxEscalation: 0,
        xp: [
          { label: 'Scrapping', amount: 16 },
          { label: 'Finished the shift', amount: 25 },
        ],
        xpTotal: 41,
        inventory: {},
        explored: '',
        exploredFraction: 0.23,
        roomsDiscovered: ['Gymnasium', 'Kitchen'],
      },
    });
    render(<ShiftSummaryScreen />);
    expect(screen.getByTestId('xp-total')).toHaveTextContent('+41 XP');
    expect(screen.getByTestId('explored')).toHaveTextContent('23%');
    expect(screen.getByText('Gymnasium, Kitchen')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Level up! Level 2');
    expect(screen.getByRole('button', { name: /Spend skill points/ })).toBeInTheDocument();
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
    light: 0.25,
    xp: 40,
    inventory: { 'energy-drink': 2 },
    boost: 0,
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
    expect(screen.getByText('Looking suspicious')).toBeInTheDocument();
  });

  it('swaps keyboard hints for thumb controls on a touch screen', () => {
    useInputMode.setState({ mode: 'touch' });
    render(<Hud />);
    act(() => useShiftStore.getState().setSnapshot(snapshot));
    expect(screen.getByTestId('touch-controls')).toBeInTheDocument();
    expect(screen.getByTestId('interact-prompt')).toHaveTextContent('Scrap — Wall Heater');
    expect(screen.getByTestId('interact-prompt')).not.toHaveTextContent('Hold E');

    // The compact top bar: clock, bag, light gem, detection, cash, hearts.
    expect(screen.getByTestId('shift-timer')).toHaveTextContent('2:06');
    expect(screen.getByTestId('bag')).toHaveAccessibleName('Scrap bag: 0.25 of 2.00');
    expect(screen.getByTestId('visibility')).toHaveAccessibleName('Dark: hard to spot');
    expect(screen.getByRole('meter', { name: 'Detection' })).toHaveAttribute(
      'aria-valuetext',
      'Suspicious',
    );
    expect(screen.getByTestId('shift-earned')).toHaveTextContent('$65');
    expect(screen.getByLabelText('2 of 3 hearts left')).toBeInTheDocument();
    expect(screen.queryByText('Scrap bag')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: /Use Energy Drink/ }));
    expect(virtualInput.drain()).toEqual([{ type: 'use', id: 'energy-drink' }]);

    // Sprint is a button you hold (not the edge of the stick).
    const sprint = screen.getByRole('button', { name: 'Sprint' });
    fireEvent.pointerDown(sprint);
    expect(virtualInput.sprint).toBe(true);
    fireEvent.pointerUp(sprint);
    expect(virtualInput.sprint).toBe(false);

    const interact = screen.getByTestId('touch-interact');
    fireEvent.pointerDown(interact);
    expect(virtualInput.interact).toBe(true);
    fireEvent.pointerUp(interact);
    expect(virtualInput.interact).toBe(false);
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
        levelId: 'school',
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
        xp: [],
        xpTotal: 0,
        inventory: {},
        explored: '',
        exploredFraction: 0,
        roomsDiscovered: [],
      }),
    );
    expect(screen.getByTestId('end-banner')).toHaveTextContent("YOU'RE FIRED!");
  });
});
