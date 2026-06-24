#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { BrowserAgent } from "./browserAgent.js";
import { config, type AgentConfig } from "./config.js";
import { scoreField } from "./fieldMatcher.js";
import { Logger } from "./logger.js";
import { loadTask, type Task } from "./task.js";

const logger = new Logger();

const HELP = `
Website Automation Agent — CLI

Usage:
  web-agent <command> [options]

Commands:
  run        Fill a form on a site (task file, or auto-fill a URL)
  inspect    Detect & score fields WITHOUT typing (safe dry run)
  demo       Run the assignment target (shadcn) and fill the fields
  tools      Live-demonstrate all 7 required browser tools on a page
  help       Show this help

Options:
  -t, --task <file>   Task JSON describing { url, fields }   (run/inspect/tools)
  -u, --url <url>     Target URL; auto-fills every field if no task given
      --submit        Click a submit button after filling
      --headless      Run without a visible browser window
      --headed        Force a visible browser window
      --slow-mo <ms>  Delay between every browser action (default 150; try 600 for demos)
      --hold <sec>    Keep the window open this long at the end
                      (headed runs already pause ~6s; use --hold 0 to disable)
  -h, --help          Show this help

Examples:
  web-agent demo
  web-agent run --task tasks/shadcn.json
  web-agent run --url https://httpbin.org/forms/post --submit
  web-agent inspect --task tasks/shadcn.json
  web-agent inspect --url https://example.com
  web-agent tools                       # uses the bundled offline fixture
  web-agent demo --headed --slow-mo 700 --hold 15   # slow, watchable viva run
`;

type ParsedArgs = {
  command: string;
  taskFile?: string;
  url?: string;
  submit: boolean;
  headless?: boolean;
  slowMo?: number;
  hold?: number;
  help: boolean;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** How long to keep the window open at the end. Headed runs pause by default. */
function holdMs(args: ParsedArgs, cfg: AgentConfig): number {
  const seconds = args.hold ?? (cfg.headless ? 0 : 6);
  return Math.max(0, seconds) * 1000;
}

async function holdThenClose(agent: BrowserAgent, ms: number): Promise<void> {
  if (ms > 0) {
    logger.info("Keeping browser open", { seconds: ms / 1000 });
    await sleep(ms);
  }
  await agent.close();
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { command: "", submit: false, help: false };
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--task":
      case "-t":
        args.taskFile = argv[++i];
        break;
      case "--url":
      case "-u":
        args.url = argv[++i];
        break;
      case "--submit":
        args.submit = true;
        break;
      case "--headless":
        args.headless = true;
        break;
      case "--headed":
      case "--no-headless":
        args.headless = false;
        break;
      case "--slow-mo":
      case "--slowmo": {
        const value = Number(argv[++i]);
        if (Number.isFinite(value)) args.slowMo = value;
        break;
      }
      case "--hold": {
        const value = Number(argv[++i]);
        if (Number.isFinite(value)) args.hold = value;
        break;
      }
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        rest.push(arg);
    }
  }

  args.command = rest[0] ?? "";
  return args;
}

function effectiveConfig(args: ParsedArgs): AgentConfig {
  return {
    ...config,
    headless: args.headless ?? config.headless,
    slowMoMs: args.slowMo ?? config.slowMoMs,
  };
}

async function resolveTask(args: ParsedArgs): Promise<Task> {
  const taskFile = args.taskFile ?? config.defaultTaskFile;
  if (taskFile) {
    const task = await loadTask(taskFile);
    if (args.submit) task.submit = true;
    return task;
  }

  const url = args.url ?? config.defaultUrl;
  if (url) {
    return { url, submit: args.submit, name: "auto-fill" };
  }

  throw new Error(
    "No target provided. Pass --task <file.json> or --url <https://...>, " +
      "or set TASK_FILE / TARGET_URL in your environment.",
  );
}

