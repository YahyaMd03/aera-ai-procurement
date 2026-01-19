import 'dotenv/config';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const migrationSQL = `
      ALTER TABLE "SentEmail" ADD COLUMN IF NOT EXISTS "subject" VARCHAR(500);
      ALTER TABLE "SentEmail" ADD COLUMN IF NOT EXISTS "body" TEXT;
    `;

    await client.query(migrationSQL);
    console.log('Migration applied successfully: Added subject and body columns to SentEmail table');
  } catch (error) {
    console.error('Error applying migration:', error);
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
