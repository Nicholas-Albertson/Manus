import { describe, it, expect, afterEach } from "vitest";
import {
  env,
  RECOGNIZED_ENV_KEYS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "../lib/env";

describe("env", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("recognizes the expected key set", () => {
    expect(RECOGNIZED_ENV_KEYS).toBeInstanceOf(Set);
    expect([...RECOGNIZED_ENV_KEYS].sort()).toEqual([
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_MODEL",
      "E2B_API_KEY",
      "LLM_PROVIDER",
      "OPENAI_MODEL",
      "OPENROUTER_API_KEY",
      "RATE_LIMIT_MAX",
      "RATE_LIMIT_WINDOW_MS",
      "REDIS_URL",
      "REQUIRE_PLAN_APPROVAL",
      "SERPER_API_KEY",
    ]);
  });

  it("falls back to the default model", () => {
    delete process.env.OPENAI_MODEL;
    expect(env.openAiModel()).toBe(DEFAULT_OPENAI_MODEL);
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    expect(env.openAiModel()).toBe("gpt-4o-mini");

    delete process.env.ANTHROPIC_MODEL;
    expect(env.anthropicModel()).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it("has() only reports recognized, non-empty keys", () => {
    delete process.env.SERPER_API_KEY;
    expect(env.has("SERPER_API_KEY")).toBe(false);
    process.env.SERPER_API_KEY = "x";
    expect(env.has("SERPER_API_KEY")).toBe(true);
    // unrecognized key is never reported, even if set
    process.env.SOME_OTHER_KEY = "y";
    expect(env.has("SOME_OTHER_KEY")).toBe(false);
  });

  it("llmProvider() infers from whichever key is present, OpenAI wins if both set", () => {
    delete process.env.LLM_PROVIDER;
    process.env.OPENROUTER_API_KEY = "sk-...";
    delete process.env.ANTHROPIC_API_KEY;
    expect(env.llmProvider()).toBe("openai");

    delete process.env.OPENROUTER_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-...";
    expect(env.llmProvider()).toBe("anthropic");

    process.env.OPENROUTER_API_KEY = "sk-...";
    expect(env.llmProvider()).toBe("openai");
  });

  it("llmProvider() respects an explicit LLM_PROVIDER override", () => {
    process.env.OPENROUTER_API_KEY = "sk-...";
    process.env.ANTHROPIC_API_KEY = "sk-ant-...";
    process.env.LLM_PROVIDER = "anthropic";
    expect(env.llmProvider()).toBe("anthropic");
  });

  it("hasAnyLlmKey() reflects either provider key", () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(env.hasAnyLlmKey()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-ant-...";
    expect(env.hasAnyLlmKey()).toBe(true);
  });

  it("requirePlanApproval() is off unless explicitly set to the string \"true\"", () => {
    delete process.env.REQUIRE_PLAN_APPROVAL;
    expect(env.requirePlanApproval()).toBe(false);
    process.env.REQUIRE_PLAN_APPROVAL = "1";
    expect(env.requirePlanApproval()).toBe(false);
    process.env.REQUIRE_PLAN_APPROVAL = "true";
    expect(env.requirePlanApproval()).toBe(true);
  });

  it("rate limit getters fall back to defaults on missing/invalid values", () => {
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    expect(env.rateLimitMax()).toBe(DEFAULT_RATE_LIMIT_MAX);
    expect(env.rateLimitWindowMs()).toBe(DEFAULT_RATE_LIMIT_WINDOW_MS);

    process.env.RATE_LIMIT_MAX = "not-a-number";
    expect(env.rateLimitMax()).toBe(DEFAULT_RATE_LIMIT_MAX);

    process.env.RATE_LIMIT_MAX = "25";
    expect(env.rateLimitMax()).toBe(25);
  });
});
