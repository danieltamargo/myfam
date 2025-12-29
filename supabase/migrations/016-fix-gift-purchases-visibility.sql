-- Fix gift_purchases RLS policy to allow family members to see all purchases
-- for items they DON'T own (anti-spoiler protection)

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view only their own purchases" ON gift_purchases;

-- Create new policy that allows:
-- 1. Users can see their own purchases
-- 2. Users can see ALL purchases for items they DON'T own (to avoid duplicate purchases)
-- 3. Users CANNOT see purchases for items they DO own (anti-spoiler)
CREATE POLICY "Family members can view purchases (except for their own items)"
  ON gift_purchases FOR SELECT
  USING (
    -- Can always see your own purchases
    purchased_by = auth.uid()
    OR
    -- Can see purchases for items you don't own in your family
    EXISTS (
      SELECT 1 FROM gift_items
      WHERE gift_items.id = gift_purchases.item_id
      AND is_family_member(gift_items.family_id, auth.uid())
      AND gift_items.owner_id != auth.uid() -- Anti-spoiler: cannot see who bought YOUR items
    )
  );

-- Add comment explaining the policy
COMMENT ON POLICY "Family members can view purchases (except for their own items)" ON gift_purchases IS
  'Allows family members to see all purchases for items they don''t own to prevent duplicate purchases, while maintaining anti-spoiler protection for item owners';
