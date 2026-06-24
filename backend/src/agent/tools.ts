import type { ToolSchema } from "../llm/types.js";

// The high-level actions the LLM may take. Each maps onto the controller, which
// executes it through the seven required low-level browser tools.
export const AGENT_TOOLS: ToolSchema[] = [
  {
    name: "navigate",
    description: "Load a URL in the browser.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Absolute or bare URL to open." } },
      required: ["url"],
    },
  },
  {
    name: "click",
    description: "Click the interactive element with the given Set-of-Marks id.",
    parameters: {
      type: "object",
      properties: { id: { type: "integer", description: "The [n] mark of the element to click." } },
      required: ["id"],
    },
  },
  {
    name: "type",
    description: "Type text into the input/textarea with the given mark id. Optionally press Enter to submit.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "integer", description: "The [n] mark of the field." },
        text: { type: "string", description: "Text to type." },
        submit: { type: "boolean", description: "Press Enter after typing.", default: false },
      },
      required: ["id", "text"],
    },
  },
  {
    name: "double_click",
    description: "Double-click the element with the given mark id (e.g. to select a word).",
    parameters: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
  },
  {
    name: "scroll",
    description: "Scroll the page up or down to reveal more elements.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["down", "up"], default: "down" },
        amount: { type: "integer", description: "Pixels to scroll.", default: 600 },
      },
      required: ["direction"],
    },
  },
  {
    name: "press_key",
    description: "Press a single keyboard key or chord (e.g. 'Enter', 'Escape', 'ControlOrMeta+A').",
    parameters: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "wait",
    description: "Wait a number of seconds for the page to settle.",
    parameters: {
      type: "object",
      properties: { seconds: { type: "number", default: 1 } },
      required: [],
    },
  },
  {
    name: "finish",
    description: "End the task. Call this when the goal is achieved or is impossible.",
    parameters: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        summary: { type: "string", description: "Short summary of what was accomplished." },
      },
      required: ["success", "summary"],
    },
  },
];
