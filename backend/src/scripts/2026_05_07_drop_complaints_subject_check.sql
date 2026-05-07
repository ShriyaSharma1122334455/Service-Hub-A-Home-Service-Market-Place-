-- =============================================================================
-- Migration: drop complaints.subject CHECK constraint
-- Date:      2026-05-07
-- Issue:     The complaints_subject_check constraint forced a small predefined
--            list of subjects, but a complaint title is inherently free-form —
--            users should be able to describe their issue in their own words.
--
-- Fix:       Drop the CHECK entirely. Length bounds (5–200 chars) are enforced
--            by the controller (see complaintController.js).
-- =============================================================================

ALTER TABLE public.complaints
  DROP CONSTRAINT IF EXISTS complaints_subject_check;
