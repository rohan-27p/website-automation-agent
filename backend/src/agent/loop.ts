import { BrowserController } from "../browser/controller.js";
import type { LlmClient, LlmMessage, LlmToolCall } from "../llm/types.js";
import { AGENT_TOOLS } from "./tools.js";
import type { EmitFn } from "./events.js";
import { SYSTEM_PROMPT, renderObservation } from "./prompts.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RunOptions = {
  task: string;
  controller: BrowserController;
  llm: LlmClient;
  maxSteps: number;
  emit: EmitFn;
  shouldStop: () => boolean;
};

/**
 * The ReAct loop: observe (Set-of-Marks) -> the LLM reasons and calls one tool
 * -> execute it -> feed the result back -> repeat until 'finish' or maxSteps.
 */
export async function runAgent(opts: RunOptions): Promise<void> {
  const { task, controller, llm, maxSteps, emit, shouldStop } = opts;

  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Task: ${task}` },
  ];

  emit({ type: "status", status: "running" });

  try {
    await controller.open_browser();

    for (let step = 1; step <= maxSteps; step++) {
      if (shouldStop()) {
        emit({ type: "status", status: "stopped" });
        return;
      }

      const obs = await controller.observe();
      emit({
        type: "observation",
        step,
        url: obs.url,
        title: obs.title,
        screenshot: obs.screenshot,
        marksCount: obs.marks.length,
      });
      messages.push({ role: "user", content: renderObservation(obs, step) });

      const response = await llm.chat(messages, AGENT_TOOLS);
      if (response.content.trim()) {
        emit({ type: "thought", step, content: response.content.trim() });
      }

      const call = response.toolCalls[0];
      if (!call) {
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: "Respond with exactly one tool call." });
        emit({ type: "log", level: "warn", message: "No tool call returned; nudging the model." });
        continue;
      }

      messages.push({ role: "assistant", content: response.content, toolCalls: [call] });

      if (call.name === "finish") {
        emit({ type: "action", step, name: call.name, args: call.arguments });
        emit({
          type: "final",
          success: Boolean(call.arguments.success),
          summary: String(call.arguments.summary ?? "Done."),
        });
        emit({ type: "status", status: "done" });
        return;
      }

      let result: string;
      try {
        result = await executeTool(controller, call);
      } catch (error) {
        result = `ERROR: ${error instanceof Error ? error.message : String(error)}`;
      }

      emit({ type: "action", step, name: call.name, args: call.arguments, result });
      messages.push({ role: "tool", toolCallId: call.id, content: result });
    }

    emit({ type: "final", success: false, summary: `Reached the ${maxSteps}-step limit without finishing.` });
    emit({ type: "status", status: "done" });
  } catch (error) {
    emit({ type: "log", level: "error", message: error instanceof Error ? error.message : String(error) });
    emit({ type: "status", status: "error" });
  } finally {
    await controller.close();
  }
}

async function executeTool(controller: BrowserController, call: LlmToolCall): Promise<string> {
  const args = call.arguments;
  switch (call.name) {
    case "navigate":
      await controller.navigate_to_url(String(args.url ?? ""));
      return `navigated to ${args.url}`;
    case "click":
      return controller.clickMark(Number(args.id));
    case "double_click":
      return controller.doubleClickMark(Number(args.id));
    case "type": {
      const result = await controller.typeIntoMark(Number(args.id), String(args.text ?? ""));
      if (args.submit) {
        await controller.pressKey("Enter");
        return `${result} + Enter`;
      }
      return result;
    }
    case "scroll": {
      const amount = Number(args.amount ?? 600);
      const direction = String(args.direction ?? "down");
      await controller.scroll(direction === "up" ? -amount : amount);
      return `scrolled ${direction} ${amount}px`;
    }
    case "press_key":
      return controller.pressKey(String(args.key ?? "Enter"));
    case "wait": {
      const seconds = Number(args.seconds ?? 1);
      await sleep(seconds * 1000);
      return `waited ${seconds}s`;
    }
    default:
      return `unknown tool: ${call.name}`;
  }
}
