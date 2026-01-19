import { pgTable, uuid, varchar, text, real, timestamp, integer, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export const vendorsTable = pgTable('Vendor', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  contactName: varchar('contactName', { length: 255 }),
  phone: varchar('phone', { length: 255 }),
  address: text('address'),
  notes: text('notes'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('Vendor_email_idx').on(table.email),
}));

export const rfpsTable = pgTable('RFP', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  budget: real('budget'),
  deadline: timestamp('deadline'),
  requirements: jsonb('requirements').notNull().$type<Record<string, any>>(),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  comparisonCache: jsonb('comparisonCache').$type<Record<string, any>>(), // Cached LLM comparison result
  comparisonCacheUpdatedAt: timestamp('comparisonCacheUpdatedAt'), // When cache was last updated
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('RFP_status_idx').on(table.status),
}));

export const proposalsTable = pgTable('Proposal', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  rfpId: uuid('rfpId').notNull().references(() => rfpsTable.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendorId').notNull().references(() => vendorsTable.id, { onDelete: 'cascade' }),
  emailMessageId: varchar('emailMessageId', { length: 255 }),
  rawEmail: text('rawEmail'),
  parsedData: jsonb('parsedData').notNull().$type<Record<string, any>>(),
  totalPrice: real('totalPrice'),
  deliveryDays: integer('deliveryDays'),
  paymentTerms: varchar('paymentTerms', { length: 255 }),
  warranty: varchar('warranty', { length: 255 }),
  notes: text('notes'),
  completeness: real('completeness'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
}, (table) => ({
  rfpVendorUnique: unique('Proposal_rfpId_vendorId_key').on(table.rfpId, table.vendorId),
  rfpIdIdx: index('Proposal_rfpId_idx').on(table.rfpId),
  vendorIdIdx: index('Proposal_vendorId_idx').on(table.vendorId),
}));

// Relations
export const vendorsRelations = relations(vendorsTable, ({ many }) => ({
  proposals: many(proposalsTable),
}));

export const rfpsRelations = relations(rfpsTable, ({ many }) => ({
  proposals: many(proposalsTable),
}));

export const proposalsRelations = relations(proposalsTable, ({ one }) => ({
  rfp: one(rfpsTable, {
    fields: [proposalsTable.rfpId],
    references: [rfpsTable.id],
  }),
  vendor: one(vendorsTable, {
    fields: [proposalsTable.vendorId],
    references: [vendorsTable.id],
  }),
}));

// Conversations table
export const conversationsTable = pgTable('Conversation', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar('sessionId', { length: 255 }).notNull(), // For user differentiation
  title: varchar('title', { length: 255 }), // User-provided conversation name
  status: varchar('status', { length: 50 }).notNull().default('drafting_rfp'), // drafting_rfp | collecting_requirements | ready_to_send | sent | closed
  agentState: jsonb('agentState').notNull().$type<Record<string, any>>().default({}),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index('Conversation_sessionId_idx').on(table.sessionId),
  statusIdx: index('Conversation_status_idx').on(table.status),
}));

// Messages table
export const messagesTable = pgTable('Message', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid('conversationId').notNull().references(() => conversationsTable.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(), // user | assistant | system
  content: text('content').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (table) => ({
  conversationIdIdx: index('Message_conversationId_idx').on(table.conversationId),
  conversationCreatedIdx: index('Message_conversationId_createdAt_idx').on(table.conversationId, table.createdAt),
}));

// Relations for conversations and messages
export const conversationsRelations = relations(conversationsTable, ({ many }) => ({
  messages: many(messagesTable),
}));

export const messagesRelations = relations(messagesTable, ({ one }) => ({
  conversation: one(conversationsTable, {
    fields: [messagesTable.conversationId],
    references: [conversationsTable.id],
  }),
}));

// SentEmails table - tracks emails sent per conversation/session
export const sentEmailsTable = pgTable('SentEmail', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid('conversationId').references(() => conversationsTable.id, { onDelete: 'cascade' }),
  rfpId: uuid('rfpId').notNull().references(() => rfpsTable.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendorId').notNull().references(() => vendorsTable.id, { onDelete: 'cascade' }),
  emailMessageId: varchar('emailMessageId', { length: 255 }),
  subject: varchar('subject', { length: 500 }),
  body: text('body'),
  sentAt: timestamp('sentAt').defaultNow().notNull(),
}, (table) => ({
  conversationIdIdx: index('SentEmail_conversationId_idx').on(table.conversationId),
  rfpIdIdx: index('SentEmail_rfpId_idx').on(table.rfpId),
  vendorIdIdx: index('SentEmail_vendorId_idx').on(table.vendorId),
}));

// Relations for sent emails
export const sentEmailsRelations = relations(sentEmailsTable, ({ one }) => ({
  conversation: one(conversationsTable, {
    fields: [sentEmailsTable.conversationId],
    references: [conversationsTable.id],
  }),
  rfp: one(rfpsTable, {
    fields: [sentEmailsTable.rfpId],
    references: [rfpsTable.id],
  }),
  vendor: one(vendorsTable, {
    fields: [sentEmailsTable.vendorId],
    references: [vendorsTable.id],
  }),
}));