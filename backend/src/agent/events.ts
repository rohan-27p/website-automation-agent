// Events streamed from the agent loop to the frontend (over SSE).
export type AgentEvent =
  | { type: "status"; status: "running" | "done" | "error" | "stopped" }
  | {
      type: "observation";
      step: number;
      url: string;
      title: string;
      screenshot: string; // base64 PNG
      marksCount: number;
    }
  | { type: "thought"; step: number; content: string }
  | {
      type: "action";
      step: number;
      name: string;
      args: Record<string, unknown>;
      result?: string;
    }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "final"; success: boolean; summary: string };

export type EmitFn = (event: AgentEvent) => void;
