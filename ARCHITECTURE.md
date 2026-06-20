# Architecture

## Goal

The agent automates a website form without manual intervention. It is intentionally small so each browser action can be explained during the viva.

## Components

- `BrowserAgent`: owns the Playwright browser, context, page, and tool methods.
- `config`: reads URL, browser mode, form values, and screenshot output settings from environment variables.
- `Logger`: prints timestamped decisions and actions.
- `index`: orchestrates the assignment workflow.

## Workflow

1. `open_browser` launches Chromium and creates a page.
2. `navigate_to_url` opens the target URL and waits for the document to load.
3. `take_screenshot` records the starting page state.
4. `detectFormElements` inspects inputs, textareas, labels, placeholders, names, IDs, and bounding boxes.
5. `fillTargetForm` fills Name and Description using accessible labels first, then placeholders and selectors, then coordinate fallback.
6. `take_screenshot` records the final state.
7. `close` shuts down browser resources.

## Element Detection Strategy

The agent uses a layered strategy:

1. Accessible labels such as `Name` and `Description`.
2. Placeholder text.
3. Attribute selectors such as `name`.
4. Generic input/textarea fallback.
5. Visual coordinate fallback using element bounding boxes.

This is more robust than hard-coding one CSS selector and demonstrates basic agent decision-making.

## Why Playwright

Playwright is recommended by the assignment, supports reliable browser control, and provides high-level locators plus low-level mouse and keyboard APIs. That lets the project satisfy both intelligent element detection and the required screen-coordinate tools.
