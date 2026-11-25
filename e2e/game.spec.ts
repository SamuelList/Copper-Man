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
    /** Which camera is in use, and where first person is looking. */
    view(): { mode: 'iso' | 'fps'; yaw: number; pitch: number };
    /** Hold the renderer at one quality level (0 is best; out of range means lowest). */
    quality(level: number): void;
  };
}

const TILE = 32;

/** The camera, where it's looking, and where the worker is and faces. */
const look = (page: Page) =>
  page.evaluate(() => {
    const c = (window as DebugWindow).__copper!;
    const p = c.session.player as unknown as { pos: { x: number; y: number }; facing: number };
    return { ...c.view(), x: p.pos.x, y: p.pos.y, facing: p.facing };
  });

/**
 * A software rasteriser (CI) starts the game at its lowest quality, which skips most of the
 * renderer. Draw a couple of frames with everything on, so every shader is compiled and any
 * that fails shows up as an error, then go back to something it can run.
 */
const drawAtFullQuality = (page: Page) =>
  page.evaluate(async () => {
    const copper = (window as DebugWindow).__copper!;
    copper.quality(0);
    for (let i = 0; i < 2; i++) await new Promise((done) => requestAnimationFrame(done));
    copper.quality(99);
  });

/** How far `to` is to the right of `from`, in radians (headings wrap around). */
const turned = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

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
  // A shader that fails to compile is logged, not thrown.
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text());
  });

  await page.goto('/?debug');
  await expect(page.getByRole('heading', { name: /PROJECT/ })).toBeVisible();
  // Top-down is the default camera.
  await expect(page.getByRole('radio', { name: 'Top-down' })).toBeChecked();
  await page.getByRole('button', { name: 'New Career' }).click();
  await page.getByRole('radio', { name: /Dalton/ }).click();
  await page.getByRole('button', { name: /Hire Dalton/ }).click();

  await expect(page.locator('canvas')).toBeVisible();
  await waitForSession(page);
  await expect(page.getByTestId('hud')).toBeVisible();
  await drawAtFullQuality(page);

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

  // First person: V switches camera, the arrow keys turn your head, and W walks where you look.
  // (In a classroom with room to walk: indoors is also much less for a software renderer to
  // draw than the car park.)
  await page.evaluate((tile) => {
    (window as DebugWindow).__copper!.session.player.pos = { x: 11.5 * tile, y: 2.5 * tile };
  }, TILE);
  await page.keyboard.press('v');
  await expect.poll(async () => (await look(page)).mode).toBe('fps');
  await expect(page.getByTestId('crosshair')).toBeVisible();
  const before = await look(page);
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(async () => turned(before.yaw, (await look(page)).yaw), { timeout: 20_000 })
    .toBeGreaterThan(0.3);
  await page.keyboard.up('ArrowRight');
  const facing = await look(page);
  await page.keyboard.down('w');
  await expect
    .poll(
      async () => {
        const now = await look(page);
        return (
          (now.x - facing.x) * Math.cos(facing.yaw) + (now.y - facing.y) * Math.sin(facing.yaw)
        );
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(8);
  await page.keyboard.up('w');
  // The worker faces wherever you look.
  const walked = await look(page);
  expect(turned(walked.yaw, walked.facing)).toBeCloseTo(0, 5);
  await drawAtFullQuality(page);
  await testInfo.attach('first-person', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // The HUD's button switches back.
  await page.getByRole('button', { name: 'Switch to top-down view' }).click();
  await expect.poll(async () => (await look(page)).mode).toBe('iso');
  await expect(page.getByTestId('crosshair')).toBeHidden();

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
  // (The store opens on Skills when a level-up left points to spend.)
  await page.getByRole('tab', { name: 'Gear' }).click();
  await page.getByRole('button', { name: 'Buy Cowboy Boots' }).click();
  await expect(page.getByTestId('cash')).toHaveText('$0');

  // Day 2 starts with a fresh game.
  await page.getByRole('button', { name: 'Clock in for Day 2' }).click();
  await waitForSession(page);
  await expect(page.getByText('Day 2 · Shift')).toBeVisible();

  // The pause menu has the camera too.
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'First person' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(async () => (await look(page)).mode).toBe('fps');

  // Progress survives a reload, and so does the camera you chose.
  await page.reload();
  await expect(page.getByRole('button', { name: /Continue — Day 2/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'First person' })).toBeChecked();

  expect(errors).toEqual([]);
});
