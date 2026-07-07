import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The agent code is Node-only (fs, fetch, LangChain); no DOM needed for
    // either the co-located (app/lib) or top-level (tests/) suites, which
    // cover pure logic, filesystem helpers, and mocked-LLM/Redis integration.
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "{app,lib}/**/*.test.ts"],
  },
});
