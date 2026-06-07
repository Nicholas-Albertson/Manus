"use client";

interface PlanItem {
  done: boolean;
  text: string;
}

function parsePlan(markdown: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/);
    if (match) {
      items.push({ done: match[1].toLowerCase() === "x", text: match[2].trim() });
    }
  }
  return items;
}

export default function PlanChecklist({ markdown }: { markdown: string }) {
  const items = parsePlan(markdown);

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">Waiting for the plan…</p>;
  }

  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <div>
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>
            {done} / {items.length} steps
          </span>
          <span>{pct}%</span>
        </div>
        <div
          className="h-1.5 bg-gray-800 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ul className="space-y-2.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2.5 text-sm">
            <span
              className={
                "mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-medium " +
                (item.done
                  ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/40"
                  : "bg-gray-800 text-gray-400 ring-1 ring-gray-700")
              }
            >
              {item.done ? "✓" : idx + 1}
            </span>
            <span className={item.done ? "text-gray-500 line-through" : "text-gray-200"}>
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
