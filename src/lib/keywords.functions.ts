import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listKeywords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("keywords")
      .select("id, keyword, kind, tracked, page_id, pages(url, title)")
      .order("keyword")
      .limit(1000);
    if (error) throw error;
    return data ?? [];
  });

export const setKeywordTracked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; tracked: boolean }) =>
    z.object({ id: z.string().uuid(), tracked: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("keywords").update({ tracked: data.tracked }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const runSerpSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getIntegration, DEFAULT_APIFY_ACTOR, markIntegration } = await import("./integrations.server");
    const { runApifyActor } = await import("./apify.server");
    const cfg = await getIntegration(context.userId, "apify");
    if (!cfg) return { swept: 0, note: "Apify not configured" };
    const { data: kws } = await supabaseAdmin
      .from("keywords").select("keyword").eq("user_id", context.userId).eq("tracked", true).limit(20);
    if (!kws?.length) return { swept: 0, note: "No tracked keywords" };
    let swept = 0;
    for (const { keyword } of kws) {
      try {
        const items = await runApifyActor<{ pinUrl?: string; title?: string; description?: string; imageUrl?: string; boardName?: string; saves?: number }>({
          token: cfg.api_token,
          actorId: cfg.actor_id ?? DEFAULT_APIFY_ACTOR,
          input: { searches: [keyword], maxItems: 25 },
        });
        const top_pins = items.slice(0, 25).map((p) => ({
          url: p.pinUrl, title: p.title, description: p.description, image: p.imageUrl, board: p.boardName, saves: p.saves,
        }));
        await supabaseAdmin.from("serp_snapshots").insert({ user_id: context.userId, keyword, top_pins });
        swept++;
      } catch (e) {
        await markIntegration(context.userId, "apify", "error", e instanceof Error ? e.message : String(e));
      }
    }
    await markIntegration(context.userId, "apify", "ok");
    return { swept };
  });
