// Python execution is an env-gated opt-in. When E2B_API_KEY is set, code runs
// in an isolated E2B cloud sandbox (https://e2b.dev); otherwise we fall back to
// a safe stub so the prototype still runs end-to-end without arbitrary code
// execution. Never run untrusted code in-process on the Node server.
import { z } from "zod";

const executePythonArgsSchema = z.object({
  code: z.string(),
});

function disabledMessage(code: string): string {
  return (
    "Python execution is disabled (no sandbox configured). " +
    "Set E2B_API_KEY to enable isolated execution. Code received:\n" +
    "```python\n" +
    code +
    "\n```"
  );
}

export async function executePython(args: unknown): Promise<string> {
  const parsedArgs = executePythonArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    return "Error: execute_python expects { code: string }";
  }

  const code = parsedArgs.data.code;

  if (!process.env.E2B_API_KEY) {
    return disabledMessage(code);
  }

  try {
    const { Sandbox } = await import("@e2b/code-interpreter");
    const sandbox = await Sandbox.create();
    try {
      const execution = await sandbox.runCode(code);
      const parts = [
        execution.results.map((r) => r.text ?? "").filter(Boolean).join("\n"),
        execution.logs.stdout.join(""),
        execution.logs.stderr.join(""),
        execution.error
          ? `${execution.error.name}: ${execution.error.value}`
          : "",
      ].filter((s) => s && s.trim().length > 0);
      return parts.join("\n").trim() || "(no output)";
    } finally {
      await sandbox.kill();
    }
  } catch (err) {
    return `Error executing Python in sandbox: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
}
