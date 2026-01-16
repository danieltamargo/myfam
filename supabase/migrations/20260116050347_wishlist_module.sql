-- =====================================================
-- WISHLIST MODULE - Gift Registry System
-- =====================================================
-- Created: 2025-12-28
-- Description: Personal wishlist with event categorization
--              Anti-spoiler system for gift purchases

-- =====================================================
-- 1. EVENT CATEGORIES
-- =====================================================
CREATE TABLE gift_event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT, -- emoji like "🎄", "🎂", "👑", "❤️"
  event_date DATE, -- Optional: for birthday/anniversary tracking
  is_system BOOLEAN DEFAULT false, -- true for pre-created events
  color TEXT, -- Hex color for UI badges
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_event_per_family UNIQUE(family_id, name)
);

-- Index for faster queries
CREATE INDEX idx_gift_event_categories_family ON gift_event_categories(family_id);

-- =====================================================
-- 2. WISHLIST ITEMS
-- =====================================================
CREATE TABLE gift_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  url TEXT, -- Link to product page
  price DECIMAL(10,2),
  priority INTEGER DEFAULT 0, -- 2=very high, 1=high, 0=normal, -1=low
  quantity INTEGER DEFAULT 1,
  image_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_priority CHECK (priority >= -1 AND priority <= 2),
  CONSTRAINT valid_quantity CHECK (quantity > 0)
);

-- Indexes for performance
CREATE INDEX idx_gift_items_family ON gift_items(family_id);
CREATE INDEX idx_gift_items_owner ON gift_items(owner_id);

-- =====================================================
-- 3. ITEM → EVENT RELATIONSHIP (Many-to-Many)
-- =====================================================
CREATE TABLE gift_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES gift_items(id) ON DELETE CASCADE,
  event_category_id UUID NOT NULL REFERENCES gift_event_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_item_event UNIQUE(item_id, event_category_id)
);

-- Index for faster lookups
CREATE INDEX idx_gift_item_events_item ON gift_item_events(item_id);
CREATE INDEX idx_gift_item_events_event ON gift_item_events(event_category_id);

-- =====================================================
-- 4. PURCHASES (INVISIBLE TO OWNER - Anti-Spoiler!)
-- =====================================================
CREATE TABLE gift_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES gift_items(id) ON DELETE CASCADE,
  purchased_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quantity_purchased INTEGER DEFAULT 1,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT, -- Private notes for the buyer

  CONSTRAINT unique_purchase_per_user UNIQUE(item_id, purchased_by),
  CONSTRAINT valid_purchase_quantity CHECK (quantity_purchased > 0)
);

-- Index for performance
CREATE INDEX idx_gift_purchases_item ON gift_purchases(item_id);
CREATE INDEX idx_gift_purchases_buyer ON gift_purchases(purchased_by);

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE gift_event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_item_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_purchases ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- RLS: gift_event_categories
-- -----------------------------------------------------
-- Family members can view events in their family
CREATE POLICY "Family members can view event categories"
  ON gift_event_categories FOR SELECT
  USING (is_family_member(family_id, auth.uid()));

-- Family members can create custom events
CREATE POLICY "Family members can create event categories"
  ON gift_event_categories FOR INSERT
  WITH CHECK (
    is_family_member(family_id, auth.uid())
    AND created_by = auth.uid()
  );

-- Only creator can update/delete custom events (not system events)
CREATE POLICY "Creators can update their event categories"
  ON gift_event_categories FOR UPDATE
  USING (
    created_by = auth.uid()
    AND is_system = false
  );

CREATE POLICY "Creators can delete their event categories"
  ON gift_event_categories FOR DELETE
  USING (
    created_by = auth.uid()
    AND is_system = false
  );

-- -----------------------------------------------------
-- RLS: gift_items
-- -----------------------------------------------------
-- Family members can view items from any member in their family
CREATE POLICY "Family members can view all wishlist items"
  ON gift_items FOR SELECT
  USING (is_family_member(family_id, auth.uid()));

-- Users can create items in their own wishlist
CREATE POLICY "Users can create their own wishlist items"
  ON gift_items FOR INSERT
  WITH CHECK (
    is_family_member(family_id, auth.uid())
    AND owner_id = auth.uid()
  );

-- Users can only update their own items
CREATE POLICY "Users can update their own wishlist items"
  ON gift_items FOR UPDATE
  USING (owner_id = auth.uid());

