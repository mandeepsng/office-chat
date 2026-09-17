import type { DB } from "./database";
import { UsersRepository } from "./repositories/users";
import { DevicesRepository } from "./repositories/devices";
import { RoomsRepository } from "./repositories/rooms";
import { MessagesRepository } from "./repositories/messages";
import { ReactionsRepository } from "./repositories/reactions";

export interface Repositories {
  db: DB;
  users: UsersRepository;
  devices: DevicesRepository;
  rooms: RoomsRepository;
  messages: MessagesRepository;
  reactions: ReactionsRepository;
}

export function createRepositories(db: DB): Repositories {
  return {
    db,
    users: new UsersRepository(db),
    devices: new DevicesRepository(db),
    rooms: new RoomsRepository(db),
    messages: new MessagesRepository(db),
    reactions: new ReactionsRepository(db),
  };
}
