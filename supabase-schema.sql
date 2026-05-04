-- ═══════════════════════════════════════════════════════════════
-- ZIONIX — Supabase Database Schema
-- ═══════════════════════════════════════════════════════════════
-- HOW TO USE:
--   1. Supabase → SQL Editor → New Query
--   2. Paste this entire file → click RUN
--   3. All tables, indexes, triggers and RLS policies created
-- ═══════════════════════════════════════════════════════════════


-- ── 1. PROFILES ──────────────────────────────────────────────
-- One row per user. lifetime = true means they paid Ksh 500 once.
CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT        NOT NULL UNIQUE,
  name             TEXT        NOT NULL,
  wake_name        TEXT        NOT NULL DEFAULT 'NOVA',
  lifetime         BOOLEAN     NOT NULL DEFAULT FALSE,
  lifetime_since   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_all" ON public.profiles;
CREATE POLICY "profiles_select_own"  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own"  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_service_all" ON public.profiles FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── 2. PAYMENTS ──────────────────────────────────────────────
-- Every M-Pesa STK Push attempt is recorded here.
-- For Zionix: amount is always 500 (Ksh), reference = ZIONIX_SUB_LIFETIME
CREATE TABLE IF NOT EXISTS public.payments (
  id                   BIGSERIAL   PRIMARY KEY,
  checkout_request_id  TEXT        NOT NULL UNIQUE,
  merchant_request_id  TEXT,
  user_id              UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone                TEXT        NOT NULL,
  amount               INTEGER     NOT NULL DEFAULT 500,
  reference            TEXT        DEFAULT 'ZIONIX_SUB_LIFETIME',
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','success','failed','cancelled','timeout')),
  mpesa_code           TEXT,
  lifetime_granted     BOOLEAN     DEFAULT FALSE,
  failure_reason       TEXT,
  callback_payload     JSONB,
  confirmed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_checkout_idx ON public.payments(checkout_request_id);
CREATE INDEX IF NOT EXISTS payments_user_idx     ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_phone_idx    ON public.payments(phone);
CREATE INDEX IF NOT EXISTS payments_status_idx   ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_select_own"  ON public.payments;
DROP POLICY IF EXISTS "payments_service_all" ON public.payments;
CREATE POLICY "payments_select_own"  ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "payments_service_all" ON public.payments FOR ALL   USING ((SELECT auth.role()) = 'service_role');


-- ── 3. PENDING LIFETIME ──────────────────────────────────────
-- Paid without a user account — claim on signup/login.
CREATE TABLE IF NOT EXISTS public.pending_lifetime (
  id          BIGSERIAL   PRIMARY KEY,
  phone       TEXT        NOT NULL UNIQUE,
  mpesa_code  TEXT        NOT NULL,
  amount      INTEGER,
  claimed     BOOLEAN     DEFAULT FALSE,
  claimed_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at  TIMESTAMPTZ
);

ALTER TABLE public.pending_lifetime ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pending_service_all" ON public.pending_lifetime;
CREATE POLICY "pending_service_all" ON public.pending_lifetime FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── 4. PANTRY ITEMS (Visual Pantry module) ───────────────────
-- Stores household inventory items per user.
CREATE TABLE IF NOT EXISTS public.pantry_items (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  barcode     TEXT,
  quantity    NUMERIC(10,2) DEFAULT 0,
  unit        TEXT        DEFAULT 'units',
  threshold   NUMERIC(10,2) DEFAULT 20,
  category    TEXT        DEFAULT 'general',
  last_seen   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pantry_user_idx ON public.pantry_items(user_id);
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pantry_own_all"     ON public.pantry_items;
DROP POLICY IF EXISTS "pantry_service_all" ON public.pantry_items;
CREATE POLICY "pantry_own_all"     ON public.pantry_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "pantry_service_all" ON public.pantry_items FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ── 5. VOICE PROFILES (Biometric lock) ──────────────────────
-- Stores encrypted acoustic fingerprint metadata.
-- Actual audio never stored — only derived features.
CREATE TABLE IF NOT EXISTS public.voice_profiles (
  id             BIGSERIAL   PRIMARY KEY,
  user_id        UUID        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  fingerprint    TEXT,
  wake_name      TEXT        DEFAULT 'NOVA',
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified  TIMESTAMPTZ
);

ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_own_all"     ON public.voice_profiles;
DROP POLICY IF EXISTS "voice_service_all" ON public.voice_profiles;
CREATE POLICY "voice_own_all"     ON public.voice_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "voice_service_all" ON public.voice_profiles FOR ALL USING ((SELECT auth.role()) = 'service_role');


-- ═══════════════════════════════════════════════════════════════
-- DONE. 5 tables created with RLS, indexes and triggers.
-- ═══════════════════════════════════════════════════════════════
