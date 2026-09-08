import type { DB } from "./database";
import { UsersRepository } from "./repositories/users";
import { DevicesRepository } from "./repositories/devices";
import { RoomsRepository } from "./repositories/rooms";
import { MessagesRepository } from "./repositories/messages";

export interface Repositories {
  db: DB;
  users: UsersRepository;
  devices: DevicesRepository;
  rooms: RoomsRepository;
  messages: MessagesRepository;
}

export function createRepositories(db: DB): Repositories {
  return {
    db,
    users: new UsersRepository(db),
    devices: new DevicesRepository(db),
    rooms: new RoomsRepository(db),
    messages: new MessagesRepository(db),
  };
}
