-- =====================================================
-- FIX GAME SESSIONS WINNER CONSTRAINT
-- =====================================================
-- The original constraint was too restrictive.
-- It didn't allow for in-progress games where there's no winner yet and it's not a draw.

ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_winner_check;

-- New constraint: Allow three states:
-- 1. In progress: no winner, no draw (both null, is_draw false)
-- 2. Winner: either winner_id OR winner_player_number set (but not both)
-- 3. Draw: no winner, is_draw is true
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_winner_check CHECK (
  -- In progress or not finished yet: no winner, not a draw
  (winner_id IS NULL AND winner_player_number IS NULL AND is_draw = false) OR
  -- User winner: winner_id set, no player_number, not a draw
  (winner_id IS NOT NULL AND winner_player_number IS NULL AND is_draw = false) OR
  -- Guest winner: winner_player_number set, no winner_id, not a draw
  (winner_id IS NULL AND winner_player_number IS NOT NULL AND is_draw = false) OR
  -- Draw: no winner, is_draw is true
  (winner_id IS NULL AND winner_player_number IS NULL AND is_draw = true)
);
