-- Destructive: run only against the intended event database after disabling access
-- and inbound integrations. Read docs/DATA_RETENTION.md first. No backup is made.
DELETE FROM call_attempts;
DELETE FROM call_tasks;
DELETE FROM call_agents;
DELETE FROM call_settings;
DELETE FROM invite_visits;
DELETE FROM adults_note_exclusions;
DELETE FROM rsvp_responses;
DELETE FROM rsvps;
DELETE FROM generated_invites;
DELETE FROM rsvp_reconciliations;
DELETE FROM rsvp_invite_resolutions;
DELETE FROM seating_sketches;
DELETE FROM seating_plans;
DELETE FROM seating_sources;
DELETE FROM public_rate_limits;
DELETE FROM webhook_nonces;
-- This runtime-created table contains seating snapshots and a sync lease.
DROP TABLE IF EXISTS seating_sheet_sync;
