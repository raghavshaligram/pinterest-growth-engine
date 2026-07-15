import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Globe, FileText, Images, Calendar, LayoutGrid,
  KeyRound, Settings2, ScrollText, Sparkles, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sites", label: "Sites", icon: Globe },
  { to: "/pages", label: "Pages", icon: FileText },
  { to: "/pins", label: "Pins", icon: Images },
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/boards", label: "Boards", icon: LayoutGrid },
  { to: "/keywords", label: "Keywords", icon: KeyRound },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/settings/integrations", label: "Settings", icon: Settings2 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-5 py-6">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-display text-xl">PinForge</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to || (to !== "/dashboard" && path.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
