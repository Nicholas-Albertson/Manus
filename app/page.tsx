"use client";

import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [plan, setPlan] = useState("");
  const [findings, setFindings] = useState("");
  const [progress, setProgress] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTask = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setPlan(""); setFindings(""); setProgress(""); setSummary(""); setError("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        body: JSON.stringify({ userInput: input }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start task.");
        return;
      }
      setTaskId(data.taskId);
      setStatus("started");
    } catch (err) {
      console.error(err);
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!taskId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/agent?taskId=${taskId}`);
        const data = await res.json();
        setStatus(data.status);

        if (data.status === "completed" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }

        // Fetch files
        const planRes = await fetch(`/api/agent/${taskId}/files/task_plan.md`);
        if (planRes.ok) setPlan(await planRes.text());
        const findRes = await fetch(`/api/agent/${taskId}/files/findings.md`);
        if (findRes.ok) setFindings(await findRes.text());
        const progRes = await fetch(`/api/agent/${taskId}/files/progress.md`);
        if (progRes.ok) setProgress(await progRes.text());
        const sumRes = await fetch(`/api/agent/${taskId}/files/summary.md`);
        if (sumRes.ok) setSummary(await sumRes.text());
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

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          🤖 Manus‑Style Agent
        </h1>
        <p className="text-gray-400 mb-6">Persistent planning with markdown files</p>

        <div className="mb-8">
          <textarea
            className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="What do you want to accomplish? e.g., 'Research the best laptops under $1000 and summarize'"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 px-6 py-3 rounded-xl font-medium transition"
            onClick={startTask}
            disabled={loading || !input.trim()}
          >
            {loading ? "Starting..." : "Start Task"}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {taskId && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-gray-400">Task ID:</span>
              <code className="bg-gray-800 px-2 py-1 rounded text-sm">{taskId}</code>
              <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                status === "completed" ? "bg-green-900 text-green-300" :
                status === "failed" ? "bg-red-900 text-red-300" :
                "bg-yellow-900 text-yellow-300"
              }`}>
                {status}
              </span>
            </div>

            {summary && (
              <div className="mb-4 bg-gray-900 border border-blue-700/60 rounded-xl p-4">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <span>✅</span> Final Output
                </h2>
                <pre className="whitespace-pre-wrap text-sm font-mono text-gray-100 overflow-auto max-h-[32rem]">
                  {summary}
                </pre>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <span>📋</span> Plan
                </h2>
                <pre className="whitespace-pre-wrap text-sm font-mono text-gray-300 overflow-auto max-h-96">
                  {plan || "Waiting for plan..."}
                </pre>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <span>🔍</span> Findings
                </h2>
                <pre className="whitespace-pre-wrap text-sm font-mono text-gray-300 overflow-auto max-h-96">
                  {findings || "No findings yet."}
                </pre>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <span>📝</span> Progress Log
                </h2>
                <pre className="whitespace-pre-wrap text-sm font-mono text-gray-300 overflow-auto max-h-96">
                  {progress || "No progress yet."}
                </pre>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
