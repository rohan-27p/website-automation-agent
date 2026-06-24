import { fileURLToPath } from "node:url";
import { BrowserController } from "../browser/controller.js";
import { config } from "../config.js";
import { OllamaClient } from "../llm/ollamaClient.js";
import { runAgent } from "./loop.js";

// Real end-to-end run: qwen3-coder reasons over the Set-of-Marks and drives the
// browser. Run: npx tsx src/agent/realRun.ts
const fixtureUrl =
  "file:///" +
  fileURLToPath(new URL("../../../tasks/fixtures/sample-form.html", import.meta.url)).replace(/\\/g, "/");

const controller = new BrowserController({ headless: true, slowMoMs: 0 });
const llm = new OllamaClient({
  apiKey: config.ollamaApiKey,
  baseUrl: config.ollamaBaseUrl,
  model: config.modelId,
});

await runAgent({
  task: `Open the page at ${fixtureUrl}. Fill the Full Name field with "Jane Doe", the Email field with "jane@example.com", and the Message field with "Hello there". Do NOT submit. Then finish.`,
  controller,
  llm,
  maxSteps: 8,
  emit: (event) => {
    if (event.type === "observation") console.log(`OBSERVE step ${event.step}: ${event.marksCount} marks @ ${event.title || event.url}`);
    else if (event.type === "action") console.log(`ACTION step ${event.step}: ${event.name}(${JSON.stringify(event.args)})${event.result ? ` -> ${event.result}` : ""}`);
    else if (event.type === "thought") console.log(`THINK  step ${event.step}: ${event.content.slice(0, 120)}`);
    else if (event.type === "final") console.log(`FINAL: success=${event.success} :: ${event.summary}`);
    else if (event.type === "status") console.log(`STATUS: ${event.status}`);
    else if (event.type === "log") console.log(`LOG[${event.level}]: ${event.message}`);
  },
  shouldStop: () => false,
});
