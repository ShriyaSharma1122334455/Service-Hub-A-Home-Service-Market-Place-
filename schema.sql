-- =============================================================================
-- ServiceHub — Supabase / PostgreSQL schema
-- =============================================================================
-- This file is reconstructed from the live Supabase project + the technical
-- paper (§3.3, §6) + constraints discovered during QA. Run it on a fresh
-- database to recreate the application schema. It does NOT recreate Supabase
-- Auth (`auth.users`), Storage, or RLS policies for managed tables — those
-- are configured through the Supabase dashboard.
--
-- Sections:
--   1. Extensions
--   2. Tables (in dependency order)
--   3. Indexes
--   4. Generated columns
--   5. Triggers (updated_at, complaint reference number)
--   6. Row Level Security — enable + representative policies
-- =============================================================================


-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()


-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- categories — service categories (cleaning, plumbing, electrical, pest control)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id          uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  description text        NOT NULL,
  icon        text        NOT NULL DEFAULT 'default-icon.svg',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- users — application-side user profiles (linked to auth.users via supabase_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id                  uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  supabase_id         uuid        NOT NULL UNIQUE,
  email               text        NOT NULL UNIQUE,
  role                text        NOT NULL DEFAULT 'customer'
                                  CHECK (role IN ('customer', 'provider', 'admin')),
  full_name           text        NOT NULL,
  phone               text,
  avatar_url          text,
  verification_status text        NOT NULL DEFAULT 'pending',
  is_active           boolean     NOT NULL DEFAULT true,
  dob                 date,
  phone_verified      boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- providers — provider business profiles + verification flags
-- is_fully_verified is a GENERATED column derived from the three stage flags.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.providers (
  id                 uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id            uuid        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  business_name      text        NOT NULL,
  description        text,
  id_document_url    text,
  selfie_url         text,
  id_verified        boolean     NOT NULL DEFAULT false,
  face_matched       boolean     NOT NULL DEFAULT false,
  nsopw_checked      boolean     NOT NULL DEFAULT false,
  self_declared      boolean     NOT NULL DEFAULT false,
  verified_at        timestamptz,
  rejection_reason   text,
  rating_avg         numeric(3,2) NOT NULL DEFAULT 0
                                  CHECK (rating_avg BETWEEN 0 AND 5),
  rating_count       integer     NOT NULL DEFAULT 0
                                  CHECK (rating_count >= 0),
  is_active          boolean     NOT NULL DEFAULT true,
  is_fully_verified  boolean     GENERATED ALWAYS AS (
    id_verified AND face_matched AND nsopw_checked AND self_declared
  ) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- addresses — saved addresses per user (customer or provider)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.addresses (
  id         uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label      text        NOT NULL DEFAULT 'Home',
  street     text,
  city       text,
  state      text,
  zip        text,
  is_default boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- services — catalog of services. provider_id is nullable so platform-defined
-- catalog entries can exist without a specific owner; provider↔service link
-- is held in provider_services.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services (
  id               uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  provider_id      uuid        REFERENCES public.providers(id) ON DELETE SET NULL,
  category_id      uuid        NOT NULL REFERENCES public.categories(id),
  name             text        NOT NULL,
  description      text        NOT NULL,
  base_price       numeric(10,2) NOT NULL CHECK (base_price >= 0),
  duration_minutes integer     NOT NULL CHECK (duration_minutes > 0),
  sub_category     text,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- provider_categories — many-to-many between providers and categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_categories (
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (provider_id, category_id)
);


-- ---------------------------------------------------------------------------
-- provider_services — which provider offers which catalog service, optionally
-- with a custom price / description override.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_services (
  id                  uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  provider_id         uuid        NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_id          uuid        NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price        numeric(10,2) CHECK (custom_price IS NULL OR custom_price >= 0),
  custom_description  text,
  is_active           boolean     NOT NULL DEFAULT true,
  UNIQUE (provider_id, service_id)
);


-- ---------------------------------------------------------------------------
-- availability — provider-defined time slots (text-typed times for legacy reasons)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.availability (
  id          uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  provider_id uuid        NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  start_time  text        NOT NULL,
  end_time    text        NOT NULL,
  is_booked   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- availability_slots — newer, time-typed variant of availability
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.availability_slots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid        NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  start_time  time        NOT NULL,
  end_time    time        NOT NULL,
  is_booked   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);


-- ---------------------------------------------------------------------------
-- bookings — the core transaction record. UNIQUE(provider_id, scheduled_at)
-- prevents double-booking; the controller catches 23505 violations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
  id                  uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  customer_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  provider_id         uuid        NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  service_id          uuid        NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  availability_id     uuid        REFERENCES public.availability(id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'confirmed'
                                  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  scheduled_at        timestamptz NOT NULL,
  completed_at        timestamptz,
  total_price         numeric(10,2) NOT NULL CHECK (total_price >= 0),
  payment_status      text        NOT NULL DEFAULT 'pending'
                                  CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  payment_intent_id   text,
  notes               text,
  address_street      text,
  address_city        text,
  address_state       text,
  address_zip         text,
  cancelled_by        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, scheduled_at)
);


-- ---------------------------------------------------------------------------
-- reviews — one review per booking, enforced by UNIQUE(booking_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id          uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  booking_id  uuid        NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  provider_id uuid        NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  rating      integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- complaints — user-filed complaints. complaint_ref is auto-generated by
-- trigger (format COMP-XXXX). subject must be one of the allowed values.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaints (
  id            uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  complaint_ref text        UNIQUE,
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  booking_id    uuid        REFERENCES public.bookings(id) ON DELETE SET NULL,
  subject       text        NOT NULL
                            CHECK (subject IN (
                              'Provider did not show up',
                              'Poor quality of work',
                              'Billing or payment issue',
                              'Rude or unprofessional behavior',
                              'Safety concern',
                              'Verification or profile appeal',
                              'Incorrect service category',
                              'Other'
                            )),
  description   text        NOT NULL,
  priority      text        NOT NULL DEFAULT 'MEDIUM'
                            CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status        text        NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- verifications — audit trail of identity-verification attempts per user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verifications (
  id                  uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id             uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type       text,
  id_document_url     text,
  selfie_url          text,
  ocr_result          jsonb,
  face_match_result   jsonb,
  face_match_score    numeric(5,2),
  nsopw_result        jsonb,
  extracted_name      text,
  extracted_dob       text,
  verification_status text        NOT NULL DEFAULT 'unverified'
                                  CHECK (verification_status IN
                                         ('unverified', 'pending', 'verified', 'rejected', 'manual_review')),
  rejection_reason    text,
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  reviewed_by         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- 3. INDEXES — covering the hot query paths described in paper §3.3
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_supabase_id        ON public.users (supabase_id);
CREATE INDEX IF NOT EXISTS idx_users_role               ON public.users (role);

CREATE INDEX IF NOT EXISTS idx_bookings_customer_status ON public.bookings (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status ON public.bookings (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_status_sched    ON public.bookings (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_reviews_provider         ON public.reviews (provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_booking          ON public.reviews (booking_id);

CREATE INDEX IF NOT EXISTS idx_services_category        ON public.services (category_id);
CREATE INDEX IF NOT EXISTS idx_services_provider        ON public.services (provider_id);

CREATE INDEX IF NOT EXISTS idx_provider_services_pair   ON public.provider_services (provider_id, service_id);

CREATE INDEX IF NOT EXISTS idx_availability_provider_date
  ON public.availability (provider_id, date);
CREATE INDEX IF NOT EXISTS idx_availability_slots_provider_date
  ON public.availability_slots (provider_id, date);

CREATE INDEX IF NOT EXISTS idx_complaints_user          ON public.complaints (user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status        ON public.complaints (status);

CREATE INDEX IF NOT EXISTS idx_verifications_user       ON public.verifications (user_id);


-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

-- Generic updated_at touch trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'providers', 'services', 'categories',
    'bookings', 'reviews', 'complaints', 'verifications'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
       CREATE TRIGGER trg_%1$s_updated_at
       BEFORE UPDATE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t);
  END LOOP;
END;
$$;

-- Auto-generate complaint_ref like COMP-XXXX
CREATE OR REPLACE FUNCTION public.generate_complaint_ref()
RETURNS trigger AS $$
BEGIN
  IF NEW.complaint_ref IS NULL THEN
    NEW.complaint_ref :=
      'COMP-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 4));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_complaints_ref ON public.complaints;
CREATE TRIGGER trg_complaints_ref
BEFORE INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.generate_complaint_ref();


-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================
-- Enable RLS on every user-facing table. Policies below are representative;
-- the live project may have additional finer-grained policies managed via
-- the Supabase dashboard.

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_services   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications       ENABLE ROW LEVEL SECURITY;

-- Categories are public (read-only for everyone)
CREATE POLICY categories_read_all
  ON public.categories FOR SELECT
  USING (true);

-- Services are public read; writes restricted to owning provider
CREATE POLICY services_read_all
  ON public.services FOR SELECT
  USING (true);

-- Users can read/update their own profile row
CREATE POLICY users_self_read
  ON public.users FOR SELECT
  USING (supabase_id = auth.uid());

CREATE POLICY users_self_update
  ON public.users FOR UPDATE
  USING (supabase_id = auth.uid());

-- Providers' public profile is readable by anyone
CREATE POLICY providers_read_all
  ON public.providers FOR SELECT
  USING (true);

-- A user can read their own bookings (as customer) and the provider they own
CREATE POLICY bookings_customer_read
  ON public.bookings FOR SELECT
  USING (customer_id IN (
    SELECT id FROM public.users WHERE supabase_id = auth.uid()
  ));

CREATE POLICY bookings_provider_read
  ON public.bookings FOR SELECT
  USING (provider_id IN (
    SELECT p.id FROM public.providers p
    JOIN public.users u ON u.id = p.user_id
    WHERE u.supabase_id = auth.uid()
  ));

-- Reviews are public read; insert restricted to the booking's customer
CREATE POLICY reviews_read_all
  ON public.reviews FOR SELECT
  USING (true);

-- Complaints are visible only to their author
CREATE POLICY complaints_self_read
  ON public.complaints FOR SELECT
  USING (user_id IN (
    SELECT id FROM public.users WHERE supabase_id = auth.uid()
  ));

-- Verifications are visible only to the subject user
CREATE POLICY verifications_self_read
  ON public.verifications FOR SELECT
  USING (user_id IN (
    SELECT id FROM public.users WHERE supabase_id = auth.uid()
  ));

-- =============================================================================
-- End of schema.sql
-- =============================================================================
