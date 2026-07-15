import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listScheduled = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scheduled_pins")
      .select("id, scheduled_at, status, pinterest_pin_id, last_error, brief_id, board_id, image_id, pin_briefs(title, page_id), boards(name), pin_images(storage_path)")
      .order("scheduled_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  });

export const autoSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { days?: number; perDay?: number; hoursStart?: number; hoursEnd?: number }) =>
    z.object({
      days: z.number().int().min(1).max(60).default(14),
      perDay: z.number().int().min(1).max(50).default(6),
      hoursStart: z.number().int().min(0).max(23).default(8),
      hoursEnd: z.number().int().min(1).max(24).default(22),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Pull ready briefs not already scheduled, along with an image and a page URL.
    const { data: readyBriefs, error } = await supabaseAdmin
      .from("pin_briefs")
      .select("id, page_id, pin_images(id, storage_path)")
      .eq("user_id", context.userId)
      .eq("status", "ready")
      .limit(data.days * data.perDay);
    if (error) throw error;
    if (!readyBriefs?.length) return { scheduled: 0, reason: "No ready briefs" };

    const { data: boards } = await supabaseAdmin.from("boards").select("id, keywords").eq("user_id", context.userId);
    if (!boards?.length) return { scheduled: 0, reason: "Add at least one board first" };

    const usedUrlsPerDay = new Map<string, Set<string>>();
    const scheduled: { id: string; scheduled_at: string; brief_id: string; image_id: string; board_id: string; user_id: string; status: "queued" }[] = [];

    let boardIdx = 0;
    let day = 0, slot = 0;
    const totalHours = data.hoursEnd - data.hoursStart;
    const gap = Math.max(1, Math.floor(totalHours / data.perDay));

    for (const brief of readyBriefs) {
      const img = brief.pin_images?.[0];
      if (!img) continue;
      while (day < data.days) {
        const dayKey = String(day);
        const set = usedUrlsPerDay.get(dayKey) ?? new Set<string>();
        if (!set.has(brief.page_id) && slot < data.perDay) {
          const at = new Date();
          at.setUTCDate(at.getUTCDate() + day);
          at.setUTCHours(data.hoursStart + slot * gap, Math.floor(Math.random() * 60), 0, 0);
          const board = boards[boardIdx % boards.length];
          scheduled.push({
            id: crypto.randomUUID(),
            scheduled_at: at.toISOString(),
            brief_id: brief.id,
            image_id: img.id,
            board_id: board.id,
            user_id: context.userId,
            status: "queued",
          });
          set.add(brief.page_id);
          usedUrlsPerDay.set(dayKey, set);
          boardIdx++;
          slot++;
          break;
        }
        slot++;
        if (slot >= data.perDay) { slot = 0; day++; }
      }
    }
    if (!scheduled.length) return { scheduled: 0, reason: "Slots exhausted" };
    const { error: insErr } = await supabaseAdmin.from("scheduled_pins").insert(scheduled);
    if (insErr) throw insErr;
    await supabaseAdmin.from("pin_briefs").update({ status: "scheduled" }).in("id", scheduled.map((s) => s.brief_id));
    return { scheduled: scheduled.length };
  });

export const runPublisher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { processDuePinsForUser } = await import("./publisher.server");
    return await processDuePinsForUser(context.userId);
  });

export const rescheduleOrCancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; scheduled_at?: string; cancel?: boolean }) =>
    z.object({ id: z.string().uuid(), scheduled_at: z.string().optional(), cancel: z.boolean().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.cancel) {
      const { error } = await context.supabase.from("scheduled_pins").update({ status: "canceled" }).eq("id", data.id);
      if (error) throw error;
    } else if (data.scheduled_at) {
      const { error } = await context.supabase.from("scheduled_pins").update({ scheduled_at: data.scheduled_at }).eq("id", data.id);
      if (error) throw error;
    }
    return { ok: true };
  });
