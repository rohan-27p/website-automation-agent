import "dotenv/config";

// Only generic, site-agnostic settings live here. What to fill on which site is
// described per-task (see src/task.ts and the tasks/ folder), not hardcoded.
export type AgentConfig = {
  headless: boolean;
  slowMoMs: number;
  screenshotDir: string;
  /** Optional fallback URL when no --task/--url is provided. */
  defaultUrl?: string;
  /** Optional default task file when no CLI args are provided. */
  defaultTaskFile?: string;
};

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config: AgentConfig = {
  headless: readBoolean(process.env.BROWSER_HEADLESS, false),
  slowMoMs: readNumber(process.env.BROWSER_SLOW_MO_MS, 150),
  screenshotDir: process.env.SCREENSHOT_DIR ?? "screenshots",
  defaultUrl: process.env.TARGET_URL,
  defaultTaskFile: process.env.TASK_FILE,
};
