export async function webSearch(args: { query: string }): Promise<string> {
  const query = args.query;
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
      const data = await response.json();
      const results = data.organic?.slice(0, 3).map((r: any) => `${r.title}: ${r.snippet}`).join("\n");
      return results || "No search results found.";
    } catch (err) {
      console.error("Search error:", err);
      return "Search failed due to an error.";
    }
  }
  // Simulated response for demo (no API key)
  return `[Simulated] Web search for: "${query}". In a production environment, this would return real results via Serper API.`;
}
