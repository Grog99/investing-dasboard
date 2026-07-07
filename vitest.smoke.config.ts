import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.smoke.test.ts"],
    exclude: configDefaults.exclude,
  },
});
