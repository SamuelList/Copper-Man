import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';

/** Minimal view of the debug hook exposed with `?debug` (see GameEngine). */
interface DebugWindow {
  __copper?: {
    session: {
      player: { pos: { x: number; y: number }; crouching: boolean; stamina: number };
      boss: { pos: { x: number; y: number } };
      bag: { capacity: number; contents: Record<string, number> };
      inventory: Record<string, number>;
    };
  };
}

const TILE = 32;

/** The worker's state, read straight from the simulation. */
const player = (page: Page) =>
  page.evaluate(() => {
    const s = (window as DebugWindow).__copper!.session;
    return {
      x: s.player.pos.x,
      y: s.player.pos.y,
      crouching: s.player.crouching,
      stamina: s.player.stamina,
      drinks: s.inventory['energy-drink'] ?? 0,
    };
  });

async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Real touch events (they arrive as pointerType "touch", like a finger on an iPhone). */
const touch = (
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: { x: number; y: number; id: number }[],
) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
  });

test('plays a shift with touch controls on a phone', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);

  await page.goto('/?debug');
  await page.getByRole('button', { name: 'New Career' }).tap();
  await testInfo.attach('select', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('radio', { name: /Dalton/ }).tap();
  await page.getByRole('button', { name: /Hire Dalton/ }).tap();
  await page.waitForFunction(() => Boolean((window as DebugWindow).__copper?.session), null, {
    timeout: 30_000,
  });

  // Phones get thumb controls instead of keyboard hints.
  await expect(page.getByTestId('touch-controls')).toBeVisible();
  await expect(page.getByText('hold to interact')).toBeHidden();

  // Park the boss far away so nothing interrupts the test.
  await page.evaluate((tile) => {
    (window as DebugWindow).__copper!.session.boss.pos = { x: 55 * tile, y: 6 * tile };
  }, TILE);

  // Drag the floating stick to the right: the worker walks screen-right.
  const start = await player(page);
  const zone = (await page.getByTestId('joystick').boundingBox())!;
  const from = { x: zone.x + zone.width * 0.4, y: zone.y + zone.height * 0.6, id: 1 };
  await touch(cdp, 'touchStart', [from]);
  for (let i = 1; i <= 5; i++) {
    await touch(cdp, 'touchMove', [{ ...from, x: from.x + i * 7 }]);
  }
  await page.waitForTimeout(900);
  const walked = await player(page);
  // Screen-right on the iso camera is +x and +y on the map.
  expect(walked.x - start.x).toBeGreaterThan(4);
  expect(walked.y - start.y).toBeGreaterThan(4);
  await touch(cdp, 'touchEnd', []);

  // Crouch button toggles crouching.
  await page.getByRole('button', { name: 'Crouch' }).tap();
  await expect.poll(async () => (await player(page)).crouching).toBe(true);
  await page.getByRole('button', { name: 'Stand up' }).tap();
  await expect.poll(async () => (await player(page)).crouching).toBe(false);

  // Gadgets show up in the tray and fire on tap.
  await page.evaluate(() => {
    const s = (window as DebugWindow).__copper!.session;
    s.inventory['energy-drink'] = 2;
    s.player.stamina = 0;
  });
  await page.getByRole('button', { name: /Use Energy Drink/ }).tap();
  await expect.poll(async () => (await player(page)).drinks).toBe(1);
  expect((await player(page)).stamina).toBeGreaterThan(1);

  // Hold the big hand button at the van to sell, while also holding the stick still with the
  // other thumb (multi-touch).
  await page.evaluate((tile) => {
    const s = (window as DebugWindow).__copper!.session;
    s.bag = { ...s.bag, contents: { ...s.bag.contents, copper: 1.5 } };
    s.player.pos = { x: 5.5 * tile, y: 15.5 * tile };
  }, TILE);
  const interact = page.getByTestId('touch-interact');
  await expect(interact).toHaveAccessibleName(/Sell scrap/);
  await testInfo.attach('shift-landscape', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const btn = await center(interact);
  await touch(cdp, 'touchStart', [{ ...from, id: 1 }]);
  await touch(cdp, 'touchStart', [
    { ...from, id: 1 },
    { ...btn, id: 2 },
  ]);
  await expect(page.getByTestId('shift-earned')).toHaveText('$60', { timeout: 10_000 });
  await touch(cdp, 'touchEnd', []);

  // Portrait works too.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await expect(page.getByTestId('touch-controls')).toBeVisible();
  await testInfo.attach('shift-portrait', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 844, height: 390 });

  // Pause button → clock out → summary → shop.
  await page.getByRole('button', { name: 'Pause' }).tap();
  await page.getByRole('button', { name: 'Clock out early' }).tap();
  await expect(page.getByRole('heading', { name: 'Day 1 complete' })).toBeVisible({
    timeout: 10_000,
  });
  await testInfo.attach('summary', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: /hardware store|shop/i }).tap();
  await expect(page.getByTestId('cash')).toHaveText('$60');
  await page.getByRole('tab', { name: 'Gadgets' }).tap();
  await page.getByRole('button', { name: 'Buy Energy Drink' }).tap();
  await expect(page.getByTestId('cash')).toHaveText('$40');
  await testInfo.attach('shop', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('tab', { name: /Skills/ }).tap();
  await testInfo.attach('skills', { body: await page.screenshot(), contentType: 'image/png' });

  expect(errors).toEqual([]);
});
