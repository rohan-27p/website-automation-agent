export type LogLevel = "info" | "warn" | "error";

export class Logger {
  log(level: LogLevel, message: string, details?: unknown): void {
    const timestamp = new Date().toISOString();
    const suffix = details ? ` ${JSON.stringify(details)}` : "";
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${suffix}`);
  }

  info(message: string, details?: unknown): void {
    this.log("info", message, details);
  }

  warn(message: string, details?: unknown): void {
    this.log("warn", message, details);
  }

  error(message: string, details?: unknown): void {
    this.log("error", message, details);
  }
}
