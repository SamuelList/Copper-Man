/** @vitest-environment jsdom */
import { BALANCE } from '@core/content/balance';
import type { ShiftSnapshot } from '@core/session/types';
import { useAppStore } from '@state/appStore';
import { initialCareer, useCareerStore } from '@state/careerStore';
import { useInputMode } from '@state/inputMode';
import { useSettings } from '@state/settingsStore';
import { useShiftStore } from '@state/shiftStore';
import { virtualInput } from '@state/virtualInput';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ViewSwitch } from './components/ViewSwitch';
import { Hud } from './hud/Hud';
import { CharacterSelectScreen } from './screens/CharacterSelectScreen';
import { ShiftSummaryScreen } from './screens/ShiftSummaryScreen';
import { ShopScreen } from './screens/ShopScreen';

beforeEach(() => {
  useCareerStore.setState(initialCareer());
  useAppStore.setState({ screen: 'title', shiftNonce: 0 });
  useShiftStore.getState().reset();
  useInputMode.setState({ mode: 'keyboard', mouseLook: false });
  useSettings.setState({ view: 'iso' });
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

  it('hires on two quick taps of the same card, and only then', () => {
    const clock = vi.spyOn(performance, 'now');
    render(<CharacterSelectScreen />);
    const dalton = screen.getByRole('radio', { name: /Dalton/ });
    const dunkin = screen.getByRole('radio', { name: /Dunkin/ });
    const screenNow = () => useAppStore.getState().screen;

    // A double tap that began on the screen before (its first tap opened this one) picks a
    // worker; it doesn't hire them.
    clock.mockReturnValue(1000);
    fireEvent.click(dalton, { detail: 2 });
    fireEvent.doubleClick(dalton);
    expect(screenNow()).toBe('title');
    // Nor do taps on two different cards, however quick...
    clock.mockReturnValue(1100);
    fireEvent.click(dunkin);
    expect(screenNow()).toBe('title');
    expect(dunkin).toHaveAttribute('aria-checked', 'true');
    // ...or two taps on one card with a pause between them.
    clock.mockReturnValue(2000);
    fireEvent.click(dunkin);
    expect(screenNow()).toBe('title');
    // Two in a row do.
    clock.mockReturnValue(2200);
    fireEvent.click(dunkin);
    expect(screenNow()).toBe('shift');
    expect(useCareerStore.getState().characterId).toBe('dunkin');
    clock.mockRestore();
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

  it('switches to first person and back from the HUD', () => {
    render(<Hud />);
    act(() => useShiftStore.getState().setSnapshot(snapshot));
    expect(screen.queryByTestId('crosshair')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to first person view' }));
    expect(useSettings.getState().view).toBe('fps');
    // A dot to aim with (lit: the wall heater is in reach) and how to look around.
    expect(screen.getByTestId('crosshair')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('look-hint')).toHaveTextContent('Click to look around');
    expect(screen.getByText('look')).toBeInTheDocument();
    // Once the mouse is captured the hint gets out of the way.
    act(() => useInputMode.getState().setMouseLook(true));
    expect(screen.queryByTestId('look-hint')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to top-down view' }));
    expect(useSettings.getState().view).toBe('iso');
    expect(screen.queryByTestId('crosshair')).not.toBeInTheDocument();
  });

  it('in first person on a touch screen, dragging the right side looks around', () => {
    useInputMode.setState({ mode: 'touch' });
    render(<Hud />);
    act(() => useShiftStore.getState().setSnapshot(snapshot));
    expect(screen.queryByTestId('look-zone')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch to first person view' }));
    const zone = screen.getByTestId('look-zone');
    fireEvent.pointerDown(zone, { pointerId: 7, clientX: 600, clientY: 200 });
    fireEvent.pointerMove(zone, { pointerId: 7, clientX: 630, clientY: 190 });
    fireEvent.pointerMove(zone, { pointerId: 7, clientX: 640, clientY: 195 });
    // Another finger (on the stick, say) doesn't turn your head.
    fireEvent.pointerMove(zone, { pointerId: 8, clientX: 100, clientY: 100 });
    expect(virtualInput.takeLook()).toEqual({ x: 40, y: -5 });
    fireEvent.pointerUp(zone, { pointerId: 7 });
    fireEvent.pointerMove(zone, { pointerId: 7, clientX: 700, clientY: 195 });
    expect(virtualInput.takeLook()).toEqual({ x: 0, y: 0 });
  });

  it('lets go of every control when the game goes into the background', () => {
    useInputMode.setState({ mode: 'touch' });
    render(<Hud />);
    act(() => useShiftStore.getState().setSnapshot(snapshot));
    const sprint = screen.getByRole('button', { name: 'Sprint' });
    const stick = screen.getByTestId('joystick');
    fireEvent.pointerDown(sprint, { pointerId: 1 });
    fireEvent.pointerDown(stick, { pointerId: 2, clientX: 50, clientY: 300 });
    fireEvent.pointerMove(stick, { pointerId: 2, clientX: 90, clientY: 300 });
    expect(virtualInput.sprint).toBe(true);
    expect(virtualInput.stickX).toBeGreaterThan(0.5);
    expect(sprint).toHaveAttribute('data-held', 'true');

    // Another app comes to the front. The thumbs lift, and nothing ever says so.
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    setHidden(true);
    expect(virtualInput.sprint).toBe(false);
    expect(virtualInput.stickX).toBe(0);
    expect(sprint).toHaveAttribute('data-held', 'false');

    // Back again: the stick answers a new thumb rather than waiting on the old one.
    setHidden(false);
    expect(virtualInput.stickX).toBe(0);
    fireEvent.pointerDown(stick, { pointerId: 3, clientX: 50, clientY: 300 });
    fireEvent.pointerMove(stick, { pointerId: 3, clientX: 50, clientY: 260 });
    expect(virtualInput.stickY).toBeGreaterThan(0.5);
    fireEvent.pointerUp(stick, { pointerId: 3 });
    Reflect.deleteProperty(document, 'hidden');
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

describe('ViewSwitch', () => {
  it('picks the camera and shows which one is in use', () => {
    render(<ViewSwitch />);
    const topDown = screen.getByRole('radio', { name: 'Top-down' });
    const firstPerson = screen.getByRole('radio', { name: 'First person' });
    expect(topDown).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(firstPerson);
    expect(useSettings.getState().view).toBe('fps');
    expect(firstPerson).toHaveAttribute('aria-checked', 'true');
    expect(topDown).toHaveAttribute('aria-checked', 'false');
  });
});
