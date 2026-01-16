-- =====================================================
-- GAMES MODULE - Mini Games System
-- =====================================================
-- This migration adds:
-- 1. Game rooms system with public/private modes
-- 2. Room participants management (family members + guests)
-- 3. Game sessions tracking
-- 4. Move-by-move history for replay
-- 5. Leaderboards with detailed statistics
-- 6. Notifications for game events

-- =====================================================
-- 1. GAME TYPES ENUM
-- =====================================================
-- Define available game types
DO $$ BEGIN
  CREATE TYPE game_type AS ENUM ('tic_tac_toe', 'connect_four', 'wordle');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE room_status AS ENUM ('waiting', 'in_progress', 'finished', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- 2. GAME ROOMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Room configuration
  name TEXT NOT NULL,
  game_type game_type NOT NULL,
  status room_status NOT NULL DEFAULT 'waiting',

  -- Access control
  is_public BOOLEAN NOT NULL DEFAULT false,
  join_code TEXT UNIQUE, -- 6-digit code for public rooms
  max_players INTEGER NOT NULL DEFAULT 2,

  -- Game configuration (stored as JSONB for flexibility)
  config JSONB DEFAULT '{}'::JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,

  CONSTRAINT game_rooms_name_not_empty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT game_rooms_max_players_check CHECK (max_players >= 2 AND max_players <= 10),
  CONSTRAINT game_rooms_join_code_format CHECK (join_code IS NULL OR join_code ~ '^[A-Z0-9]{6}$')
);

CREATE INDEX game_rooms_family_id_idx ON game_rooms(family_id);
CREATE INDEX game_rooms_created_by_idx ON game_rooms(created_by);
CREATE INDEX game_rooms_status_idx ON game_rooms(status);
CREATE INDEX game_rooms_join_code_idx ON game_rooms(join_code) WHERE join_code IS NOT NULL;
CREATE INDEX game_rooms_created_at_idx ON game_rooms(created_at DESC);

-- =====================================================
-- 3. ROOM PARTICIPANTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Guest support (for non-family members via join code)
  guest_name TEXT,
  guest_identifier TEXT, -- session ID or similar for guests

  -- Participant info
  player_number INTEGER, -- 1, 2, 3, etc. (for turn order)
  is_ready BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true, -- false if disconnected/left

  -- Timestamps
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,

  CONSTRAINT room_participants_user_or_guest CHECK (
    (user_id IS NOT NULL AND guest_name IS NULL) OR
    (user_id IS NULL AND guest_name IS NOT NULL)
  ),
  CONSTRAINT room_participants_guest_name_not_empty CHECK (
    guest_name IS NULL OR char_length(trim(guest_name)) > 0
  ),
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, player_number)
);

CREATE INDEX room_participants_room_id_idx ON room_participants(room_id);
CREATE INDEX room_participants_user_id_idx ON room_participants(user_id);
CREATE INDEX room_participants_guest_identifier_idx ON room_participants(guest_identifier) WHERE guest_identifier IS NOT NULL;

-- =====================================================
-- 4. GAME SESSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,

  -- Winner info
  winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  winner_player_number INTEGER, -- For guests who won
  is_draw BOOLEAN NOT NULL DEFAULT false,

  -- Session data
  game_state JSONB NOT NULL DEFAULT '{}'::JSONB, -- Current game state
  final_state JSONB, -- Final state when game ends

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_seconds INTEGER, -- Auto-calculated on finish

  CONSTRAINT game_sessions_winner_check CHECK (
    (winner_id IS NOT NULL AND winner_player_number IS NULL) OR
    (winner_id IS NULL AND winner_player_number IS NOT NULL) OR
    (winner_id IS NULL AND winner_player_number IS NULL AND is_draw = true)
  )
);

CREATE INDEX game_sessions_room_id_idx ON game_sessions(room_id);
CREATE INDEX game_sessions_winner_id_idx ON game_sessions(winner_id);
CREATE INDEX game_sessions_started_at_idx ON game_sessions(started_at DESC);

