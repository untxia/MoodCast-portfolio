import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

const use = {
  ...devices['Pixel 7'],
  baseURL: `http://localhost:${PORT}`,
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
};

export default defineConfig({
  testDir: './tests',
  timeout: 60000, // WebGL logiciel + machine chargée : 30 s ne suffisent pas toujours
  fullyParallel: true,
  workers: 2, // WebGL logiciel (swiftshader) : au-delà, les tests deviennent instables
  forbidOnly: !!process.env.CI,
  retries: 1, // rendu WebGL logiciel : une nouvelle tentative absorbe les à-coups de charge
  reporter: [['list']],
  // Les captures de référence sont propres à chaque OS : {platform} dans le nom du fichier.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' } },
  use,
  projects: [
    { name: 'e2e', testDir: './tests/e2e' },
    // Rendu WebGL logiciel : une nouvelle tentative absorbe les à-coups de charge de la machine
    { name: 'visual', testDir: './tests/visual', retries: 1 }
  ],
  webServer: {
    command: 'node scripts/build.mjs && node scripts/serve.mjs',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), MOCK_AI: '1' },
    timeout: 120000
  }
});
