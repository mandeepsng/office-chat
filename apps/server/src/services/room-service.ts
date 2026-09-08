import { ErrorCodes } from "@office-chat/shared";
import type { Room } from "@office-chat/shared";
import type { RoomCreateInput, RoomHistoryInput } from "@office-chat/validation";
import type { HistoryPage } from "../db/repositories/messages";
import type { Repositories } from "../db";
import { AppError } from "../utils/errors";

export class RoomService {
  constructor(private readonly repos: Repositories) {}

  listForUser(userId: string): Room[] {
    return this.repos.rooms.listForUser(userId);
  }

  isMember(roomId: string, userId: string): boolean {
    return this.repos.rooms.isMember(roomId, userId);
  }

  requireMembership(roomId: string, userId: string): Room {
    const room = this.repos.rooms.getById(roomId);
    if (!room) throw new AppError(ErrorCodes.RoomNotFound, "Room not found");
    if (!this.repos.rooms.isMember(roomId, userId)) {
      throw new AppError(ErrorCodes.NotRoomMember, "You are not a member of this room");
    }
    return room;
  }

  create(creatorId: string, input: RoomCreateInput): Room {
    const now = new Date().toISOString();

    if (input.type === "direct") {
      const other = input.memberIds[0]!;
      if (other === creatorId) {
        throw new AppError(ErrorCodes.InvalidPayload, "Cannot open a direct room with yourself");
      }
      if (!this.repos.users.getById(other)) {
        throw new AppError(ErrorCodes.UserNotFound, "Target user does not exist");
      }
      const existing = this.repos.rooms.findDirectRoom(creatorId, other);
      if (existing) return existing;

      return this.repos.rooms.create({
        id: crypto.randomUUID(),
        type: "direct",
        name: "Direct", // clients render direct rooms from the members, not the name
        createdBy: creatorId,
        memberIds: [creatorId, other],
        now,
      });
    }

    // Group room: creator plus any provided members.
    const memberIds = Array.from(new Set([creatorId, ...input.memberIds]));
    return this.repos.rooms.create({
      id: crypto.randomUUID(),
      type: "group",
      name: input.name!,
      createdBy: creatorId,
      memberIds,
      now,
    });
  }

  join(roomId: string, userId: string): Room {
    const room = this.repos.rooms.getById(roomId);
    if (!room) throw new AppError(ErrorCodes.RoomNotFound, "Room not found");
    if (room.type === "direct") {
      throw new AppError(ErrorCodes.Forbidden, "Cannot join a direct room");
    }
    this.repos.rooms.addMember(roomId, userId, new Date().toISOString());
    return this.repos.rooms.getById(roomId)!;
  }

  leave(roomId: string, userId: string): void {
    this.requireMembership(roomId, userId);
    this.repos.rooms.removeMember(roomId, userId);
  }

  history(userId: string, input: RoomHistoryInput): HistoryPage {
    this.requireMembership(input.roomId, userId);
    return this.repos.messages.history(input.roomId, {
      before: input.before,
      limit: input.limit,
    });
  }
}
