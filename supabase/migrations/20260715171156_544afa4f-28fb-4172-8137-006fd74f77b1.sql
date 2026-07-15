ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pages_user_excluded_idx
  ON public.pages (user_id, excluded);

-- Auto-exclude common non-content URL patterns for existing rows.
UPDATE public.pages
SET excluded = true
WHERE excluded = false
  AND (
    url ~* '/(about|about-us|contact|contact-us|methodology|privacy|privacy-policy|terms|terms-of-service|tos|legal|disclaimer|cookies?|cookie-policy|refund|shipping|returns|faq|support|help|login|signin|signup|register|account|cart|checkout|thank-?you|search|sitemap|author|authors|team|careers|jobs|press|media-kit|affiliate|advertise|dmca|accessibility|imprint|impressum)(/|$|\?)'
    OR url ~* '/(tag|tags|category|categories|archive|archives|page)/[0-9]+'
    OR url ~* '\?.*(utm_|ref=|fbclid|gclid)'
  );