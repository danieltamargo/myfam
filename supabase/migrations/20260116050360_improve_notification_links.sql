-- Improve notification links to include item_id for direct modal opening
DROP FUNCTION IF EXISTS handle_comment_mentions() CASCADE;

CREATE OR REPLACE FUNCTION handle_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
  v_mentioned_user_id UUID;
  v_item_owner_id UUID;
  v_item_name TEXT;
  v_author_name TEXT;
  v_family_members_ids UUID[];
  v_family_id UUID;
BEGIN
  -- Get item owner, name, and family_id
  SELECT owner_id, name, family_id
  INTO v_item_owner_id, v_item_name, v_family_id
  FROM gift_items
  WHERE id = NEW.item_id;

  -- Get author name
  SELECT display_name INTO v_author_name
  FROM profiles
  WHERE id = NEW.author_id;

  -- Get all family members for this item
  SELECT ARRAY_AGG(DISTINCT fm.user_id)
  INTO v_family_members_ids
  FROM family_members fm
  WHERE fm.family_id = v_family_id;

  -- Extract mentions from comment (now returns UUID array)
  FOREACH v_mentioned_user_id IN ARRAY extract_mentions_from_comment(NEW.content)
  LOOP
    -- Validate the mentioned user
    IF v_mentioned_user_id = ANY(v_family_members_ids) -- Must be a family member
      AND v_mentioned_user_id != v_item_owner_id -- Don't mention the item owner
      AND v_mentioned_user_id != NEW.author_id -- Don't mention yourself
    THEN
      -- Create mention record
      INSERT INTO gift_comment_mentions (comment_id, mentioned_user_id)
      VALUES (NEW.id, v_mentioned_user_id)
      ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING;

      -- Create notification for mentioned user with item_id in URL
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        link,
        reference_type,
        reference_id
      ) VALUES (
        v_mentioned_user_id,
        'mention',
        COALESCE(v_author_name, 'Alguien') || ' te mencionó',
        'En un comentario sobre: ' || v_item_name,
        '/family/' || v_family_id || '/wishlist?item=' || NEW.item_id,
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
