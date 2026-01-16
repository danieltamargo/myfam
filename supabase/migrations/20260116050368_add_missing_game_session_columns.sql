-- =====================================================
-- ADD MISSING COLUMNS TO GAME_SESSIONS
-- =====================================================

-- Add game_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'game_type'
  ) THEN
    ALTER TABLE game_sessions
    ADD COLUMN game_type game_type NOT NULL DEFAULT 'tic_tac_toe';

    -- Remove default after adding
    ALTER TABLE game_sessions
    ALTER COLUMN game_type DROP DEFAULT;
  END IF;
END $$;

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'status'
  ) THEN
    ALTER TABLE game_sessions
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished'));
  END IF;
END $$;

-- Add has_bots column if it doesn't exist (from migration 021)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_sessions' AND column_name = 'has_bots'
  ) THEN
    ALTER TABLE game_sessions
    ADD COLUMN has_bots BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Create index on game_type
CREATE INDEX IF NOT EXISTS game_sessions_game_type_idx ON game_sessions(game_type);
CREATE INDEX IF NOT EXISTS game_sessions_status_idx ON game_sessions(status);
