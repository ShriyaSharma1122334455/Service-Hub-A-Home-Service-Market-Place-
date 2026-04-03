-- ============================================================================
-- Verification System Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL → New Query)
-- ============================================================================

-- 1. Add verification_status to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
  CONSTRAINT users_verification_status_check
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'failed'));

-- 2. Add verification_status to public.providers
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
  CONSTRAINT providers_verification_status_check
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'failed'));

-- 3. Create verifications table
CREATE TABLE IF NOT EXISTS public.verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type       TEXT NOT NULL
                        CHECK (document_type IN ('passport', 'drivers_license')),
  id_document_url     TEXT,
  selfie_url          TEXT,
  ocr_result          JSONB,
  face_match_result   JSONB,
  nsopw_result        JSONB,
  extracted_name      TEXT,
  extracted_dob       TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (verification_status IN ('unverified', 'pending', 'verified', 'failed')),
  rejection_reason    TEXT,
  submitted_at        TIMESTAMPTZ,
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         UUID REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Compound index on user_id + verification_status
CREATE INDEX IF NOT EXISTS idx_verifications_user_status
  ON public.verifications (user_id, verification_status);

-- 5. Enable RLS
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Service role (backend) can do everything
CREATE POLICY "Service role full access on verifications"
  ON public.verifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Users can read only their own verification records
CREATE POLICY "Users can read own verification"
  ON public.verifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- 7. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_verifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_verifications_updated_at
  BEFORE UPDATE ON public.verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_verifications_updated_at();

-- ============================================================================
-- Storage Bucket (run separately or create via Supabase Dashboard)
-- ============================================================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('verification-documents', 'verification-documents', false)
-- ON CONFLICT (id) DO NOTHING;
--
-- Note: It's recommended to create the bucket via the Supabase Dashboard:
--   1. Go to Storage → New Bucket
--   2. Name: verification-documents
--   3. Public: OFF (private)
--   4. File size limit: 5MB
--   5. Allowed MIME types: image/jpeg, image/png, image/webp
