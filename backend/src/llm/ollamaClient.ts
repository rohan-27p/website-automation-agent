import OpenAI from "openai";
import type { LlmClient, LlmMessage, LlmResponse, ToolSchema } from "./types.js";

/**
 * Talks to Ollama Cloud through its OpenAI-compatible endpoint
 * (https://ollama.com/v1) using native tool calling.
 */
export class OllamaClient implements LlmClient {
  private readonly client: OpenAI;

  constructor(private readonly cfg: { apiKey: string; baseUrl: string; model: string }) {
    this.client = new OpenAI({
      apiKey: cfg.apiKey || "ollama",
      baseURL: cfg.baseUrl,
    });
  }

  async chat(messages: LlmMessage[], tools: ToolSchema[]): Promise<LlmResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.cfg.model,
      temperature: 0,
      messages: messages.map(toOpenAiMessage),
      tools: tools.map((tool) => ({ type: "function" as const, function: tool })),
      tool_choice: "auto",
    });

    const message = completion.choices[0]?.message;
    const toolCalls = (message?.tool_calls ?? [])
      .filter((tc): tc is typeof tc & { function: { name: string; arguments: string } } =>
        "function" in tc,
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeJsonParse(tc.function.arguments),
      }));

    // Some models occasionally emit the action as JSON in content instead of a
    // native tool call. Recover that so the loop keeps working.
    if (toolCalls.length === 0 && message?.content) {
      const recovered = recoverToolCallFromText(message.content);
      if (recovered) toolCalls.push(recovered);
    }

    return { content: message?.content ?? "", toolCalls };
  }
}

function toOpenAiMessage(message: LlmMessage): OpenAI.Chat.ChatCompletionMessageParam {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content };
    case "user":
      return { role: "user", content: message.content };
    case "tool":
      return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    case "assistant":
      return {
        role: "assistant",
        content: message.content || null,
        ...(message.toolCalls && message.toolCalls.length
          ? {
              tool_calls: message.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            }
          : {}),
      };
  }
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function recoverToolCallFromText(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    const obj = JSON.parse(match[0]);
    const name = obj.tool ?? obj.name ?? obj.action;
    if (typeof name !== "string") return undefined;
    return {
      id: `recovered-${Date.now()}`,
      name,
      arguments: (obj.arguments ?? obj.args ?? obj.parameters ?? {}) as Record<string, unknown>,
    };
  } catch {
    return undefined;
  }
}
