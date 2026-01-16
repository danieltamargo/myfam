-- =====================================================
-- GAME ABANDONMENT SYSTEM
-- =====================================================
-- Penalize players who abandon games in progress

-- Function to handle player leaving/abandoning a game
CREATE OR REPLACE FUNCTION handle_player_leave()
RETURNS TRIGGER AS $$
DECLARE
  v_room game_rooms;
  v_session game_sessions;
  v_remaining_players INTEGER;
  v_leaving_player_number INTEGER;
BEGIN
  -- Only process if player was active and is now leaving
  IF OLD.is_active = true AND NEW.is_active = false THEN
    -- Get room info
    SELECT * INTO v_room FROM game_rooms WHERE id = OLD.room_id;

    -- Check if room has an active game session
    SELECT * INTO v_session
    FROM game_sessions
    WHERE room_id = OLD.room_id
      AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1;

    -- If there's an active game session, mark as abandoned
    IF v_session.id IS NOT NULL THEN
      -- Count remaining HUMAN players (excluding bots)
      SELECT COUNT(*) INTO v_remaining_players
      FROM room_participants
      WHERE room_id = OLD.room_id
        AND is_active = true
        AND is_bot = false
        AND id != OLD.id;

      -- If this was the last human player or second-to-last, end the game
      IF v_remaining_players <= 1 THEN
        -- Find the leaving player's number
        SELECT player_number INTO v_leaving_player_number
        FROM room_participants
        WHERE id = OLD.id;

        -- Get winner (the player who didn't leave)
        DECLARE
          v_winner_id UUID;
          v_winner_player_number INTEGER;
        BEGIN
          SELECT user_id, player_number INTO v_winner_id, v_winner_player_number
          FROM room_participants
          WHERE room_id = OLD.room_id
            AND is_active = true
            AND is_bot = false
            AND id != OLD.id
          LIMIT 1;

          -- Update session as finished with abandonment
          UPDATE game_sessions
          SET
            status = 'finished',
            finished_at = now(),
            winner_id = v_winner_id,
            winner_player_number = v_winner_player_number,
            final_state = game_state
          WHERE id = v_session.id;

          -- Update room status
          UPDATE game_rooms
          SET
            status = 'finished',
            finished_at = now()
          WHERE id = OLD.room_id;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for handling abandonment
DROP TRIGGER IF EXISTS trigger_handle_player_leave ON room_participants;
CREATE TRIGGER trigger_handle_player_leave
  AFTER UPDATE ON room_participants
  FOR EACH ROW
  WHEN (OLD.is_active = true AND NEW.is_active = false)
  EXECUTE FUNCTION handle_player_leave();
