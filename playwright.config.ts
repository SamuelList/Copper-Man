import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Cloud/dev containers may ship a preinstalled Chromium; CI installs its own.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  // Headless CI renders WebGL in software (SwiftShader), which is slow; give the full-day test room.
  timeout: 180_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      testMatch: 'game.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // SwiftShader gives headless Chromium WebGL for the Three.js renderer.
        launchOptions: { executablePath, args: ['--enable-unsafe-swiftshader'] },
      },
    },
    {
      // A phone in landscape, with touch. Chromium (not WebKit) so the test can drive real
      // multi-touch through the DevTools protocol.
      name: 'iphone',
      testMatch: 'mobile.spec.ts',
      use: {
        ...devices['iPhone 13 landscape'],
        browserName: 'chromium',
        deviceScaleFactor: 2,
        launchOptions: { executablePath, args: ['--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
