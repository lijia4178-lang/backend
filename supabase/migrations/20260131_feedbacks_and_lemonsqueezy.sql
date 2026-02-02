-- Create feedbacks table for user feedback storage
CREATE TABLE IF NOT EXISTS feedbacks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general', 'bug', 'feature', 'other')),
  message TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  page TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_type ON feedbacks(type);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at DESC);

-- Enable RLS
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to insert (backend API)
CREATE POLICY "Service role can insert feedbacks" ON feedbacks
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Allow service role to select (for admin dashboard)
CREATE POLICY "Service role can select feedbacks" ON feedbacks
  FOR SELECT
  TO service_role
  USING (true);

-- No billing fields are added here (handled in main schema)

COMMENT ON TABLE feedbacks IS 'User feedback submissions';
COMMENT ON COLUMN feedbacks.type IS 'Feedback type: general, bug, feature, other';
COMMENT ON COLUMN feedbacks.rating IS 'User rating from 1 to 5 stars';
COMMENT ON COLUMN feedbacks.page IS 'Page URL where feedback was submitted';
