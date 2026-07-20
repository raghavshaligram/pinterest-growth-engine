
CREATE TABLE public.account_publishing_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  self_reported_age_bucket text,
  reconciled_tier text NOT NULL DEFAULT 'new',
  pinterest_metrics jsonb,
  reconciled_at timestamptz,
  current_daily_cap integer NOT NULL DEFAULT 5,
  manual_cap integer,
  cap_mode text NOT NULL DEFAULT 'auto',
  onboarded_at timestamptz NOT NULL DEFAULT now(),
  last_cap_check_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_publishing_profiles TO authenticated;
GRANT ALL ON public.account_publishing_profiles TO service_role;
ALTER TABLE public.account_publishing_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.account_publishing_profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.account_publishing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.account_cap_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_tier text,
  to_tier text,
  from_cap integer,
  to_cap integer,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_cap_events_user_created_idx ON public.account_cap_events(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.account_cap_events TO authenticated;
GRANT ALL ON public.account_cap_events TO service_role;
ALTER TABLE public.account_cap_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cap events" ON public.account_cap_events FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "insert own cap events" ON public.account_cap_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