-- =====================================================
-- 5. GAME MOVES TABLE (Move history for replay)
-- =====================================================
CREATE TABLE IF NOT EXISTS game_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  -- Move info
  player_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  player_number INTEGER NOT NULL,
  move_number INTEGER NOT NULL, -- 1, 2, 3...

  -- Move data (flexible JSONB for different game types)
  move_data JSONB NOT NULL,
  -- Examples:
  -- Tic-tac-toe: {"row": 1, "col": 2}
  -- Connect 4: {"column": 3}
  -- Wordle: {"guess": "HOLA", "result": [{"letter": "H", "status": "correct"}, ...]}

  -- State after this move
  state_after JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_taken_ms INTEGER, -- Time taken to make this move

  CONSTRAINT game_moves_move_number_positive CHECK (move_number > 0),
  UNIQUE(session_id, move_number)
);

CREATE INDEX game_moves_session_id_idx ON game_moves(session_id);
CREATE INDEX game_moves_player_id_idx ON game_moves(player_id);
CREATE INDEX game_moves_move_number_idx ON game_moves(session_id, move_number);

-- =====================================================
-- 6. GAME STATS TABLE (Leaderboard & player statistics)
-- =====================================================
CREATE TABLE IF NOT EXISTS game_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  game_type game_type NOT NULL,

  -- Statistics
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_lost INTEGER NOT NULL DEFAULT 0,
  games_drawn INTEGER NOT NULL DEFAULT 0,

  -- Streaks
  current_win_streak INTEGER NOT NULL DEFAULT 0,
  best_win_streak INTEGER NOT NULL DEFAULT 0,

  -- Time stats
  total_time_played_seconds INTEGER NOT NULL DEFAULT 0,
  average_move_time_ms INTEGER,

  -- Game-specific stats (JSONB for flexibility)
  game_specific_stats JSONB DEFAULT '{}'::JSONB,
  -- Examples:
  -- Wordle: {"average_guesses": 4.2, "first_guess_success_rate": 0.05}
  -- Connect 4: {"vertical_wins": 5, "horizontal_wins": 3, "diagonal_wins": 2}

  -- ELO rating (optional for ranked play)
  elo_rating INTEGER DEFAULT 1200,

  -- Timestamps
  last_played_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, family_id, game_type)
);

CREATE INDEX game_stats_user_id_idx ON game_stats(user_id);
CREATE INDEX game_stats_family_id_idx ON game_stats(family_id);
CREATE INDEX game_stats_game_type_idx ON game_stats(game_type);
CREATE INDEX game_stats_elo_rating_idx ON game_stats(family_id, game_type, elo_rating DESC);
CREATE INDEX game_stats_games_won_idx ON game_stats(family_id, game_type, games_won DESC);

-- =====================================================
-- 7. GAME ACHIEVEMENTS TABLE (Optional fun feature)
-- =====================================================
CREATE TABLE IF NOT EXISTS game_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  game_type game_type,

  -- Achievement info
  achievement_key TEXT NOT NULL, -- 'first_win', 'win_streak_5', 'perfect_game', etc.
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Context
  session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::JSONB,

  UNIQUE(user_id, family_id, game_type, achievement_key)
);

CREATE INDEX game_achievements_user_id_idx ON game_achievements(user_id);
CREATE INDEX game_achievements_family_id_idx ON game_achievements(family_id);

-- =====================================================
-- 8. RLS POLICIES - Game Rooms
-- =====================================================
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_members_can_view_rooms" ON game_rooms;
CREATE POLICY "family_members_can_view_rooms"
  ON game_rooms FOR SELECT
  TO authenticated
  USING (
    family_id IS NULL -- Public rooms
    OR is_family_member(family_id, auth.uid())
  );

DROP POLICY IF EXISTS "family_members_can_create_rooms" ON game_rooms;
CREATE POLICY "family_members_can_create_rooms"
  ON game_rooms FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (family_id IS NULL OR is_family_member(family_id, auth.uid()))
  );

