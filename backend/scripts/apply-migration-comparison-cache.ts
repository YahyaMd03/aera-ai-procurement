import 'dotenv/config';
import { Client } from 'pg';

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const migrationSQL = `
      ALTER TABLE "RFP" ADD COLUMN IF NOT EXISTS "comparisonCache" JSONB;
      ALTER TABLE "RFP" ADD COLUMN IF NOT EXISTS "comparisonCacheUpdatedAt" TIMESTAMP;
    `;

    await client.query(migrationSQL);
    console.log('Migration applied successfully: Added comparisonCache and comparisonCacheUpdatedAt columns to RFP table');
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
