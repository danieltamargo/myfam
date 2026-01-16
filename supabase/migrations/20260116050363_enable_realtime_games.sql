-- =====================================================
-- ENABLE REALTIME FOR GAMES MODULE
-- =====================================================

-- Enable realtime for game rooms (to see when players join/leave, status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;

-- Enable realtime for room participants (to see who joins/leaves in real-time)
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;

-- Enable realtime for game sessions (to see game state updates)
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;

-- Enable realtime for game moves (to see moves as they happen)
ALTER PUBLICATION supabase_realtime ADD TABLE game_moves;

-- Enable realtime for game stats (to see leaderboard updates)
ALTER PUBLICATION supabase_realtime ADD TABLE game_stats;

-- Enable realtime for achievements (to celebrate achievements as they unlock)
ALTER PUBLICATION supabase_realtime ADD TABLE game_achievements;