DROP POLICY IF EXISTS "room_creator_can_update" ON game_rooms;
CREATE POLICY "room_creator_can_update"
  ON game_rooms FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "room_creator_can_delete" ON game_rooms;
CREATE POLICY "room_creator_can_delete"
  ON game_rooms FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- =====================================================
-- 9. RLS POLICIES - Room Participants
-- =====================================================
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_can_view_room_members" ON room_participants;
CREATE POLICY "participants_can_view_room_members"
  ON room_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM game_rooms
      WHERE game_rooms.id = room_participants.room_id
        AND (
          game_rooms.is_public = true
          OR game_rooms.family_id IS NULL
          OR is_family_member(game_rooms.family_id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "users_can_join_rooms" ON room_participants;
CREATE POLICY "users_can_join_rooms"
  ON room_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM game_rooms
      WHERE game_rooms.id = room_participants.room_id
        AND game_rooms.status = 'waiting'
        AND (
          game_rooms.is_public = true
          OR game_rooms.family_id IS NULL
          OR is_family_member(game_rooms.family_id, auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "users_can_update_own_participation" ON room_participants;
CREATE POLICY "users_can_update_own_participation"
  ON room_participants FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_can_leave_rooms" ON room_participants;
CREATE POLICY "users_can_leave_rooms"
  ON room_participants FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- 10. RLS POLICIES - Game Sessions
-- =====================================================
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_can_view_sessions" ON game_sessions;
CREATE POLICY "participants_can_view_sessions"
  ON game_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM room_participants
      WHERE room_participants.room_id = game_sessions.room_id
        AND room_participants.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM game_rooms
      WHERE game_rooms.id = game_sessions.room_id
        AND (
          game_rooms.is_public = true
          OR (game_rooms.family_id IS NOT NULL AND is_family_member(game_rooms.family_id, auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "system_can_manage_sessions" ON game_sessions;
CREATE POLICY "system_can_manage_sessions"
  ON game_sessions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 11. RLS POLICIES - Game Moves
-- =====================================================
ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_can_view_moves" ON game_moves;
CREATE POLICY "participants_can_view_moves"
  ON game_moves FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM game_sessions gs
      JOIN room_participants rp ON rp.room_id = gs.room_id
      WHERE gs.id = game_moves.session_id
        AND rp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM game_sessions gs
      JOIN game_rooms gr ON gr.id = gs.room_id
      WHERE gs.id = game_moves.session_id
        AND (
          gr.is_public = true
          OR (gr.family_id IS NOT NULL AND is_family_member(gr.family_id, auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "players_can_create_moves" ON game_moves;
CREATE POLICY "players_can_create_moves"
  ON game_moves FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM game_sessions gs
      JOIN room_participants rp ON rp.room_id = gs.room_id
      WHERE gs.id = game_moves.session_id
        AND rp.user_id = auth.uid()
        AND rp.is_active = true
    )
  );

-- =====================================================
-- 12. RLS POLICIES - Game Stats
-- =====================================================
ALTER TABLE game_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_view_family_stats" ON game_stats;
CREATE POLICY "users_can_view_family_stats"
  ON game_stats FOR SELECT
  TO authenticated
  USING (
    family_id IS NULL
    OR is_family_member(family_id, auth.uid())
  );

DROP POLICY IF EXISTS "system_can_manage_stats" ON game_stats;
CREATE POLICY "system_can_manage_stats"
  ON game_stats FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 13. RLS POLICIES - Game Achievements
-- =====================================================
ALTER TABLE game_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_view_family_achievements" ON game_achievements;
CREATE POLICY "users_can_view_family_achievements"
  ON game_achievements FOR SELECT
  TO authenticated
  USING (
    family_id IS NULL
    OR is_family_member(family_id, auth.uid())
  );

DROP POLICY IF EXISTS "system_can_create_achievements" ON game_achievements;
CREATE POLICY "system_can_create_achievements"
  ON game_achievements FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =====================================================
-- 14. FUNCTION: Generate unique join code
-- =====================================================
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 6-character alphanumeric code
    code := upper(substring(md5(random()::text) from 1 for 6));

    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM game_rooms WHERE join_code = code) INTO exists;

    EXIT WHEN NOT exists;
  END LOOP;

  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 15. FUNCTION: Update game stats after session
-- =====================================================
CREATE OR REPLACE FUNCTION update_game_stats_after_session()
RETURNS TRIGGER AS $$
DECLARE
  participant RECORD;
  session_duration INTEGER;
BEGIN
  -- Only process when session is finished
  IF NEW.finished_at IS NULL THEN
    RETURN NEW;
  END IF;

  session_duration := EXTRACT(EPOCH FROM (NEW.finished_at - NEW.started_at))::INTEGER;

  -- Update duration
  UPDATE game_sessions
  SET duration_seconds = session_duration
  WHERE id = NEW.id;

  -- Update stats for all participants
  FOR participant IN
    SELECT rp.user_id, gr.game_type, gr.family_id
    FROM room_participants rp
    JOIN game_rooms gr ON gr.id = rp.room_id
    WHERE rp.room_id = NEW.room_id
      AND rp.user_id IS NOT NULL
  LOOP
    -- Insert or update stats
    INSERT INTO game_stats (
      user_id,
      family_id,
      game_type,
      games_played,
      games_won,
      games_lost,
      games_drawn,
      total_time_played_seconds,
      last_played_at,
      current_win_streak,
      best_win_streak
    ) VALUES (
      participant.user_id,
      participant.family_id,
      participant.game_type,
      1,
      CASE WHEN NEW.winner_id = participant.user_id THEN 1 ELSE 0 END,
      CASE WHEN NOT NEW.is_draw AND NEW.winner_id != participant.user_id THEN 1 ELSE 0 END,
      CASE WHEN NEW.is_draw THEN 1 ELSE 0 END,
      session_duration,
      NEW.finished_at,
      CASE WHEN NEW.winner_id = participant.user_id THEN 1 ELSE 0 END,
      CASE WHEN NEW.winner_id = participant.user_id THEN 1 ELSE 0 END
    )
    ON CONFLICT (user_id, family_id, game_type) DO UPDATE SET
      games_played = game_stats.games_played + 1,
      games_won = game_stats.games_won + CASE WHEN NEW.winner_id = participant.user_id THEN 1 ELSE 0 END,
      games_lost = game_stats.games_lost + CASE WHEN NOT NEW.is_draw AND NEW.winner_id != participant.user_id THEN 1 ELSE 0 END,
      games_drawn = game_stats.games_drawn + CASE WHEN NEW.is_draw THEN 1 ELSE 0 END,
      total_time_played_seconds = game_stats.total_time_played_seconds + session_duration,
      last_played_at = NEW.finished_at,
      current_win_streak = CASE
        WHEN NEW.winner_id = participant.user_id THEN game_stats.current_win_streak + 1
        ELSE 0
      END,
      best_win_streak = GREATEST(
        game_stats.best_win_streak,
        CASE WHEN NEW.winner_id = participant.user_id THEN game_stats.current_win_streak + 1 ELSE 0 END
      ),
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_game_stats ON game_sessions;
CREATE TRIGGER trigger_update_game_stats
  AFTER UPDATE ON game_sessions
  FOR EACH ROW
  WHEN (OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL)
  EXECUTE FUNCTION update_game_stats_after_session();

-- =====================================================
-- 16. FUNCTION: Auto-assign player numbers
-- =====================================================
CREATE OR REPLACE FUNCTION assign_player_number()
RETURNS TRIGGER AS $$
DECLARE
  next_number INTEGER;
  max_allowed INTEGER;
BEGIN
  -- Get max players for this room
  SELECT max_players INTO max_allowed
  FROM game_rooms
  WHERE id = NEW.room_id;

  -- Get next available player number
  SELECT COALESCE(MAX(player_number), 0) + 1 INTO next_number
  FROM room_participants
  WHERE room_id = NEW.room_id;

  -- Check if room is full
  IF next_number > max_allowed THEN
    RAISE EXCEPTION 'Room is full (max % players)', max_allowed;
  END IF;

  NEW.player_number := next_number;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_assign_player_number ON room_participants;
CREATE TRIGGER trigger_assign_player_number
  BEFORE INSERT ON room_participants
  FOR EACH ROW
  WHEN (NEW.player_number IS NULL)
  EXECUTE FUNCTION assign_player_number();

-- =====================================================
-- 17. FUNCTION: Get leaderboard for a game type
-- =====================================================
CREATE OR REPLACE FUNCTION get_game_leaderboard(
  p_family_id UUID,
  p_game_type game_type,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  games_played INTEGER,
  games_won INTEGER,
  win_rate NUMERIC,
  elo_rating INTEGER,
  best_win_streak INTEGER,
  rank INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.user_id,
    p.display_name,
    p.avatar_url,
    gs.games_played,
    gs.games_won,
    CASE WHEN gs.games_played > 0
      THEN ROUND((gs.games_won::NUMERIC / gs.games_played::NUMERIC) * 100, 2)
      ELSE 0
    END AS win_rate,
    gs.elo_rating,
    gs.best_win_streak,
    ROW_NUMBER() OVER (ORDER BY gs.elo_rating DESC, gs.games_won DESC)::INTEGER AS rank
  FROM game_stats gs
  JOIN profiles p ON p.id = gs.user_id
  WHERE gs.family_id = p_family_id
    AND gs.game_type = p_game_type
    AND gs.games_played > 0
  ORDER BY gs.elo_rating DESC, gs.games_won DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 18. FUNCTION: Notify game events
-- =====================================================
CREATE OR REPLACE FUNCTION notify_game_event()
RETURNS TRIGGER AS $$
DECLARE
  participant RECORD;
  room_name TEXT;
  winner_name TEXT;
BEGIN
  -- Get room name
  SELECT name INTO room_name
  FROM game_rooms
  WHERE id = NEW.room_id;

  -- When game finishes, notify all participants
  IF OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL THEN

    -- Get winner name if applicable
    IF NEW.winner_id IS NOT NULL THEN
      SELECT display_name INTO winner_name
      FROM profiles
      WHERE id = NEW.winner_id;
    END IF;

    -- Notify all participants except winner
    FOR participant IN
      SELECT rp.user_id
      FROM room_participants rp
      WHERE rp.room_id = NEW.room_id
        AND rp.user_id IS NOT NULL
        AND rp.user_id != COALESCE(NEW.winner_id, '00000000-0000-0000-0000-000000000000'::UUID)
    LOOP
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        link,
        reference_type,
        reference_id
      ) VALUES (
        participant.user_id,
        'game_finished',
        'Partida finalizada',
        CASE
          WHEN NEW.is_draw THEN 'La partida "' || room_name || '" terminó en empate'
          ELSE winner_name || ' ganó la partida "' || room_name || '"'
        END,
        '/family/' || (SELECT family_id FROM game_rooms WHERE id = NEW.room_id) || '/games',
        'game_session',
        NEW.id
      );
    END LOOP;

    -- Notify winner
    IF NEW.winner_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        link,
        reference_type,
        reference_id
      ) VALUES (
        NEW.winner_id,
        'game_won',
        '¡Victoria!',
        'Ganaste la partida "' || room_name || '"',
        '/family/' || (SELECT family_id FROM game_rooms WHERE id = NEW.room_id) || '/games',
        'game_session',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_game_event ON game_sessions;
CREATE TRIGGER trigger_notify_game_event
  AFTER UPDATE ON game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION notify_game_event();

-- =====================================================
-- 19. Update notifications constraint to include game types
-- =====================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('mention', 'comment', 'invitation', 'gift_status', 'family_join', 'game_finished', 'game_won', 'game_invite'));
