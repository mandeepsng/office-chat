// Centralized WebSocket event names. Never hardcode these strings elsewhere.

export const ClientEvents = {
  AuthRegister: "auth:register",
  AuthConnect: "auth:connect",

  RoomList: "room:list",
  RoomCreate: "room:create",
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  RoomHistory: "room:history",

  MessageSend: "message:send",
  MessageEdit: "message:edit",
  MessageDelete: "message:delete",
  MessageRead: "message:read",

  TypingStart: "typing:start",
  TypingStop: "typing:stop",

  PresenceUpdate: "presence:update",
} as const;

export const ServerEvents = {
  AuthSuccess: "auth:success",
  AuthError: "auth:error",

  RoomList: "room:list",
  RoomCreated: "room:created",
  RoomUpdated: "room:updated",
  RoomHistory: "room:history",

  MessageNew: "message:new",
  MessageUpdated: "message:updated",
  MessageDeleted: "message:deleted",
  MessageSent: "message:sent",
  MessageRead: "message:read",

  TypingStart: "typing:start",
  TypingStop: "typing:stop",

  PresenceOnline: "presence:online",
  PresenceOffline: "presence:offline",

  Error: "error",
} as const;

export type ClientEvent = (typeof ClientEvents)[keyof typeof ClientEvents];
export type ServerEvent = (typeof ServerEvents)[keyof typeof ServerEvents];

// Stable error codes used in the `error` / `auth:error` payloads.
export const ErrorCodes = {
  InvalidJson: "INVALID_JSON",
  InvalidPayload: "INVALID_PAYLOAD",
  UnknownEvent: "UNKNOWN_EVENT",
  Unauthenticated: "UNAUTHENTICATED",
  InvalidOfficeCode: "INVALID_OFFICE_CODE",
  UserNotFound: "USER_NOT_FOUND",
  RoomNotFound: "ROOM_NOT_FOUND",
  NotRoomMember: "NOT_ROOM_MEMBER",
  MessageNotFound: "MESSAGE_NOT_FOUND",
  Forbidden: "FORBIDDEN",
  RateLimited: "RATE_LIMITED",
  Internal: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
