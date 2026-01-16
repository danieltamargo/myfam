-- =====================================================
-- FIX GAME STATS ON CONFLICT CONSTRAINT
-- =====================================================
-- The ON CONFLICT was missing family_id in the constraint

CREATE OR REPLACE FUNCTION update_game_stats_after_session()
RETURNS TRIGGER AS $$
DECLARE
  v_family_id UUID;
BEGIN
  -- Get family_id from the room
  SELECT family_id INTO v_family_id
  FROM game_rooms
  WHERE id = NEW.room_id;

  -- Only update stats if game doesn't have bots
  IF NEW.status = 'finished' AND NEW.has_bots = false THEN
    -- Winner is a user
    IF NEW.winner_id IS NOT NULL THEN
      INSERT INTO game_stats (user_id, family_id, game_type, games_played, games_won)
      VALUES (NEW.winner_id, v_family_id, NEW.game_type, 1, 1)
      ON CONFLICT (user_id, family_id, game_type)
      DO UPDATE SET
        games_played = game_stats.games_played + 1,
        games_won = game_stats.games_won + 1;

      -- Update other participants (losers)
      INSERT INTO game_stats (user_id, family_id, game_type, games_played, games_lost)
      SELECT
        rp.user_id,
        v_family_id,
        NEW.game_type,
        1,
        1
      FROM room_participants rp
      WHERE rp.room_id = NEW.room_id
        AND rp.user_id IS NOT NULL
        AND rp.user_id != NEW.winner_id
        AND rp.is_bot = false
      ON CONFLICT (user_id, family_id, game_type)
      DO UPDATE SET
        games_played = game_stats.games_played + 1,
        games_lost = game_stats.games_lost + 1;

    -- Draw - update all participants
    ELSIF NEW.is_draw = true THEN
      INSERT INTO game_stats (user_id, family_id, game_type, games_played, games_drawn)
      SELECT
        rp.user_id,
        v_family_id,
        NEW.game_type,
        1,
        1
      FROM room_participants rp
      WHERE rp.room_id = NEW.room_id
        AND rp.user_id IS NOT NULL
        AND rp.is_bot = false
      ON CONFLICT (user_id, family_id, game_type)
      DO UPDATE SET
        games_played = game_stats.games_played + 1,
        games_drawn = game_stats.games_drawn + 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
