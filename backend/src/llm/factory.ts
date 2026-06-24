import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { MockClient } from "./mockClient.js";
import { OllamaClient } from "./ollamaClient.js";
import type { LlmClient } from "./types.js";

/**
 * Returns the real Ollama Cloud client, or (when MOCK_LLM=1) a scripted offline
 * client that drives the bundled sample form — lets the full UI/SSE pipeline be
 * demoed without an API key or network.
 */
export function createLlm(): LlmClient {
  if (config.mockLlm) {
    const fixture =
      "file:///" +
      fileURLToPath(new URL("../../../tasks/fixtures/sample-form.html", import.meta.url)).replace(/\\/g, "/");
    return new MockClient([
      { content: "Opening the demo contact form.", tool: "navigate", args: { url: fixture } },
      { content: "Filling the full name field.", tool: "type", args: { id: 1, text: "Jane Doe" } },
      { content: "Filling the email field.", tool: "type", args: { id: 2, text: "jane@example.com" } },
      { content: "Adding a message.", tool: "type", args: { id: 6, text: "Hello from BrowserMind (mock mode)." } },
      { content: "Task complete.", tool: "finish", args: { success: true, summary: "Mock demo: filled the sample contact form." } },
    ]);
  }

  return new OllamaClient({
    apiKey: config.ollamaApiKey,
    baseUrl: config.ollamaBaseUrl,
    model: config.modelId,
  });
}
