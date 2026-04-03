-- Migration: Add service validation constraints at database level
-- Apply with: psql -d <your_db> -f db/migrations/0001_add_service_constraints.sql

-- Up
ALTER TABLE services
  ADD CONSTRAINT services_base_price_nonnegative CHECK (base_price >= 0),
  ADD CONSTRAINT services_duration_minutes_minimum CHECK (duration_minutes >= 15);

-- Down
-- To rollback, run:
-- ALTER TABLE services DROP CONSTRAINT IF EXISTS services_base_price_nonnegative;
-- ALTER TABLE services DROP CONSTRAINT IF EXISTS services_duration_minutes_minimum;
