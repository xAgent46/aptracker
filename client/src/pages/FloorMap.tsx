import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  type Machine, type Session, type Layout, type ZoneConfig, type CabinetConfig,
  STATUS_OPTIONS, AP_SIGNAL_OPTIONS, BEING_PLAYED_OPTIONS, type MachineType,
} from "@shared/schema";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, Filter, Search, AlertTriangle, Flame,
  Eye, User, Coins, Zap, X, Check,
  Moon, Sun, Plus, Minus, Clock, GripVertical, Users,
  TrendingUp, TrendingDown, Pencil, FileText,
  Rows, Columns, Coffee, Utensils, CircleDot, Play, Pause,
  Lock, Unlock, Bell, LayoutGrid, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

// dnd-kit core
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Break type ───────────────────────────────────────────────────
type BreakType = "smoke" | "food" | "other";
interface BreakEntry { type: BreakType; startedAt: string; endedAt: string | null; }

function parseBreaks(raw: string | undefined): BreakEntry[] {
  if (!raw || raw === "[]") return [];
  try { return JSON.parse(raw) as BreakEntry[]; } catch { return []; }
}

// ── Color maps ───────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  unplayed:             "bg-slate-700/40 border-slate-600 text-slate-300",
  being_played:         "bg-blue-900/60 border-blue-500 text-blue-200",
  played_by_me:         "bg-green-900/60 border-green-500 text-green-200",
  checked:              "bg-teal-900/50 border-teal-600 text-teal-300",
  out_of_service:       "bg-rose-950/60 border-rose-700 text-rose-300 opacity-70",
  out_of_paper:         "bg-purple-900/50 border-purple-500 text-purple-200",
  running_out_of_money: "bg-orange-950/70 border-orange-400 text-orange-200 animate-pulse",
};

const STATUS_DOT: Record<string, string> = {
  unplayed:             "bg-slate-500",
  being_played:         "bg-blue-400",
  played_by_me:         "bg-green-400",
  checked:              "bg-teal-400",
  out_of_service:       "bg-rose-700",
  out_of_paper:         "bg-purple-500",
  running_out_of_money: "bg-orange-400",
};

const AP_CATEGORY_ICON: Record<string, React.ReactNode> = {
  player:  <User size={9} />,
  wild:    <Zap size={9} />,
  coin:    <Coins size={9} />,
  jackpot: <Flame size={9} />,
  default: <Eye size={9} />,
  other:   <AlertTriangle size={9} />,
};

// ── Player type color pills ───────────────────────────────────────
const PLAYER_TYPE_PILL: Record<string, { bg: string; text: string; abbr: string; pulse?: boolean }> = {
  long_time:      { bg: "bg-blue-700",   text: "text-blue-100",   abbr: "LT" },
  money_out:      { bg: "bg-orange-600", text: "text-orange-100", abbr: "M$", pulse: true },
  high_amount:    { bg: "bg-yellow-600", text: "text-yellow-100", abbr: "H$" },
  jumping_bets:   { bg: "bg-violet-600", text: "text-violet-100", abbr: "JB" },
  senior:         { bg: "bg-slate-500",  text: "text-slate-100",  abbr: "SR" },
  beginner:       { bg: "bg-sky-600",    text: "text-sky-100",    abbr: "BG" },
  normal:         { bg: "bg-gray-600",   text: "text-gray-100",   abbr: "NR" },
  other:          { bg: "bg-gray-600",   text: "text-gray-100",   abbr: "?" },
};

// ── Timer hook ───────────────────────────────────────────────────
function useElapsedTimer(statusChangedAt: string | null | undefined) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!statusChangedAt) { setElapsed(0); return; }
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(statusChangedAt).getTime()) / 1000);
      setElapsed(Math.max(0, diff));
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [statusChangedAt]);
  return elapsed;
}

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m${s > 0 ? ` ${s}s` : ""}`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function LiveTimer({ statusChangedAt, status }: { statusChangedAt?: string; status: string }) {
  const elapsed = useElapsedTimer(statusChangedAt);
  if (!statusChangedAt) return null;
  const color = elapsed > 1800 ? "text-red-400" : elapsed > 600 ? "text-orange-400" : "text-emerald-400";
  return (
    <span className={`flex items-center gap-0.5 text-[8px] font-mono font-bold leading-none ${color}`}>
      <Clock size={7} />
      {formatElapsed(elapsed)}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────
function getStatusInfo(v: string) { return STATUS_OPTIONS.find(s => s.value === v) ?? STATUS_OPTIONS[0]; }
function getApInfo(v: string)     { return AP_SIGNAL_OPTIONS.find(a => a.value === v) ?? AP_SIGNAL_OPTIONS[0]; }

function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.getAttribute("data-theme") === "dark" ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const toggle = () => setDark(d => {
    const next = !d;
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    return next;
  });
  return { dark, toggle };
}

// ── Priority auto-rules ──────────────────────────────────────────
function computeAutoRules(status: string, playerType: string): { priority: number; alarmAt: string } {
  if (status === "unplayed" || status === "checked") {
    return { priority: 0, alarmAt: "" };
  }
  if (status === "running_out_of_money") {
    return { priority: 2, alarmAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
  }
  if (status === "being_played") {
    if (playerType === "money_out") {
      return { priority: 2, alarmAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
    }
    if (playerType === "high_amount") {
      return { priority: 2, alarmAt: "" };
    }
    if (["long_time","senior","beginner","jumping_bets"].includes(playerType)) {
      return { priority: 1, alarmAt: "" };
    }
  }
  return { priority: 0, alarmAt: "" };
}

// ── Bulk status button ──────────────────────────────────────────
function BulkStatusButton({ sessionId, machines, zone, onDone }: {
  sessionId: number;
  machines: string[];
  zone: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const bulkMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PUT", `/api/sessions/${sessionId}/machines/bulk-status`, {
        machines: machines.map(id => ({ machineNumber: id, zone })),
        status,
      }).then(r => r.json()),
    onSuccess: (_data: unknown, status: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "machines"] });
      toast({ title: `All ${machines.length} machines set to "${STATUS_OPTIONS.find(s => s.value === status)?.label ?? status}"` });
      setOpen(false);
      onDone();
    },
    onError: () => toast({ title: "Bulk update failed", variant: "destructive" }),
  });

  return (
    <div className="relative ml-auto">
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[10px] gap-1 border-primary/40 text-primary hover:bg-primary/10"
        onClick={() => setOpen(o => !o)}
        data-testid={`btn-bulk-status-${zone}`}
      >
        <Users size={10} />
        Set all
      </Button>

      {open && (
        <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-xl shadow-2xl p-2 min-w-[180px] flex flex-col gap-1">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider px-1 pb-1 border-b border-border mb-1">
            Set all {machines.length} machines to…
          </p>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.value}
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate(s.value)}
              className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-left text-xs transition-all hover:bg-muted/60 disabled:opacity-50"
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[s.value]}`} />
              {s.label}
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="text-[9px] text-muted-foreground text-center mt-1 hover:text-foreground"
          >cancel</button>
        </div>
      )}
    </div>
  );
}

// ── Unified Machine Tile ──────────────────────────────────────────
function MachineTile({ gridId, machine, onClick, compact = false, style, editMode, onRemove }: {
  gridId: string; machine?: Machine; onClick: () => void; compact?: boolean;
  style?: React.CSSProperties;
  editMode?: boolean;
  onRemove?: () => void;
}) {
  const status = machine?.status ?? "unplayed";
  const apInfo = machine ? getApInfo(machine.apSignal) : null;
  const hasSignal = machine && machine.apSignal !== "none";
  const wilds = machine?.wildCount ?? 0;
  const coins = machine?.coinCount ?? 0;
  const pt = machine?.playerType ?? "";
  const ptInfo = pt ? PLAYER_TYPE_PILL[pt] : null;

  // Alarm check
  const [alarmFired, setAlarmFired] = useState(false);
  useEffect(() => {
    if (!machine?.alarmAt) { setAlarmFired(false); return; }
    const check = () => {
      if (new Date(machine.alarmAt!).getTime() <= Date.now()) setAlarmFired(true);
      else setAlarmFired(false);
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [machine?.alarmAt]);

  return (
    <button
      onClick={onClick}
      style={style}
      className={`
        relative flex flex-col items-center justify-between rounded-lg border-2 p-1 text-center
        transition-all duration-150 hover:scale-105 hover:z-10 hover:shadow-lg cursor-pointer select-none
        ${STATUS_COLORS[status]}
        ${machine?.priority === 2 ? "ring-2 ring-red-500 ring-offset-1 ring-offset-background" : ""}
        ${machine?.priority === 1 ? "ring-1 ring-yellow-500 ring-offset-1 ring-offset-background" : ""}
        ${alarmFired ? "ring-2 ring-red-400 animate-pulse" : ""}
        ${compact ? "w-full h-14" : "w-full h-16 sm:h-20"}
      `}
      data-testid={`tile-machine-${gridId}`}
    >
      <span className="text-[10px] font-mono font-bold leading-none">{gridId}</span>
      <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
      {/* Player type pill */}
      {ptInfo && (
        <span className={`text-[7px] font-bold px-1 rounded-sm leading-tight ${ptInfo.bg} ${ptInfo.text} ${ptInfo.pulse ? "animate-pulse" : ""}`}>
          {ptInfo.abbr}
        </span>
      )}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {wilds > 0 && <span className="flex items-center gap-0.5 text-[8px] font-bold text-yellow-300"><Zap size={7} />{wilds}</span>}
        {coins > 0 && <span className="flex items-center gap-0.5 text-[8px] font-bold text-amber-300"><Coins size={7} />{coins}</span>}
        {hasSignal && apInfo && <span className="text-[7px] opacity-80">{AP_CATEGORY_ICON[apInfo.category]}</span>}
        {status === "played_by_me" && machine?.outcomeType === "won" && (machine?.outcomeAmount ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[8px] font-bold text-emerald-300"><TrendingUp size={7} />{machine!.outcomeAmount}</span>
        )}
        {status === "played_by_me" && machine?.outcomeType === "lost" && (machine?.outcomeAmount ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[8px] font-bold text-red-300"><TrendingDown size={7} />{machine!.outcomeAmount}</span>
        )}
        {alarmFired && <Bell size={7} className="text-red-400 animate-pulse" />}
      </div>
      {machine?.statusChangedAt && (
        <LiveTimer statusChangedAt={machine.statusChangedAt} status={status} />
      )}
      {editMode && onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1.5 -right-1.5 z-20 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500"
        >
          <X size={8} />
        </button>
      )}
    </button>
  );
}

// ── Sortable Machine Tile ─────────────────────────────────────────
function SortableMachineTile({ gridId, machine, onClick, editMode, onRemove }: {
  gridId: string; machine?: Machine; onClick: () => void;
  editMode?: boolean; onRemove?: () => void;
}) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: gridId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto",
    touchAction: "none",
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/tile">
      <div
        {...attributes}
        {...listeners}
        className="absolute top-0.5 right-0.5 z-20 opacity-0 group-hover/tile:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-primary transition-all"
        title="Drag to reorder"
      >
        <GripVertical size={8} />
      </div>
      <MachineTile gridId={gridId} machine={machine} onClick={onClick} editMode={editMode} onRemove={onRemove} />
    </div>
  );
}

