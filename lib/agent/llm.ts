// Single place that turns the configured provider (env.llmProvider()) into a
// concrete chat model. Every graph node calls getLlm() instead of
// constructing `ChatOpenAI` directly, so adding a provider only touches this
// file plus the pricing table in cost.ts.
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { env, OPENROUTER_BASE_URL, type LlmProvider } from "../env";

// Union (not the base interface) so callers can rely on `bindTools` being
// present — it's optional on the base `BaseChatModel` type but concretely
// implemented by both of these classes.
export function getLlm(): ChatOpenAI | ChatAnthropic {
  const provider = env.llmProvider();
  if (provider === "anthropic") {
    return new ChatAnthropic({
      model: env.anthropicModel(),
      temperature: 0,
    });
  }
  // Routed through OpenRouter's OpenAI-compatible API rather than OpenAI
  // directly, so both the key and base URL must be set explicitly.
  return new ChatOpenAI({
    model: env.openAiModel(),
    temperature: 0,
    apiKey: env.openRouterApiKey(),
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });
}

/** The model name in effect for the active provider, for display/logging. */
export function activeModelName(provider: LlmProvider = env.llmProvider()): string {
  return provider === "anthropic" ? env.anthropicModel() : env.openAiModel();
}
