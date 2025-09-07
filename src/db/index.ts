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
    max: Number(process.env.DB_POOL_MAX || 10), // Maximum connections in pool
    idle_timeout: Number(process.env.DB_IDLE_TIMEOUT || 60), // seconds
    connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT || 20), // seconds
    keep_alive: Number(process.env.DB_KEEPALIVE || 1),
    ssl: process.env.DB_SSL === 'require' || process.env.DB_SSL === 'true' ? 'require' : undefined,
  });
  dbInstance = drizzle({ client });

  return dbInstance;
}