// ── Cabinet content ───────────────────────────────────────────────
function CabinetContent({ cabinetId, machineIds, machineMap, onClickMachine, isDragging = false, cols = 2, onToggleOrientation, label, editMode, onRemoveMachine, onAddMachine, onRenameLabel, onDeleteCabinet }: {
  cabinetId: string;
  machineIds: string[];
  machineMap: Record<string, Machine>;
  onClickMachine: (id: string) => void;
  isDragging?: boolean;
  cols?: number;
  onToggleOrientation?: () => void;
  label: string;
  editMode?: boolean;
  onRemoveMachine?: (id: string) => void;
  onAddMachine?: () => void;
  onRenameLabel?: (newLabel: string) => void;
  onDeleteCabinet?: () => void;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelVal, setLabelVal] = useState(label);

  return (
    <div className={`
      relative border-2 rounded-xl p-1.5 flex flex-col gap-1
      border-border/40 bg-card/30
      ${isDragging ? "shadow-2xl ring-2 ring-primary/60 scale-105" : ""}
      transition-colors
    `}>
      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1">
        {editMode && !isDragging ? (
          editingLabel ? (
            <input
              autoFocus
              className="text-[8px] font-bold text-muted-foreground bg-background border border-border px-1 rounded w-16"
              value={labelVal}
              onChange={e => setLabelVal(e.target.value)}
              onBlur={() => { setEditingLabel(false); onRenameLabel?.(labelVal); }}
              onKeyDown={e => { if (e.key === "Enter") { setEditingLabel(false); onRenameLabel?.(labelVal); } }}
            />
          ) : (
            <span
              className="text-[8px] font-bold text-muted-foreground bg-background px-1 rounded cursor-pointer hover:text-primary"
              onClick={() => setEditingLabel(true)}
            >{label} ✎</span>
          )
        ) : (
          <span className="text-[8px] font-bold text-muted-foreground bg-background px-1 rounded">{label}</span>
        )}
      </div>
      {onToggleOrientation && !isDragging && (
        <button
          onClick={e => { e.stopPropagation(); onToggleOrientation(); }}
          className="absolute -top-2.5 right-1 z-10 flex items-center gap-0.5 px-1 py-0.5 rounded bg-background border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors text-[8px]"
          title={`Columns: ${cols} — click to cycle`}
          data-testid={`btn-orient-${cabinetId}`}
        >
          <span className="font-mono leading-none">{cols}</span>
        </button>
      )}
      {editMode && !isDragging && onDeleteCabinet && (
        <button
          onClick={onDeleteCabinet}
          className="absolute -top-2.5 -right-2 z-10 w-4 h-4 rounded-full bg-red-700 text-white flex items-center justify-center hover:bg-red-500"
          title="Delete cabinet"
        >
          <X size={8} />
        </button>
      )}
      <div className="gap-1 mt-1" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {machineIds.map(id => (
          <SortableMachineTile
            key={id}
            gridId={id}
            machine={machineMap[id]}
            onClick={isDragging ? () => {} : () => onClickMachine(id)}
            editMode={editMode}
            onRemove={editMode ? () => onRemoveMachine?.(id) : undefined}
          />
        ))}
        {editMode && !isDragging && onAddMachine && (
          <button
            onClick={onAddMachine}
            className="w-full h-16 rounded-lg border-2 border-dashed border-border/50 flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors text-[10px]"
          >
            <Plus size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Position map ──────────────────────────────────────────────────
type CabPos = { col: number; row: number };
type PosMap = Record<string, CabPos>;

const GRID_COLS = 4;

const DEFAULT_POSITIONS: PosMap = {
  A: { col: 0, row: 0 },
  B: { col: 1, row: 0 },
  C: { col: 3, row: 0 },
  D: { col: 0, row: 1 },
  E: { col: 1, row: 1 },
  F: { col: 3, row: 1 },
};

function parseSavedPositions(raw: string, cabIds: string[]): PosMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed);
      if (keys.length > 0 && "col" in (parsed[keys[0]] ?? {})) return parsed as PosMap;
    }
    if (Array.isArray(parsed) && parsed.length === cabIds.length) {
      const pos: PosMap = {};
      parsed.forEach((id: string, idx: number) => {
        pos[id] = { col: idx % GRID_COLS, row: Math.floor(idx / GRID_COLS) };
      });
      return pos;
    }
    return null;
  } catch { return null; }
}

function parseCabMachineOrder(raw: string | undefined): Record<string, string[]> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, string[]>; } catch { return {}; }
}

// ── Draggable cabinet (inter-cabinet positioning) ─────────────────
function DraggableCabinet({ cabinetId, machineIds, machineMap, onClickMachine, isDragOverlay = false, cols, onToggleOrientation, label, onSortEnd, editMode, onRemoveMachine, onAddMachine, onRenameLabel, onDeleteCabinet }: {
  cabinetId: string;
  machineIds: string[];
  machineMap: Record<string, Machine>;
  onClickMachine: (id: string) => void;
  isDragOverlay?: boolean;
  cols?: number;
  onToggleOrientation?: () => void;
  label: string;
  onSortEnd: (cabId: string, newOrder: string[]) => void;
  editMode?: boolean;
  onRemoveMachine?: (id: string) => void;
  onAddMachine?: () => void;
  onRenameLabel?: (newLabel: string) => void;
  onDeleteCabinet?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: cabinetId });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : "auto",
    touchAction: "none",
  };

  const sortSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  function handleSortEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = machineIds.indexOf(String(active.id));
    const newIdx = machineIds.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    onSortEnd(cabinetId, arrayMove(machineIds, oldIdx, newIdx));
  }

  return (
    <div
      ref={setNodeRef}
      style={isDragOverlay ? undefined : style}
      className="relative group"
    >
      <div
        {...attributes}
        {...listeners}
        className="
          absolute -top-3 left-1/2 -translate-x-1/2 z-10
          flex items-center gap-1 px-2 py-0.5 rounded-full
          bg-background border border-border
          cursor-grab active:cursor-grabbing
          text-muted-foreground hover:text-primary hover:border-primary/50
          transition-colors select-none
          opacity-0 group-hover:opacity-100
          text-[9px] font-medium
        "
        data-testid={`drag-handle-${cabinetId}`}
        title="Drag to reposition cabinet"
      >
        <GripVertical size={10} />
        drag
      </div>

      <DndContext
        sensors={sortSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSortEnd}
      >
        <SortableContext items={machineIds} strategy={rectSortingStrategy}>
          <CabinetContent
            cabinetId={cabinetId}
            machineIds={machineIds}
            machineMap={machineMap}
            onClickMachine={onClickMachine}
            isDragging={isDragOverlay}
            cols={cols}
            onToggleOrientation={isDragOverlay ? undefined : onToggleOrientation}
            label={label}
            editMode={editMode}
            onRemoveMachine={onRemoveMachine}
            onAddMachine={isDragOverlay ? undefined : onAddMachine}
            onRenameLabel={onRenameLabel}
            onDeleteCabinet={onDeleteCabinet}
          />
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ── Droppable grid cell ───────────────────────────────────────────
function GridCell({ cellId, occupied, isOver, children }: {
  cellId: string; occupied: boolean; isOver: boolean; children?: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: cellId });
  return (
    <div
      ref={setNodeRef}
      className={`
        relative pt-4 min-h-[168px] rounded-xl transition-all duration-150
        ${!occupied
          ? isOver
            ? "bg-primary/10 border-2 border-dashed border-primary/60 ring-1 ring-primary/30"
            : "bg-muted/10 border-2 border-dashed border-border/30 hover:border-border/60"
          : "border-2 border-transparent"
        }
      `}
      data-testid={`grid-cell-${cellId}`}
    >
      {children}
    </div>
  );
}

// ── Circular layouts ──────────────────────────────────────────────
const TILE_W = 72;
const TILE_H = 80;
const RADIUS = 140;
const CIRCLE_SIZE = (RADIUS + TILE_H) * 2;

const SMALL_TILE_W = 64;
const SMALL_TILE_H = 72;
const SMALL_RADIUS = 58;
const SMALL_CIRCLE_SIZE = (SMALL_RADIUS + SMALL_TILE_H) * 2 + 4;

function SmallCircularCabinet({ label, ids, machineMap, onClickMachine, color, editMode, onRemoveMachine, onAddMachine }: {
  label: string;
  ids: readonly string[];
  machineMap: Record<string, Machine>;
  onClickMachine: (id: string) => void;
  color: string;
  editMode?: boolean;
  onRemoveMachine?: (id: string) => void;
  onAddMachine?: () => void;
}) {
  const n = ids.length;
  const startAngle = -Math.PI / 2;

  return (
    <div className={`border-2 ${color}/40 rounded-xl p-2 bg-card/20 flex flex-col items-center`}>
      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1 text-center">{label}</p>
      <div className="relative" style={{ width: SMALL_CIRCLE_SIZE, height: SMALL_CIRCLE_SIZE }}>
        <svg className="absolute inset-0 pointer-events-none" width={SMALL_CIRCLE_SIZE} height={SMALL_CIRCLE_SIZE}>
          <circle cx={SMALL_CIRCLE_SIZE / 2} cy={SMALL_CIRCLE_SIZE / 2} r={SMALL_RADIUS}
            fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 5" className="text-border/40" />
          <text x={SMALL_CIRCLE_SIZE / 2} y={SMALL_CIRCLE_SIZE / 2 + 4} textAnchor="middle"
            className="fill-muted-foreground" fontSize="8" fontFamily="monospace" opacity="0.4">CAB C</text>
        </svg>
        {ids.map((id, i) => {
          const angle = startAngle + (2 * Math.PI * i) / n;
          const cx = SMALL_CIRCLE_SIZE / 2 + SMALL_RADIUS * Math.cos(angle);
          const cy = SMALL_CIRCLE_SIZE / 2 + SMALL_RADIUS * Math.sin(angle);
          return (
            <MachineTile
              key={id}
              gridId={id}
              machine={machineMap[id]}
              onClick={() => onClickMachine(id)}
              compact
              editMode={editMode}
              onRemove={editMode ? () => onRemoveMachine?.(id) : undefined}
              style={{
                position: "absolute",
                left: cx - SMALL_TILE_W / 2,
                top: cy - SMALL_TILE_H / 2,
                width: SMALL_TILE_W,
                height: SMALL_TILE_H,
              }}
            />
          );
        })}
      </div>
      {editMode && onAddMachine && (
        <button onClick={onAddMachine} className="mt-1 text-[9px] text-primary hover:underline">+ Add slot</button>
      )}
    </div>
  );
}

