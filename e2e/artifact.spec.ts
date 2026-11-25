import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type FrameLocator, type Page } from '@playwright/test';

/**
 * The single-file build (`npm run build:artifact`), run the way it's published: wrapped in its
 * host's page skeleton, on a phone held upright, with a status bar and a home indicator to
 * stay clear of.
 */

/** Minimal view of the debug hook exposed with `?debug` (see GameEngine). */
interface DebugWindow {
  __copper?: { quality(level: number): void };
}

/**
 * What the host wraps a page in, as its contract describes it: a viewport that covers the
 * whole screen, and a root padded top and bottom by the phone's safe-area insets.
 */
const skeleton = (page: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      :root { color-scheme: light; padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); }
      body { margin: 0; font: 14px system-ui, sans-serif; }
      img { max-width: 100%; }
      [hidden] { display: none !important; }
    </style>
  </head>
  <body>${page}</body>
</html>`;

const ORIGIN = 'https://artifact.test';
/** An iPhone with a Dynamic Island, upright. */
const INSETS = { top: 59, right: 0, bottom: 34, left: 0 };

let html = '';

test.beforeAll(() => {
  execFileSync('node', ['scripts/build-artifact.mjs'], { stdio: 'inherit' });
  html = skeleton(readFileSync('dist-artifact/project-copper.html', 'utf8'));
});

/** Collects what would otherwise fail silently: thrown errors and shaders that don't compile. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|shader|WebGL/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function serve(page: Page) {
  await page.route(`${ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    // "/" is the artifact itself; "/framed" shows it the way a locked-down host might, in a
    // frame with an origin of its own (no storage, no access to the page around it).
    const body =
      pathname === '/framed'
        ? `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1" />
           <body style="margin:0">
             <iframe sandbox="allow-scripts" src="/" title="game"
               style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
           </body>`
        : html;
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
  });
}

/** Title screen to a running shift, by thumb. */
async function clockIn(view: Page | FrameLocator) {
  await view.getByRole('button', { name: 'New Career' }).tap();
  await view.getByRole('radio', { name: /Tomothy/ }).tap();
  await view.getByRole('button', { name: /Hire Tomothy/ }).tap();
  // The thumb controls are there as soon as the screen is; the top bar only once the engine
  // has been built and has said something. And it must not have given up instead.
  await expect(view.getByTestId('touch-controls')).toBeVisible({ timeout: 60_000 });
  await expect(view.getByTestId('touch-bar')).toBeVisible({ timeout: 60_000 });
  // The cover lifts on the first frame drawn (or on a failure, which the alert would show).
  await expect(view.locator('[data-done="false"]')).toHaveCount(0, { timeout: 60_000 });
  await expect(view.locator('canvas')).toBeVisible();
  await expect(view.getByRole('alert')).toHaveCount(0);
}

test('fits its frame and starts a shift on a phone held upright', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: INSETS });
  await serve(page);
  await page.goto(`${ORIGIN}/?debug`);

  const screen = page.viewportSize()!;
  const top = INSETS.top;
  const bottom = screen.height - INSETS.bottom;

  // The menus sit between the system bars, and the page itself never scrolls.
  const start = (await page.getByRole('button', { name: 'New Career' }).boundingBox())!;
  expect(start.y).toBeGreaterThanOrEqual(top);
  expect(start.y + start.height).toBeLessThanOrEqual(bottom);
  // The host's own text size (14px on its body) stays the host's: the game keeps its own, and
  // with it buttons a thumb can hit.
  expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('16px');
  expect(start.height).toBeGreaterThanOrEqual(44);
  await clockIn(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(screen.height);

  // The view fills exactly the space the host leaves...
  const canvas = (await page.locator('canvas').boundingBox())!;
  expect(canvas.y).toBe(top);
  expect(canvas.height).toBe(bottom - top);
  expect(canvas.width).toBe(screen.width);
  // ...and the HUD keeps its usual margins from there, not a second helping of the insets.
  const bar = (await page.getByTestId('touch-bar').boundingBox())!;
  expect(bar.y - top).toBeGreaterThanOrEqual(4);
  expect(bar.y - top).toBeLessThan(20);
  const hand = (await page.getByTestId('touch-interact').boundingBox())!;
  expect(bottom - (hand.y + hand.height)).toBeGreaterThanOrEqual(8);
  expect(bottom - (hand.y + hand.height)).toBeLessThan(30);

  // Every shader, in both views (a software renderer starts with most effects off).
  const everyEffect = () =>
    page.evaluate(async () => {
      const copper = (window as DebugWindow).__copper!;
      copper.quality(0);
      for (let i = 0; i < 2; i++) await new Promise((done) => requestAnimationFrame(done));
      copper.quality(99);
    });
  await everyEffect();
  await page.getByRole('button', { name: 'Switch to first person view' }).tap();
  await expect(page.getByTestId('look-zone')).toBeVisible();
  await everyEffect();
  await testInfo.attach('upright', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('plays in a frame that gives it no storage', async ({ page }) => {
  const errors = watchErrors(page);
  await serve(page);
  await page.goto(`${ORIGIN}/framed`);
  const game = page.frameLocator('iframe');
  await expect(game.getByRole('button', { name: 'New Career' })).toBeVisible();
  // Reading localStorage throws in there; the game has to carry on without a save.
  const storage = await page.frames()[1]!.evaluate(() => {
    try {
      return typeof window.localStorage.length;
    } catch {
      return 'blocked';
    }
  });
  expect(storage).toBe('blocked');
  await clockIn(game);
  expect(errors).toEqual([]);
});
