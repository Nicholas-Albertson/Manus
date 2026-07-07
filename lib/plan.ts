export interface PlanItem {
  done: boolean;
  text: string;
}

/** Parse the agent's `task_plan.md` checkbox list into structured items. */
export function parsePlan(markdown: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.*)$/);
    if (match) {
      items.push({ done: match[1].toLowerCase() === "x", text: match[2].trim() });
    }
  }
  return items;
}
