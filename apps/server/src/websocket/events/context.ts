import type { AppContext } from "../../context";
import type { Connection } from "../connection";
import type { Hub } from "../hub";

/** Everything an event handler needs. */
export interface EventContext {
  app: AppContext;
  hub: Hub;
  conn: Connection;
  officeCode: string;
}

export type EventHandler = (ec: EventContext, payload: unknown) => void;
