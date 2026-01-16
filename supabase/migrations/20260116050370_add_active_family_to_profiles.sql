-- ============================================
-- Add active_family_id to profiles
-- ============================================
-- This allows users to persist their active family across devices

ALTER TABLE public.profiles
ADD COLUMN active_family_id UUID REFERENCES families(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_family ON profiles(active_family_id);

-- Set active_family_id to the first family for existing users who don't have one
UPDATE public.profiles p
SET active_family_id = (
  SELECT fm.family_id
  FROM family_members fm
  WHERE fm.user_id = p.id
  ORDER BY fm.joined_at ASC
  LIMIT 1
)
WHERE active_family_id IS NULL
  AND EXISTS (
    SELECT 1 FROM family_members fm WHERE fm.user_id = p.id
  );
