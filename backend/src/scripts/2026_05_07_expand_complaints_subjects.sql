-- =============================================================================
-- Migration: expand allowed values for complaints.subject
-- Date:      2026-05-07
-- Issue:    Frontend SupportModal offers 8 subject options (customer + provider
--           dropdowns), but the existing complaints_subject_check constraint
--           only permitted 'Provider did not show up', 'Safety concern',
--           'Other'. Submissions for any other UI option failed with HTTP 400
--           and a check-constraint violation.
--
-- Fix:      Drop the old CHECK and recreate it covering every subject the
--           frontend dropdown currently offers. Keep the controller's
--           ALLOWED_COMPLAINT_SUBJECTS in lockstep with this list.
-- =============================================================================

ALTER TABLE public.complaints
  DROP CONSTRAINT IF EXISTS complaints_subject_check;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_subject_check
  CHECK (subject IN (
    'Provider did not show up',
    'Poor quality of work',
    'Billing or payment issue',
    'Rude or unprofessional behavior',
    'Safety concern',
    'Verification or profile appeal',
    'Incorrect service category',
    'Other'
  ));
