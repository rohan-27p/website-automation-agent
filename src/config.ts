import "dotenv/config";

export type AgentConfig = {
  headless: boolean;
  slowMoMs: number;
  targetUrl: string;
  formName: string;
  formDescription: string;
  screenshotDir: string;
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
  targetUrl:
    process.env.TARGET_URL ??
    "https://ui.shadcn.com/docs/forms/react-hook-form",
  formName: process.env.FORM_NAME ?? "Assignment Demo Agent",
  formDescription:
    process.env.FORM_DESCRIPTION ??
    "This text was entered automatically by the website automation agent.",
  screenshotDir: process.env.SCREENSHOT_DIR ?? "screenshots",
};
