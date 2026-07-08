// Single source of truth for the environment variables this app recognizes,
// so env access isn't scattered across the codebase as ad-hoc process.env reads.

export const RECOGNIZED_ENV_KEYS = new Set<string>([
  "OPENROUTER_API_KEY",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "LLM_PROVIDER",
  "SERPER_API_KEY",
  "E2B_API_KEY",
  "RATE_LIMIT_MAX",
  "RATE_LIMIT_WINDOW_MS",
  "REDIS_URL",
  "REQUIRE_PLAN_APPROVAL",
]);

// The "openai" provider is served through OpenRouter's OpenAI-compatible API
// rather than OpenAI directly, so model ids need OpenRouter's `vendor/model`
// slug format.
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENAI_MODEL = "openai/gpt-4o";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
export const DEFAULT_RATE_LIMIT_MAX = 10;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 requests / 10 min / IP

export type LlmProvider = "openai" | "anthropic";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  openRouterApiKey: (): string | undefined => process.env.OPENROUTER_API_KEY,
  openAiModel: (): string => process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
  anthropicApiKey: (): string | undefined => process.env.ANTHROPIC_API_KEY,
  anthropicModel: (): string =>
    process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
  /**
   * Which LLM provider to use. Explicit `LLM_PROVIDER` wins; otherwise infer
   * from whichever API key is present (OpenAI/OpenRouter takes precedence if
   * both are set, preserving prior behavior for existing deployments).
   */
  llmProvider: (): LlmProvider => {
    const explicit = process.env.LLM_PROVIDER?.toLowerCase();
    if (explicit === "anthropic" || explicit === "openai") return explicit;
    if (!process.env.OPENROUTER_API_KEY && process.env.ANTHROPIC_API_KEY) {
      return "anthropic";
    }
    return "openai";
  },
  /** True if at least one supported LLM provider has a key configured. */
  hasAnyLlmKey: (): boolean =>
    Boolean(process.env.OPENROUTER_API_KEY) || Boolean(process.env.ANTHROPIC_API_KEY),
  serperApiKey: (): string | undefined => process.env.SERPER_API_KEY,
  e2bApiKey: (): string | undefined => process.env.E2B_API_KEY,
  redisUrl: (): string | undefined => process.env.REDIS_URL,
  /**
   * When true, the graph pauses after planning and waits for an explicit
   * approve/reject call before spending any execution-step LLM calls or tool
   * invocations. Off by default to preserve the zero-config run-to-completion
   * experience; opt in for a human checkpoint before spend begins.
   */
  requirePlanApproval: (): boolean => process.env.REQUIRE_PLAN_APPROVAL === "true",
  rateLimitMax: (): number =>
    parsePositiveInt(process.env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
  rateLimitWindowMs: (): number =>
    parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
  /** True if a recognized env key is set to a non-empty value. */
  has: (key: string): boolean =>
    RECOGNIZED_ENV_KEYS.has(key) && Boolean(process.env[key]),
};
