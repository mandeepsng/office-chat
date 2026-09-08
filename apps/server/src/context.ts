import type { DB } from "./db/database";
import { createRepositories, type Repositories } from "./db";
import { UserService } from "./services/user-service";
import { RoomService } from "./services/room-service";
import { MessageService } from "./services/message-service";

export interface AppContext {
  repos: Repositories;
  userService: UserService;
  roomService: RoomService;
  messageService: MessageService;
}

export function createContext(db: DB): AppContext {
  const repos = createRepositories(db);
  const roomService = new RoomService(repos);
  return {
    repos,
    userService: new UserService(repos),
    roomService,
    messageService: new MessageService(repos, roomService),
  };
}
