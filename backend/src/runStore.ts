import { randomUUID } from "node:crypto";
import type { AgentEvent } from "./agent/events.js";

export type RunStatus = "running" | "done" | "error" | "stopped";

export type Run = {
  id: string;
  task: string;
  status: RunStatus;
  events: AgentEvent[];
  stopRequested: boolean;
  subscribers: Set<(event: AgentEvent) => void>;
  createdAt: number;
};

/** In-memory registry of agent runs and their event histories (for SSE replay). */
class RunStore {
  private runs = new Map<string, Run>();

  create(task: string): Run {
    const run: Run = {
      id: randomUUID(),
      task,
      status: "running",
      events: [],
      stopRequested: false,
      subscribers: new Set(),
      createdAt: Date.now(),
    };
    this.runs.set(run.id, run);
    return run;
  }

  get(id: string): Run | undefined {
    return this.runs.get(id);
  }

  emit(id: string, event: AgentEvent): void {
    const run = this.runs.get(id);
    if (!run) return;
    run.events.push(event);
    if (event.type === "status") run.status = event.status;
    for (const subscriber of run.subscribers) subscriber(event);
  }

  subscribe(id: string, cb: (event: AgentEvent) => void): () => void {
    const run = this.runs.get(id);
    if (!run) return () => undefined;
    run.subscribers.add(cb);
    return () => run.subscribers.delete(cb);
  }

  requestStop(id: string): void {
    const run = this.runs.get(id);
    if (run) run.stopRequested = true;
  }
}

export const runStore = new RunStore();
