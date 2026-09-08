import { env } from "./config/env";
import { createDatabase } from "./db/database";
import { createContext } from "./context";
import { createServer } from "./websocket/server";
import { logger } from "./utils/logger";

const db = createDatabase(env.databasePath);
const app = createContext(db);
const { http } = createServer(app, env.officeCode);

http.listen(env.port, env.host, () => {
  logger.info(`OfficeChat server listening on ws://${env.host}:${env.port}`);
  logger.info(`Health check at http://${env.host}:${env.port}/health`);
});

function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down`);
  http.close(() => {
    db.close();
    process.exit(0);
  });
  // Force-exit if connections keep the server alive too long.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
