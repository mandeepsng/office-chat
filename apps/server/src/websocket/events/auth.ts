import { ServerEvents, ErrorCodes } from "@office-chat/shared";
import { authConnectSchema, authRegisterSchema } from "@office-chat/validation";
import { logger } from "../../utils/logger";
import type { EventContext } from "./context";

function completeAuth(ec: EventContext, userId: string): void {
  const { app, hub, conn } = ec;
  conn.userId = userId;
  conn.authenticated = true;

  const wasOffline = !hub.isUserOnline(userId);
  hub.bindUser(conn);
  const user = app.userService.setPresence(userId, true)!;

  conn.send(ServerEvents.AuthSuccess, {
    user,
    device: conn.deviceId ? app.repos.devices.getById(conn.deviceId) : null,
    rooms: app.roomService.listForUser(userId),
    users: app.repos.users.all(),
    onlineUserIds: hub.onlineUserIds(),
  });

  // Only announce presence on the first device coming online.
  if (wasOffline) {
    hub.broadcastToAll(ServerEvents.PresenceOnline, { userId }, userId);
  }
  logger.info("User authenticated", { userId, connection: conn.id });
}

export function handleAuthRegister(ec: EventContext, payload: unknown): void {
  const parsed = authRegisterSchema.safeParse(payload);
  if (!parsed.success) {
    ec.conn.send(ServerEvents.AuthError, {
      code: ErrorCodes.InvalidPayload,
      message: "Invalid registration payload",
    });
    return;
  }
  if (parsed.data.officeCode !== ec.officeCode) {
    ec.conn.send(ServerEvents.AuthError, {
      code: ErrorCodes.InvalidOfficeCode,
      message: "Invalid office code",
    });
    logger.warn("Rejected auth: bad office code", { userId: parsed.data.userId });
    return;
  }

  ec.conn.deviceId = parsed.data.deviceId;
  ec.app.userService.register(parsed.data);
  completeAuth(ec, parsed.data.userId);
}

export function handleAuthConnect(ec: EventContext, payload: unknown): void {
  const parsed = authConnectSchema.safeParse(payload);
  if (!parsed.success) {
    ec.conn.send(ServerEvents.AuthError, {
      code: ErrorCodes.InvalidPayload,
      message: "Invalid connect payload",
    });
    return;
  }

  const identity = ec.app.userService.connect(parsed.data.userId, parsed.data.deviceId);
  if (!identity) {
    // Unknown identity — client must re-register with the office code.
    ec.conn.send(ServerEvents.AuthError, {
      code: ErrorCodes.UserNotFound,
      message: "Unknown identity; please re-enter the office code",
    });
    return;
  }

  ec.conn.deviceId = parsed.data.deviceId;
  completeAuth(ec, parsed.data.userId);
}
