import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Layout, type ZoneConfig, type CabinetConfig } from "@shared/schema";
import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, Plus, X, Trash2, Save, LayoutGrid,
  GripVertical, ChevronDown, ChevronRight, CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function genId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const ZONE_COLORS = [
  "border-amber-600",
  "border-violet-600",
  "border-rose-600",
  "border-emerald-600",
  "border-sky-600",
  "border-orange-600",
  "border-pink-600",
  "border-teal-600",
];

export default function LayoutBuilder() {
  const params = useParams<{ layoutId?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const layoutId = params.layoutId ? Number(params.layoutId) : undefined;

  const [name, setName] = useState("New Layout");
  const [casino, setCasino] = useState("");
  const [zones, setZones] = useState<ZoneConfig[]>([]);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [expandedCabs, setExpandedCabs] = useState<Set<string>>(new Set());

  const { data: layout, isLoading } = useQuery<Layout>({
    queryKey: ["/api/layouts", layoutId],
    queryFn: () => apiRequest("GET", `/api/layouts/${layoutId}`).then(r => r.json()),
    enabled: !!layoutId,
  });

  const { data: allLayouts = [] } = useQuery<Layout[]>({
    queryKey: ["/api/layouts"],
  });

  useEffect(() => {
    if (layout) {
      setName(layout.name);
      setCasino(layout.casino);
      try {
        const parsed = JSON.parse(layout.zonesConfig) as ZoneConfig[];
        setZones(parsed);
        setExpandedZones(new Set(parsed.map(z => z.id)));
      } catch { setZones([]); }
    }
  }, [layout?.id]);

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; casino: string; zonesConfig: string }) => {
      if (layoutId) {
        return apiRequest("PUT", `/api/layouts/${layoutId}`, data).then(r => r.json());
      }
      return apiRequest("POST", "/api/layouts", data).then(r => r.json());
    },
    onSuccess: (saved: Layout) => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: `Layout "${saved.name}" saved` });
      if (!layoutId) {
        navigate(`/layout-builder/${saved.id}`);
      }
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/layouts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts"] });
      toast({ title: "Layout deleted" });
      navigate("/");
    },
  });

  function handleSave() {
    saveMutation.mutate({ name, casino, zonesConfig: JSON.stringify(zones) });
  }

  function addZone() {
    const id = `zone_${genId()}`;
    const newZone: ZoneConfig = {
      id,
      name: "New Zone",
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
      cabinets: [],
    };
    setZones([...zones, newZone]);
    setExpandedZones(prev => new Set([...prev, id]));
  }

  function removeZone(zoneId: string) {
    setZones(zones.filter(z => z.id !== zoneId));
  }

  function updateZone(zoneId: string, updates: Partial<ZoneConfig>) {
    setZones(zones.map(z => z.id === zoneId ? { ...z, ...updates } : z));
  }

  function addCabinet(zoneId: string) {
    const cabId = `cab_${genId()}`;
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    const maxCol = Math.max(...zone.cabinets.map(c => c.col), -1);
    const maxRow = Math.max(...zone.cabinets.map(c => c.row), 0);
    const newCab: CabinetConfig = {
      id: cabId,
      label: `CAB ${String.fromCharCode(65 + zone.cabinets.length)}`,
      machineIds: [],
      row: maxRow,
      col: maxCol + 1,
    };
    updateZone(zoneId, { cabinets: [...zone.cabinets, newCab] });
    setExpandedCabs(prev => new Set([...prev, cabId]));
  }

  function removeCabinet(zoneId: string, cabId: string) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    updateZone(zoneId, { cabinets: zone.cabinets.filter(c => c.id !== cabId) });
  }

  function updateCabinet(zoneId: string, cabId: string, updates: Partial<CabinetConfig>) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    updateZone(zoneId, {
      cabinets: zone.cabinets.map(c => c.id === cabId ? { ...c, ...updates } : c),
    });
  }

  function addMachineSlot(zoneId: string, cabId: string) {
    const zone = zones.find(z => z.id === zoneId);
    const cab = zone?.cabinets.find(c => c.id === cabId);
    if (!cab) return;
    const allIds = zones.flatMap(z => z.cabinets.flatMap(c => c.machineIds));
    const prefix = zone?.name.startsWith("Pared") || zone?.name.toLowerCase().includes("carousel") ? "P"
      : zone?.name.startsWith("Pasillo") ? "Q"
      : zone?.name.startsWith("Smoking") ? "S"
      : zone?.name.slice(0,1).toUpperCase();
    let n = allIds.length + 1;
    let newId = `${prefix}-${String(n).padStart(2,"0")}`;
    while (allIds.includes(newId)) { n++; newId = `${prefix}-${String(n).padStart(2,"0")}`; }
    updateCabinet(zoneId, cabId, { machineIds: [...cab.machineIds, newId] });
  }

  function removeMachineSlot(zoneId: string, cabId: string, machineId: string) {
    const zone = zones.find(z => z.id === zoneId);
    const cab = zone?.cabinets.find(c => c.id === cabId);
    if (!cab) return;
    updateCabinet(zoneId, cabId, { machineIds: cab.machineIds.filter(m => m !== machineId) });
  }

  function renameMachineSlot(zoneId: string, cabId: string, oldId: string, newId: string) {
    const zone = zones.find(z => z.id === zoneId);
    const cab = zone?.cabinets.find(c => c.id === cabId);
    if (!cab) return;
    updateCabinet(zoneId, cabId, { machineIds: cab.machineIds.map(m => m === oldId ? newId : m) });
  }

  const totalMachines = zones.reduce((sum, z) => sum + z.cabinets.reduce((s, c) => s + c.machineIds.length, 0), 0);

  if (layoutId && isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading layout…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <LayoutGrid size={18} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold">{layoutId ? `Edit: ${name}` : "New Layout"}</h1>
            <p className="text-[10px] text-muted-foreground">{totalMachines} machines across {zones.length} zones</p>
          </div>
          <div className="flex items-center gap-2">
            {layoutId && layoutId !== 1 && (
              <Button
                size="sm" variant="outline"
                className="h-8 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => { if (confirm("Delete this layout?")) deleteMutation.mutate(layoutId); }}
              >
                <Trash2 size={12} /> Delete
              </Button>
            )}
            <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save size={12} /> {saveMutation.isPending ? "Saving…" : "Save Layout"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Layout metadata */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layout Info</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Layout Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Parisian Macao" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Casino</label>
              <Input value={casino} onChange={e => setCasino(e.target.value)} placeholder="e.g. Parisian Macao" />
            </div>
          </div>
        </div>

        {/* Existing layouts list */}
        {allLayouts.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Layouts</p>
            <div className="space-y-2">
              {allLayouts.map(l => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="text-[10px] text-muted-foreground">{l.casino}{l.id === 1 ? " · Default" : ""}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link href={`/layout-builder/${l.id}`}>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">Edit</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => navigate("/layout-builder")} className="mt-3 w-full text-xs text-primary hover:underline text-center block">
              + Create new layout
            </button>
          </div>
        )}

        {/* Zones */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Zones ({zones.length})</p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addZone}>
              <Plus size={12} /> Add Zone
            </Button>
          </div>

          {zones.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
              <LayoutGrid size={32} className="mx-auto text-muted-foreground mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No zones yet</p>
              <p className="text-muted-foreground text-xs mt-1">Add zones to define floor areas</p>
              <Button className="mt-4" size="sm" onClick={addZone}><Plus size={12} className="mr-1" /> Add Zone</Button>
            </div>
          )}

          {zones.map((zone, zi) => {
            const isExpanded = expandedZones.has(zone.id);
            return (
              <div key={zone.id} className={`border-2 ${zone.color}/50 rounded-xl overflow-hidden`}>
                {/* Zone header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-card/60 cursor-pointer"
                  onClick={() => setExpandedZones(prev => {
                    const next = new Set(prev);
                    if (next.has(zone.id)) next.delete(zone.id); else next.add(zone.id);
                    return next;
                  })}
                >
                  {isExpanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                  <div className={`w-3 h-3 rounded-full ${zone.color.replace("border-","bg-")} shrink-0`} />
                  <Input
                    value={zone.name}
                    onChange={e => { e.stopPropagation(); updateZone(zone.id, { name: e.target.value }); }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 h-7 text-sm font-semibold border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">{zone.cabinets.length} cabinets</span>
                  {/* Color picker */}
                  <select
                    value={zone.color}
                    onChange={e => { e.stopPropagation(); updateZone(zone.id, { color: e.target.value }); }}
                    onClick={e => e.stopPropagation()}
                    className="h-6 text-[10px] bg-background border border-border rounded px-1 text-muted-foreground"
                  >
                    {ZONE_COLORS.map(c => <option key={c} value={c}>{c.replace("border-","")}</option>)}
                  </select>
                  <button
                    onClick={e => { e.stopPropagation(); removeZone(zone.id); }}
                    className="w-6 h-6 rounded-full bg-red-700/20 text-red-400 flex items-center justify-center hover:bg-red-700/40 transition-colors shrink-0"
                  ><X size={10} /></button>
                </div>

                {isExpanded && (
                  <div className="p-4 space-y-3">
                    {/* Cabinets */}
                    {zone.cabinets.map((cab) => {
                      const isCabExpanded = expandedCabs.has(cab.id);
                      return (
                        <div key={cab.id} className="border border-border/50 rounded-lg bg-card/30 overflow-hidden">
                          <div
                            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20"
                            onClick={() => setExpandedCabs(prev => {
                              const next = new Set(prev);
                              if (next.has(cab.id)) next.delete(cab.id); else next.add(cab.id);
                              return next;
                            })}
                          >
                            {isCabExpanded ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                            <Input
                              value={cab.label}
                              onChange={e => { e.stopPropagation(); updateCabinet(zone.id, cab.id, { label: e.target.value }); }}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 h-6 text-xs font-semibold border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            />
                            <span className="text-[10px] text-muted-foreground shrink-0">{cab.machineIds.length} slots</span>
                            {/* Position fields */}
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <span className="text-[9px] text-muted-foreground">Row</span>
                              <input
                                type="number" min="0" max="10"
                                value={cab.row}
                                onChange={e => updateCabinet(zone.id, cab.id, { row: Number(e.target.value) })}
                                className="w-10 h-5 text-[10px] text-center bg-background border border-border rounded"
                              />
                              <span className="text-[9px] text-muted-foreground">Col</span>
                              <input
                                type="number" min="0" max="10"
                                value={cab.col}
                                onChange={e => updateCabinet(zone.id, cab.id, { col: Number(e.target.value) })}
                                className="w-10 h-5 text-[10px] text-center bg-background border border-border rounded"
                              />
                            </div>
                            {/* Circular toggle */}
                            <button
                              onClick={e => { e.stopPropagation(); updateCabinet(zone.id, cab.id, { circular: !cab.circular }); }}
                              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                cab.circular ? "border-violet-500 text-violet-400 bg-violet-950/30" : "border-border text-muted-foreground hover:border-violet-500/50"
                              }`}
                              title="Toggle circular display"
                            >
                              <CircleDot size={10} />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); removeCabinet(zone.id, cab.id); }}
                              className="w-5 h-5 rounded-full bg-red-700/20 text-red-400 flex items-center justify-center hover:bg-red-700/40 transition-colors shrink-0"
                            ><X size={8} /></button>
                          </div>

                          {isCabExpanded && (
                            <div className="px-3 pb-3">
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {cab.machineIds.map((mid) => (
                                  <div key={mid} className="flex items-center gap-0.5 bg-muted/30 border border-border/50 rounded px-1.5 py-0.5">
                                    <input
                                      value={mid}
                                      onChange={e => renameMachineSlot(zone.id, cab.id, mid, e.target.value)}
                                      className="w-14 text-[10px] font-mono bg-transparent focus:outline-none"
                                    />
                                    <button
                                      onClick={() => removeMachineSlot(zone.id, cab.id, mid)}
                                      className="text-muted-foreground hover:text-red-400 transition-colors"
                                    ><X size={8} /></button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => addMachineSlot(zone.id, cab.id)}
                                  className="flex items-center gap-0.5 text-[10px] text-primary border border-dashed border-primary/50 rounded px-1.5 py-0.5 hover:bg-primary/5 transition-colors"
                                >
                                  <Plus size={9} /> slot
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      onClick={() => addCabinet(zone.id)}
                      className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed border-border/40 rounded-lg py-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                    >
                      <Plus size={12} /> Add Cabinet
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Save CTA */}
        {zones.length > 0 && (
          <div className="flex justify-end pb-8">
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-1.5">
              <Save size={14} /> {saveMutation.isPending ? "Saving…" : "Save Layout"}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
