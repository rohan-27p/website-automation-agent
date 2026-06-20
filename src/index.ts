import { BrowserAgent } from "./browserAgent.js";
import { config } from "./config.js";
import { Logger } from "./logger.js";

const logger = new Logger();
const agent = new BrowserAgent(config, logger);

async function main(): Promise<void> {
  try {
    await agent.open_browser();
    await agent.navigate_to_url(config.targetUrl);
    await agent.take_screenshot("before-fill");
    await agent.fillTargetForm(config.formName, config.formDescription);
    await agent.take_screenshot("after-fill");
    logger.info("Automation completed");
  } catch (error) {
    logger.error("Automation failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    if (process.exitCode) {
      await agent.take_screenshot("failure").catch(() => undefined);
    }
    await agent.close();
  }
}

await main();
