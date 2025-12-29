-- =====================================================
-- GIFT ITEM COMMENTS & ENHANCED STATUS SYSTEM
-- =====================================================
-- This migration adds:
-- 1. Comments/notes system for gift items (like Jira/Odoo)
-- 2. @mentions support with notifications
-- 3. Enhanced status tracking (purchased, reserved, considering, etc.)

-- =====================================================
-- 1. GIFT ITEM COMMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gift_item_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES gift_items(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gift_item_comments_content_not_empty CHECK (char_length(trim(content)) > 0)
);

-- Index for faster queries
CREATE INDEX gift_item_comments_item_id_idx ON gift_item_comments(item_id);
CREATE INDEX gift_item_comments_author_id_idx ON gift_item_comments(author_id);
CREATE INDEX gift_item_comments_created_at_idx ON gift_item_comments(created_at DESC);

-- =====================================================
-- 2. COMMENT MENTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gift_comment_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES gift_item_comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(comment_id, mentioned_user_id)
);

CREATE INDEX gift_comment_mentions_mentioned_user_idx ON gift_comment_mentions(mentioned_user_id);
CREATE INDEX gift_comment_mentions_comment_id_idx ON gift_comment_mentions(comment_id);

-- =====================================================
-- 3. NOTIFICATIONS TABLE (General purpose)
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'mention', 'comment', 'invitation', etc.
  title TEXT NOT NULL,
  message TEXT,
  link TEXT, -- URL to navigate to when clicked
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Polymorphic references (optional)
  reference_type TEXT, -- 'gift_item', 'family', 'comment', etc.
  reference_id UUID,

  CONSTRAINT notifications_type_check CHECK (type IN ('mention', 'comment', 'invitation', 'gift_status', 'family_join'))
);

CREATE INDEX notifications_user_id_idx ON notifications(user_id);
CREATE INDEX notifications_read_idx ON notifications(read);
CREATE INDEX notifications_created_at_idx ON notifications(created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id, read) WHERE read = false;

-- =====================================================
-- 4. UPDATE gift_purchases TABLE - Add status
-- =====================================================
-- Instead of just boolean purchased, let's track purchase quantity and notes
ALTER TABLE gift_purchases
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- =====================================================
-- 5. UPDATE gift_reservations TABLE - Add status and type
-- =====================================================
-- Add a status field to distinguish between "looking" vs "reserved"
ALTER TABLE gift_reservations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'considering',
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Status can be: 'considering' (mirando), 'reserved' (reservado)
ALTER TABLE gift_reservations
  ADD CONSTRAINT gift_reservations_status_check
  CHECK (status IN ('considering', 'reserved'));

-- =====================================================
-- 6. RLS POLICIES - Comments
-- =====================================================
DROP POLICY IF EXISTS "family_members_can_view_comments" ON gift_item_comments;
CREATE POLICY "family_members_can_view_comments"
  ON gift_item_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_item_comments.item_id
        AND is_family_member(gift_items.family_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "family_members_can_create_comments" ON gift_item_comments;
CREATE POLICY "family_members_can_create_comments"
  ON gift_item_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_item_comments.item_id
        AND is_family_member(gift_items.family_id, auth.uid())
        -- Don't allow owner to comment on their own items
        AND gift_items.owner_id != auth.uid()
    )
  );

DROP POLICY IF EXISTS "authors_can_update_own_comments" ON gift_item_comments;
CREATE POLICY "authors_can_update_own_comments"
  ON gift_item_comments FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "authors_can_delete_own_comments" ON gift_item_comments;
CREATE POLICY "authors_can_delete_own_comments"
  ON gift_item_comments FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

-- =====================================================
-- 7. RLS POLICIES - Comment Mentions
-- =====================================================
DROP POLICY IF EXISTS "anyone_can_view_mentions" ON gift_comment_mentions;
CREATE POLICY "anyone_can_view_mentions"
  ON gift_comment_mentions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "system_can_create_mentions" ON gift_comment_mentions;
CREATE POLICY "system_can_create_mentions"
  ON gift_comment_mentions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM gift_item_comments
      WHERE gift_item_comments.id = gift_comment_mentions.comment_id
        AND gift_item_comments.author_id = auth.uid()
    )
  );

-- =====================================================
-- 8. RLS POLICIES - Notifications
-- =====================================================
DROP POLICY IF EXISTS "users_can_view_own_notifications" ON notifications;
CREATE POLICY "users_can_view_own_notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_can_update_own_notifications" ON notifications;
CREATE POLICY "users_can_update_own_notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "system_can_create_notifications" ON notifications;
CREATE POLICY "system_can_create_notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Any authenticated user can create notifications

DROP POLICY IF EXISTS "users_can_delete_own_notifications" ON notifications;
CREATE POLICY "users_can_delete_own_notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- 9. FUNCTION: Extract mentions from comment text
-- =====================================================
CREATE OR REPLACE FUNCTION extract_mentions_from_comment(comment_text TEXT)
RETURNS TEXT[] AS $$
DECLARE
  mentions TEXT[];
BEGIN
  -- Extract all @mentions from the comment
  -- Matches @word patterns (letters, numbers, underscore, hyphen)
  SELECT ARRAY_AGG(DISTINCT substring(match FROM 2))
  INTO mentions
  FROM regexp_matches(comment_text, '@([\w-]+)', 'g') AS match;

  RETURN COALESCE(mentions, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 10. TRIGGER: Create mentions and notifications on comment insert
-- =====================================================
CREATE OR REPLACE FUNCTION handle_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
  mention_username TEXT;
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

  -- Extract mentions from comment
  FOREACH mention_username IN ARRAY extract_mentions_from_comment(NEW.content)
  LOOP
    -- Find user by display_name (case-insensitive)
    SELECT id INTO mentioned_user_id
    FROM profiles
    WHERE LOWER(display_name) = LOWER(mention_username)
      AND id = ANY(family_members_ids) -- Must be a family member
      AND id != item_owner_id -- Don't mention the item owner
      AND id != NEW.author_id -- Don't mention yourself
    LIMIT 1;

    IF mentioned_user_id IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS trigger_handle_comment_mentions ON gift_item_comments;
CREATE TRIGGER trigger_handle_comment_mentions
  AFTER INSERT ON gift_item_comments
  FOR EACH ROW
  EXECUTE FUNCTION handle_comment_mentions();

-- =====================================================
-- 11. FUNCTION: Get unread notification count
-- =====================================================
CREATE OR REPLACE FUNCTION get_unread_notification_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM notifications
    WHERE user_id = user_uuid AND read = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
