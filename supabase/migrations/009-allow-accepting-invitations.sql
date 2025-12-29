-- Allow users to join families when accepting invitations
-- This updates the RLS policy to allow users to insert themselves as members
-- when they have a pending invitation

DROP POLICY IF EXISTS "can_insert_family_members" ON family_members;
CREATE POLICY "can_insert_family_members"
  ON family_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow creating themselves as owner (when creating a new family)
    (user_id = auth.uid() AND role = 'owner')
    OR
    -- Allow owners/admins to add other members
    has_family_role(family_id, auth.uid(), ARRAY['owner', 'admin'])
    OR
    -- Allow users to add themselves as member if they have a pending invitation
    (
      user_id = auth.uid()
      AND role = 'member'
      AND EXISTS (
        SELECT 1 FROM family_invitations
        WHERE family_invitations.family_id = family_members.family_id
          AND family_invitations.invited_user_id = auth.uid()
          AND family_invitations.status = 'pending'
      )
    )
  );
