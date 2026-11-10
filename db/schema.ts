import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rsvps = sqliteTable(
  "rsvps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    attendance: text("attendance", { enum: ["yes", "no"] }).notNull(),
    guestCount: integer("guest_count").notNull().default(0),
    message: text("message").notNull().default(""),
    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("rsvps_phone_unique").on(table.phone)],
);

export const rsvpResponses = sqliteTable(
  "rsvp_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inviteId: text("invite_id"),
    firstName: text("first_name").notNull().default(""),
    invitedName: text("invited_name").notNull().default(""),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    attendance: text("attendance", { enum: ["yes", "no"] }).notNull(),
    guestCount: integer("guest_count").notNull().default(0),
    maxGuests: integer("max_guests").notNull().default(10),
    message: text("message").notNull().default(""),
    sourceSheet: text("source_sheet"),
    sourceRow: integer("source_row"),
    syncStatus: text("sync_status", { enum: ["pending", "synced", "not_configured"] })
      .notNull()
      .default("pending"),
    syncError: text("sync_error").notNull().default(""),
    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rsvp_responses_invite_id_unique").on(table.inviteId),
  ],
);

export const inviteVisits = sqliteTable(
  "invite_visits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inviteId: text("invite_id").notNull(),
    firstName: text("first_name").notNull().default(""),
    sourceSheet: text("source_sheet").notNull(),
    sourceRow: integer("source_row"),
    firstOpenedAt: text("first_opened_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastOpenedAt: text("last_opened_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    openCount: integer("open_count").notNull().default(1),
    syncStatus: text("sync_status", { enum: ["pending", "synced", "not_configured"] })
      .notNull()
      .default("pending"),
    syncError: text("sync_error").notNull().default(""),
  },
  (table) => [uniqueIndex("invite_visits_invite_id_unique").on(table.inviteId)],
);

export const generatedInvites = sqliteTable(
  "generated_invites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inviteId: text("invite_id").notNull(),
    firstName: text("first_name").notNull(),
    maxGuests: integer("max_guests").notNull(),
    sourceSheet: text("source_sheet").notNull(),
    sourceRow: integer("source_row"),
    shortLink: text("short_link").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("generated_invites_invite_id_unique").on(table.inviteId)],
);

export const adultsNoteExclusions = sqliteTable("adults_note_exclusions", {
  token: text("token").primaryKey(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const seatingPlans = sqliteTable("seating_plans", {
  id: integer("id").primaryKey(),
  document: text("document").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});
export const seatingSources = sqliteTable("seating_sources", {
  id: integer("id").primaryKey(),
  document: text("document").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const seatingSketches = sqliteTable("seating_sketches", {
  id: integer("id").primaryKey(),
  document: text("document").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const callAgents = sqliteTable("call_agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shareToken: text("share_token").notNull(),
  tokenHash: text("token_hash").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("call_agents_token_hash_unique").on(table.tokenHash)]);
export const callTasks = sqliteTable("call_tasks", {
  inviteId: text("invite_id").primaryKey(),
  callerId: text("caller_id"),
  callStatus: text("call_status"),
  retryAt: text("retry_at"),
  version: integer("version").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const callSettings = sqliteTable("call_settings", {
  id: integer("id").primaryKey(),
  openingScript: text("opening_script").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
export const callAttempts = sqliteTable("call_attempts", {
  id: text("id").primaryKey(),
  inviteId: text("invite_id").notNull(),
  callerId: text("caller_id"),
  callerName: text("caller_name").notNull(),
  phone: text("phone").notNull(),
  clickedAt: text("clicked_at").notNull(),
}, table => [index("call_attempts_invite_time_idx").on(table.inviteId, table.clickedAt)]);

export const rsvpReconciliations = sqliteTable('rsvp_reconciliations', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  beforeDocument: text('before_document').notNull(),
  sourceDocument: text('source_document').notNull(),
  decisionsDocument: text('decisions_document').notNull(),
  createdAt: text('created_at').notNull(),
});
export const rsvpInviteResolutions = sqliteTable('rsvp_invite_resolutions', {
  inviteId: text('invite_id').primaryKey(),
  canonicalId: text('canonical_id'),
  reconciliationId: text('reconciliation_id').notNull(),
});
