import { fileURLToPath } from "node:url";
import { BrowserController } from "../browser/controller.js";
import { MockClient } from "../llm/mockClient.js";
import { runAgent } from "./loop.js";

// Offline smoke test: drives the full ReAct loop with a scripted (mock) LLM so
// the browser controller, Set-of-Marks, tool execution and event stream can be
// verified WITHOUT an API key or network. Run with: npm run mock
const fixtureUrl =
  "file:///" +
  fileURLToPath(new URL("../../../tasks/fixtures/sample-form.html", import.meta.url)).replace(/\\/g, "/");

const llm = new MockClient([
  { content: "Open the contact form.", tool: "navigate", args: { url: fixtureUrl } },
  { content: "Fill the full name field.", tool: "type", args: { id: 1, text: "Jane Doe" } },
  { content: "Fill the email field.", tool: "type", args: { id: 2, text: "jane@example.com" } },
  { content: "Done.", tool: "finish", args: { success: true, summary: "Filled name and email on the contact form." } },
]);

const controller = new BrowserController({ headless: true, slowMoMs: 0 });

await runAgent({
  task: "Fill in the contact form with a name and email.",
  controller,
  llm,
  maxSteps: 10,
  emit: (event) => {
    if (event.type === "observation") {
      console.log(`OBSERVE step ${event.step}: ${event.marksCount} marks @ ${event.title || event.url} (screenshot ${event.screenshot.length} b64 chars)`);
    } else if (event.type === "action") {
      console.log(`ACTION step ${event.step}: ${event.name}(${JSON.stringify(event.args)})${event.result ? ` -> ${event.result}` : ""}`);
    } else if (event.type === "thought") {
      console.log(`THINK  step ${event.step}: ${event.content}`);
    } else if (event.type === "final") {
      console.log(`FINAL: success=${event.success} :: ${event.summary}`);
    } else if (event.type === "status") {
      console.log(`STATUS: ${event.status}`);
    } else if (event.type === "log") {
      console.log(`LOG[${event.level}]: ${event.message}`);
    }
  },
  shouldStop: () => false,
});
