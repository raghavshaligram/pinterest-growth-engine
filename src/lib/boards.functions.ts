import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listBoards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("boards").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  });

export const upsertBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string; name: string; pinterest_board_id?: string; keywords?: string[]; category?: string }) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      pinterest_board_id: z.string().optional(),
      keywords: z.array(z.string()).default([]),
      category: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase
      .from("boards").upsert({ ...data, user_id: context.userId }).select().single();
    if (error) throw error;
    return out;
  });

export const deleteBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("boards").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
