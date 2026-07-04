-- Performance indexes for foreign keys and frequently-filtered columns.
-- Postgres does not auto-index FK columns, so these back the joins/filters
-- used by the event, registration, analytics, attendee and notification flows.
-- IF NOT EXISTS keeps this safe to (re)apply across environments.

-- Registration: event lookups + status-filtered counts
CREATE INDEX IF NOT EXISTS "registrations_event_id_idx" ON "registrations"("event_id");
CREATE INDEX IF NOT EXISTS "registrations_event_id_status_idx" ON "registrations"("event_id", "status");

-- Order: registration join, discount join, status aggregation
CREATE INDEX IF NOT EXISTS "orders_registration_id_idx" ON "orders"("registration_id");
CREATE INDEX IF NOT EXISTS "orders_discount_code_id_idx" ON "orders"("discount_code_id");
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders"("status");

-- Ticket: check-in filtering (scanner / attendee status)
CREATE INDEX IF NOT EXISTS "tickets_checked_in_at_idx" ON "tickets"("checked_in_at");

-- Reviews / polls / poll options / poll votes
CREATE INDEX IF NOT EXISTS "reviews_event_id_idx" ON "reviews"("event_id");
CREATE INDEX IF NOT EXISTS "polls_event_id_idx" ON "polls"("event_id");
CREATE INDEX IF NOT EXISTS "poll_options_poll_id_idx" ON "poll_options"("poll_id");
CREATE INDEX IF NOT EXISTS "poll_votes_option_id_idx" ON "poll_votes"("option_id");

-- Event child collections loaded on the event-control / details pages
CREATE INDEX IF NOT EXISTS "ticket_tiers_event_id_idx" ON "ticket_tiers"("event_id");
CREATE INDEX IF NOT EXISTS "speakers_event_id_idx" ON "speakers"("event_id");
CREATE INDEX IF NOT EXISTS "event_reminders_event_id_idx" ON "event_reminders"("event_id");

-- Push subscriptions targeted by recipient email
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_email_idx" ON "push_subscriptions"("user_email");
