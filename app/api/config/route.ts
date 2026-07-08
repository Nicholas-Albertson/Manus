import { NextResponse } from "next/server";
import { env } from "../../../lib/env";
import { activeModelName } from "../../../lib/agent/llm";
import { estimateWorstCase } from "../../../lib/agent/cost";
import { MAX_PLAN_STEPS, MAX_STEP_ATTEMPTS } from "../../../lib/agent/limits";

// Public, non-secret runtime configuration the client needs to render the
// pre-run cost estimate and provider label. Never include API keys here.
export async function GET() {
  const provider = env.llmProvider();
  const model = activeModelName(provider);
  const estimate = estimateWorstCase(model, MAX_PLAN_STEPS, MAX_STEP_ATTEMPTS);

  return NextResponse.json({
    provider,
    model,
    maxPlanSteps: MAX_PLAN_STEPS,
    maxStepAttempts: MAX_STEP_ATTEMPTS,
    estimate,
  });
}
