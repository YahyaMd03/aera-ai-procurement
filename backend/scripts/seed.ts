import { randomUUID } from 'crypto';
import { db } from '../src/db/index.js';
import { vendorsTable } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('Seeding database...');

  // Create sample vendors (upsert logic)
  const vendor1Email = 'dell@example.com';
  const existingVendor1 = await db.query.vendorsTable.findFirst({
    where: eq(vendorsTable.email, vendor1Email),
  });
  
  const now = new Date();
  const vendor1 = existingVendor1 || (await db.insert(vendorsTable).values({
    id: randomUUID(),
    name: 'Dell Technologies',
    email: vendor1Email,
    contactName: 'John Smith',
    phone: '+1-555-0101',
    address: '123 Tech Street, Austin, TX',
    createdAt: now,
    updatedAt: now,
  }).returning())[0];

  const vendor2Email = 'hp@example.com';
  const existingVendor2 = await db.query.vendorsTable.findFirst({
    where: eq(vendorsTable.email, vendor2Email),
  });
  
  const vendor2 = existingVendor2 || (await db.insert(vendorsTable).values({
    id: randomUUID(),
    name: 'HP Inc.',
    email: vendor2Email,
    contactName: 'Jane Doe',
    phone: '+1-555-0102',
    address: '456 Innovation Drive, Palo Alto, CA',
    createdAt: now,
    updatedAt: now,
  }).returning())[0];

  const vendor3Email = 'lenovo@example.com';
  const existingVendor3 = await db.query.vendorsTable.findFirst({
    where: eq(vendorsTable.email, vendor3Email),
  });
  
  const vendor3 = existingVendor3 || (await db.insert(vendorsTable).values({
    id: randomUUID(),
    name: 'Lenovo',
    email: vendor3Email,
    contactName: 'Bob Johnson',
    phone: '+1-555-0103',
    address: '789 Business Blvd, Morrisville, NC',
    createdAt: now,
    updatedAt: now,
  }).returning())[0];

  console.log('Created vendors:', { vendor1, vendor2, vendor3 });

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