function CircularMachines({ ids, machineMap, onClickMachine, editMode, onRemoveMachine, onAddMachine }: {
  ids: string[];
  machineMap: Record<string, Machine>;
  onClickMachine: (id: string) => void;
  editMode?: boolean;
  onRemoveMachine?: (id: string) => void;
  onAddMachine?: () => void;
}) {
  const n = ids.length;
  const startAngle = -Math.PI / 2;

  return (
    <div className="flex justify-center flex-col items-center">
      <div className="relative" style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}>
        <svg className="absolute inset-0 pointer-events-none" width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
          <circle cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={RADIUS}
            fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" className="text-border/40" />
          <text x={CIRCLE_SIZE / 2} y={CIRCLE_SIZE / 2 + 5} textAnchor="middle"
            className="fill-muted-foreground" fontSize="10" fontFamily="monospace" opacity="0.4">CAROUSEL</text>
        </svg>
        {ids.map((id, i) => {
          const angle = startAngle + (2 * Math.PI * i) / n;
          const cx = CIRCLE_SIZE / 2 + RADIUS * Math.cos(angle);
          const cy = CIRCLE_SIZE / 2 + RADIUS * Math.sin(angle);
          return (
            <MachineTile
              key={id}
              gridId={id}
              machine={machineMap[id]}
              onClick={() => onClickMachine(id)}
              editMode={editMode}
              onRemove={editMode ? () => onRemoveMachine?.(id) : undefined}
              style={{
                position: "absolute",
                left: cx - TILE_W / 2,
                top: cy - TILE_H / 2,
                width: TILE_W,
                height: TILE_H,
              }}
            />
          );
        })}
      </div>
      {editMode && onAddMachine && (
        <button onClick={onAddMachine} className="mt-2 text-xs text-primary hover:underline">+ Add carousel slot</button>
      )}
    </div>
  );
}

