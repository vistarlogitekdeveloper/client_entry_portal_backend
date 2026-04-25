-- Migration: Add reminder_snooze_until column to lead_master
-- Run this on your PostgreSQL database before deploying the backend changes.
--
-- When reminder_snooze_until is set to a future date, all weekly update
-- reminders (push notifications and emails) for that lead will be suppressed
-- until that date. After that date, reminders resume automatically.

ALTER TABLE lead_master
  ADD COLUMN IF NOT EXISTS reminder_snooze_until DATE NULL;

COMMENT ON COLUMN lead_master.reminder_snooze_until IS
  'Date until which weekly review reminders are snoozed for this lead. NULL = no snooze active.';
