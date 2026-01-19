import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
  // Keep connections alive
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // Start sending keep-alive after 10 seconds
  // SSL configuration for production (Railway)
  ssl: process.env.DATABASE_URL?.includes('railway') || process.env.DATABASE_URL?.includes('rlwy.net')
    ? { rejectUnauthorized: false }
    : false,
});

// Handle pool errors to prevent unhandled error events
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  // Don't crash the app - the pool will automatically remove the dead client
});

// Handle connection errors gracefully
pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.error('Database client error:', err);
  });
});

// Test the connection on startup with retry logic
async function testConnection(retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('✓ Database connection established');
      client.release();
      return true;
    } catch (err: any) {
      console.warn(`Database connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('✗ Failed to connect to database after retries');
        console.log('The app will continue but database queries may fail until connection is restored');
      }
    }
  }
  return false;
}

// Test connection on startup (non-blocking)
testConnection().catch(() => {
  // Error already logged in testConnection
});

export const db = drizzle(pool, { schema });

// Graceful shutdown function
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await pool.end();
    console.log('✓ Database connection pool closed');
  } catch (err) {
    console.error('Error closing database connection pool:', err);
  }
}