// ── Machine editor sheet ──────────────────────────────────────────
function MachineEditor({ open, onClose, gridId, zone, sessionId, existing }: {
  open: boolean; onClose: () => void;
  gridId: string; zone: string; sessionId: number; existing?: Machine;
}) {
  const { toast } = useToast();
  const [status, setStatus]           = useState(existing?.status ?? "unplayed");
  const [apSignal, setApSignal]       = useState(existing?.apSignal ?? "none");
  const [wildCount, setWildCount]     = useState(existing?.wildCount ?? 0);
  const [coinCount, setCoinCount]     = useState(existing?.coinCount ?? 0);
  const [betLevel, setBetLevel]       = useState(existing?.betLevel ?? "");
  const [playerState, setPlayerState] = useState(existing?.playerState ?? "");
  const [priority, setPriority]       = useState(existing?.priority ?? 0);
  const [notes, setNotes]             = useState(existing?.notes ?? "");
  const [machineType, setMachineType] = useState(existing?.machineType ?? "Duo Fu Duo Cai Ingotcha");
  const [outcomeType, setOutcomeType] = useState<"won"|"lost"|"">(existing?.outcomeType as "won"|"lost"|"" ?? "");
  const [outcomeAmount, setOutcomeAmount] = useState<string>(existing?.outcomeAmount ? String(existing.outcomeAmount) : "");
  const [playerType, setPlayerType] = useState<string>(existing?.playerType ?? "");
  // Machine type search
  const [typeSearch, setTypeSearch] = useState("");
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const savedStatus = existing?.status ?? "unplayed";
  const elapsed = useElapsedTimer(existing?.statusChangedAt);

  const { data: machineTypes = [] } = useQuery<MachineType[]>({
    queryKey: ["/api/machine-types"],
  });

  const addTypeMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/machine-types", { name }).then(r => r.json()),
    onSuccess: (newType: MachineType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/machine-types"] });
      setMachineType(newType.name);
      setShowAddType(false);
      setNewTypeName("");
      toast({ title: `Added machine type: ${newType.name}` });
    },
    onError: () => toast({ title: "Type already exists", variant: "destructive" }),
  });

  useMemo(() => {
    setStatus(existing?.status ?? "unplayed");
    setApSignal(existing?.apSignal ?? "none");
    setWildCount(existing?.wildCount ?? 0);
    setCoinCount(existing?.coinCount ?? 0);
    setBetLevel(existing?.betLevel ?? "");
    setPlayerState(existing?.playerState ?? "");
    setPriority(existing?.priority ?? 0);
    setNotes(existing?.notes ?? "");
    setMachineType(existing?.machineType ?? "Duo Fu Duo Cai Ingotcha");
    setOutcomeType(existing?.outcomeType as "won"|"lost"|"" ?? "");
    setOutcomeAmount(existing?.outcomeAmount ? String(existing.outcomeAmount) : "");
    setPlayerType(existing?.playerType ?? "");
    setTypeSearch("");
    setShowAddType(false);
  }, [existing?.id, open]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const autoRules = computeAutoRules(status, status === "being_played" ? playerType : "");
      return apiRequest("PUT", `/api/sessions/${sessionId}/machines/upsert`, {
        machineNumber: gridId, zone, machineType, status, apSignal,
        wildCount, coinCount, betLevel, playerState,
        priority: autoRules.priority,
        alarmAt: autoRules.alarmAt,
        notes,
        outcomeType: status === "played_by_me" ? outcomeType : "",
        outcomeAmount: status === "played_by_me" ? (parseFloat(outcomeAmount) || 0) : 0,
        playerType: status === "being_played" ? playerType : "",
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "machines"] });
      toast({ title: `Machine ${gridId} saved` });
      onClose();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/machines/${existing!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "machines"] });
      toast({ title: `Machine ${gridId} cleared` });
      onClose();
    },
  });

  const filteredTypes = machineTypes.filter(t =>
    t.name.toLowerCase().includes(typeSearch.toLowerCase())
  );

  // Compute what auto-priority will be set to (for display)
  const autoRulesPreview = computeAutoRules(status, status === "being_played" ? playerType : "");

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-machine-editor">
        <SheetHeader className="pb-3">
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-primary">{gridId}</span>
            <span className="text-muted-foreground text-sm font-normal">— {zone}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {existing && existing.statusChangedAt && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <Clock size={14} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">{savedStatus === "unplayed" ? "Unplayed for" : "In current status"}</p>
                <p className="text-sm font-bold font-mono text-foreground leading-tight">{formatElapsed(elapsed)}</p>
              </div>
              <div className="flex items-center gap-2">
                {savedStatus === "played_by_me" && existing.outcomeType && existing.outcomeAmount > 0 && (
                  <span className={`text-xs font-bold font-mono ${
                    existing.outcomeType === "won" ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {existing.outcomeType === "won" ? "+" : "-"}{existing.outcomeAmount} HKD
                  </span>
                )}
                <div className="text-xs font-semibold px-2 py-0.5 rounded-full border border-border">
                  {getStatusInfo(savedStatus).label}
                </div>
              </div>
            </div>
          )}

          {/* Machine Type with search */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Machine Type</label>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Search types…"
                  value={typeSearch}
                  onChange={e => setTypeSearch(e.target.value)}
                  className="w-full bg-muted/20 pl-7 pr-3 py-1.5 text-xs focus:outline-none border-b border-border"
                />
              </div>
              <div className="max-h-32 overflow-y-auto">
                {filteredTypes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setMachineType(t.name); setTypeSearch(""); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors flex items-center justify-between ${
                      machineType === t.name ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {t.name}
                    {t.isCustom === 1 && <span className="text-[9px] text-primary/60 border border-primary/30 rounded px-1">custom</span>}
                  </button>
                ))}
                {filteredTypes.length === 0 && (
                  <p className="text-[10px] text-muted-foreground px-3 py-2">No types found</p>
                )}
              </div>
              {showAddType ? (
                <div className="border-t border-border flex gap-1 p-1">
                  <input
                    autoFocus
                    placeholder="New type name…"
                    value={newTypeName}
                    onChange={e => setNewTypeName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newTypeName.trim()) addTypeMutation.mutate(newTypeName.trim()); }}
                    className="flex-1 bg-transparent text-xs px-2 py-1 focus:outline-none"
                  />
                  <Button size="sm" className="h-6 text-[10px]" onClick={() => newTypeName.trim() && addTypeMutation.mutate(newTypeName.trim())} disabled={addTypeMutation.isPending}>Add</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowAddType(false)}>✕</Button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddType(true)}
                  className="w-full border-t border-border text-[10px] text-primary py-1.5 hover:bg-primary/5 transition-colors"
                >+ Add new type…</button>
              )}
            </div>
            {machineType && (
              <p className="text-[10px] text-muted-foreground mt-1">Selected: <span className="font-semibold text-foreground">{machineType}</span></p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Machine Status
              {status !== existing?.status && (
                <span className="ml-2 text-[10px] text-amber-400 normal-case font-normal">(timer resets on save)</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => {
                    setStatus(s.value);
                    if (s.value !== "being_played") setPlayerType("");
                    if (s.value !== "played_by_me") { setOutcomeType(""); setOutcomeAmount(""); }
                  }}
                  className={`
                    flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-all
                    ${status === s.value
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                    }
                  `}
                  data-testid={`btn-status-${s.value}`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[s.value]}`} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority preview (auto-computed) */}
          {(status === "being_played" || status === "running_out_of_money") && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Bell size={12} className="text-muted-foreground" />
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground">Auto priority</p>
                <p className="text-xs font-bold">
                  {autoRulesPreview.priority === 2 ? "🔥 High" : autoRulesPreview.priority === 1 ? "⚠ Watch" : "Normal"}
                  {autoRulesPreview.alarmAt && <span className="ml-2 text-orange-400 text-[10px]">+ 5min alarm</span>}
                </p>
              </div>
            </div>
          )}

          {/* Being Played prompt */}
          {status === "being_played" && (
            <div className="rounded-lg border border-blue-700/50 bg-blue-950/30 p-4 space-y-2">
              <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={12} /> Player Type
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {BEING_PLAYED_OPTIONS.map(opt => {
                  const ptInfo = PLAYER_TYPE_PILL[opt.value];
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setPlayerType(playerType === opt.value ? "" : opt.value)}
                      className={`rounded-md border px-2.5 py-2 text-xs font-medium transition-all text-left flex items-center gap-2 ${
                        playerType === opt.value
                          ? "bg-blue-600 border-blue-400 text-white"
                          : "border-border text-muted-foreground hover:border-blue-500 hover:text-blue-300"
                      }`}
                      data-testid={`btn-player-type-${opt.value}`}
                    >
                      {ptInfo && (
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${ptInfo.bg} ${ptInfo.text}`}>{ptInfo.abbr}</span>
                      )}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Outcome prompt */}
          {status === "played_by_me" && (
            <div className="rounded-lg border border-green-700/50 bg-green-950/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-green-300 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp size={12} /> Session Outcome
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setOutcomeType(outcomeType === "won" ? "" : "won")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-bold transition-all ${
                    outcomeType === "won"
                      ? "bg-emerald-600 border-emerald-400 text-white"
                      : "border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-300"
                  }`}
                  data-testid="btn-outcome-won"
                >
                  <TrendingUp size={12} /> Won
                </button>
                <button
                  onClick={() => setOutcomeType(outcomeType === "lost" ? "" : "lost")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-bold transition-all ${
                    outcomeType === "lost"
                      ? "bg-red-700 border-red-400 text-white"
                      : "border-border text-muted-foreground hover:border-red-500 hover:text-red-300"
                  }`}
                  data-testid="btn-outcome-lost"
                >
                  <TrendingDown size={12} /> Lost
                </button>
              </div>
              {outcomeType && (
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block mb-1">
                    Amount ({outcomeType === "won" ? "won" : "lost"})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">HKD</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={outcomeAmount}
                      onChange={e => setOutcomeAmount(e.target.value)}
                      className="w-full bg-background border border-border rounded-md pl-12 pr-3 py-2 text-sm font-mono font-bold text-right focus:outline-none focus:ring-1 focus:ring-primary"
                      data-testid="input-outcome-amount"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <Separator />

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">AP Signal Observed</label>
            <Select value={apSignal} onValueChange={setApSignal}>
              <SelectTrigger data-testid="select-ap-signal"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {AP_SIGNAL_OPTIONS.map(a => (
                  <SelectItem key={a.value} value={a.value}>
                    <span className="flex items-center gap-2">{AP_CATEGORY_ICON[a.category]}{a.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                <span className="flex items-center gap-1"><Zap size={11} className="text-yellow-400" /> Sticky Wilds</span>
              </label>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setWildCount(Math.max(0, wildCount - 1))} data-testid="btn-wild-minus"><Minus size={12} /></Button>
                <span className="text-xl font-bold font-mono w-8 text-center text-yellow-400">{wildCount}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setWildCount(Math.min(6, wildCount + 1))} data-testid="btn-wild-plus"><Plus size={12} /></Button>
              </div>
              {wildCount === 5 && <p className="text-[10px] text-red-400 mt-1 font-semibold animate-pulse">⚡ 1 away from Bei Bei Gao!</p>}
              {wildCount === 6 && <p className="text-[10px] text-red-400 mt-1 font-semibold animate-pulse">🔥 Bei Bei Gao triggered!</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                <span className="flex items-center gap-1"><Coins size={11} className="text-amber-400" /> Coins on Board</span>
              </label>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCoinCount(Math.max(0, coinCount - 1))} data-testid="btn-coin-minus"><Minus size={12} /></Button>
                <span className="text-xl font-bold font-mono w-8 text-center text-amber-400">{coinCount}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCoinCount(coinCount + 1)} data-testid="btn-coin-plus"><Plus size={12} /></Button>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Last Known Bet Level</label>
            <Select value={betLevel || "unknown"} onValueChange={v => setBetLevel(v === "unknown" ? "" : v)}>
              <SelectTrigger data-testid="select-bet-level"><SelectValue placeholder="Unknown" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">Unknown</SelectItem>
                {["28","38","68","88","100"].map(v => <SelectItem key={v} value={v}>{v} credits</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Player Observation</label>
            <Input placeholder="e.g. Low on credits, changed bet from 100→28" value={playerState} onChange={e => setPlayerState(e.target.value)} data-testid="input-player-state" />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Notes</label>
            <Textarea placeholder="Any other observations…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="input-notes" />
          </div>

          <div className="flex gap-2 pt-2">
            {existing && (
              <Button
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="btn-clear-machine"
              >Clear</Button>
            )}
            <Button className="flex-1" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="btn-save-machine">
              {saveMutation.isPending ? "Saving…" : <><Check size={14} className="mr-1" /> Save</>}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────
function StatsBar({ machines }: { machines: Machine[] }) {
  const { counts, netPnL, playedCount } = useMemo(() => {
    const c: Record<string, number> = {};
    let net = 0;
    let played = 0;
    for (const m of machines) {
      c[m.status] = (c[m.status] ?? 0) + 1;
      if (m.status === "played_by_me") {
        played++;
        const amt = m.outcomeAmount ?? 0;
        if (m.outcomeType === "won") net += amt;
        else if (m.outcomeType === "lost") net -= amt;
      }
    }
    return { counts: c, netPnL: net, playedCount: played };
  }, [machines]);
  return (
    <div className="flex items-center gap-3 text-xs overflow-x-auto no-scrollbar py-1">
      <span className="text-muted-foreground shrink-0">{machines.length} tagged</span>
      {(counts["being_played"] ?? 0) > 0 && <Badge variant="outline" className="border-blue-400 text-blue-300 shrink-0">{counts["being_played"]} active</Badge>}
      {playedCount > 0 && (
        <Badge variant="outline" className={`shrink-0 ${
          netPnL > 0 ? "border-emerald-500 text-emerald-300" :
          netPnL < 0 ? "border-red-500 text-red-300" :
          "border-green-600 text-green-400"
        }`}>
          {playedCount} played{netPnL !== 0 ? ` · ${netPnL > 0 ? "+" : ""}${netPnL} HKD` : ""}
        </Badge>
      )}
    </div>
  );
}

// ── Break Modal ───────────────────────────────────────────────────
function BreakModal({ onStart, onClose }: {
  onStart: (type: BreakType) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-[300px] shadow-2xl space-y-4">
        <div>
          <h2 className="text-sm font-bold">Taking a Break?</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Select the type of break</p>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => onStart("smoke")}
            className="flex items-center gap-3 w-full border border-border rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted/40 hover:border-amber-500/60 transition-all"
            data-testid="btn-break-smoke">
            <CircleDot size={16} className="text-amber-400" /> 🚬 Smoke Break
          </button>
          <button onClick={() => onStart("food")}
            className="flex items-center gap-3 w-full border border-border rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted/40 hover:border-emerald-500/60 transition-all"
            data-testid="btn-break-food">
            <Utensils size={16} className="text-emerald-400" /> 🍽 Food Break
          </button>
          <button onClick={() => onStart("other")}
            className="flex items-center gap-3 w-full border border-border rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted/40 hover:border-violet-500/60 transition-all"
            data-testid="btn-break-other">
            <Pause size={16} className="text-violet-400" /> Other
          </button>
        </div>
        <button onClick={onClose} className="w-full border border-border rounded-lg py-2 text-xs text-muted-foreground hover:bg-muted/40">Cancel</button>
      </div>
    </div>
  );
}

// ── Session timer ─────────────────────────────────────────────────
function SessionTimer({ startedAt }: { startedAt?: string }) {
  const elapsed = useElapsedTimer(startedAt);
  if (!startedAt) return null;
  return (
    <span className="flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground">
      <Clock size={9} />
      {formatElapsed(elapsed)}
    </span>
  );
}

// ── Break elapsed ─────────────────────────────────────────────────
function BreakElapsed({ startedAt }: { startedAt: string }) {
  const elapsed = useElapsedTimer(startedAt);
  return <span className="text-[10px] font-mono text-amber-300 ml-1">({formatElapsed(elapsed)})</span>;
}

// ── Sortable Cabinet (for zone grid) ─────────────────────────────
type CabinetDef = { id: string; label: string; ids: readonly string[]; row: number; col: number; circular?: boolean };

function SortableCabinet({ cab, machineMap, onClickMachine, color, cols, onToggleOrientation, cabMachineOrder, onSortEnd, shouldShow, editMode, onRemoveMachine, onAddMachine, onRenameLabel, onDeleteCabinet }: {
  cab: CabinetDef;
  machineMap: Record<string, Machine>;
  onClickMachine: (id: string) => void;
  color: string;
  cols: number;
  onToggleOrientation: () => void;
  cabMachineOrder: Record<string, string[]>;
  onSortEnd: (cabId: string, newOrder: string[]) => void;
  shouldShow: (id: string) => boolean;
  editMode?: boolean;
  onRemoveMachine?: (id: string) => void;
  onAddMachine?: () => void;
  onRenameLabel?: (newLabel: string) => void;
  onDeleteCabinet?: () => void;
}) {
  const machineIds = cabMachineOrder[cab.id] ?? [...cab.ids];
  const visIds = [...cab.ids].filter(shouldShow);
  const visibleMachineIds = editMode ? machineIds : machineIds.filter(id => visIds.includes(id));

  const sortSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  function handleSortEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = machineIds.indexOf(String(active.id));
    const newIdx = machineIds.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    onSortEnd(cab.id, arrayMove(machineIds, oldIdx, newIdx));
  }

  return (
    <div
      style={{ gridColumn: cab.col + 1, gridRow: cab.row + 1 }}
      className={`relative border-2 ${color}/40 rounded-xl p-2 bg-card/20`}
    >
      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 text-center">{cab.label}</p>
      <button
        onClick={onToggleOrientation}
        className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded bg-background border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors text-[8px]"
        title={`Columns: ${cols} — click to cycle`}
        data-testid={`btn-orient-${cab.id}`}
      >
        <span className="font-mono leading-none">{cols}</span>
      </button>
      {editMode && onDeleteCabinet && (
        <button onClick={onDeleteCabinet}
          className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-red-700 text-white flex items-center justify-center hover:bg-red-500"
          title="Delete cabinet">
          <X size={8} />
        </button>
      )}
      <DndContext sensors={sortSensors} collisionDetection={closestCenter} onDragEnd={handleSortEnd}>
        <SortableContext items={machineIds} strategy={rectSortingStrategy}>
          <div className="gap-1" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {visibleMachineIds.map(id => (
              <SortableMachineTile
                key={id}
                gridId={id}
                machine={machineMap[id]}
                onClick={() => onClickMachine(id)}
                editMode={editMode}
                onRemove={editMode ? () => onRemoveMachine?.(id) : undefined}
              />
            ))}
            {editMode && onAddMachine && (
              <button onClick={onAddMachine}
                className="w-full h-16 rounded-lg border-2 border-dashed border-border/50 flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                <Plus size={12} />
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ── Cabinet Zone Section ──────────────────────────────────────────
function CabinetZoneSection({
  zone, cabinets, machineMap, onClickMachine, sessionId, shouldShow, color,
  circularCabId, cabMachineOrder, onSortEnd, editMode, layoutId,
  onRemoveMachine, onAddMachine, onRenameZone, onRenameCabinet, onDeleteCabinet, onAddCabinet,
}: {
  zone: string;
  cabinets: CabinetDef[];
  machineMap: Record<string, Machine>;
  onClickMachine: (id: string) => void;
  sessionId: number;
  shouldShow: (id: string) => boolean;
  color: string;
  circularCabId?: string;
  cabMachineOrder: Record<string, string[]>;
  onSortEnd: (cabId: string, newOrder: string[]) => void;
  editMode?: boolean;
  layoutId?: number;
  onRemoveMachine?: (cabId: string, machineId: string) => void;
  onAddMachine?: (cabId: string) => void;
  onRenameZone?: (newName: string) => void;
  onRenameCabinet?: (cabId: string, newLabel: string) => void;
  onDeleteCabinet?: (cabId: string) => void;
  onAddCabinet?: () => void;
}) {
  const allIds = cabinets.flatMap(c => [...c.ids]);
  const visibleCount = editMode ? allIds.length : allIds.filter(shouldShow).length;

  const [cabOrientations, setCabOrientations] = useState<Record<string, number>>({});
  const toggleOrientation = useCallback((cabId: string) => {
    setCabOrientations(prev => { const cur = prev[cabId] ?? 2; return { ...prev, [cabId]: cur >= 3 ? 1 : cur + 1 }; });
  }, []);

  const [editingZoneName, setEditingZoneName] = useState(false);
  const [zoneNameVal, setZoneNameVal] = useState(zone);

  const maxRow = Math.max(...cabinets.map(c => c.row), 0);
  const maxCol = Math.max(...cabinets.map(c => c.col), 0);

  return (
    <section data-testid={`zone-section-${zone}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className={`h-4 w-1 rounded-full ${color.replace("border-","bg-")}`} />
        {editMode && !editingZoneName ? (
          <h2
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-primary"
            onClick={() => setEditingZoneName(true)}
          >{zone} ✎</h2>
        ) : editMode && editingZoneName ? (
          <input
            autoFocus
            className="text-xs font-semibold bg-background border border-border rounded px-1"
            value={zoneNameVal}
            onChange={e => setZoneNameVal(e.target.value)}
            onBlur={() => { setEditingZoneName(false); onRenameZone?.(zoneNameVal); }}
            onKeyDown={e => { if (e.key === "Enter") { setEditingZoneName(false); onRenameZone?.(zoneNameVal); } }}
          />
        ) : (
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{zone}</h2>
        )}
        <span className="text-[10px] text-muted-foreground">({visibleCount} machines)</span>
        {editMode && onAddCabinet && (
          <button onClick={onAddCabinet} className="text-[10px] text-primary hover:underline ml-1">+ Cabinet</button>
        )}
        <div className="ml-auto">
          <BulkStatusButton sessionId={sessionId} machines={allIds} zone={zone} onDone={() => {}} />
        </div>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${maxCol + 1}, 1fr)`, gridTemplateRows: `repeat(${maxRow + 1}, auto)` }}
      >
        {cabinets.map(cab => {
          const visIds = [...cab.ids].filter(shouldShow);
          if (!editMode && visIds.length === 0) return null;

          if (cab.circular || cab.id === circularCabId) {
            return (
              <div
                key={cab.id}
                style={{ gridColumn: cab.col + 1, gridRow: cab.row + 1 }}
                className="flex justify-center"
              >
                <SmallCircularCabinet
                  label={cab.label}
                  ids={cab.ids}
                  machineMap={machineMap}
                  onClickMachine={onClickMachine}
                  color={color}
                  editMode={editMode}
                  onRemoveMachine={editMode ? (id) => onRemoveMachine?.(cab.id, id) : undefined}
                  onAddMachine={editMode ? () => onAddMachine?.(cab.id) : undefined}
                />
              </div>
            );
          }

          return (
            <SortableCabinet
              key={cab.id}
              cab={cab}
              machineMap={machineMap}
              onClickMachine={onClickMachine}
              color={color}
              cols={cabOrientations[cab.id] ?? 2}
              onToggleOrientation={() => toggleOrientation(cab.id)}
              cabMachineOrder={cabMachineOrder}
              onSortEnd={onSortEnd}
              shouldShow={shouldShow}
              editMode={editMode}
              onRemoveMachine={editMode ? (id) => onRemoveMachine?.(cab.id, id) : undefined}
              onAddMachine={editMode ? () => onAddMachine?.(cab.id) : undefined}
              onRenameLabel={editMode ? (newLabel) => onRenameCabinet?.(cab.id, newLabel) : undefined}
              onDeleteCabinet={editMode ? () => onDeleteCabinet?.(cab.id) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

// ── Carousel Section ──────────────────────────────────────────────
function CarouselSection({
  carouselCabinets, arcMachines, machineMap, onClickMachine, sessionId, savedCabinetOrder, cabMachineOrder, onSortEnd,
  editMode, onRemoveMachine, onAddMachine, onRenameLabel, onDeleteCabinet,
}: {
  carouselCabinets: CabinetDef[];
  arcMachines: string[];
  machineMap: Record<string, Machine>;
  onClickMachine: (id: string) => void;
  sessionId: number;
  savedCabinetOrder: string;
  cabMachineOrder: Record<string, string[]>;
  onSortEnd: (cabId: string, newOrder: string[]) => void;
  editMode?: boolean;
  onRemoveMachine?: (cabId: string, machineId: string) => void;
  onAddMachine?: (cabId: string) => void;
  onRenameLabel?: (cabId: string, newLabel: string) => void;
  onDeleteCabinet?: (cabId: string) => void;
}) {
  const { toast } = useToast();
  const carouselIds = carouselCabinets.map(c => c.id);
  const defaultPositions: PosMap = {};
  carouselCabinets.forEach(c => { defaultPositions[c.id] = { col: c.col, row: c.row }; });

  const [positions, setPositions] = useState<PosMap>(() =>
    parseSavedPositions(savedCabinetOrder, carouselIds) ?? defaultPositions
  );

  const [cabOrientations, setCabOrientations] = useState<Record<string, number>>({});
  const toggleOrientation = useCallback((cabId: string) => {
    setCabOrientations(prev => { const cur = prev[cabId] ?? 2; return { ...prev, [cabId]: cur >= 3 ? 1 : cur + 1 }; });
  }, []);

  useEffect(() => {
    const parsed = parseSavedPositions(savedCabinetOrder, carouselIds);
    if (parsed) setPositions(parsed);
  }, [savedCabinetOrder]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overCellId, setOverCellId] = useState<string | null>(null);

  const savePositionsMutation = useMutation({
    mutationFn: (pos: PosMap) =>
      apiRequest("PUT", `/api/sessions/${sessionId}/cabinet-order`, { positions: pos }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
    },
    onError: () => toast({ title: "Failed to save layout", variant: "destructive" }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => setActiveDragId(String(event.active.id)), []);
  const handleDragOver  = useCallback((event: DragOverEvent) => setOverCellId(event.over ? String(event.over.id) : null), []);
  const handleDragEnd   = useCallback((event: DragEndEvent) => {
    const draggedId = String(event.active.id);
    setActiveDragId(null);
    setOverCellId(null);
    if (!event.over) return;
    const overId = String(event.over.id);
    setPositions(prev => {
      const next = { ...prev };
      let targetPos: CabPos;
      if (overId.includes(":")) {
        const [col, row] = overId.split(":").map(Number);
        targetPos = { col, row };
      } else {
        const targetCabPos = prev[overId];
        if (!targetCabPos) return prev;
        targetPos = targetCabPos;
        next[overId] = prev[draggedId];
      }
      next[draggedId] = targetPos;
      savePositionsMutation.mutate(next);
      return next;
    });
  }, [savePositionsMutation]);

  const maxRow = Math.max(...Object.values(positions).map(p => p.row), 1);
  const rows = maxRow + 1;

  const cellToCab = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(positions).forEach(([cabId, pos]) => {
      map[`${pos.col}:${pos.row}`] = cabId;
    });
    return map;
  }, [positions]);

  const allCarouselIds = carouselCabinets.flatMap(c => [...c.ids]);

  return (
    <section data-testid="zone-section-Pared/Carousel">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-4 w-1 rounded-full bg-amber-500" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pared / Carousel</h2>
        <span className="text-[10px] text-muted-foreground">({allCarouselIds.length + arcMachines.length} machines)</span>
        <span className="text-[9px] text-muted-foreground/60 flex items-center gap-1 ml-1">
          <GripVertical size={9} /> drag cabinets · drag machines inside
        </span>
        <div className="ml-auto flex items-center gap-2">
          <BulkStatusButton
            sessionId={sessionId}
            machines={[...allCarouselIds, ...arcMachines]}
            zone="Pared/Carousel"
            onDone={() => {}}
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-6 pb-2" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}>
          {Array.from({ length: rows * GRID_COLS }).map((_, idx) => {
            const col = idx % GRID_COLS;
            const row = Math.floor(idx / GRID_COLS);
            const cellKey = `${col}:${row}`;
            const cabId = cellToCab[cellKey];
            const cabDef = carouselCabinets.find(c => c.id === cabId);
            const machineIds = cabId ? (cabMachineOrder[cabId] ?? [...(cabDef?.ids ?? [])]) : [];
            return (
              <GridCell key={cellKey} cellId={cabId ?? cellKey} occupied={!!cabId} isOver={overCellId === (cabId ?? cellKey)}>
                {cabId && cabDef && (
                  <DraggableCabinet
                    cabinetId={cabId}
                    machineIds={machineIds}
                    machineMap={machineMap}
                    onClickMachine={onClickMachine}
                    cols={cabOrientations[cabId] ?? 2}
                    onToggleOrientation={() => toggleOrientation(cabId)}
                    label={cabDef.label}
                    onSortEnd={onSortEnd}
                    editMode={editMode}
                    onRemoveMachine={editMode ? (id) => onRemoveMachine?.(cabId, id) : undefined}
                    onAddMachine={editMode ? () => onAddMachine?.(cabId) : undefined}
                    onRenameLabel={editMode ? (newLabel) => onRenameLabel?.(cabId, newLabel) : undefined}
                    onDeleteCabinet={editMode ? () => onDeleteCabinet?.(cabId) : undefined}
                  />
                )}
              </GridCell>
            );
          })}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
          {activeDragId ? (() => {
            const cabDef = carouselCabinets.find(c => c.id === activeDragId);
            const machineIds = cabMachineOrder[activeDragId] ?? [...(cabDef?.ids ?? [])];
            return (
              <DraggableCabinet
                cabinetId={activeDragId}
                machineIds={machineIds}
                machineMap={machineMap}
                onClickMachine={() => {}}
                isDragOverlay
                cols={cabOrientations[activeDragId] ?? 2}
                label={cabDef?.label ?? activeDragId}
                onSortEnd={() => {}}
              />
            );
          })() : null}
        </DragOverlay>
      </DndContext>

      {arcMachines.length > 0 && (
        <div className="mt-8">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-4 ml-1">Carousel</p>
          <CircularMachines
            ids={arcMachines}
            machineMap={machineMap}
            onClickMachine={onClickMachine}
            editMode={editMode}
            onRemoveMachine={editMode ? (id) => onRemoveMachine?.("ARC", id) : undefined}
            onAddMachine={editMode ? () => onAddMachine?.("ARC") : undefined}
          />
        </div>
      )}
    </section>
  );
}

// ── Session Report ────────────────────────────────────────────────
function SessionReport({ session, machines, breaks, onClose }: {
  session?: Session; machines: Machine[]; breaks: BreakEntry[]; onClose: () => void;
}) {
  const played = machines.filter(m => m.status === "played_by_me");
  const totalWon  = played.filter(m => m.outcomeType === "won").reduce((s, m) => s + (m.outcomeAmount ?? 0), 0);
  const totalLost = played.filter(m => m.outcomeType === "lost").reduce((s, m) => s + (m.outcomeAmount ?? 0), 0);
  const net = totalWon - totalLost;
  const startAmt = session?.startingAmount ?? 0;
  const finishAmt = session?.finishedAmount ?? 0;
  const cashNet = finishAmt > 0 ? finishAmt - startAmt : null;
  const checked   = machines.filter(m => m.status === "checked").length;
  const beingPlayed = machines.filter(m => m.status === "being_played").length;
  const outOfService = machines.filter(m => m.status === "out_of_service").length;
  const outOfPaper = machines.filter(m => m.status === "out_of_paper").length;
  const runningOut = machines.filter(m => m.status === "running_out_of_money").length;

  const startedAt = session?.startedAt ?? "";
  const endedAt = session?.endedAt ?? "";
  let sessionDuration: string | null = null;
  if (startedAt) {
    const end = endedAt ? new Date(endedAt) : new Date();
    const secs = Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000);
    sessionDuration = formatElapsed(secs);
  }

  const totalBreakSecs = breaks.reduce((total, b) => {
    const end = b.endedAt ? new Date(b.endedAt) : new Date();
    return total + Math.floor((end.getTime() - new Date(b.startedAt).getTime()) / 1000);
  }, 0);

  const ptCounts: Record<string, number> = {};
  machines.filter(m => m.status === "being_played" && m.playerType).forEach(m => {
    ptCounts[m.playerType!] = (ptCounts[m.playerType!] ?? 0) + 1;
  });

  const sigCounts: Record<string, number> = {};
  machines.filter(m => m.apSignal && m.apSignal !== "none").forEach(m => {
    sigCounts[m.apSignal] = (sigCounts[m.apSignal] ?? 0) + 1;
  });

  const BEING_PLAYED_LABEL: Record<string, string> = Object.fromEntries(BEING_PLAYED_OPTIONS.map(o => [o.value, o.label]));
  const AP_SIGNAL_LABEL: Record<string, string> = Object.fromEntries(AP_SIGNAL_OPTIONS.map(o => [o.value, o.label]));

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2"><FileText size={16} /> Session Report</SheetTitle>
          {session && <p className="text-xs text-muted-foreground">{session.name} · {session.date}</p>}
        </SheetHeader>

        <div className="space-y-5">
          {startedAt && (
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Session Timing</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[9px] text-muted-foreground">Started</p>
                  <p className="text-xs font-bold font-mono">{new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="border-x border-border">
                  <p className="text-[9px] text-muted-foreground">Duration</p>
                  <p className="text-xs font-bold font-mono text-primary">{sessionDuration}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">{endedAt ? "Ended" : "Active"}</p>
                  <p className="text-xs font-bold font-mono">
                    {endedAt ? new Date(endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </p>
                </div>
              </div>
              {breaks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[9px] text-muted-foreground mb-2">Breaks ({breaks.length} · {formatElapsed(totalBreakSecs)} total)</p>
                  <div className="space-y-1">
                    {breaks.map((b, i) => {
                      const dur = Math.floor(((b.endedAt ? new Date(b.endedAt) : new Date()).getTime() - new Date(b.startedAt).getTime()) / 1000);
                      return (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground capitalize">
                            {b.type === "smoke" ? "🚬" : b.type === "food" ? "🍽" : "⏸"} {b.type}
                          </span>
                          <span className="font-mono text-[10px]">{new Date(b.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="font-bold text-amber-400">{formatElapsed(dur)}</span>
                          {!b.endedAt && <span className="text-[9px] text-amber-400 animate-pulse ml-1">active</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {startAmt > 0 && (
            <div className={`rounded-xl border p-4 ${
              cashNet === null ? "border-border bg-card/40" :
              cashNet >= 0 ? "border-emerald-700/60 bg-emerald-950/30" : "border-red-700/60 bg-red-950/30"
            }`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Cash Result</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground">Started</p>
                  <p className="text-lg font-bold">{startAmt}</p>
                  <p className="text-[9px] text-muted-foreground">HKD</p>
                </div>
                <div className="text-center border-x border-border">
                  <p className="text-[9px] text-muted-foreground">Finished</p>
                  <p className={`text-lg font-bold ${finishAmt > 0 ? "" : "text-muted-foreground"}`}>{finishAmt > 0 ? finishAmt : "—"}</p>
                  <p className="text-[9px] text-muted-foreground">HKD</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground">Net</p>
                  <p className={`text-lg font-bold ${
                    cashNet === null ? "text-muted-foreground" :
                    cashNet >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>{cashNet === null ? "—" : `${cashNet >= 0 ? "+" : ""}${cashNet}`}</p>
                  <p className="text-[9px] text-muted-foreground">HKD</p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Machine P&amp;L</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center"><p className="text-[9px] text-muted-foreground">Won</p><p className="text-lg font-bold text-emerald-400">+{totalWon}</p><p className="text-[9px] text-muted-foreground">HKD</p></div>
              <div className="text-center border-x border-border"><p className="text-[9px] text-muted-foreground">Lost</p><p className="text-lg font-bold text-red-400">-{totalLost}</p><p className="text-[9px] text-muted-foreground">HKD</p></div>
              <div className="text-center"><p className="text-[9px] text-muted-foreground">Net</p><p className={`text-lg font-bold ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{net >= 0 ? "+" : ""}{net}</p><p className="text-[9px] text-muted-foreground">HKD</p></div>
            </div>
          </div>

          {played.length > 0 && (
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Machines Played ({played.length})</p>
              <div className="space-y-1.5">
                {played.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold">{m.machineNumber}</span>
                    <span className="text-muted-foreground text-[10px]">{m.zone}</span>
                    <span className={`font-bold font-mono ${
                      m.outcomeType === "won" ? "text-emerald-400" : m.outcomeType === "lost" ? "text-red-400" : "text-muted-foreground"
                    }`}>
                      {m.outcomeType === "won" ? "+" : m.outcomeType === "lost" ? "-" : ""}{m.outcomeAmount > 0 ? m.outcomeAmount + " HKD" : "No amount"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Activity Summary</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Machines tracked</span><span className="font-bold">{machines.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Played by me</span><span className="font-bold text-green-400">{played.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Checked / nothing</span><span className="font-bold text-teal-400">{checked}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Being played</span><span className="font-bold text-blue-400">{beingPlayed}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Out of service</span><span className="font-bold text-rose-400">{outOfService}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Out of paper</span><span className="font-bold text-purple-400">{outOfPaper}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Running out $</span><span className="font-bold text-orange-400">{runningOut}</span></div>
            </div>
          </div>

          {Object.keys(ptCounts).length > 0 && (
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Player Types Observed</p>
              <div className="space-y-1">
                {Object.entries(ptCounts).sort((a,b) => b[1]-a[1]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{BEING_PLAYED_LABEL[k] ?? k}</span>
                    <span className="font-bold">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(sigCounts).length > 0 && (
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">AP Signals Observed</p>
              <div className="space-y-1">
                {Object.entries(sigCounts).sort((a,b) => b[1]-a[1]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{AP_SIGNAL_LABEL[k] ?? k}</span>
                    <span className="font-bold">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {machines.filter(m => m.notes).length > 0 && (
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Notes</p>
              <div className="space-y-2">
                {machines.filter(m => m.notes).map(m => (
                  <div key={m.id} className="text-xs">
                    <span className="font-mono font-bold text-primary">{m.machineNumber}</span>
                    <span className="text-muted-foreground ml-2">{m.notes}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Helpers to convert DB layout to CabinetDef arrays ────────────
function parseZonesConfig(raw: string): ZoneConfig[] {
  try { return JSON.parse(raw) as ZoneConfig[]; } catch { return []; }
}

function zoneConfigToCabinetDefs(zone: ZoneConfig): CabinetDef[] {
  return zone.cabinets.map(c => ({
    id: c.id,
    label: c.label,
    ids: c.machineIds as readonly string[],
    row: c.row,
    col: c.col,
    circular: c.circular,
  }));
}

// ── Alarm polling: fires toast when alarmAt reached ───────────────
function useAlarmToast(machines: Machine[], toast: ReturnType<typeof useToast>["toast"]) {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const m of machines) {
        if (!m.alarmAt || m.priority !== 2) continue;
        const alarmTime = new Date(m.alarmAt).getTime();
        if (alarmTime <= now && !firedRef.current.has(m.id)) {
          firedRef.current.add(m.id);
          toast({
            title: `🔔 Alarm: ${m.machineNumber}`,
            description: `High priority machine — check it now! (${m.zone})`,
          });
          // Reset alarm for next 5 minutes
          setTimeout(() => { firedRef.current.delete(m.id); }, 5 * 60 * 1000);
        }
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [machines, toast]);
}

// ── Main page ─────────────────────────────────────────────────────
export default function FloorMap() {
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);
  const { dark, toggle } = useTheme();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedGrid, setSelectedGrid] = useState<{ id: string; zone: string } | null>(null);
  const [activeZone, setActiveZone] = useState<string>("all");
  const [showStartModal, setShowStartModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [startInput, setStartInput] = useState("");
  const [finishInput, setFinishInput] = useState("");
  const [amountPromptShown, setAmountPromptShown] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [cabMachineOrder, setCabMachineOrder] = useState<Record<string, string[]>>({});
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useAlarmToast([], toast); // Will be connected after machines load

  const { data: session } = useQuery<Session>({
    queryKey: ["/api/sessions", sessionId],
    queryFn: () => apiRequest("GET", `/api/sessions/${sessionId}`).then(r => r.json()),
  });

  const { data: machines = [], isLoading } = useQuery<Machine[]>({
    queryKey: ["/api/sessions", sessionId, "machines"],
    queryFn: () => apiRequest("GET", `/api/sessions/${sessionId}/machines`).then(r => r.json()),
    refetchInterval: 30000,
  });

  // Use alarm polling with actual machines
  useAlarmToast(machines, toast);

  const layoutId = session?.layoutId ?? 1;
  const { data: layout } = useQuery<Layout>({
    queryKey: ["/api/layouts", layoutId],
    queryFn: () => apiRequest("GET", `/api/layouts/${layoutId}`).then(r => r.json()),
    enabled: !!session,
  });

  // Parse zones from layout
  const zonesConfig = useMemo(() => {
    if (!layout) return [];
    return parseZonesConfig(layout.zonesConfig);
  }, [layout?.zonesConfig]);

  const machineMap = useMemo(() => {
    const m: Record<string, Machine> = {};
    for (const machine of machines) m[machine.machineNumber] = machine;
    return m;
  }, [machines]);

  // Load saved cab machine order from session
  useEffect(() => {
    if (session?.cabMachineOrder) {
      const parsed = parseCabMachineOrder(session.cabMachineOrder);
      if (Object.keys(parsed).length > 0) setCabMachineOrder(parsed);
    }
  }, [session?.id]);

  // SSE subscription
  useEffect(() => {
    if (!sessionId) return;
    const url = `/__PORT_5000__/api/sessions/${sessionId}/events`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "machine_update" && data.machine) {
          queryClient.setQueryData<Machine[]>(
            ["/api/sessions", sessionId, "machines"],
            (old = []) => {
              const idx = old.findIndex(m => m.id === data.machine.id);
              if (idx >= 0) {
                const next = [...old];
                next[idx] = data.machine;
                return next;
              }
              return [...old, data.machine];
            }
          );
        } else if (data.type === "machine_deleted") {
          queryClient.setQueryData<Machine[]>(
            ["/api/sessions", sessionId, "machines"],
            (old = []) => old.filter(m => m.id !== data.machineId)
          );
        } else if (data.type === "session_update" && data.session) {
          queryClient.setQueryData(["/api/sessions", sessionId], data.session);
        }
      } catch (_) {}
    };
    es.onerror = () => {
      // SSE will auto-reconnect
    };
    return () => es.close();
  }, [sessionId]);

  const updateSessionMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/sessions/${sessionId}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId] });
    },
  });

  // Auto-set startedAt when session loads (if not set)
  useEffect(() => {
    if (session && !session.startedAt) {
      updateSessionMutation.mutate({ startedAt: new Date().toISOString() });
    }
  }, [session?.id]);

  // Auto-prompt starting amount once session loads and has none set
  useEffect(() => {
    if (session && !amountPromptShown && (session.startingAmount ?? 0) === 0) {
      setAmountPromptShown(true);
      setShowStartModal(true);
    }
  }, [session?.id]);

  const breaks = useMemo(() => parseBreaks(session?.breaks), [session?.breaks]);
  const activeBreak = breaks.find(b => !b.endedAt) ?? null;

  function startBreak(type: BreakType) {
    const newBreak: BreakEntry = { type, startedAt: new Date().toISOString(), endedAt: null };
    const newBreaks = [...breaks, newBreak];
    updateSessionMutation.mutate({ breaks: JSON.stringify(newBreaks) });
    setShowBreakModal(false);
    toast({ title: `Break started — ${type === "smoke" ? "🚬 Smoke" : type === "food" ? "🍽 Food" : "Other"}` });
  }

  function endBreak() {
    const newBreaks = breaks.map(b =>
      !b.endedAt ? { ...b, endedAt: new Date().toISOString() } : b
    );
    updateSessionMutation.mutate({ breaks: JSON.stringify(newBreaks) });
    toast({ title: "Break ended — back to the floor!" });
  }

  function handleSortEnd(cabId: string, newOrder: string[]) {
    const updated = { ...cabMachineOrder, [cabId]: newOrder };
    setCabMachineOrder(updated);
    updateSessionMutation.mutate({ cabMachineOrder: JSON.stringify(updated) });
  }

  const savedCabinetOrder = session?.cabinetOrder ?? "";

  const selectedMachine = selectedGrid ? machineMap[selectedGrid.id] : undefined;

  function getZoneForId(id: string): string {
    for (const zone of zonesConfig) {
      for (const cab of zone.cabinets) {
        if (cab.machineIds.includes(id)) return zone.name;
      }
    }
    return "Other";
  }

  function handleClickMachine(id: string) {
    if (editMode) return; // In edit mode, clicking is for removal
    setSelectedGrid({ id, zone: getZoneForId(id) });
  }

  function shouldShowMachine(id: string): boolean {
    if (search && !id.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all") {
      const m = machineMap[id];
      if (!m && filterStatus !== "unplayed") return false;
      if (m && m.status !== filterStatus) return false;
    }
    return true;
  }

  // ── Edit mode: mutate layout ──────────────────────────────────
  const [localZones, setLocalZones] = useState<ZoneConfig[]>([]);

  useEffect(() => {
    if (zonesConfig.length > 0) setLocalZones(zonesConfig);
  }, [layout?.zonesConfig]);

  const saveLayoutMutation = useMutation({
    mutationFn: (zones: ZoneConfig[]) =>
      apiRequest("PUT", `/api/layouts/${layoutId}`, { zonesConfig: JSON.stringify(zones) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layouts", layoutId] });
      setSaving(false);
      toast({ title: "Layout saved" });
    },
    onError: () => { setSaving(false); toast({ title: "Save failed", variant: "destructive" }); },
  });

  function saveLayoutChanges(zones: ZoneConfig[]) {
    setSaving(true);
    saveLayoutMutation.mutate(zones);
  }

  function handleRemoveMachine(zoneId: string, cabId: string, machineId: string) {
    const newZones = localZones.map(z => {
      if (z.id !== zoneId) return z;
      return { ...z, cabinets: z.cabinets.map(c => {
        if (c.id !== cabId) return c;
        return { ...c, machineIds: c.machineIds.filter(m => m !== machineId) };
      })};
    });
    setLocalZones(newZones);
    saveLayoutChanges(newZones);
  }

  function handleAddMachine(zoneId: string, cabId: string) {
    const zone = localZones.find(z => z.id === zoneId);
    if (!zone) return;
    const cab = zone.cabinets.find(c => c.id === cabId);
    if (!cab) return;
    const prefix = zone.name.startsWith("P") ? "P" : zone.name.startsWith("Pasillo") ? "Q" : zone.name.startsWith("Smoking") ? "S" : "M";
    const allIds = localZones.flatMap(z => z.cabinets.flatMap(c => c.machineIds));
    let n = allIds.length + 1;
    let newId = `${prefix}-${String(n).padStart(2,"0")}`;
    while (allIds.includes(newId)) { n++; newId = `${prefix}-${String(n).padStart(2,"0")}`; }
    const newZones = localZones.map(z => {
      if (z.id !== zoneId) return z;
      return { ...z, cabinets: z.cabinets.map(c => {
        if (c.id !== cabId) return c;
        return { ...c, machineIds: [...c.machineIds, newId] };
      })};
    });
    setLocalZones(newZones);
    saveLayoutChanges(newZones);
  }

  function handleRenameZone(zoneId: string, newName: string) {
    const newZones = localZones.map(z => z.id === zoneId ? { ...z, name: newName } : z);
    setLocalZones(newZones);
    saveLayoutChanges(newZones);
  }

  function handleRenameCabinet(zoneId: string, cabId: string, newLabel: string) {
    const newZones = localZones.map(z => {
      if (z.id !== zoneId) return z;
      return { ...z, cabinets: z.cabinets.map(c => c.id === cabId ? { ...c, label: newLabel } : c) };
    });
    setLocalZones(newZones);
    saveLayoutChanges(newZones);
  }

  function handleDeleteCabinet(zoneId: string, cabId: string) {
    const newZones = localZones.map(z => {
      if (z.id !== zoneId) return z;
      return { ...z, cabinets: z.cabinets.filter(c => c.id !== cabId) };
    });
    setLocalZones(newZones);
    saveLayoutChanges(newZones);
  }

  function handleAddCabinet(zoneId: string) {
    const zone = localZones.find(z => z.id === zoneId);
    if (!zone) return;
    const maxCol = Math.max(...zone.cabinets.map(c => c.col), -1);
    const maxRow = Math.max(...zone.cabinets.map(c => c.row), 0);
    const newCabId = `${zoneId.slice(0,1).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const newCab: CabinetConfig = {
      id: newCabId,
      label: "New CAB",
      machineIds: [],
      row: maxRow,
      col: maxCol + 1,
    };
    const newZones = localZones.map(z => z.id === zoneId ? { ...z, cabinets: [...z.cabinets, newCab] } : z);
    setLocalZones(newZones);
    saveLayoutChanges(newZones);
  }

  // Use localZones in edit mode, zonesConfig otherwise
  const activeZones = editMode ? localZones : zonesConfig;

  // First zone is "Carousel" (Pared), rest are standard zones
  const carouselZone = activeZones.find(z => z.name.toLowerCase().includes("carousel") || z.name.toLowerCase().includes("pared"));
  const standardZonesData = activeZones.filter(z => z !== carouselZone);

  const carouselCabinets = carouselZone
    ? carouselZone.cabinets.filter(c => !c.circular).map(c => ({ ...c, ids: c.machineIds as readonly string[] }))
    : [];
  const arcCab = carouselZone?.cabinets.find(c => c.circular);
  const arcMachines = arcCab ? arcCab.machineIds : [];

  const showCarousel = activeZone === "all" || (carouselZone && activeZone === carouselZone.name);

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="floor-map-page">
      <header className="border-b border-border bg-card sticky top-0 z-20">
        <div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <Link href="/">
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" data-testid="btn-back">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{session?.name ?? "Loading…"}</p>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-muted-foreground">{session?.date} · {layout?.name ?? "Parisian Macao"}</p>
              {session?.startedAt && <SessionTimer startedAt={session.startedAt} />}
            </div>
          </div>
          <StatsBar machines={machines} />

          {/* Edit mode toggle */}
          <Button
            size="sm"
            variant={editMode ? "default" : "outline"}
            className={`h-7 text-[11px] shrink-0 gap-1 ${editMode ? "bg-amber-600 hover:bg-amber-700 border-amber-600" : "border-border text-muted-foreground"}`}
            onClick={() => {
              if (editMode && localZones.length > 0) saveLayoutChanges(localZones);
              setEditMode(e => !e);
            }}
            data-testid="btn-edit-mode"
          >
            {editMode ? <><Unlock size={10} /> Editing{saving ? " (saving…)" : ""}</> : <><Lock size={10} /> Locked</>}
          </Button>

          {/* Break button */}
          {activeBreak ? (
            <Button size="sm" variant="outline"
              className="h-7 text-[11px] border-amber-500 text-amber-400 bg-amber-950/30 hover:bg-amber-950/60 shrink-0 gap-1 animate-pulse"
              onClick={endBreak} data-testid="btn-end-break">
              <Play size={10} /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="outline"
              className="h-7 text-[11px] border-border text-muted-foreground hover:bg-muted/40 hover:border-amber-500/60 shrink-0 gap-1"
              onClick={() => setShowBreakModal(true)} data-testid="btn-start-break">
              <Pause size={10} /> Break
            </Button>
          )}

          <Button size="sm" variant="outline"
            className="h-7 text-[11px] border-amber-600 text-amber-400 hover:bg-amber-950/40 shrink-0"
            onClick={() => { setFinishInput(String(session?.finishedAmount || "")); setShowFinishModal(true); }}
            data-testid="btn-finish-session">
            Finish
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setShowReport(true)} data-testid="btn-session-report" title="Session Report">
            <FileText size={15} />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={toggle} data-testid="btn-theme-toggle-map">
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </Button>
        </div>

        {/* Active break banner */}
        {activeBreak && (
          <div className="px-3 pb-1.5">
            <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-500/40 rounded-lg px-3 py-1.5">
              <span className="text-[10px] text-amber-400 font-semibold">
                {activeBreak.type === "smoke" ? "🚬 Smoke break" : activeBreak.type === "food" ? "🍽 Food break" : "⏸ Break"} in progress
              </span>
              <BreakElapsed startedAt={activeBreak.startedAt} />
              <button onClick={endBreak} className="ml-auto text-[9px] text-amber-400 hover:text-amber-300 font-bold">END BREAK</button>
            </div>
          </div>
        )}

        {/* Edit mode banner */}
        {editMode && (
          <div className="px-3 pb-1.5">
            <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-600/40 rounded-lg px-3 py-1.5">
              <Unlock size={10} className="text-amber-400" />
              <span className="text-[10px] text-amber-400 font-semibold">Edit Mode — click ✎ labels to rename, × to remove, + to add</span>
              {saving && <span className="ml-auto text-[9px] text-amber-400 animate-pulse">Saving…</span>}
            </div>
          </div>
        )}

        <div className="px-3 pb-2.5 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveZone("all")}
              className={`shrink-0 text-xs px-3 py-1 rounded-full border font-medium transition-all ${
                activeZone === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
              }`}
              data-testid="zone-tab-all"
            >All Zones</button>
            {activeZones.map(z => (
              <button
                key={z.id}
                onClick={() => setActiveZone(z.name)}
                className={`shrink-0 text-xs px-3 py-1 rounded-full border font-medium transition-all flex items-center gap-1.5 ${
                  activeZone === z.name ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                }`}
                data-testid={`zone-tab-${z.id}`}
              >
                {z.name}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search machine ID…" value={search} onChange={e => setSearch(e.target.value)} className="pl-7 h-8 text-xs" data-testid="input-search-machine" />
              {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={12} /></button>}
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-filter-status">
                <Filter size={12} className="mr-1 text-muted-foreground" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="flex-1 px-3 py-4 space-y-8 overflow-y-auto">
        {isLoading || !layout ? (
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {showCarousel && carouselZone && (
              <CarouselSection
                carouselCabinets={carouselCabinets}
                arcMachines={arcMachines}
                machineMap={machineMap}
                onClickMachine={handleClickMachine}
                sessionId={sessionId}
                savedCabinetOrder={savedCabinetOrder}
                cabMachineOrder={cabMachineOrder}
                onSortEnd={handleSortEnd}
                editMode={editMode}
                onRemoveMachine={editMode ? (cabId, machineId) => handleRemoveMachine(carouselZone.id, cabId, machineId) : undefined}
                onAddMachine={editMode ? (cabId) => handleAddMachine(carouselZone.id, cabId) : undefined}
                onRenameLabel={editMode ? (cabId, newLabel) => handleRenameCabinet(carouselZone.id, cabId, newLabel) : undefined}
                onDeleteCabinet={editMode ? (cabId) => handleDeleteCabinet(carouselZone.id, cabId) : undefined}
              />
            )}

            {standardZonesData.map(zone => {
              if (activeZone !== "all" && activeZone !== zone.name) return null;
              const cabinets = zoneConfigToCabinetDefs(zone);
              return (
                <CabinetZoneSection
                  key={zone.id}
                  zone={zone.name}
                  cabinets={cabinets}
                  machineMap={machineMap}
                  onClickMachine={handleClickMachine}
                  sessionId={sessionId}
                  shouldShow={shouldShowMachine}
                  color={zone.color}
                  cabMachineOrder={cabMachineOrder}
                  onSortEnd={handleSortEnd}
                  editMode={editMode}
                  layoutId={layoutId}
                  onRemoveMachine={editMode ? (cabId, machineId) => handleRemoveMachine(zone.id, cabId, machineId) : undefined}
                  onAddMachine={editMode ? (cabId) => handleAddMachine(zone.id, cabId) : undefined}
                  onRenameZone={editMode ? (newName) => handleRenameZone(zone.id, newName) : undefined}
                  onRenameCabinet={editMode ? (cabId, newLabel) => handleRenameCabinet(zone.id, cabId, newLabel) : undefined}
                  onDeleteCabinet={editMode ? (cabId) => handleDeleteCabinet(zone.id, cabId) : undefined}
                  onAddCabinet={editMode ? () => handleAddCabinet(zone.id) : undefined}
                />
              );
            })}

            <section className="border border-border rounded-xl p-4 mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Legend</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STATUS_OPTIONS.map(s => (
                  <div key={s.value} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[s.value]}`} />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                ))}
              </div>
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Zap size={11} className="text-yellow-400" /> = Sticky wilds</span>
                <span className="flex items-center gap-1"><Coins size={11} className="text-amber-400" /> = Coins on board</span>
                <span className="flex items-center gap-1"><Clock size={11} className="text-emerald-400" /> = Time in status</span>
                <span className="flex items-center gap-1"><GripVertical size={11} /> = Drag to reorder</span>
                <span className="flex items-center gap-1"><Bell size={11} className="text-red-400" /> = 5-min alarm active</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(PLAYER_TYPE_PILL).map(([k, v]) => (
                  <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${v.bg} ${v.text}`}>{v.abbr} = {k.replace(/_/g," ")}</span>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {selectedGrid && !editMode && (
        <MachineEditor
          open={!!selectedGrid}
          onClose={() => setSelectedGrid(null)}
          gridId={selectedGrid.id}
          zone={selectedGrid.zone}
          sessionId={sessionId}
          existing={selectedMachine}
        />
      )}

      {showReport && (
        <SessionReport
          session={session}
          machines={machines}
          breaks={breaks}
          onClose={() => setShowReport(false)}
        />
      )}

      {showBreakModal && (
        <BreakModal onStart={startBreak} onClose={() => setShowBreakModal(false)} />
      )}

      {/* Starting amount modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-[320px] shadow-2xl space-y-4">
            <div>
              <h2 className="text-sm font-bold">Session Starting Amount</h2>
              <p className="text-xs text-muted-foreground mt-0.5">How much HKD are you starting with today?</p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">HKD</span>
              <input
                type="number" min="0" step="1" autoFocus
                placeholder="e.g. 5000"
                value={startInput}
                onChange={e => setStartInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && startInput) {
                    updateSessionMutation.mutate({ startingAmount: parseFloat(startInput) || 0 });
                    setShowStartModal(false);
                  }
                }}
                className="w-full bg-background border border-border rounded-xl pl-12 pr-3 py-2.5 text-sm font-mono font-bold text-right focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="input-starting-amount"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowStartModal(false)}
                className="flex-1 border border-border rounded-lg py-2 text-xs text-muted-foreground hover:bg-muted/40">Skip</button>
              <button
                onClick={() => {
                  if (startInput) updateSessionMutation.mutate({ startingAmount: parseFloat(startInput) || 0 });
                  setShowStartModal(false);
                }}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-bold"
                data-testid="btn-confirm-starting-amount"
              >Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Finish session modal */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-[320px] shadow-2xl space-y-4">
            <div>
              <h2 className="text-sm font-bold">Finish Session</h2>
              <p className="text-xs text-muted-foreground mt-0.5">How much HKD are you walking out with?</p>
              {(session?.startingAmount ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Started with <span className="font-bold text-foreground">{session!.startingAmount} HKD</span></p>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">HKD</span>
              <input
                type="number" min="0" step="1" autoFocus
                placeholder="e.g. 4200"
                value={finishInput}
                onChange={e => setFinishInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    updateSessionMutation.mutate({ finishedAmount: parseFloat(finishInput) || 0, endedAt: new Date().toISOString() });
                    setShowFinishModal(false);
                    setShowReport(true);
                  }
                }}
                className="w-full bg-background border border-border rounded-xl pl-12 pr-3 py-2.5 text-sm font-mono font-bold text-right focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="input-finished-amount"
              />
            </div>
            {finishInput && (session?.startingAmount ?? 0) > 0 && (() => {
              const diff = (parseFloat(finishInput) || 0) - (session?.startingAmount ?? 0);
              return (
                <p className={`text-xs font-bold text-center ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {diff >= 0 ? "+" : ""}{diff} HKD
                </p>
              );
            })()}
            <div className="flex gap-2">
              <button onClick={() => setShowFinishModal(false)}
                className="flex-1 border border-border rounded-lg py-2 text-xs text-muted-foreground hover:bg-muted/40">Cancel</button>
              <button
                onClick={() => {
                  updateSessionMutation.mutate({ finishedAmount: parseFloat(finishInput) || 0, endedAt: new Date().toISOString() });
                  setShowFinishModal(false);
                  setShowReport(true);
                }}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-bold"
                data-testid="btn-confirm-finished-amount"
              >Save &amp; View Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Legacy exports for backward compat ────────────────────────────
export const CAROUSEL_CABINETS = [
  { id: "A", label: "CAB A", ids: ["P-01","P-02","P-03","P-04"] as const },
  { id: "B", label: "CAB B", ids: ["P-05","P-06","P-07","P-08"] as const },
  { id: "C", label: "CAB C", ids: ["P-09","P-10","P-11","P-12"] as const },
  { id: "D", label: "CAB D", ids: ["P-13","P-14","P-15","P-16"] as const },
  { id: "E", label: "CAB E", ids: ["P-17","P-18","P-19","P-20"] as const },
  { id: "F", label: "CAB F", ids: ["P-21","P-22","P-23","P-24"] as const },
];
export const ARC_MACHINES = ["P-25","P-26","P-27","P-28","P-29","P-30","P-31","P-32"];
