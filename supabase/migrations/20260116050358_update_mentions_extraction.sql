-- Update mention extraction to support new format: @{{user_id:display_name}}
-- This allows mentions with spaces in names

DROP FUNCTION IF EXISTS extract_mentions_from_comment(TEXT);

CREATE OR REPLACE FUNCTION extract_mentions_from_comment(comment_text TEXT)
RETURNS UUID[] AS $$
BEGIN
  -- Extract user IDs from @{{user_id:display_name}} format
  -- Returns array of UUIDs instead of text
  RETURN ARRAY(
    SELECT DISTINCT (regexp_matches(comment_text, '@\{\{([^:]+):[^}]+\}\}', 'g'))[1]::UUID
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update the trigger function to work with UUIDs
DROP FUNCTION IF EXISTS handle_comment_mentions() CASCADE;

CREATE OR REPLACE FUNCTION handle_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
  mentioned_user_id UUID;
  item_owner_id UUID;
  item_name TEXT;
  author_name TEXT;
  family_members_ids UUID[];
BEGIN
  -- Get item owner and name
  SELECT owner_id, name INTO item_owner_id, item_name
  FROM gift_items
  WHERE id = NEW.item_id;

  -- Get author name
  SELECT display_name INTO author_name
  FROM profiles
  WHERE id = NEW.author_id;

  -- Get all family members for this item
  SELECT ARRAY_AGG(DISTINCT fm.user_id)
  INTO family_members_ids
  FROM gift_items gi
  JOIN family_members fm ON fm.family_id = gi.family_id
  WHERE gi.id = NEW.item_id;

  -- Extract mentions from comment (now returns UUID array)
  FOREACH mentioned_user_id IN ARRAY extract_mentions_from_comment(NEW.content)
  LOOP
    -- Validate the mentioned user
    IF mentioned_user_id = ANY(family_members_ids) -- Must be a family member
      AND mentioned_user_id != item_owner_id -- Don't mention the item owner
      AND mentioned_user_id != NEW.author_id -- Don't mention yourself
    THEN
      -- Create mention record
      INSERT INTO gift_comment_mentions (comment_id, mentioned_user_id)
      VALUES (NEW.id, mentioned_user_id)
      ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING;

      -- Create notification for mentioned user
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        link,
        reference_type,
        reference_id
      ) VALUES (
        mentioned_user_id,
        'mention',
        COALESCE(author_name, 'Alguien') || ' te mencionó',
        'En un comentario sobre: ' || item_name,
        '/family/' || (SELECT family_id FROM gift_items WHERE id = NEW.item_id) || '/wishlist',
        'gift_comment',
        NEW.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_handle_comment_mentions ON gift_item_comments;
CREATE TRIGGER trigger_handle_comment_mentions
  AFTER INSERT ON gift_item_comments
  FOR EACH ROW
  EXECUTE FUNCTION handle_comment_mentions();
