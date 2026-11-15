import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";
import { urlBaseDeTest } from "./prisma/test/environnement.mts";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/*.e2e.ts", "**/.next-e2e/**"],
    // Un futur `test.projects` doit mettre `extends: true` sur chaque projet, sinon env/globalSetup/setupFiles ne s'y appliquent pas.
    env: { DATABASE_URL: urlBaseDeTest(import.meta.dirname) },
    globalSetup: ["./prisma/test/preparer-base-de-test.ts"],
    setupFiles: ["./prisma/test/garde-environnement.ts"],
  },
});
