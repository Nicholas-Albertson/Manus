// Bounded summary of prior steps' findings, injected into each execution
// step's prompt. This is the cost-bounded version of "feed completed-step
// state back into planning" (a documented gap borrowed from BabyAGI's
// circular-replanning failure mode): rather than adding a new LLM call to
// dynamically re-plan, later steps just get to see what earlier ones already
// found, so they don't blindly redo work or contradict it. No new LLM calls
// — this only changes the content of calls that already happen.
const DEFAULT_MAX_CONTEXT_CHARS = 4000;

export function buildFindingsContext(
  findings: string[],
  maxChars: number = DEFAULT_MAX_CONTEXT_CHARS
): string {
  if (findings.length === 0) return "";

  const numbered = findings.map((f, i) => `${i + 1}. ${f}`).join("\n");
  const body =
    numbered.length > maxChars
      ? `[earlier findings truncated to the most recent ${maxChars} characters]\n...\n${numbered.slice(-maxChars)}`
      : numbered;

  return `\n\nFindings from earlier steps so far:\n${body}`;
}
