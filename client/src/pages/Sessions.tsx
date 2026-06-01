import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Session, type Layout } from "@shared/schema";
import { useState } from "react";
import { Link } from "wouter";
import { Plus, Trash2, ChevronRight, Calendar, SlidersHorizontal, Moon, Sun, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function useTheme() {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
      return next;
    });
  };
  return { dark, toggle };
}

export default function Sessions() {
  const { dark, toggle } = useTheme();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newLayoutId, setNewLayoutId] = useState<string>("1");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });

  const { data: layouts = [] } = useQuery<Layout[]>({
    queryKey: ["/api/layouts"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; date: string; notes: string; layoutId: number }) =>
      apiRequest("POST", "/api/sessions", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setShowNew(false);
      setNewName("");
      setNewNotes("");
      setNewLayoutId("1");
      toast({ title: "Session created" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setDeleteId(null);
      toast({ title: "Session deleted" });
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) return;
    const today = new Date().toISOString().split("T")[0];
    createMutation.mutate({ name: newName.trim(), date: today, notes: newNotes, layoutId: Number(newLayoutId) || 1 });
  };

  return (
    <div className="min-h-screen bg-background" data-testid="sessions-page">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="AP Tracker" className="text-primary">
              <rect x="2" y="2" width="28" height="28" rx="6" fill="currentColor" opacity="0.15"/>
              <rect x="6" y="12" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="14" y="8" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="22" y="14" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="10" y="18" width="4" height="4" rx="1" fill="currentColor"/>
              <circle cx="16" cy="24" r="2" fill="currentColor" opacity="0.6"/>
            </svg>
            <div>
              <h1 className="text-base font-bold leading-tight">AP Tracker v2</h1>
              <p className="text-xs text-muted-foreground leading-tight">Parisian Macao · Advantage Play</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/layout-builder">
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1 text-muted-foreground" data-testid="btn-layout-builder">
                <LayoutGrid size={13} /> Layouts
              </Button>
            </Link>
            <Button size="icon" variant="ghost" onClick={toggle} aria-label="Toggle theme" data-testid="btn-theme-toggle">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <Button size="sm" onClick={() => setShowNew(true)} data-testid="btn-new-session">
              <Plus size={14} className="mr-1" /> New Session
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-20">
            <SlidersHorizontal size={40} className="mx-auto text-muted-foreground mb-4 opacity-40" />
            <p className="text-muted-foreground text-sm">No sessions yet.</p>
            <p className="text-muted-foreground text-xs mt-1">Create one to start tracking machines.</p>
            <Button className="mt-4" onClick={() => setShowNew(true)} data-testid="btn-create-first">
              <Plus size={14} className="mr-1" /> Create first session
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-4">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </p>
            {sessions.map((s) => {
              const layout = layouts.find(l => l.id === (s.layoutId ?? 1));
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-4 group hover:border-primary transition-colors"
                  data-testid={`card-session-${s.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <Link href={`/session/${s.id}`} className="block">
                      <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{s.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Calendar size={11} className="text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">{s.date}</p>
                        {layout && layout.id !== 1 && (
                          <span className="text-[10px] text-primary/70 border border-primary/30 rounded px-1">{layout.name}</span>
                        )}
                        {s.notes && <span className="text-xs text-muted-foreground truncate">· {s.notes}</span>}
                      </div>
                    </Link>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                      onClick={(e) => { e.preventDefault(); setDeleteId(s.id); }}
                      data-testid={`btn-delete-session-${s.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                    <Link href={`/session/${s.id}`}>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" data-testid={`btn-open-session-${s.id}`}>
                        <ChevronRight size={16} />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* New Session Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent data-testid="dialog-new-session">
          <DialogHeader>
            <DialogTitle>New Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Session Name</label>
              <Input
                placeholder="Parisian – Saturday Night"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
                data-testid="input-session-name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
              <Input
                placeholder="e.g. post payday crowd, machine row D busy"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                data-testid="input-session-notes"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Floor Layout</label>
              <Select value={newLayoutId} onValueChange={setNewLayoutId}>
                <SelectTrigger data-testid="select-session-layout">
                  <SelectValue placeholder="Select layout" />
                </SelectTrigger>
                <SelectContent>
                  {layouts.map(l => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}{l.casino && l.casino !== l.name ? ` — ${l.casino}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Or{" "}
                <Link href="/layout-builder" className="text-primary hover:underline" onClick={() => setShowNew(false)}>
                  create a new layout
                </Link>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending} data-testid="btn-confirm-create-session">
              {createMutation.isPending ? "Creating…" : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the session and all tracked machines. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
              data-testid="btn-confirm-delete-session"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
