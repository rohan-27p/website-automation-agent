// Provider-agnostic LLM contract so the agent loop doesn't depend on any SDK.
// OllamaClient is the real implementation; MockClient is used for offline tests.

export type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type LlmResponse = {
  content: string;
  toolCalls: LlmToolCall[];
};

export interface LlmClient {
  chat(messages: LlmMessage[], tools: ToolSchema[]): Promise<LlmResponse>;
}
