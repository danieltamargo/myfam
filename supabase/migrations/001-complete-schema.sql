-- ============================================
-- MYFAMILY DATABASE SCHEMA - CONSOLIDATED
-- ============================================

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;

-- Trigger to create profile automatically on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to sync email updates
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- ============================================
-- FAMILIES
-- ============================================
CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- FAMILY MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(family_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON family_members(user_id);

-- ============================================
-- FAMILY MODULES
-- ============================================
CREATE TABLE IF NOT EXISTS family_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL CHECK (
    module_name IN ('expenses', 'events', 'notes', 'planner', 'fitness', 'tasks', 'lists')
  ),
  enabled BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}',
  enabled_at TIMESTAMP,
  enabled_by UUID REFERENCES profiles(id),
  UNIQUE(family_id, module_name)
);

CREATE INDEX IF NOT EXISTS idx_family_modules_family ON family_modules(family_id);

-- ============================================
-- NOTES (Polymorphic)
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notable_type TEXT NOT NULL,
  notable_id UUID NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_family ON notes(family_id);
CREATE INDEX IF NOT EXISTS idx_notes_notable ON notes(notable_type, notable_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);

-- ============================================
-- FAMILY INVITATIONS
-- ============================================
DROP TABLE IF EXISTS family_invitations;
CREATE TABLE family_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invited_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(family_id, invited_user_id)
);

CREATE INDEX IF NOT EXISTS idx_invitations_family ON family_invitations(family_id);
CREATE INDEX IF NOT EXISTS idx_invitations_user ON family_invitations(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON family_invitations(status);

-- ============================================
-- EXTERNAL CONNECTIONS (Google Calendar, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS external_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_calendar', 'github')),
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  connected_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(family_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_connections_family_user ON external_connections(family_id, user_id);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  module_name TEXT,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_family ON audit_logs(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_families_updated_at ON families;
CREATE TRIGGER update_families_updated_at BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_connections_updated_at ON external_connections;
CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON external_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invitations_updated_at ON family_invitations;
CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON family_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS HELPER FUNCTIONS
-- ============================================
DROP FUNCTION IF EXISTS is_family_member(UUID, UUID);
CREATE FUNCTION is_family_member(family_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = family_uuid
    AND user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP FUNCTION IF EXISTS has_family_role(UUID, UUID, TEXT[]);
CREATE FUNCTION has_family_role(family_uuid UUID, user_uuid UUID, required_roles TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = family_uuid
    AND user_id = user_uuid
    AND role = ANY(required_roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

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
-- RLS POLICIES - PROFILES
-- ============================================
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ============================================
-- RLS POLICIES - FAMILIES
-- ============================================
DROP POLICY IF EXISTS "authenticated_can_create_families" ON families;
CREATE POLICY "authenticated_can_create_families"
  ON families FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "members_can_view_families" ON families;
CREATE POLICY "members_can_view_families"
  ON families FOR SELECT
  TO authenticated
  USING (is_family_member(id, auth.uid()));

DROP POLICY IF EXISTS "owners_can_update_families" ON families;
CREATE POLICY "owners_can_update_families"
  ON families FOR UPDATE
  TO authenticated
  USING (has_family_role(id, auth.uid(), ARRAY['owner']));

DROP POLICY IF EXISTS "owners_can_delete_families" ON families;
CREATE POLICY "owners_can_delete_families"
  ON families FOR DELETE
  TO authenticated
  USING (has_family_role(id, auth.uid(), ARRAY['owner']));

-- ============================================
-- RLS POLICIES - FAMILY_MEMBERS
-- ============================================
DROP POLICY IF EXISTS "members_can_view_family_members" ON family_members;
CREATE POLICY "members_can_view_family_members"
  ON family_members FOR SELECT
  TO authenticated
  USING (is_family_member(family_id, auth.uid()));

DROP POLICY IF EXISTS "can_insert_family_members" ON family_members;
CREATE POLICY "can_insert_family_members"
  ON family_members FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND role = 'owner')
    OR
    has_family_role(family_id, auth.uid(), ARRAY['owner', 'admin'])
  );

DROP POLICY IF EXISTS "owners_can_update_roles" ON family_members;
CREATE POLICY "owners_can_update_roles"
  ON family_members FOR UPDATE
  TO authenticated
  USING (has_family_role(family_id, auth.uid(), ARRAY['owner']));

DROP POLICY IF EXISTS "owners_admins_can_remove_members" ON family_members;
CREATE POLICY "owners_admins_can_remove_members"
  ON family_members FOR DELETE
  TO authenticated
  USING (has_family_role(family_id, auth.uid(), ARRAY['owner', 'admin']));

-- ============================================
-- RLS POLICIES - FAMILY_MODULES
-- ============================================
DROP POLICY IF EXISTS "Members can view family modules" ON family_modules;
CREATE POLICY "Members can view family modules"
  ON family_modules FOR SELECT
  TO authenticated
  USING (is_family_member(family_id, auth.uid()));

DROP POLICY IF EXISTS "Owners and admins can manage modules" ON family_modules;
CREATE POLICY "Owners and admins can manage modules"
  ON family_modules FOR ALL
  TO authenticated
  USING (has_family_role(family_id, auth.uid(), ARRAY['owner', 'admin']));

-- ============================================
-- RLS POLICIES - NOTES
-- ============================================
DROP POLICY IF EXISTS "Members can view family notes" ON notes;
CREATE POLICY "Members can view family notes"
  ON notes FOR SELECT
  TO authenticated
  USING (is_family_member(family_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create notes" ON notes;
CREATE POLICY "Members can create notes"
  ON notes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND is_family_member(family_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own notes" ON notes;
CREATE POLICY "Users can update own notes"
  ON notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete own notes" ON notes;
CREATE POLICY "Users can delete own notes"
  ON notes FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ============================================
-- RLS POLICIES - INVITATIONS
-- ============================================
DROP POLICY IF EXISTS "Anyone can view invitations by token" ON family_invitations;
CREATE POLICY "Anyone can view invitations by token"
  ON family_invitations FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Owners and admins can create invitations" ON family_invitations;
CREATE POLICY "Owners and admins can create invitations"
  ON family_invitations FOR INSERT
  TO authenticated
  WITH CHECK (has_family_role(family_id, auth.uid(), ARRAY['owner', 'admin']));

-- ============================================
-- RLS POLICIES - EXTERNAL_CONNECTIONS
-- ============================================
DROP POLICY IF EXISTS "Users can view own connections" ON external_connections;
CREATE POLICY "Users can view own connections"
  ON external_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own connections" ON external_connections;
CREATE POLICY "Users can manage own connections"
  ON external_connections FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - AUDIT_LOGS
-- ============================================
DROP POLICY IF EXISTS "Members can view family audit logs" ON audit_logs;
CREATE POLICY "Members can view family audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (has_family_role(family_id, auth.uid(), ARRAY['owner', 'admin']));
