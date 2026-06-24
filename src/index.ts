import { runCli } from "./cli.js";

// Thin entry point. All command handling lives in the CLI module.
// If no command is given, default to the assignment demo for convenience.
const argv = process.argv.slice(2);
await runCli(argv.length > 0 ? argv : ["demo"]);
