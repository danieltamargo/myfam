-- Allow invited users to view family details
-- This allows users who have pending invitations to see the family name
-- when viewing their invitations on the dashboard

DROP POLICY IF EXISTS "invited_users_can_view_families" ON families;
CREATE POLICY "invited_users_can_view_families"
  ON families FOR SELECT
  TO authenticated
  USING (
    -- Allow if user is a member OR has a pending invitation
    is_family_member(id, auth.uid()) OR
    EXISTS (
      SELECT 1 FROM family_invitations
      WHERE family_invitations.family_id = families.id
        AND family_invitations.invited_user_id = auth.uid()
        AND family_invitations.status = 'pending'
    )
  );

-- Drop the old policy since we're replacing it with the new one above
DROP POLICY IF EXISTS "members_can_view_families" ON families;
