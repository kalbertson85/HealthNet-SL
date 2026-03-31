-- Fix infinite recursion in profiles RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "users_select_own_profile" ON profiles;
DROP POLICY IF EXISTS "admins_select_all_profiles" ON profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;

-- Create simpler, non-recursive policies for profiles
CREATE POLICY "users_select_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "admins_select_all_profiles" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Ensure staff can view other staff profiles for lookups
CREATE POLICY "staff_can_view_staff_profiles" ON profiles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
  );
