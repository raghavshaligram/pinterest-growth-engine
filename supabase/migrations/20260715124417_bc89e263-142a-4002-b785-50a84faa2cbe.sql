
-- ============ ENUMS ============
CREATE TYPE public.integration_provider AS ENUM ('openai','replicate','apify','pinterest');
CREATE TYPE public.integration_status AS ENUM ('unconfigured','ok','error');
CREATE TYPE public.page_status AS ENUM ('active','inactive','error');
CREATE TYPE public.brief_status AS ENUM ('draft','image_pending','ready','scheduled','archived');
CREATE TYPE public.pin_status AS ENUM ('queued','publishing','published','failed','exported','canceled');
CREATE TYPE public.job_kind AS ENUM ('crawl','analyze','generate_briefs','generate_image','publish','serp_sweep','autoschedule');
CREATE TYPE public.job_status AS ENUM ('queued','running','done','failed');

-- ============ INTEGRATIONS (encrypted BYOK) ============
CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider public.integration_provider NOT NULL,
  config_ciphertext text NOT NULL,
  status public.integration_status NOT NULL DEFAULT 'unconfigured',
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);
GRANT ALL ON public.integrations TO service_role;
GRANT SELECT ON public.integrations TO authenticated;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own integrations readable" ON public.integrations FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- INSERT/UPDATE/DELETE only via service role (server functions) so ciphertext never leaves server.

-- ============ SITES ============
CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  url text NOT NULL,
  sitemap_url text,
  timezone text NOT NULL DEFAULT 'UTC',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sites" ON public.sites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ PAGES ============
CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  url text NOT NULL,
  title text,
  h1 text,
  meta_description text,
  content_hash text,
  headings jsonb,
  images jsonb,
  jsonld jsonb,
  analysis jsonb,
  status public.page_status NOT NULL DEFAULT 'active',
  last_crawled_at timestamptz,
  last_analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, url)
);
CREATE INDEX pages_user_id_idx ON public.pages(user_id);
CREATE INDEX pages_site_id_idx ON public.pages(site_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pages TO authenticated;
GRANT ALL ON public.pages TO service_role;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pages" ON public.pages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ KEYWORDS ============
CREATE TABLE public.keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_id uuid REFERENCES public.pages(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  kind text NOT NULL DEFAULT 'secondary',
  tracked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX keywords_user_id_idx ON public.keywords(user_id);
CREATE INDEX keywords_page_id_idx ON public.keywords(page_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keywords TO authenticated;
GRANT ALL ON public.keywords TO service_role;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own keywords" ON public.keywords FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ BOARDS ============
CREATE TABLE public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  pinterest_board_id text,
  keywords text[] NOT NULL DEFAULT '{}',
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boards TO authenticated;
GRANT ALL ON public.boards TO service_role;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own boards" ON public.boards FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ PIN BRIEFS ============
CREATE TABLE public.pin_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  board_id uuid REFERENCES public.boards(id) ON DELETE SET NULL,
  style text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  hashtags text[] NOT NULL DEFAULT '{}',
  alt_text text,
  cta text,
  image_prompt text NOT NULL,
  status public.brief_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pin_briefs_user_id_idx ON public.pin_briefs(user_id);
CREATE INDEX pin_briefs_page_id_idx ON public.pin_briefs(page_id);
CREATE INDEX pin_briefs_status_idx ON public.pin_briefs(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_briefs TO authenticated;
GRANT ALL ON public.pin_briefs TO service_role;
ALTER TABLE public.pin_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pin_briefs" ON public.pin_briefs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ PIN IMAGES ============
CREATE TABLE public.pin_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brief_id uuid NOT NULL REFERENCES public.pin_briefs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  width int NOT NULL DEFAULT 1000,
  height int NOT NULL DEFAULT 1500,
  prompt_hash text NOT NULL,
  replicate_prediction_id text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prompt_hash)
);
CREATE INDEX pin_images_user_id_idx ON public.pin_images(user_id);
CREATE INDEX pin_images_brief_id_idx ON public.pin_images(brief_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_images TO authenticated;
GRANT ALL ON public.pin_images TO service_role;
ALTER TABLE public.pin_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pin_images" ON public.pin_images FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ SCHEDULED PINS ============
CREATE TABLE public.scheduled_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brief_id uuid NOT NULL REFERENCES public.pin_briefs(id) ON DELETE CASCADE,
  image_id uuid REFERENCES public.pin_images(id) ON DELETE SET NULL,
  board_id uuid REFERENCES public.boards(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  status public.pin_status NOT NULL DEFAULT 'queued',
  pinterest_pin_id text,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_pins_user_id_idx ON public.scheduled_pins(user_id);
CREATE INDEX scheduled_pins_scheduled_at_idx ON public.scheduled_pins(scheduled_at);
CREATE INDEX scheduled_pins_status_idx ON public.scheduled_pins(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_pins TO authenticated;
GRANT ALL ON public.scheduled_pins TO service_role;
ALTER TABLE public.scheduled_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scheduled_pins" ON public.scheduled_pins FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ SERP SNAPSHOTS ============
CREATE TABLE public.serp_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  keyword text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  top_pins jsonb NOT NULL DEFAULT '[]'::jsonb,
  patterns jsonb
);
CREATE INDEX serp_snapshots_keyword_idx ON public.serp_snapshots(user_id, keyword, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.serp_snapshots TO authenticated;
GRANT ALL ON public.serp_snapshots TO service_role;
ALTER TABLE public.serp_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own serp_snapshots" ON public.serp_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ RANK HISTORY ============
CREATE TABLE public.rank_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  keyword text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  position int,
  our_pin_id uuid REFERENCES public.scheduled_pins(id) ON DELETE SET NULL
);
CREATE INDEX rank_history_keyword_idx ON public.rank_history(user_id, keyword, captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rank_history TO authenticated;
GRANT ALL ON public.rank_history TO service_role;
ALTER TABLE public.rank_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rank_history" ON public.rank_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ PUBLISH LOGS ============
CREATE TABLE public.publish_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scheduled_pin_id uuid REFERENCES public.scheduled_pins(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  payload jsonb
);
CREATE INDEX publish_logs_user_id_idx ON public.publish_logs(user_id, at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_logs TO authenticated;
GRANT ALL ON public.publish_logs TO service_role;
ALTER TABLE public.publish_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own publish_logs" ON public.publish_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ JOBS ============
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.job_kind NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.job_status NOT NULL DEFAULT 'queued',
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_status_run_at_idx ON public.jobs(status, run_at);
CREATE INDEX jobs_user_id_idx ON public.jobs(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs" ON public.jobs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_integrations_updated BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_sites_updated BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_pages_updated BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_boards_updated BEFORE UPDATE ON public.boards FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_briefs_updated BEFORE UPDATE ON public.pin_briefs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_scheduled_updated BEFORE UPDATE ON public.scheduled_pins FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ Storage: pins bucket policies ============
CREATE POLICY "own pin images read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pins' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own pin images write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pins' AND (storage.foldername(name))[1] = auth.uid()::text);
