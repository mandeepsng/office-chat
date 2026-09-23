import type { DB } from "./db/database";
import { createRepositories, type Repositories } from "./db";
import { UserService } from "./services/user-service";
import { RoomService } from "./services/room-service";
import { MessageService } from "./services/message-service";
import { LinkPreviewService } from "./services/link-preview-service";
import { CallService } from "./services/call-service";

export interface AppContext {
  repos: Repositories;
  userService: UserService;
  roomService: RoomService;
  messageService: MessageService;
  linkPreviewService: LinkPreviewService;
  callService: CallService;
}

export function createContext(db: DB): AppContext {
  const repos = createRepositories(db);
  const roomService = new RoomService(repos);
  return {
    repos,
    userService: new UserService(repos),
    roomService,
    messageService: new MessageService(repos, roomService),
    linkPreviewService: new LinkPreviewService(repos),
    callService: new CallService(),
  };
}
