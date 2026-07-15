import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PIN_STYLES = [
  "problem-solver", "how-to", "checklist", "comparison", "calculator",
  "mistakes-to-avoid", "before-after", "listicle", "faq", "quick-tip",
  "infographic", "photo", "illustration", "minimal", "seasonal",
] as const;

export const generateBriefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { pageId: string; count?: number }) =>
    z.object({ pageId: z.string().uuid(), count: z.number().int().min(1).max(30).default(10) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { requireIntegration, markIntegration } = await import("./integrations.server");
    const { openaiJSON } = await import("./openai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await requireIntegration(context.userId, "openai");

    const { data: page, error } = await context.supabase.from("pages").select("*").eq("id", data.pageId).single();
    if (error || !page) throw error ?? new Error("Page not found");
    const analysis = (page.analysis ?? {}) as {
      topic?: string; primary_keyword?: string; secondary_keywords?: string[]; audience?: string; category?: string;
    };
    if (!analysis.primary_keyword) throw new Error("Analyze the page first.");

    const { data: site } = await context.supabase.from("sites").select("*").eq("id", page.site_id).single();
    const brandName = site?.brand_name ?? (site ? new URL(site.url).hostname.replace(/^www\./, "") : "");
    const brandHost = site ? new URL(site.url).hostname.replace(/^www\./, "") : "";
    const brandColors = Array.isArray(site?.brand_colors) ? (site!.brand_colors as string[]) : [];
    const brandFont = site?.brand_font ?? "";
    const brandNotes = site?.brand_notes ?? "";
    const paletteLine = brandColors.length
      ? `brand palette: ${brandColors.join(", ")}`
      : `cohesive palette derived from the page's topic (keep identical across the batch)`;
    // Intent detection drives the CTA pool so a tips pin gets "Read the Guide →",
    // not "Try It Free". Model can override per-brief in its returned intent.
    const haystack = `${page.url} ${page.title ?? ""} ${analysis.topic ?? ""} ${analysis.category ?? ""}`.toLowerCase();
    const defaultIntent: "informational" | "tool" | "list" | "commercial" =
      /calculator|calc|\/tool|estimator/.test(haystack) ? "tool"
      : /\bvs\b|versus|compare|comparison|best\s+\d|top\s+\d|listicle/.test(haystack) ? "list"
      : /pricing|signup|sign-up|trial|buy|checkout|plans/.test(haystack) ? "commercial"
      : "informational";
    const ctaPools: Record<string, string[]> = {
      informational: ["Read the Guide →", "See All Tips →", "Learn How →", "Get the Full Guide →", "Read More →"],
      tool: ["Calculate Yours →", "Try the Calculator →", "Run the Numbers →", "Get Your Number →", "Free Calculator →"],
      list: ["See the List →", "Compare Options →", "See the Comparison →", "View All →", "See Which Wins →"],
      commercial: ["Try It Free →", "Get Started →", "Start Free →", "Sign Up Free →", "Try Now →"],
    };
    const ctaGuidance = `Each brief has an intent: "informational" | "tool" | "list" | "commercial". Default intent for THIS page = "${defaultIntent}"; you MAY set a different intent per brief when the angle differs (e.g. a comparison pin on a tool page = "list"). Then pick cta EXCLUSIVELY from the matching pool:
- informational: ${JSON.stringify(ctaPools.informational)}
- tool: ${JSON.stringify(ctaPools.tool)}
- list: ${JSON.stringify(ctaPools.list)}
- commercial: ${JSON.stringify(ctaPools.commercial)}
Never mix pools. Never invent CTAs outside the pools. Vary CTAs across the batch.`;
    const brandBlock = `UNIVERSAL PIN TEMPLATE — identical frame on every pin. Only the middle illustration, the title text, and the CTA label change.
- Aspect ratio 2:3, 1000x1500.
- TOP AREA: The pin title in an elegant serif display font, cream/off-white color, set against a solid brand-color band OR over the illustration with a translucent brand overlay for legibility. Title is the largest element on the pin.
- MIDDLE AREA: Illustration or photograph. Use ONLY the ${paletteLine}. Deep/dark brand color for backgrounds, warm accent for highlights, cream for negative space. No stray colors outside the palette.
- CTA BUTTON (mandatory, lower third ~72-78% down from top): Pill/rounded-rectangle button in the brand's warm accent color (mustard/gold/orange if present in palette, otherwise the lightest palette accent). Dark text on it, bold clean sans, trailing arrow "→". Button label = this brief's cta value verbatim. Must be visibly clickable and high contrast.
- BOTTOM BAR (mandatory, ~5% tall, full width, flush to the bottom edge): Solid dark brand-color band containing ONLY the website URL in cream/off-white, small clean sans, centered horizontally: "${brandHost}". NO brand name wordmark above or below. NO tagline. NO logo. URL only.
- Do NOT invent a different URL. No fake logos. No stock-photo watermarks. No social handles.
${brandFont ? `- Typography direction (title): ${brandFont}.\n` : ""}${brandNotes ? `- Brand notes: ${brandNotes}.\n` : ""}`;

    const stylesSubset = [...PIN_STYLES].sort(() => Math.random() - 0.5).slice(0, Math.min(data.count, PIN_STYLES.length));
    const chosenStyles = stylesSubset.length >= data.count
      ? stylesSubset.slice(0, data.count)
      : [...stylesSubset, ...Array(data.count - stylesSubset.length).fill("how-to")];

    try {
      type BriefsResp = {
        briefs: Array<{
          style: string;
          title: string;
          description: string;
          hashtags: string[];
          alt_text: string;
          cta: string;
          image_prompt: string;
        }>;
      };
      const resp = await openaiJSON<BriefsResp>({
        apiKey: cfg.api_key,
        model: "gpt-4o-mini",
        system: "You are a Pinterest pin strategist. Return strict JSON. Titles under 100 chars, descriptions 150-450 chars, natural keyword use (no stuffing), 5-8 hashtags including the primary keyword. Every pin has an action CTA.",
        user: `Create ${data.count} unique Pinterest pin briefs for this page. Use each style once from this list where possible: ${JSON.stringify(chosenStyles)}.

Return JSON: { briefs: [{ style, title, description, hashtags: [], alt_text, cta, image_prompt }] }.

CTA RULES: ${ctaGuidance}

The image_prompt is for a text-to-image model producing a vertical 2:3 Pinterest pin at 1000x1500. Include composition, style (photography/illustration/flat/vintage/infographic/split/minimal etc), and any overlay text WITH exact typography direction. Vary composition/style per brief, but keep the brand lock IDENTICAL on every pin. The image_prompt MUST explicitly describe a visible CTA button rendering the exact cta text.

${brandBlock}

Every image_prompt MUST end with this exact line: "CTA button (lower third): [cta text] →. Bottom-center footer text: ${brandHost}. Small wordmark: ${brandName}. Palette: ${brandColors.join(", ") || "cohesive brand palette"}." — replace [cta text] with this brief's cta value.

Page: ${page.url}
Topic: ${analysis.topic ?? ""}
Primary keyword: ${analysis.primary_keyword}
Secondary: ${JSON.stringify(analysis.secondary_keywords ?? [])}
Audience: ${analysis.audience ?? ""}
Category: ${analysis.category ?? ""}`,
      });

      const rows = resp.briefs.slice(0, data.count).map((b) => ({
        user_id: context.userId,
        page_id: page.id,
        style: b.style,
        title: b.title,
        description: b.description,
        hashtags: b.hashtags ?? [],
        alt_text: b.alt_text ?? null,
        cta: b.cta ?? null,
        image_prompt: b.image_prompt,
        status: "image_pending" as const,
      }));
      const { data: inserted, error: insErr } = await supabaseAdmin.from("pin_briefs").insert(rows).select("id");
      if (insErr) throw insErr;

      // Enqueue image jobs
      const jobs = inserted!.map((r) => ({
        user_id: context.userId,
        kind: "generate_image" as const,
        payload: { brief_id: r.id },
      }));
      await supabaseAdmin.from("jobs").insert(jobs);

      await markIntegration(context.userId, "openai", "ok");
      return { created: inserted!.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markIntegration(context.userId, "openai", "error", msg);
      throw e;
    }
  });

export const listBriefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("pin_briefs")
      .select("id, style, title, status, page_id, created_at, pin_images(storage_path)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const runImageWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { processImageQueueForUser } = await import("./image-worker.server");
    return await processImageQueueForUser(context.userId, 5);
  });

export const rerenderBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { briefId: string }) => z.object({ briefId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: brief } = await context.supabase.from("pin_briefs").select("id, user_id").eq("id", data.briefId).single();
    if (!brief || brief.user_id !== context.userId) throw new Error("Brief not found");
    // Remove any existing images for this brief (both DB row and storage object)
    const { data: imgs } = await supabaseAdmin.from("pin_images").select("id, storage_path").eq("brief_id", data.briefId);
    if (imgs?.length) {
      const paths = imgs.map((i) => i.storage_path).filter(Boolean) as string[];
      if (paths.length) await supabaseAdmin.storage.from("pins").remove(paths);
      await supabaseAdmin.from("pin_images").delete().eq("brief_id", data.briefId);
    }
    await supabaseAdmin.from("pin_briefs").update({ status: "image_pending" }).eq("id", data.briefId);
    await supabaseAdmin.from("jobs").insert({
      user_id: context.userId,
      kind: "generate_image" as const,
      payload: { brief_id: data.briefId, force: true },
    });
    // Kick the worker inline so the user sees it render immediately
    const { processImageQueueForUser } = await import("./image-worker.server");
    await processImageQueueForUser(context.userId, 1);
    return { ok: true };
  });
