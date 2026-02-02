-- Migrate billing fields to PayPal

-- Drop legacy billing fields if they exist
ALTER TABLE profiles DROP COLUMN IF EXISTS lemonsqueezy_subscription_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS lemonsqueezy_customer_id;

-- Add PayPal fields if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'paypal_subscription_id') THEN
    ALTER TABLE profiles ADD COLUMN paypal_subscription_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'profiles' AND column_name = 'paypal_payer_id') THEN
    ALTER TABLE profiles ADD COLUMN paypal_payer_id TEXT;
  END IF;
END $$;

-- Drop old index if present
DROP INDEX IF EXISTS idx_profiles_lemonsqueezy_subscription_id;

-- Create index for PayPal lookups
CREATE INDEX IF NOT EXISTS idx_profiles_paypal_subscription_id
  ON profiles(paypal_subscription_id)
  WHERE paypal_subscription_id IS NOT NULL;