-- Users can only delete their own items
CREATE POLICY "Users can delete their own wishlist items"
  ON gift_items FOR DELETE
  USING (owner_id = auth.uid());

-- -----------------------------------------------------
-- RLS: gift_item_events
-- -----------------------------------------------------
-- Anyone can view item-event relationships if they can see the item
CREATE POLICY "Family members can view item events"
  ON gift_item_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_item_events.item_id
      AND is_family_member(gift_items.family_id, auth.uid())
    )
  );

-- Only item owner can manage event relationships
CREATE POLICY "Item owners can manage event relationships"
  ON gift_item_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_item_events.item_id
      AND gift_items.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_item_events.item_id
      AND gift_items.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------
-- RLS: gift_purchases (CRITICAL - Anti-Spoiler!)
-- -----------------------------------------------------
-- ONLY the buyer can see their own purchases (NOT the item owner!)
CREATE POLICY "Users can view only their own purchases"
  ON gift_purchases FOR SELECT
  USING (purchased_by = auth.uid());

-- Family members can mark items as purchased (but NOT items they own!)
CREATE POLICY "Family members can purchase items (except their own)"
  ON gift_purchases FOR INSERT
  WITH CHECK (
    purchased_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_purchases.item_id
      AND is_family_member(gift_items.family_id, auth.uid())
      AND gift_items.owner_id != auth.uid() -- Cannot buy your own items!
    )
  );

-- Users can update their own purchase records
CREATE POLICY "Users can update their own purchases"
  ON gift_purchases FOR UPDATE
  USING (purchased_by = auth.uid());

-- Users can delete their own purchase records (un-purchase)
CREATE POLICY "Users can delete their own purchases"
  ON gift_purchases FOR DELETE
  USING (purchased_by = auth.uid());

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to get total purchased quantity for an item
CREATE OR REPLACE FUNCTION get_item_purchased_quantity(item_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  total_purchased INTEGER;
BEGIN
  SELECT COALESCE(SUM(quantity_purchased), 0)
  INTO total_purchased
  FROM gift_purchases
  WHERE item_id = item_uuid;

  RETURN total_purchased;
END;
$$;

-- Function to check if current user has purchased an item
CREATE OR REPLACE FUNCTION has_user_purchased_item(item_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  purchase_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM gift_purchases
    WHERE item_id = item_uuid
    AND purchased_by = user_uuid
  ) INTO purchase_exists;

  RETURN purchase_exists;
END;
$$;

-- =====================================================
-- 7. SEED DATA - System Event Categories
-- =====================================================
-- Note: These will be inserted per-family when family is created
-- For now, we'll insert them for existing families

-- Insert system events for all existing families
INSERT INTO gift_event_categories (family_id, name, icon, color, is_system, created_by)
SELECT
  f.id,
  event.name,
  event.icon,
  event.color,
  true,
  f.created_by
FROM families f
CROSS JOIN (
  VALUES
    ('Navidad', '🎄', '#dc2626'),
    ('Cumpleaños', '🎂', '#f59e0b'),
    ('Reyes', '👑', '#8b5cf6'),
    ('San Valentín', '❤️', '#ec4899'),
    ('Todos', '🎁', '#10b981')
) AS event(name, icon, color)
ON CONFLICT (family_id, name) DO NOTHING;

-- =====================================================
-- 8. UPDATED_AT TRIGGERS
-- =====================================================

-- Trigger for gift_event_categories
CREATE TRIGGER update_gift_event_categories_updated_at
  BEFORE UPDATE ON gift_event_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for gift_items
CREATE TRIGGER update_gift_items_updated_at
  BEFORE UPDATE ON gift_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE gift_event_categories IS 'Event categories for wishlist items (Christmas, Birthday, etc)';
COMMENT ON TABLE gift_items IS 'Individual wishlist items owned by users';
COMMENT ON TABLE gift_item_events IS 'Many-to-many relationship between items and events';
COMMENT ON TABLE gift_purchases IS 'Purchase tracking - INVISIBLE to item owner to avoid spoilers';

COMMENT ON COLUMN gift_purchases.purchased_by IS 'CRITICAL: RLS ensures owner cannot see who purchased their items';
COMMENT ON FUNCTION get_item_purchased_quantity IS 'Returns total quantity purchased across all buyers (for availability check)';
COMMENT ON FUNCTION has_user_purchased_item IS 'Returns true if specific user has purchased this item';
