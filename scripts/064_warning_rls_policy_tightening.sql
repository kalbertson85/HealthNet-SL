BEGIN;

-- Tighten legacy broad RLS policies that used USING(true)/WITH CHECK(true).
-- This keeps authenticated app access working while removing public-open behavior.

-- 011 notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'service_role');

-- 012 queue system
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view queues" ON public.queues;
DROP POLICY IF EXISTS "Staff can insert queues" ON public.queues;
DROP POLICY IF EXISTS "Staff can update queues" ON public.queues;
CREATE POLICY "Anyone can view queues" ON public.queues
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert queues" ON public.queues
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can update queues" ON public.queues
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view queue settings" ON public.queue_settings;
DROP POLICY IF EXISTS "Admins can update queue settings" ON public.queue_settings;
CREATE POLICY "Anyone can view queue settings" ON public.queue_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update queue settings" ON public.queue_settings
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view queue audit logs" ON public.queue_audit_logs;
DROP POLICY IF EXISTS "Staff can insert queue audit logs" ON public.queue_audit_logs;
CREATE POLICY "Anyone can view queue audit logs" ON public.queue_audit_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert queue audit logs" ON public.queue_audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 013 emergency triage
ALTER TABLE public.triage_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_vitals_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view triage assessments" ON public.triage_assessments;
DROP POLICY IF EXISTS "Staff can insert triage assessments" ON public.triage_assessments;
DROP POLICY IF EXISTS "Staff can update triage assessments" ON public.triage_assessments;
CREATE POLICY "Anyone can view triage assessments" ON public.triage_assessments
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert triage assessments" ON public.triage_assessments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can update triage assessments" ON public.triage_assessments
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view emergency cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Staff can manage emergency cases" ON public.emergency_cases;
CREATE POLICY "Anyone can view emergency cases" ON public.emergency_cases
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage emergency cases" ON public.emergency_cases
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view vitals log" ON public.emergency_vitals_log;
DROP POLICY IF EXISTS "Staff can insert vitals log" ON public.emergency_vitals_log;
CREATE POLICY "Anyone can view vitals log" ON public.emergency_vitals_log
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert vitals log" ON public.emergency_vitals_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 018 nursing notes
ALTER TABLE public.nursing_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view nursing notes" ON public.nursing_notes;
DROP POLICY IF EXISTS "Staff can insert nursing notes" ON public.nursing_notes;
CREATE POLICY "Anyone can view nursing notes" ON public.nursing_notes
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert nursing notes" ON public.nursing_notes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 019 pharmacy stock and dispense
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispense_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view medications" ON public.medications;
DROP POLICY IF EXISTS "Staff can manage medications" ON public.medications;
CREATE POLICY "Anyone can view medications" ON public.medications
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage medications" ON public.medications
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view medication stock" ON public.medication_stock;
DROP POLICY IF EXISTS "Staff can manage medication stock" ON public.medication_stock;
CREATE POLICY "Anyone can view medication stock" ON public.medication_stock
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage medication stock" ON public.medication_stock
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view dispense events" ON public.dispense_events;
DROP POLICY IF EXISTS "Staff can insert dispense events" ON public.dispense_events;
CREATE POLICY "Anyone can view dispense events" ON public.dispense_events
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert dispense events" ON public.dispense_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 022 workflow core tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view companies" ON public.companies;
DROP POLICY IF EXISTS "Staff can manage companies" ON public.companies;
CREATE POLICY "Anyone can view companies" ON public.companies
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage companies" ON public.companies
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view visits" ON public.visits;
DROP POLICY IF EXISTS "Staff can manage visits" ON public.visits;
CREATE POLICY "Anyone can view visits" ON public.visits
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage visits" ON public.visits
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view investigations" ON public.investigations;
DROP POLICY IF EXISTS "Staff can manage investigations" ON public.investigations;
CREATE POLICY "Anyone can view investigations" ON public.investigations
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage investigations" ON public.investigations
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view hospital settings" ON public.hospital_settings;
DROP POLICY IF EXISTS "Admins can manage hospital settings" ON public.hospital_settings;
CREATE POLICY "Anyone can view hospital settings" ON public.hospital_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage hospital settings" ON public.hospital_settings
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 034 visit nursing notes
ALTER TABLE public.visit_nursing_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view visit nursing notes" ON public.visit_nursing_notes;
DROP POLICY IF EXISTS "Staff can insert visit nursing notes" ON public.visit_nursing_notes;
CREATE POLICY "Anyone can view visit nursing notes" ON public.visit_nursing_notes
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert visit nursing notes" ON public.visit_nursing_notes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 036 pharmacy ward requests and controlled drugs
ALTER TABLE public.ward_medication_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_medication_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controlled_drug_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view ward medication requests" ON public.ward_medication_requests;
DROP POLICY IF EXISTS "Staff can manage ward medication requests" ON public.ward_medication_requests;
CREATE POLICY "Anyone can view ward medication requests" ON public.ward_medication_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage ward medication requests" ON public.ward_medication_requests
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view ward medication request items" ON public.ward_medication_request_items;
DROP POLICY IF EXISTS "Staff can manage ward medication request items" ON public.ward_medication_request_items;
CREATE POLICY "Anyone can view ward medication request items" ON public.ward_medication_request_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage ward medication request items" ON public.ward_medication_request_items
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view controlled drug register" ON public.controlled_drug_register;
DROP POLICY IF EXISTS "Staff can insert controlled drug entries" ON public.controlled_drug_register;
CREATE POLICY "Anyone can view controlled drug register" ON public.controlled_drug_register
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can insert controlled drug entries" ON public.controlled_drug_register
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 038 override ward request read policies
ALTER TABLE public.ward_medication_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_medication_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view ward medication requests" ON public.ward_medication_requests;
DROP POLICY IF EXISTS "Anyone can view ward medication request items" ON public.ward_medication_request_items;
CREATE POLICY "Anyone can view ward medication requests" ON public.ward_medication_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Anyone can view ward medication request items" ON public.ward_medication_request_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 039 insurance claims
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view insurance claims" ON public.insurance_claims;
CREATE POLICY "Anyone can view insurance claims" ON public.insurance_claims
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 041 radiology
ALTER TABLE public.radiology_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiology_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view radiology requests" ON public.radiology_requests;
DROP POLICY IF EXISTS "Staff can manage radiology requests" ON public.radiology_requests;
DROP POLICY IF EXISTS "Anyone can view radiology audit logs" ON public.radiology_audit_logs;
DROP POLICY IF EXISTS "Staff can manage radiology audit logs" ON public.radiology_audit_logs;
CREATE POLICY "Anyone can view radiology requests" ON public.radiology_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage radiology requests" ON public.radiology_requests
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Anyone can view radiology audit logs" ON public.radiology_audit_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage radiology audit logs" ON public.radiology_audit_logs
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 045 surgeries
ALTER TABLE public.surgeries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view surgeries" ON public.surgeries;
DROP POLICY IF EXISTS "Staff can manage surgeries" ON public.surgeries;
CREATE POLICY "Anyone can view surgeries" ON public.surgeries
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Staff can manage surgeries" ON public.surgeries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
