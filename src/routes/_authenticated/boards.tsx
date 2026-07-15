import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBoards, upsertBoard, deleteBoard } from "@/lib/boards.functions";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LayoutGrid, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/boards")({
  head: () => ({ meta: [{ title: "Boards — PinForge" }] }),
  component: BoardsPage,
});

function BoardsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listBoards);
  const up = useServerFn(upsertBoard);
  const del = useServerFn(deleteBoard);
  const { data } = useQuery({ queryKey: ["boards"], queryFn: () => list() });
  const [name, setName] = useState("");
  const [pid, setPid] = useState("");
  const [category, setCategory] = useState("");
  const [kw, setKw] = useState("");

  const addMut = useMutation({
    mutationFn: () => up({ data: { name, pinterest_board_id: pid || undefined, category: category || undefined,
      keywords: kw.split(",").map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: () => { setName(""); setPid(""); setCategory(""); setKw(""); toast.success("Board saved"); qc.invalidateQueries({ queryKey: ["boards"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const delMut = useMutation({ mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boards"] }) });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl">Boards</h1>
        <p className="text-sm text-muted-foreground">Register your Pinterest boards. Paste the board ID once you have Pinterest credentials.</p>
      </header>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Add board</h2>
        <form onSubmit={(e) => { e.preventDefault(); addMut.mutate(); }} className="grid gap-4 md:grid-cols-4 md:items-end">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><Label>Pinterest board ID</Label><Input value={pid} onChange={(e) => setPid(e.target.value)} placeholder="optional" /></div>
          <div><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div><Label>Keywords <span className="text-muted-foreground">(comma-separated)</span></Label><Input value={kw} onChange={(e) => setKw(e.target.value)} /></div>
          <div className="md:col-span-4"><Button type="submit">Save board</Button></div>
        </form>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((b) => (
          <Card key={b.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <LayoutGrid className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">{b.pinterest_board_id ?? "no Pinterest ID"} · {b.category ?? "—"}</div>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => delMut.mutate(b.id)}><Trash2 className="h-4 w-4" /></Button>
          </Card>
        ))}
        {!data?.length && <p className="text-sm text-muted-foreground">No boards yet.</p>}
      </div>
    </div>
  );
}
