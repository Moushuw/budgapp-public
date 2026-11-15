import { defineConfig } from "@playwright/test";
import { lireUrlE2e } from "./e2e/outils/url-e2e";

const PORT = 3100;
const URL_E2E = lireUrlE2e();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    locale: "fr-CA",
    timezoneId: "America/Toronto",
    // `--lang` est posé pour la langue de l'interface ; le gabarit « yyyy-mm-dd » d'un champ date vide reste inchangé
    // en Chromium headless (docs/pilotage/passes/m2.md P2-b).
    launchOptions: { args: ["--lang=fr-CA"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // `mobile` est conservé pour M9 mais `npm run e2e` ne lance que `bureau` (scripts/e2e.mts).
  projects: [
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 667 },
        isMobile: false,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
    { name: "bureau", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next build && node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${String(PORT)}`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { DATABASE_URL: URL_E2E, BUDGAPP_DIST_DIR: ".next-e2e" },
    stdout: "pipe",
    stderr: "pipe",
  },
});
