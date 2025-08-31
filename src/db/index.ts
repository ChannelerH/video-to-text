import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Database instance for Node.js environment
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function db() {
  let databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  // In Node.js environment, use singleton pattern
  if (dbInstance) {
    return dbInstance;
  }

  // Node.js environment with connection pool configuration
  const client = postgres(databaseUrl, {
    prepare: false,
    max: 10, // Maximum connections in pool
    idle_timeout: 30, // Idle connection timeout (seconds)
    connect_timeout: 10, // Connection timeout (seconds)
  });
  dbInstance = drizzle({ client });

  return dbInstance;
}
