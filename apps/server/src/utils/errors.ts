import type { ErrorCode } from "@office-chat/shared";

/** Thrown by services; the router turns it into a structured `error` frame. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
