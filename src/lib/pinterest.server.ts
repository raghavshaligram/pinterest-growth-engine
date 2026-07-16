// Server-only. Pinterest publishing adapter with three modes.
export type PublishInput = {
  boardId: string; // Pinterest board id (native) or internal board id for export
  title: string;
  description: string;
  link: string;
  imageUrl: string; // publicly reachable URL
  altText?: string;
};

export type PublishResult =
  | { mode: "api"; pinterestPinId: string }
  | { mode: "apify"; jobRunId: string }
  | { mode: "export"; ok: true }
  | { mode: "webhook"; ok: true; pinterestPinId?: string; status?: string; raw?: unknown };

export interface PinterestClient {
  mode: "api" | "apify" | "export" | "webhook";
  publish(input: PublishInput & { userId: string; scheduledPinId: string }): Promise<PublishResult>;
}

const WEBHOOK_URL = "https://hook.eu1.make.com/clrkvdlzl3w6id6bhtb8jwg8bj0pt0jq";

export async function webhookPublish(input: PublishInput & { userId: string; scheduledPinId: string }): Promise<PublishResult> {
  const r = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: input.userId,
      scheduledPinId: input.scheduledPinId,
      boardId: input.boardId,
      title: input.title,
      description: input.description,
      link: input.link,
      imageUrl: input.imageUrl,
      altText: input.altText ?? null,
      publishedAt: new Date().toISOString(),
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Webhook ${r.status}: ${text}`);
  let parsed: unknown = undefined;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { /* not JSON — treat as success */ }
  const obj = (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : {};
  const status = typeof obj.status === "string" ? obj.status : undefined;
  const pinId = typeof obj.pinterest_pin_id === "string" ? obj.pinterest_pin_id
    : typeof obj.pinterestPinId === "string" ? obj.pinterestPinId
    : typeof obj.pin_id === "string" ? obj.pin_id
    : undefined;
  const error = typeof obj.error === "string" ? obj.error : undefined;
  if (status === "failed" || error) throw new Error(error ?? "Webhook reported failure");
  return { mode: "webhook", ok: true, pinterestPinId: pinId, status, raw: parsed };
}

export async function makePinterestClient(_userId: string): Promise<PinterestClient> {
  return { mode: "webhook", publish: (i) => webhookPublish(i) };
}
