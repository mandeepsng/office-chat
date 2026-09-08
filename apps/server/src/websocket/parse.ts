import type { z } from "zod";
import { ErrorCodes } from "@office-chat/shared";
import { AppError } from "../utils/errors";

/** Validate a payload, throwing a structured AppError on failure. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const first = result.error.issues[0];
    const detail = first ? `${first.path.join(".")} ${first.message}`.trim() : "invalid payload";
    throw new AppError(ErrorCodes.InvalidPayload, detail);
  }
  return result.data;
}
