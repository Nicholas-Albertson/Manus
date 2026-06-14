import { z } from "zod";

const webSearchArgsSchema = z.object({
  query: z.string().min(1),
});

const serperResponseSchema = z.object({
  organic: z
    .array(
      z.object({
        title: z.string().optional(),
        snippet: z.string().optional(),
      })
    )
    .optional(),
});

export async function webSearch(args: unknown): Promise<string> {
  const parsedArgs = webSearchArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    return "Error: web_search expects { query: string }";
  }

  const query = parsedArgs.data.query;
  // Use Serper API if key is present, otherwise return simulated result
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  if (SERPER_API_KEY) {
    try {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query }),
      });
      const data: unknown = await response.json();
      const parsed = serperResponseSchema.safeParse(data);
      if (!parsed.success) {
        return "Search failed due to an unexpected response shape.";
      }

      const results = parsed.data.organic
        ?.slice(0, 3)
        .map((r) => `${r.title ?? "Result"}: ${r.snippet ?? ""}`.trim())
        .join("\n");
      return results || "No search results found.";
    } catch (err) {
      console.error("Search error:", err);
      return "Search failed due to an error.";
    }
  }
  // Simulated response for demo (no API key)
  return `[Simulated] Web search for: "${query}". In a production environment, this would return real results via Serper API.`;
}
