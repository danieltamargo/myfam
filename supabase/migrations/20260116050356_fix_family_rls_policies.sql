-- Fix RLS policies for families table
-- The previous migration (008) broke access for existing family members
-- This combines both conditions: members OR invited users can view

DROP POLICY IF EXISTS "invited_users_can_view_families" ON families;
DROP POLICY IF EXISTS "members_can_view_families" ON families;

-- Create a single comprehensive policy that allows BOTH members AND invited users to view
CREATE POLICY "members_and_invited_can_view_families"
  ON families FOR SELECT
  TO authenticated
  USING (
    -- Allow if user is a family member
    is_family_member(id, auth.uid())
    OR
    -- Allow if user has a pending invitation
    EXISTS (
      SELECT 1 FROM family_invitations
      WHERE family_invitations.family_id = families.id
        AND family_invitations.invited_user_id = auth.uid()
        AND family_invitations.status = 'pending'
    )
  );

-- Also ensure family_members view policy is correct
DROP POLICY IF EXISTS "members_can_view_family_members" ON family_members;
CREATE POLICY "members_can_view_family_members"
  ON family_members FOR SELECT
  TO authenticated
  USING (is_family_member(family_id, auth.uid()));

-- Ensure family_invitations policies allow viewing own invitations
DROP POLICY IF EXISTS "users_can_view_own_invitations" ON family_invitations;
CREATE POLICY "users_can_view_own_invitations"
  ON family_invitations FOR SELECT
  TO authenticated
  USING (
    invited_user_id = auth.uid()
    OR
    invited_by = auth.uid()
    OR
    is_family_member(family_id, auth.uid())
  );

-- Fix duplicate invitation constraint issue
-- Allow updating existing invitations
DROP POLICY IF EXISTS "owners_can_manage_invitations" ON family_invitations;
CREATE POLICY "owners_can_manage_invitations"
  ON family_invitations FOR ALL
  TO authenticated
  USING (
    has_family_role(family_id, auth.uid(), ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    has_family_role(family_id, auth.uid(), ARRAY['owner', 'admin'])
  );
