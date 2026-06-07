"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Markdown from "./components/Markdown";
import PlanChecklist from "./components/PlanChecklist";

const MAX_INPUT = 4000;

const EXAMPLES = [
  "Research the best laptops under $1000 and summarize the top 3",
  "Outline a go-to-market plan for a developer tool",
  "Compare three popular vector databases and recommend one",
];

const STATUS_META: Record<
  string,
  { label: string; dot: string; chip: string; busy: boolean }
> = {
  pending: { label: "Pending", dot: "bg-yellow-400", chip: "bg-yellow-900/60 text-yellow-200", busy: true },
  started: { label: "Starting", dot: "bg-yellow-400", chip: "bg-yellow-900/60 text-yellow-200", busy: true },
  running: { label: "Running", dot: "bg-blue-400", chip: "bg-blue-900/60 text-blue-200", busy: true },
  completed: { label: "Completed", dot: "bg-green-400", chip: "bg-green-900/60 text-green-200", busy: false },
  failed: { label: "Failed", dot: "bg-red-400", chip: "bg-red-900/60 text-red-200", busy: false },
};

interface TaskState {
  status: string;
  plan: string;
  findings: string;
  progress: string;
  summary: string;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [state, setState] = useState<TaskState>({
    status: "",
    plan: "",
    findings: "",
    progress: "",
    summary: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"findings" | "progress">("findings");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const meta = STATUS_META[state.status] ?? null;

  const startTask = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    setTaskId(null);
    setState({ status: "", plan: "", findings: "", progress: "", summary: "" });
    if (intervalRef.current) clearInterval(intervalRef.current);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        body: JSON.stringify({ userInput: trimmed }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start the task.");
        return;
      }
      setTaskId(data.taskId);
      setState((s) => ({ ...s, status: "started" }));
    } catch (err) {
      console.error(err);
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  useEffect(() => {
    if (!taskId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/agent/${taskId}`);
        if (!res.ok) return;
        const data: TaskState = await res.json();
        setState({
          status: data.status,
          plan: data.plan,
          findings: data.findings,
          progress: data.progress,
          summary: data.summary,
        });
        if (data.status === "completed" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch (err) {
        console.error(err);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [taskId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      startTask();
    }
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(state.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const downloadSummary = () => {
    const blob = new Blob([state.summary], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taskflow-summary-${taskId?.slice(0, 8) ?? "result"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(60rem_40rem_at_50%_-10%,rgba(59,130,246,0.12),transparent)]">
      <header className="border-b border-gray-900/80 backdrop-blur sticky top-0 z-10 bg-[#07080c]/80">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-14 flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold">
            T
          </div>
          <span className="font-semibold tracking-tight">Taskflow</span>
          <span className="text-xs text-gray-500 hidden sm:inline">
            Autonomous planning agent
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <div className="mb-10 max-w-3xl">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            What should we accomplish?
          </h1>
          <p className="text-gray-400 mt-2">
            Describe a goal. Taskflow plans the steps, runs them with tools,
            verifies each result, and hands back a consolidated answer.
          </p>
        </div>

        {/* Composer */}
        <section className="mb-8">
          <label htmlFor="task-input" className="sr-only">
            Task description
          </label>
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 focus-within:border-blue-600/70 focus-within:ring-2 focus-within:ring-blue-600/20 transition">
            <textarea
              id="task-input"
              className="w-full bg-transparent p-4 text-gray-100 placeholder-gray-500 focus:outline-none resize-y rounded-2xl"
              rows={3}
              maxLength={MAX_INPUT}
              placeholder="e.g. Research the best laptops under $1000 and summarize the top 3"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="flex items-center justify-between gap-3 px-4 pb-3">
              <span className="text-xs text-gray-500">
                <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px]">⌘/Ctrl</kbd>
                {" + "}
                <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px]">Enter</kbd> to run
                <span className="ml-3">{input.length}/{MAX_INPUT}</span>
              </span>
              <button
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 px-5 py-2.5 rounded-xl font-medium transition"
                onClick={startTask}
                disabled={loading || !input.trim()}
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {loading ? "Starting…" : "Run task"}
              </button>
            </div>
          </div>

          {!taskId && (
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="text-xs text-gray-300 bg-gray-900/70 hover:bg-gray-800 border border-gray-800 rounded-full px-3 py-1.5 transition"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </section>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-200 animate-fade-in"
          >
            {error}
          </div>
        )}

        {taskId && (
          <div className="animate-fade-in">
            {/* Status bar */}
            <div className="mb-6 flex flex-wrap items-center gap-3" aria-live="polite">
              {meta && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${meta.chip}`}
                >
                  <span className={`relative flex h-2 w-2`}>
                    {meta.busy && (
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${meta.dot}`} />
                    )}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
                  </span>
                  {meta.label}
                </span>
              )}
              <span className="text-xs text-gray-500">
                Task <code className="bg-gray-900 px-1.5 py-0.5 rounded text-gray-400">{taskId.slice(0, 8)}</code>
              </span>
            </div>

            {/* Final output */}
            {state.summary ? (
              <section className="mb-6 rounded-2xl border border-blue-800/50 bg-gray-900/60 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <span>✅</span> Final Output
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={copySummary}
                      className="text-xs text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 transition"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={downloadSummary}
                      className="text-xs text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 transition"
                    >
                      Download
                    </button>
                  </div>
                </div>
                <Markdown>{state.summary}</Markdown>
              </section>
            ) : (
              meta?.busy && (
                <section className="mb-6 rounded-2xl border border-gray-800 bg-gray-900/40 p-5">
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-400" />
                    Working through the plan… the final answer will appear here.
                  </div>
                </section>
              )
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Plan */}
              <section className="lg:col-span-2 rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
                <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <span>📋</span> Plan
                </h2>
                <PlanChecklist markdown={state.plan} />
              </section>

              {/* Activity (tabs) */}
              <section className="lg:col-span-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
                <div className="flex items-center gap-1 mb-4 border-b border-gray-800">
                  {(["findings", "progress"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={
                        "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition " +
                        (tab === t
                          ? "border-blue-500 text-gray-100"
                          : "border-transparent text-gray-500 hover:text-gray-300")
                      }
                    >
                      {t === "findings" ? "🔍 Findings" : "📝 Progress"}
                    </button>
                  ))}
                </div>

                <div className="max-h-[28rem] overflow-auto">
                  {tab === "findings" ? (
                    state.findings ? (
                      <Markdown>{state.findings}</Markdown>
                    ) : (
                      <p className="text-sm text-gray-500">No findings yet.</p>
                    )
                  ) : state.progress ? (
                    <pre className="whitespace-pre-wrap text-xs font-mono text-gray-400 leading-relaxed">
                      {state.progress}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-500">No progress logged yet.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 md:px-8 py-8 text-xs text-gray-600">
        Taskflow · plans, executes, verifies, and summarizes — with bounded,
        cost-aware execution.
      </footer>
    </div>
  );
}