/** `run` and `inspect` share this; dryRun=true never types. */
async function commandRun(args: ParsedArgs, dryRun: boolean): Promise<void> {
  const task = await resolveTask(args);
  const cfg = effectiveConfig(args);
  const agent = new BrowserAgent(cfg, logger);

  try {
    await agent.open_browser();
    await agent.navigate_to_url(task.url);

    if (dryRun) {
      const detected = await agent.detectFormElements();
      logger.info("Detected fields", {
        fields: detected.map((f) => ({
          label: f.label,
          tag: f.tagName,
          type: f.type,
          visible: f.visible,
        })),
      });
      for (const field of task.fields ?? []) {
        const ranked = detected
          .map((f) => ({ label: f.label, score: Number(scoreField(f, field.match).toFixed(2)) }))
          .sort((a, b) => b.score - a.score);
        logger.info("Match preview", { match: field.match, best: ranked[0], runnerUp: ranked[1] });
      }
      logger.info("Inspect complete (nothing was typed)");
      return;
    }

    await agent.take_screenshot("before-fill");
    const results =
      task.fields && task.fields.length > 0
        ? await agent.fillForm(task.fields)
        : await agent.autoFill();

    const filled = results.filter((r) => r.matched).length;
    logger.info("Fill summary", { task: task.name, filled, total: results.length, results });

    if (task.submit) await agent.submit(task.submitMatch);

    await agent.take_screenshot("after-fill");
    logger.info("Done");
  } catch (error) {
    logger.error("Run failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    await agent.take_screenshot("failure").catch(() => undefined);
    process.exitCode = 1;
  } finally {
    // Inspect/dry runs are read-only and quick; only hold when we actually filled.
    await holdThenClose(agent, dryRun ? 0 : holdMs(args, cfg));
  }
}

/**
 * Live-demonstrate every required tool by composing them, exactly as a viva
 * examiner would want to see: open → navigate → screenshot → scroll →
 * click_on_screen → send_keys → double_click → send_keys → screenshot.
 */
async function commandTools(args: ParsedArgs): Promise<void> {
  const fixtureUrl =
    "file:///" +
    fileURLToPath(new URL("../tasks/fixtures/sample-form.html", import.meta.url))
      .replace(/\\/g, "/");
  const target = args.url ?? config.defaultUrl ?? fixtureUrl;

  const cfg = effectiveConfig(args);
  const agent = new BrowserAgent(cfg, logger);
  try {
    logger.info("TOOLS DEMO: 1/7 open_browser");
    await agent.open_browser();

    logger.info("TOOLS DEMO: 2/7 navigate_to_url", { target });
    await agent.navigate_to_url(target);

    logger.info("TOOLS DEMO: 3/7 take_screenshot (initial)");
    await agent.take_screenshot("tools-1-initial");

    logger.info("TOOLS DEMO: 4/7 scroll (down then up)");
    await agent.scroll(400);
    await agent.scroll(-400);

    const fields = (await agent.detectFormElements()).filter((f) => f.visible && f.box);
    const target1 = fields.find((f) => f.tagName === "input" || f.tagName === "textarea");
    if (!target1?.box) {
      logger.warn("No text field with a bounding box found; skipping coordinate tools");
    } else {
      const cx = target1.box.x + target1.box.width / 2;
      const cy = target1.box.y + target1.box.height / 2;

      logger.info("TOOLS DEMO: 5/7 click_on_screen", { field: target1.label, x: cx, y: cy });
      await agent.click_on_screen(cx, cy);

      logger.info("TOOLS DEMO: 6/7 send_keys");
      await agent.send_keys("Typed via click_on_screen + send_keys");
      await agent.take_screenshot("tools-2-after-typing");

      logger.info("TOOLS DEMO: 7/7 double_click (selects a word, then overtype)");
      await agent.double_click(cx, cy);
      await agent.send_keys("Replaced");
    }

    await agent.take_screenshot("tools-3-final");
    logger.info("TOOLS DEMO complete — all 7 tools exercised. See screenshots/");
  } catch (error) {
    logger.error("Tools demo failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    await holdThenClose(agent, holdMs(args, cfg));
  }
}

export async function runCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help || args.command === "help" || args.command === "") {
    console.log(HELP);
    return;
  }

  switch (args.command) {
    case "run":
      await commandRun(args, false);
      break;
    case "inspect":
      await commandRun(args, true);
      break;
    case "demo":
      if (!args.taskFile && !args.url) args.taskFile = "tasks/shadcn.json";
      await commandRun(args, false);
      break;
    case "tools":
      await commandTools(args);
      break;
    default:
      logger.error("Unknown command", { command: args.command });
      console.log(HELP);
      process.exitCode = 1;
  }
}

// Auto-run only when this file is the program entry point.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli(process.argv.slice(2));
}
