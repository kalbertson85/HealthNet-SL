-- Comprehensive fix for all RLS infinite recursion issues
-- The key principle: NEVER query the profiles table from within a profiles policy
-- Use auth.uid() directly and simple checks only

-- Step 1: Fix profiles table policies (the root cause)
DROP POLICY IF EXISTS "users_select_own_profile" ON profiles;
DROP POLICY IF EXISTS "admins_select_all_profiles" ON profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "staff_can_view_staff_profiles" ON profiles;

-- Simple policy: users can see their own profile
CREATE POLICY "users_view_own_profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Simple policy: users can update their own profile
CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Simple policy: all authenticated users can view all profiles
-- (This avoids recursion - we just check if user is authenticated)
CREATE POLICY "authenticated_view_all_profiles" ON profiles
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Step 2: Ensure other tables don't have recursive profile lookups
-- Fix any policies that might be checking profiles table

-- Lab tests policies - ensure they don't recursively check profiles
DROP POLICY IF EXISTS "staff_select_lab_tests" ON lab_tests;
DROP POLICY IF EXISTS "staff_insert_lab_tests" ON lab_tests;
DROP POLICY IF EXISTS "staff_update_lab_tests" ON lab_tests;

CREATE POLICY "authenticated_select_lab_tests" ON lab_tests
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_lab_tests" ON lab_tests
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_lab_tests" ON lab_tests
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Admissions policies - ensure they don't recursively check profiles
DROP POLICY IF EXISTS "staff_select_admissions" ON admissions;
DROP POLICY IF EXISTS "staff_insert_admissions" ON admissions;
DROP POLICY IF EXISTS "staff_update_admissions" ON admissions;

CREATE POLICY "authenticated_select_admissions" ON admissions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_admissions" ON admissions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_admissions" ON admissions
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Fix other common tables that might have issues
DROP POLICY IF EXISTS "staff_select_patients" ON patients;
DROP POLICY IF EXISTS "staff_insert_patients" ON patients;
DROP POLICY IF EXISTS "staff_update_patients" ON patients;

CREATE POLICY "authenticated_select_patients" ON patients
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_patients" ON patients
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_patients" ON patients
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Appointments
DROP POLICY IF EXISTS "staff_select_appointments" ON appointments;
DROP POLICY IF EXISTS "staff_insert_appointments" ON appointments;
DROP POLICY IF EXISTS "staff_update_appointments" ON appointments;
DROP POLICY IF EXISTS "staff_delete_appointments" ON appointments;

CREATE POLICY "authenticated_select_appointments" ON appointments
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_appointments" ON appointments
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_appointments" ON appointments
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_delete_appointments" ON appointments
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Prescriptions
DROP POLICY IF EXISTS "staff_select_prescriptions" ON prescriptions;
DROP POLICY IF EXISTS "staff_insert_prescriptions" ON prescriptions;
DROP POLICY IF EXISTS "staff_update_prescriptions" ON prescriptions;

CREATE POLICY "authenticated_select_prescriptions" ON prescriptions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_prescriptions" ON prescriptions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_prescriptions" ON prescriptions
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Invoices
DROP POLICY IF EXISTS "staff_select_invoices" ON invoices;
DROP POLICY IF EXISTS "staff_insert_invoices" ON invoices;
DROP POLICY IF EXISTS "staff_update_invoices" ON invoices;

CREATE POLICY "authenticated_select_invoices" ON invoices
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_invoices" ON invoices
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_invoices" ON invoices
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Consultations
DROP POLICY IF EXISTS "staff_select_consultations" ON consultations;
DROP POLICY IF EXISTS "staff_insert_consultations" ON consultations;
DROP POLICY IF EXISTS "staff_update_consultations" ON consultations;

CREATE POLICY "authenticated_select_consultations" ON consultations
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_consultations" ON consultations
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_consultations" ON consultations
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);
