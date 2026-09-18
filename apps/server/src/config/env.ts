import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH ?? "./data/officechat.db";
  if (configured === ":memory:") return configured;
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(serverRoot, configured);
}

function resolveFilesPath(): string {
  const configured = process.env.FILES_PATH ?? "./data/files";
  return path.isAbsolute(configured) ? configured : path.resolve(serverRoot, configured);
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",
  officeCode: process.env.OFFICE_CODE ?? "CHANGE_ME",
  databasePath: resolveDbPath(),
  filesPath: resolveFilesPath(),
  // Cap uploaded images; clients also downscale before sending.
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024),
  nodeEnv: process.env.NODE_ENV ?? "development",
  logMessageContent: process.env.LOG_MESSAGE_CONTENT === "true",
  // Server-side URL unfurling for link-preview cards. Off → the /unfurl endpoint
  // returns { ok: false } and clients render nothing.
  linkPreviewsEnabled: process.env.LINK_PREVIEWS_ENABLED !== "false",
  linkPreviewTtlDays: Number(process.env.LINK_PREVIEW_TTL_DAYS ?? 7),
} as const;

export const isProduction = env.nodeEnv === "production";

if (isProduction && env.officeCode === "CHANGE_ME") {
  throw new Error("OFFICE_CODE must be set to a real value in production.");
}
