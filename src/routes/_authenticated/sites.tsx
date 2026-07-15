import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSites, upsertSite, deleteSite, crawlSite } from "@/lib/sites.functions";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Globe, Trash2, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sites")({
  head: () => ({ meta: [{ title: "Sites — PinForge" }] }),
  component: SitesPage,
});

function SitesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSites);
  const upsert = useServerFn(upsertSite);
  const del = useServerFn(deleteSite);
  const crawl = useServerFn(crawlSite);

  const { data: sites } = useQuery({ queryKey: ["sites"], queryFn: () => list() });
  const [url, setUrl] = useState("");
  const [sitemap, setSitemap] = useState("");

  const addMut = useMutation({
    mutationFn: () => upsert({ data: { url, sitemap_url: sitemap || undefined } }),
    onSuccess: () => { setUrl(""); setSitemap(""); toast.success("Site added"); qc.invalidateQueries({ queryKey: ["sites"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["sites"] }); },
  });
  const crawlMut = useMutation({
    mutationFn: (id: string) => crawl({ data: { siteId: id } }),
    onSuccess: (r) => toast.success(`Crawl: +${r.added} added, ${r.updated} updated, ${r.errors} errors`),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl">Sites</h1>
        <p className="text-sm text-muted-foreground">Add a website and its sitemap. PinForge crawls, extracts and stores every page.</p>
      </header>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Add a site</h2>
        <form onSubmit={(e) => { e.preventDefault(); addMut.mutate(); }} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div><Label>Website URL</Label><Input placeholder="https://harvestmath.com" value={url} onChange={(e) => setUrl(e.target.value)} required /></div>
          <div><Label>Sitemap URL <span className="text-muted-foreground">(optional)</span></Label><Input placeholder="https://harvestmath.com/sitemap.xml" value={sitemap} onChange={(e) => setSitemap(e.target.value)} /></div>
          <Button type="submit" disabled={addMut.isPending}>Add site</Button>
        </form>
      </Card>

      <div className="space-y-3">
        {sites?.map((s) => (
          <Card key={s.id} className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">{s.url}</div>
                <div className="text-xs text-muted-foreground">{s.sitemap_url ?? "sitemap.xml (default)"}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => crawlMut.mutate(s.id)} disabled={crawlMut.isPending}>
                <RefreshCcw className="mr-1 h-4 w-4" />Crawl now
              </Button>
              <Button size="sm" variant="ghost" onClick={() => delMut.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
        {!sites?.length && <p className="text-sm text-muted-foreground">No sites yet.</p>}
      </div>
    </div>
  );
}
