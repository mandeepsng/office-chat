import { z } from "zod";
import { LIMITS, MESSAGE_TYPES, PLATFORMS } from "@office-chat/shared";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const uuid = z.string().uuid();

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

export const platformSchema = z.enum(PLATFORMS);
export const messageTypeSchema = z.enum(MESSAGE_TYPES);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authRegisterSchema = z.object({
  officeCode: z.string().min(1).max(128),
  userId: uuid,
  deviceId: uuid,
  name: nonEmpty(LIMITS.NAME_MAX_LENGTH),
  avatar: z.string().max(512).nullish(),
  deviceName: z.string().trim().max(120).default("Desktop"),
  platform: platformSchema,
});

export const authConnectSchema = z.object({
  userId: uuid,
  deviceId: uuid,
});

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const roomCreateSchema = z
  .object({
    type: z.enum(["direct", "group"]),
    name: z.string().trim().max(LIMITS.ROOM_NAME_MAX_LENGTH).optional(),
    memberIds: z.array(uuid).max(200).default([]),
  })
  .refine(
    (r) => r.type === "group" ? !!r.name && r.name.length > 0 : true,
    { message: "Group rooms require a name", path: ["name"] },
  )
  .refine(
    (r) => r.type === "direct" ? r.memberIds.length === 1 : true,
    { message: "Direct rooms require exactly one other member", path: ["memberIds"] },
  );

export const roomIdSchema = z.object({ roomId: uuid });

export const roomHistorySchema = z.object({
  roomId: uuid,
  before: uuid.optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(LIMITS.HISTORY_MAX_PAGE_SIZE)
    .default(LIMITS.HISTORY_PAGE_SIZE),
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const messageSendSchema = z.object({
  roomId: uuid,
  clientMessageId: uuid,
  content: nonEmpty(LIMITS.MESSAGE_MAX_LENGTH),
  messageType: messageTypeSchema.default("text"),
  replyToId: uuid.nullish(),
});

export const messageEditSchema = z.object({
  messageId: uuid,
  content: nonEmpty(LIMITS.MESSAGE_MAX_LENGTH),
});

export const messageDeleteSchema = z.object({ messageId: uuid });

export const messageReadSchema = z.object({
  roomId: uuid,
  messageId: uuid,
});

// ---------------------------------------------------------------------------
// Typing / presence
// ---------------------------------------------------------------------------

export const typingSchema = z.object({ roomId: uuid });

export const presenceUpdateSchema = z.object({
  status: z.enum(["online", "away"]).default("online"),
});

// ---------------------------------------------------------------------------
// Inferred payload types
// ---------------------------------------------------------------------------

export type AuthRegisterInput = z.infer<typeof authRegisterSchema>;
export type AuthConnectInput = z.infer<typeof authConnectSchema>;
export type RoomCreateInput = z.infer<typeof roomCreateSchema>;
export type RoomHistoryInput = z.infer<typeof roomHistorySchema>;
export type MessageSendInput = z.infer<typeof messageSendSchema>;
export type MessageEditInput = z.infer<typeof messageEditSchema>;
export type MessageReadInput = z.infer<typeof messageReadSchema>;
