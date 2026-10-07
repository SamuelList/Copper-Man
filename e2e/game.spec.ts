import { expect, test, type Page } from '@playwright/test';

/** Minimal view of the debug hook exposed with `?debug` (see GameEngine). */
interface DebugWindow {
  __copper?: {
    session: {
      elapsed: number;
      player: {
        pos: { x: number; y: number };
        abilityActive: number;
        sprinting: boolean;
        stamina: number;
      };
      boss: { pos: { x: number; y: number }; mode: string };
      bag: { capacity: number; contents: Record<string, number> };
      vanBoxes: { minX: number; maxX: number; minY: number; maxY: number }[];
    };
  };
}

const TILE = 32;

async function waitForSession(page: Page) {
  await page.waitForFunction(() => Boolean((window as DebugWindow).__copper?.session), null, {
    timeout: 20_000,
  });
}

test('a full day: hire, sneak, sprint, sell, clock out, shop, next day', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?debug');
  await expect(page.getByRole('heading', { name: /PROJECT/ })).toBeVisible();
  await page.getByRole('button', { name: 'New Career' }).click();
  await page.getByRole('radio', { name: /Dalton/ }).click();
  await page.getByRole('button', { name: /Hire Dalton/ }).click();

  await expect(page.locator('canvas')).toBeVisible();
  await waitForSession(page);
  await expect(page.getByTestId('hud')).toBeVisible();

  // Clock is running.
  await expect
    .poll(() => page.evaluate(() => (window as DebugWindow).__copper!.session.elapsed), {
      timeout: 10_000,
    })
    .toBeGreaterThan(1);

  // Keyboard moves the worker.
  const startX = await page.evaluate(() => (window as DebugWindow).__copper!.session.player.pos.x);
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  const movedX = await page.evaluate(() => (window as DebugWindow).__copper!.session.player.pos.x);
  expect(movedX).toBeGreaterThan(startX);

  // Q triggers Dalton's "Act Like a Student".
  await page.keyboard.press('q');
  await expect
    .poll(() => page.evaluate(() => (window as DebugWindow).__copper!.session.player.abilityActive))
    .toBeGreaterThan(0);

  // Shift sprints (and burns stamina); the light meter shows how lit you are.
  await page.keyboard.down('Shift');
  await page.keyboard.down('a');
  await expect
    .poll(() => page.evaluate(() => (window as DebugWindow).__copper!.session.player.sprinting))
    .toBe(true);
  await page.keyboard.up('a');
  await page.keyboard.up('Shift');
  expect(
    await page.evaluate(() => (window as DebugWindow).__copper!.session.player.stamina),
  ).toBeLessThan(2.5);
  await expect(page.getByTestId('visibility')).toContainText(/Bright|Dim|Dark/);

  // Pause and resume with Esc / the overlay.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();

  // Sell a bag of copper at the van (boss parked far away so the test is deterministic).
  await page.evaluate((tile) => {
    const s = (window as DebugWindow).__copper!.session;
    s.boss.pos = { x: 85 * tile, y: 27 * tile };
    s.bag = { ...s.bag, contents: { ...s.bag.contents, copper: 1.5 } };
    // Just east of the van.
    const van = s.vanBoxes[s.vanBoxes.length - 1]!;
    s.player.pos = { x: van.maxX + tile * 0.5, y: (van.minY + van.maxY) / 2 };
  }, TILE);
  await expect(page.getByTestId('interact-prompt')).toContainText('Sell scrap');
  await page.keyboard.down('e');
  await expect(page.getByTestId('shift-earned')).toHaveText('$60', { timeout: 10_000 });
  await page.keyboard.up('e');
  await testInfo.attach('shift', { body: await page.screenshot(), contentType: 'image/png' });

  // Clock out early → banner → summary.
  // The banner only shows for a moment, so start watching for it before clicking.
  await page.keyboard.press('Escape');
  const banner = page.waitForSelector('[data-testid="end-banner"]:has-text("CLOCKED OUT")');
  await page.getByRole('button', { name: 'Clock out early' }).click();
  await banner;
  await expect(page.getByRole('heading', { name: 'Day 1 complete' })).toBeVisible({
    timeout: 10_000,
  });

  // Shop: spend the $60.
  await page.getByRole('button', { name: /hardware store|shop/i }).click();
  await expect(page.getByTestId('cash')).toHaveText('$60');
  await page.getByRole('button', { name: 'Buy Cowboy Boots' }).click();
  await expect(page.getByTestId('cash')).toHaveText('$0');

  // Day 2 starts with a fresh game.
  await page.getByRole('button', { name: 'Clock in for Day 2' }).click();
  await waitForSession(page);
  await expect(page.getByText('Day 2 · Shift')).toBeVisible();

  // Progress survives a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: /Continue — Day 2/ })).toBeVisible();

  expect(errors).toEqual([]);
});
