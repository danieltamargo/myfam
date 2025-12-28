-- =====================================================
-- Gift Reservations System - "Yo lo miro"
-- =====================================================
-- Created: 2025-12-28
-- Description: System for family members to reserve gifts they're looking into buying
--              Visible to other members to coordinate and avoid duplicate purchases

-- =====================================================
-- 1. RESERVATIONS TABLE
-- =====================================================
CREATE TABLE gift_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES gift_items(id) ON DELETE CASCADE,
  reserved_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reserved_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT, -- Private notes for the reserver

  CONSTRAINT unique_reservation_per_user UNIQUE(item_id, reserved_by)
);

-- Index for performance
CREATE INDEX idx_gift_reservations_item ON gift_reservations(item_id);
CREATE INDEX idx_gift_reservations_user ON gift_reservations(reserved_by);

-- =====================================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE gift_reservations ENABLE ROW LEVEL SECURITY;

-- Family members can see ALL reservations for items in their family
-- (Unlike purchases, reservations are visible to coordinate)
CREATE POLICY "Family members can view reservations"
  ON gift_reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_reservations.item_id
      AND is_family_member(gift_items.family_id, auth.uid())
    )
  );

-- Family members can reserve items (except their own)
CREATE POLICY "Family members can reserve items (except their own)"
  ON gift_reservations FOR INSERT
  WITH CHECK (
    reserved_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_reservations.item_id
      AND is_family_member(gift_items.family_id, auth.uid())
      AND gift_items.owner_id != auth.uid() -- Cannot reserve your own items!
    )
  );

-- Users can only update their own reservations
CREATE POLICY "Users can update their own reservations"
  ON gift_reservations FOR UPDATE
  USING (reserved_by = auth.uid());

-- Users can only delete their own reservations (unreserve)
CREATE POLICY "Users can delete their own reservations"
  ON gift_reservations FOR DELETE
  USING (reserved_by = auth.uid());

-- =====================================================
-- 3. ENABLE REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE gift_reservations;

-- =====================================================
-- 4. COMMENTS
-- =====================================================
COMMENT ON TABLE gift_reservations IS 'Gift reservations - visible to family members to coordinate purchases';
COMMENT ON COLUMN gift_reservations.reserved_by IS 'User who is looking into buying this gift - VISIBLE to other family members';
