# Website Automation Agent

Mini website automation agent for Assignment 04. It uses Playwright directly and exposes the required browser tools as methods on `BrowserAgent`.

## Why Not Just Use Browser Use?

Self-hosted Browser Use can be used as a reference, but using it as the main implementation would likely weaken the viva because the assignment asks you to build a mini version of tools like Browser Use. This project implements the required tools directly:

- `open_browser`
- `navigate_to_url`
- `take_screenshot`
- `click_on_screen(x, y)`
- `send_keys`
- `scroll`
- `double_click`

The agent still follows the Browser Use idea: observe the page, decide which elements look relevant, act through browser tools, and log each step.

## Setup

```bash
cd C:\Users\lostdecimal27\projects\website-automation-agent
npm install
npm run install:browsers
copy .env.example .env
```

Edit `.env` if you want different form values.

## Run

```bash
npm run demo
```

The agent will:

1. Open Chromium.
2. Navigate to `https://ui.shadcn.com/docs/forms/react-hook-form`.
3. Detect form elements.
4. Fill the Name and Description fields.
5. Save before and after screenshots in `screenshots/`.

## Configuration

Environment variables:

- `BROWSER_HEADLESS`: `true` or `false`
- `BROWSER_SLOW_MO_MS`: delay between browser actions
- `TARGET_URL`: page to automate
- `FORM_NAME`: value for the Name field
- `FORM_DESCRIPTION`: value for the Description field
- `SCREENSHOT_DIR`: screenshot output folder

## Error Handling

The agent handles common failures:

- Browser not opened before navigation or actions.
- Page load/network idle timeout.
- Missing or hidden form elements.
- Locator failure with coordinate fallback.
- Failure screenshots for debugging.

## Project Structure

```text
src/
  browserAgent.ts  Required browser tools and form automation logic
  config.ts        Environment-based configuration
  index.ts         Demo runner for the assignment target page
  logger.ts        Timestamped action logging
```
