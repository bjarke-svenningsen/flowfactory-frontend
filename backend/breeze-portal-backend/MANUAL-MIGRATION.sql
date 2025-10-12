-- Manual SQL migration script
-- Run this in your SQLite database browser or with sqlite3 CLI
-- To run: sqlite3 breeze.db < MANUAL-MIGRATION.sql

-- Add contact_person_id to quotes table
ALTER TABLE quotes ADD COLUMN contact_person_id INTEGER;

-- Add extra work columns to quotes table
ALTER TABLE quotes ADD COLUMN is_extra_work INTEGER DEFAULT 0;
ALTER TABLE quotes ADD COLUMN parent_order_id INTEGER;
ALTER TABLE quotes ADD COLUMN sub_number INTEGER;

-- Verify changes
.schema quotes
