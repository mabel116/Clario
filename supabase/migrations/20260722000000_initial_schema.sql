-- Migration: Initial Schema for Clario
-- Created: 2026-07-22
-- Includes tables, RLS policies, indexes, and auth.users trigger per PRD §5.2 and §7.1.

--------------------------------------------------------------------------------
-- 1. TABLES CREATION
--------------------------------------------------------------------------------

-- profiles: extends auth.users
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text,
  business_address text,
  default_currency char(3) NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- clients: client contact profiles
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  notes text,
  default_currency char(3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- client_links: document links attached to a client
CREATE TABLE public.client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- invoices: invoices header
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'void')),
  currency char(3) NOT NULL,
  total_minor bigint NOT NULL DEFAULT 0,
  issue_date date,
  due_date date,
  notes text,
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- invoice_line_items: individual line items for invoices
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price_minor bigint NOT NULL DEFAULT 0,
  line_total_minor bigint NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- payment_events: IMMUTABLE append-only ledger for payments
-- Explicitly append-only table. No updated_at or deleted_at columns exist.
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'card', 'mobile_money', 'other')),
  note text,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  reverses_id uuid REFERENCES public.payment_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 2. INDEXES
--------------------------------------------------------------------------------

CREATE INDEX idx_clients_user_id ON public.clients(user_id);
CREATE INDEX idx_client_links_client_id ON public.client_links(client_id);
CREATE INDEX idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX idx_invoice_line_items_invoice_id ON public.invoice_line_items(invoice_id);
CREATE INDEX idx_payment_events_invoice_id ON public.payment_events(invoice_id);
CREATE INDEX idx_payment_events_client_id ON public.payment_events(client_id);
CREATE INDEX idx_payment_events_user_id_created_at ON public.payment_events(user_id, created_at DESC);

--------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) & POLICIES
--------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;

ALTER TABLE public.client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_links FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events FORCE ROW LEVEL SECURITY;

-- profiles RLS policies
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- clients RLS policies
CREATE POLICY "clients_select_own" ON public.clients
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "clients_insert_own" ON public.clients
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients_update_own" ON public.clients
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients_delete_own" ON public.clients
  FOR DELETE USING (auth.uid() = user_id);

-- client_links RLS policies
CREATE POLICY "client_links_select_own" ON public.client_links
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "client_links_insert_own" ON public.client_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "client_links_update_own" ON public.client_links
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "client_links_delete_own" ON public.client_links
  FOR DELETE USING (auth.uid() = user_id);

-- invoices RLS policies
CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "invoices_insert_own" ON public.invoices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoices_update_own" ON public.invoices
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoices_delete_own" ON public.invoices
  FOR DELETE USING (auth.uid() = user_id);

-- invoice_line_items RLS policies
CREATE POLICY "invoice_line_items_select_own" ON public.invoice_line_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "invoice_line_items_insert_own" ON public.invoice_line_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoice_line_items_update_own" ON public.invoice_line_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "invoice_line_items_delete_own" ON public.invoice_line_items
  FOR DELETE USING (auth.uid() = user_id);

-- payment_events RLS policies:
-- Explicitly append-only table. No UPDATE or DELETE policies are granted. RLS denies updates and deletes.
CREATE POLICY "payment_events_select_own" ON public.payment_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "payment_events_insert_own" ON public.payment_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- 4. AUTH.USERS TRIGGER FOR PROFILES CREATION
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, default_currency, created_at, updated_at)
  VALUES (new.id, 'USD', now(), now());
  RETURN new;
END;
$$;

-- Trigger firing on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
