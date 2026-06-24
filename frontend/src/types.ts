// Mirrors backend/src/agent/events.ts
export type AgentEvent =
  | { type: "status"; status: "running" | "done" | "error" | "stopped" }
  | { type: "observation"; step: number; url: string; title: string; screenshot: string; marksCount: number }
  | { type: "thought"; step: number; content: string }
  | { type: "action"; step: number; name: string; args: Record<string, unknown>; result?: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "final"; success: boolean; summary: string };

export type RunStatus = "idle" | "running" | "done" | "error" | "stopped";
