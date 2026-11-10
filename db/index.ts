import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import type { D1Database } from "@cloudflare/workers-types";
import { requestContext } from "@/lib/request-context";

export function getD1Binding() {
  const db = requestContext.getStore()?.db;
  if (!db) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return db;
}

export function getDb() {
  return drizzle(getD1Binding(), { schema });
}

const schemaReady = new WeakMap<D1Database, Promise<void>>();

export async function ensureRsvpSchema() {
  const db = getD1Binding();

  const previous = schemaReady.get(db);
  if (previous) return previous;
  const pending = db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS rsvps (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        full_name text NOT NULL,
        phone text NOT NULL,
        attendance text NOT NULL,
        guest_count integer DEFAULT 0 NOT NULL,
        message text DEFAULT '' NOT NULL,
        submitted_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS rsvps_phone_unique ON rsvps (phone)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS rsvp_responses (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        invite_id text,
        first_name text DEFAULT '' NOT NULL,
        invited_name text DEFAULT '' NOT NULL,
        full_name text NOT NULL,
        phone text,
        attendance text NOT NULL,
        guest_count integer DEFAULT 0 NOT NULL,
        max_guests integer DEFAULT 10 NOT NULL,
        message text DEFAULT '' NOT NULL,
        source_sheet text,
        source_row integer,
        sync_status text DEFAULT 'pending' NOT NULL,
        sync_error text DEFAULT '' NOT NULL,
        submitted_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS rsvp_responses_invite_id_unique ON rsvp_responses (invite_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS invite_visits (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        invite_id text NOT NULL,
        first_name text DEFAULT '' NOT NULL,
        source_sheet text NOT NULL,
        source_row integer,
        first_opened_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        last_opened_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        open_count integer DEFAULT 1 NOT NULL,
        sync_status text DEFAULT 'pending' NOT NULL,
        sync_error text DEFAULT '' NOT NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS invite_visits_invite_id_unique ON invite_visits (invite_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS generated_invites (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        invite_id text NOT NULL,
        first_name text NOT NULL,
        max_guests integer NOT NULL,
        source_sheet text NOT NULL,
        source_row integer,
        short_link text NOT NULL,
        created_by text NOT NULL,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS generated_invites_invite_id_unique ON generated_invites (invite_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS public_rate_limits (
        key text PRIMARY KEY NOT NULL,
        window_start integer NOT NULL,
        hits integer NOT NULL
      )`),
    ])
    .then(() => undefined)
    .catch((error) => {
      schemaReady.delete(db);
      throw error;
    });

  schemaReady.set(db, pending);
  return pending;
}
