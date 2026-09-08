import { isProduction } from "../config/env";

type Level = "INFO" | "WARN" | "ERROR" | "DEBUG";

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = `[${level}] ${message}`;
  const extra = meta && Object.keys(meta).length ? meta : undefined;
  if (level === "ERROR") console.error(line, extra ?? "");
  else if (level === "WARN") console.warn(line, extra ?? "");
  else console.log(line, extra ?? "");
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("INFO", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("WARN", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("ERROR", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (!isProduction) emit("DEBUG", msg, meta);
  },
};
