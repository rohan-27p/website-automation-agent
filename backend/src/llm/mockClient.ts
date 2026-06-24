import type { LlmClient, LlmMessage, LlmResponse, ToolSchema } from "./types.js";

/**
 * Deterministic LLM stand-in for offline testing. Returns a pre-scripted
 * sequence of tool calls, one per chat() call, so the whole loop/server can be
 * exercised without an API key or network.
 */
export class MockClient implements LlmClient {
  private index = 0;

  constructor(
    private readonly script: Array<{ content?: string; tool: string; args?: Record<string, unknown> }>,
  ) {}

  async chat(_messages: LlmMessage[], _tools: ToolSchema[]): Promise<LlmResponse> {
    const step = this.script[this.index] ?? { tool: "finish", args: { success: true, summary: "Mock script finished." } };
    this.index += 1;
    return {
      content: step.content ?? "",
      toolCalls: [
        {
          id: `mock-${this.index}`,
          name: step.tool,
          arguments: step.args ?? {},
        },
      ],
    };
  }
}
