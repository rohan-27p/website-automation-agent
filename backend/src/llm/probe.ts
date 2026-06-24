import { AGENT_TOOLS } from "../agent/tools.js";
import { config } from "../config.js";
import { OllamaClient } from "./ollamaClient.js";

// One-shot connectivity + tool-calling probe for Ollama Cloud. Run: npx tsx src/llm/probe.ts
const client = new OllamaClient({
  apiKey: config.ollamaApiKey,
  baseUrl: config.ollamaBaseUrl,
  model: config.modelId,
});

console.log(`Probing ${config.modelId} at ${config.ollamaBaseUrl} …`);
const res = await client.chat(
  [
    { role: "system", content: "You are a browser agent. Take exactly one tool call." },
    {
      role: "user",
      content:
        "Page Set-of-Marks:\n[3] <input> Search\nTask: type the word hello into the search box. Respond with one tool call.",
    },
  ],
  AGENT_TOOLS,
);

console.log("content:", JSON.stringify(res.content));
console.log("toolCalls:", JSON.stringify(res.toolCalls, null, 2));
console.log(res.toolCalls.length ? "✓ tool calling works" : "✗ no tool call returned");
