-- Align subscription plan types with platform fee tiers
BEGIN;

UPDATE subscriptions
SET plan_type = 'starter'
WHERE plan_type = 'indie';

UPDATE subscriptions
SET plan_type = 'growth'
WHERE plan_type = 'studio';

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_type_check
  CHECK (plan_type IN ('starter', 'growth', 'scale', 'enterprise'));

COMMIT;
