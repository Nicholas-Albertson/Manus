import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The agent code is Node-only (fs, fetch, LangChain); no DOM needed for the
    // priority-1/2 suites, which cover pure logic and filesystem helpers.
    environment: "node",
    globals: true,
    include: ["{app,lib}/**/*.test.ts"],
  },
});
