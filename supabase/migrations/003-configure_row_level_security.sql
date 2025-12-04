-- ============================================
-- ENABLE RLS
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES POLICIES
-- ============================================
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- FAMILIES POLICIES
-- ============================================
CREATE POLICY "Users can view their families"
  ON families FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = families.id
      AND family_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create families"
  ON families FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update their families"
  ON families FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = families.id
      AND family_members.user_id = auth.uid()
      AND family_members.role = 'owner'
    )
  );

CREATE POLICY "Owners can delete their families"
  ON families FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = families.id
      AND family_members.user_id = auth.uid()
      AND family_members.role = 'owner'
    )
  );

-- ============================================
-- FAMILY_MEMBERS POLICIES
-- ============================================
CREATE POLICY "Members can view their family members"
  ON family_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family_members.family_id
      AND fm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can add members"
  ON family_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = family_members.family_id
      AND family_members.user_id = auth.uid()
      AND family_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can remove members"
  ON family_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.family_id = family_members.family_id
      AND fm.user_id = auth.uid()
      AND fm.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- FAMILY_MODULES POLICIES
-- ============================================
CREATE POLICY "Members can view family modules"
  ON family_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = family_modules.family_id
      AND family_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can manage modules"
  ON family_modules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = family_modules.family_id
      AND family_members.user_id = auth.uid()
      AND family_members.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- NOTES POLICIES
-- ============================================
CREATE POLICY "Members can view family notes"
  ON notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = notes.family_id
      AND family_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create notes"
  ON notes FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = notes.family_id
      AND family_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own notes"
  ON notes FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own notes"
  ON notes FOR DELETE
  USING (auth.uid() = created_by);

-- ============================================
-- INVITATIONS POLICIES
-- ============================================
CREATE POLICY "Anyone can view invitations by token"
  ON family_invitations FOR SELECT
  USING (true);

CREATE POLICY "Owners and admins can create invitations"
  ON family_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = family_invitations.family_id
      AND family_members.user_id = auth.uid()
      AND family_members.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- EXTERNAL_CONNECTIONS POLICIES
-- ============================================
CREATE POLICY "Users can view own connections"
  ON external_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own connections"
  ON external_connections FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- AUDIT_LOGS POLICIES
-- ============================================
CREATE POLICY "Members can view family audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.family_id = audit_logs.family_id
      AND family_members.user_id = auth.uid()
      AND family_members.role IN ('owner', 'admin')
    )
  );