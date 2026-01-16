-- =====================================================
-- BOT SUPPORT FOR GAMES
-- =====================================================
-- Allow bot players in game rooms that don't count for leaderboard

-- Add bot support to room_participants
ALTER TABLE room_participants
ADD COLUMN is_bot BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN bot_difficulty VARCHAR(20) CHECK (bot_difficulty IN ('easy', 'medium', 'hard'));

-- Add flag to game_sessions to mark bot games
ALTER TABLE game_sessions
ADD COLUMN has_bots BOOLEAN NOT NULL DEFAULT false;

-- Update game stats function to skip bot games
CREATE OR REPLACE FUNCTION update_game_stats_after_session()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update stats if game doesn't have bots
  IF NEW.status = 'finished' AND NEW.has_bots = false THEN
    -- Winner is a user
    IF NEW.winner_id IS NOT NULL THEN
      INSERT INTO game_stats (user_id, game_type, games_played, games_won)
      VALUES (NEW.winner_id, NEW.game_type, 1, 1)
      ON CONFLICT (user_id, game_type)
      DO UPDATE SET
        games_played = game_stats.games_played + 1,
        games_won = game_stats.games_won + 1;

      -- Update other participants (losers)
      INSERT INTO game_stats (user_id, game_type, games_played, games_won)
      SELECT
        rp.user_id,
        NEW.game_type,
        1,
        0
      FROM room_participants rp
      WHERE rp.room_id = NEW.room_id
        AND rp.user_id IS NOT NULL
        AND rp.user_id != NEW.winner_id
        AND rp.is_bot = false
      ON CONFLICT (user_id, game_type)
      DO UPDATE SET
        games_played = game_stats.games_played + 1;

    -- Draw - update all participants
    ELSIF NEW.is_draw = true THEN
      INSERT INTO game_stats (user_id, game_type, games_played, games_won)
      SELECT
        rp.user_id,
        NEW.game_type,
        1,
        0
      FROM room_participants rp
      WHERE rp.room_id = NEW.room_id
        AND rp.user_id IS NOT NULL
        AND rp.is_bot = false
      ON CONFLICT (user_id, game_type)
      DO UPDATE SET
        games_played = game_stats.games_played + 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update auto-delete function to count only human participants
CREATE OR REPLACE FUNCTION auto_delete_empty_rooms()
RETURNS TRIGGER AS $$
DECLARE
  active_human_count INTEGER;
BEGIN
  -- Count active HUMAN participants in the room
  SELECT COUNT(*) INTO active_human_count
  FROM room_participants
  WHERE room_id = OLD.room_id
    AND is_active = true
    AND is_bot = false;

  -- If no active human participants left, delete the room
  IF active_human_count = 0 THEN
    DELETE FROM game_rooms WHERE id = OLD.room_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add a bot to a room
CREATE OR REPLACE FUNCTION add_bot_to_room(
  p_room_id UUID,
  p_difficulty VARCHAR(20) DEFAULT 'medium'
)
RETURNS UUID AS $$
DECLARE
  v_room game_rooms;
  v_participant_count INTEGER;
  v_next_player_number INTEGER;
  v_bot_id UUID;
BEGIN
  -- Get room details
  SELECT * INTO v_room FROM game_rooms WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check if room is waiting
  IF v_room.status != 'waiting' THEN
    RAISE EXCEPTION 'Can only add bots to waiting rooms';
  END IF;

  -- Count current participants
  SELECT COUNT(*) INTO v_participant_count
  FROM room_participants
  WHERE room_id = p_room_id AND is_active = true;

  -- Check if room is full
  IF v_participant_count >= v_room.max_players THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  -- Get next player number
  SELECT COALESCE(MAX(player_number), 0) + 1 INTO v_next_player_number
  FROM room_participants
  WHERE room_id = p_room_id;

  -- Insert bot participant
  INSERT INTO room_participants (
    room_id,
    user_id,
    guest_name,
    is_bot,
    bot_difficulty,
    is_ready,
    player_number
  )
  VALUES (
    p_room_id,
    NULL,
    'Bot ' || p_difficulty,
    true,
    p_difficulty,
    true,
    v_next_player_number
  )
  RETURNING id INTO v_bot_id;

  RETURN v_bot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is room owner
CREATE OR REPLACE FUNCTION is_room_owner(p_room_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_created_by UUID;
BEGIN
  SELECT created_by INTO v_created_by
  FROM game_rooms
  WHERE id = p_room_id;

  RETURN v_created_by = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS for room_participants to allow bot insertion by room owner
DROP POLICY IF EXISTS "Users can manage participants in their family's rooms" ON room_participants;

CREATE POLICY "Users can manage participants in their family's rooms"
ON room_participants FOR ALL
USING (
  -- Can see participants in rooms they're in or their family's rooms
  EXISTS (
    SELECT 1 FROM game_rooms r
    LEFT JOIN families f ON r.family_id = f.id
    LEFT JOIN family_members fm ON f.id = fm.family_id
    WHERE r.id = room_participants.room_id
      AND (fm.user_id = auth.uid() OR r.family_id IS NULL OR room_participants.user_id = auth.uid())
  )
)
WITH CHECK (
  -- Can insert/update participants if they're the user themselves, or if they're the room owner (for bots)
  user_id = auth.uid() OR
  (is_bot = true AND EXISTS (
    SELECT 1 FROM game_rooms WHERE id = room_participants.room_id AND created_by = auth.uid()
  ))
);

-- Update assign_player_number to handle bots
CREATE OR REPLACE FUNCTION assign_player_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.player_number IS NULL THEN
    SELECT COALESCE(MAX(player_number), 0) + 1
    INTO NEW.player_number
    FROM room_participants
    WHERE room_id = NEW.room_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
