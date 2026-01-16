-- =====================================================
-- AUTO-DELETE EMPTY GAME ROOMS
-- =====================================================
-- When the last participant leaves a room, delete the room automatically

CREATE OR REPLACE FUNCTION auto_delete_empty_rooms()
RETURNS TRIGGER AS $$
DECLARE
  active_count INTEGER;
BEGIN
  -- Count active participants in the room
  SELECT COUNT(*) INTO active_count
  FROM room_participants
  WHERE room_id = OLD.room_id
    AND is_active = true;

  -- If no active participants left, delete the room
  IF active_count = 0 THEN
    DELETE FROM game_rooms WHERE id = OLD.room_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger when a participant is marked as inactive
DROP TRIGGER IF EXISTS trigger_auto_delete_empty_rooms ON room_participants;
CREATE TRIGGER trigger_auto_delete_empty_rooms
  AFTER UPDATE ON room_participants
  FOR EACH ROW
  WHEN (OLD.is_active = true AND NEW.is_active = false)
  EXECUTE FUNCTION auto_delete_empty_rooms();

-- Trigger when a participant is deleted
DROP TRIGGER IF EXISTS trigger_auto_delete_empty_rooms_on_delete ON room_participants;
CREATE TRIGGER trigger_auto_delete_empty_rooms_on_delete
  AFTER DELETE ON room_participants
  FOR EACH ROW
  EXECUTE FUNCTION auto_delete_empty_rooms();

-- =====================================================
-- CLEANUP ORPHANED ROOMS (existing rooms with no active participants)
-- =====================================================
DELETE FROM game_rooms
WHERE id NOT IN (
  SELECT DISTINCT room_id
  FROM room_participants
  WHERE is_active = true
);
