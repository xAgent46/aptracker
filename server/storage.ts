import Database from "better-sqlite3";
import { type Session, type InsertSession, type Machine, type InsertMachine } from "@shared/schema";

const sqlite = new Database("data.db");

// Enable WAL for better concurrency
sqlite.pragma("journal_mode = WAL");

// Initialize tables and migrate
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    cabinet_order TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    machine_number TEXT NOT NULL,
    zone TEXT NOT NULL,
    machine_type TEXT NOT NULL DEFAULT 'Duo Fu Duo Cai Ingotcha',
    status TEXT NOT NULL DEFAULT 'unplayed',
    ap_signal TEXT NOT NULL DEFAULT 'none',
    wild_count INTEGER DEFAULT 0,
    coin_count INTEGER DEFAULT 0,
    bet_level TEXT DEFAULT '',
    player_state TEXT DEFAULT '',
    priority INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    last_updated TEXT NOT NULL,
    status_changed_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS layouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    casino TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    zones_config TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS machine_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_custom INTEGER DEFAULT 0
  );
`);

// Runtime migrations
try { sqlite.exec(`ALTER TABLE machines ADD COLUMN status_changed_at TEXT NOT NULL DEFAULT ''`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN cabinet_order TEXT DEFAULT ''`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE machines ADD COLUMN outcome_type TEXT DEFAULT ''`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE machines ADD COLUMN outcome_amount REAL DEFAULT 0`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE machines ADD COLUMN player_type TEXT DEFAULT ''`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN starting_amount REAL DEFAULT 0`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN finished_amount REAL DEFAULT 0`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN started_at TEXT DEFAULT ''`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN ended_at TEXT DEFAULT ''`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN breaks TEXT DEFAULT '[]'`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN cab_machine_order TEXT DEFAULT ''`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN layout_id INTEGER DEFAULT 1`); } catch (_) {}
try { sqlite.exec(`ALTER TABLE machines ADD COLUMN alarm_at TEXT DEFAULT ''`); } catch (_) {}

// Seed machine_types with defaults
const BUILTIN_MACHINE_TYPES = [
  "Duo Fu Duo Cai Ingotcha",
  "Duo Fu Duo Cai Grand",
  "Duo Fu Duo Cai Dragons",
  "88 Fortunes",
  "5 Treasures",
  "Dancing Drums",
  "Coin Combo",
  "Prosperity Peaks",
  "Golden Egypt",
  "Ocean Magic",
  "Forbidden Beauty",
  "Extreme Wild Lanterns",
  "Other",
];

for (const name of BUILTIN_MACHINE_TYPES) {
  try {
    sqlite.prepare("INSERT OR IGNORE INTO machine_types (name, is_custom) VALUES (?, 0)").run(name);
  } catch (_) {}
}

// Seed Parisian Macao layout as id=1 (only if not already seeded)
const existingLayout = sqlite.prepare("SELECT id FROM layouts WHERE id = 1").get();
if (!existingLayout) {
  const parisianZones = [
    {
      id: "carousel",
      name: "Pared/Carousel",
      color: "border-amber-600",
      cabinets: [
        { id: "A",  label: "CAB A", machineIds: ["P-01","P-02","P-03","P-04"], row: 0, col: 0 },
        { id: "B",  label: "CAB B", machineIds: ["P-05","P-06","P-07","P-08"], row: 0, col: 1 },
        { id: "C",  label: "CAB C", machineIds: ["P-09","P-10","P-11","P-12"], row: 0, col: 3 },
        { id: "D",  label: "CAB D", machineIds: ["P-13","P-14","P-15","P-16"], row: 1, col: 0 },
        { id: "E",  label: "CAB E", machineIds: ["P-17","P-18","P-19","P-20"], row: 1, col: 1 },
        { id: "F",  label: "CAB F", machineIds: ["P-21","P-22","P-23","P-24"], row: 1, col: 3 },
        { id: "ARC", label: "Carousel", machineIds: ["P-25","P-26","P-27","P-28","P-29","P-30","P-31","P-32"], row: 2, col: 0, circular: true },
      ],
    },
    {
      id: "pasillo",
      name: "Pasillo",
      color: "border-violet-600",
      cabinets: [
        { id: "QA", label: "CAB A", machineIds: ["Q-01","Q-02","Q-03","Q-04"], row: 0, col: 0 },
        { id: "QB", label: "CAB B", machineIds: ["Q-05","Q-06","Q-07","Q-08"], row: 0, col: 2 },
        { id: "QC", label: "CAB C", machineIds: ["Q-09","Q-10","Q-11","Q-12"], row: 1, col: 1, circular: true },
        { id: "QD", label: "CAB D", machineIds: ["Q-13","Q-14","Q-15","Q-16","Q-17","Q-18"], row: 2, col: 0 },
      ],
    },
    {
      id: "smoking",
      name: "Smoking Room",
      color: "border-rose-600",
      cabinets: [
        { id: "SA", label: "CAB A", machineIds: ["S-01","S-02","S-03","S-04"], row: 0, col: 0 },
        { id: "SB", label: "CAB B", machineIds: ["S-05","S-06","S-07","S-08"], row: 0, col: 2 },
        { id: "SC", label: "CAB C", machineIds: ["S-09","S-10","S-11","S-12"], row: 1, col: 1, circular: true },
        { id: "SD", label: "CAB D", machineIds: ["S-13","S-14","S-15","S-16"], row: 1, col: 2 },
        { id: "SE", label: "CAB E", machineIds: ["S-17","S-18","S-19","S-20","S-21","S-22"], row: 2, col: 0 },
        { id: "SF", label: "CAB F", machineIds: ["S-23","S-24","S-25"], row: 2, col: 2 },
      ],
    },
  ];

  sqlite.prepare(
    "INSERT INTO layouts (id, name, casino, created_at, zones_config) VALUES (1, 'Parisian Macao', 'Parisian Macao', ?, ?)"
  ).run(new Date().toISOString(), JSON.stringify(parisianZones));
}

// ── Row mappers ───────────────────────────────────────────────────────

function rowToMachine(r: any): Machine {
  return {
    id: r.id,
    sessionId: r.session_id,
    machineNumber: r.machine_number,
    zone: r.zone,
    machineType: r.machine_type,
    status: r.status,
    apSignal: r.ap_signal,
    wildCount: r.wild_count,
    coinCount: r.coin_count,
    betLevel: r.bet_level,
    playerState: r.player_state,
    priority: r.priority,
    notes: r.notes,
    lastUpdated: r.last_updated,
    statusChangedAt: r.status_changed_at,
    outcomeType: r.outcome_type ?? "",
    outcomeAmount: r.outcome_amount ?? 0,
    playerType: r.player_type ?? "",
    alarmAt: r.alarm_at ?? "",
  };
}

function rowToSession(r: any): Session {
  return {
    id: r.id,
    name: r.name,
    date: r.date,
    notes: r.notes,
    createdAt: r.created_at,
    cabinetOrder: r.cabinet_order ?? "",
    startingAmount: r.starting_amount ?? 0,
    finishedAmount: r.finished_amount ?? 0,
    startedAt: r.started_at ?? "",
    endedAt: r.ended_at ?? "",
    breaks: r.breaks ?? "[]",
    cabMachineOrder: r.cab_machine_order ?? "",
    layoutId: r.layout_id ?? 1,
  };
}

export interface Layout {
  id: number;
  name: string;
  casino: string;
  createdAt: string;
  zonesConfig: string; // JSON
}

export interface MachineType {
  id: number;
  name: string;
  isCustom: number;
}

function rowToLayout(r: any): Layout {
  return {
    id: r.id,
    name: r.name,
    casino: r.casino ?? "",
    createdAt: r.created_at,
    zonesConfig: r.zones_config ?? "[]",
  };
}

function rowToMachineType(r: any): MachineType {
  return {
    id: r.id,
    name: r.name,
    isCustom: r.is_custom ?? 0,
  };
}

// ── SSE Registry ─────────────────────────────────────────────────────

export type SSEClient = {
  sessionId: number;
  res: any; // Express Response
};

const sseClients = new Map<number, Set<SSEClient>>();

export function addSSEClient(sessionId: number, client: SSEClient) {
  if (!sseClients.has(sessionId)) sseClients.set(sessionId, new Set());
  sseClients.get(sessionId)!.add(client);
}

export function removeSSEClient(sessionId: number, client: SSEClient) {
  sseClients.get(sessionId)?.delete(client);
}

export function broadcastToSession(sessionId: number, event: object) {
  const clients = sseClients.get(sessionId);
  if (!clients) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(data);
    } catch (_) {
      clients.delete(client);
    }
  }
}

// ── Storage interface ─────────────────────────────────────────────────

export interface IStorage {
  getSessions(): Session[];
  getSession(id: number): Session | undefined;
  createSession(data: InsertSession): Session;
  updateSession(id: number, data: Partial<InsertSession>): Session | undefined;
  deleteSession(id: number): void;
  getMachinesForSession(sessionId: number): Machine[];
  getMachine(id: number): Machine | undefined;
  createMachine(data: InsertMachine): Machine;
  updateMachine(id: number, data: Partial<InsertMachine>): Machine | undefined;
  deleteMachine(id: number): void;
  upsertMachine(sessionId: number, machineNumber: string, zone: string, data: Partial<InsertMachine>): Machine;
  saveCabinetOrder(sessionId: number, order: unknown): Session | undefined;
  // Layouts
  getLayouts(): Layout[];
  getLayout(id: number): Layout | undefined;
  createLayout(data: { name: string; casino: string; zonesConfig: string }): Layout;
  updateLayout(id: number, data: { name?: string; casino?: string; zonesConfig?: string }): Layout | undefined;
  deleteLayout(id: number): void;
  // Machine types
  getMachineTypes(): MachineType[];
  addMachineType(name: string): MachineType;
  deleteMachineType(id: number): void;
}

export const storage: IStorage = {
  getSessions() {
    return sqlite.prepare("SELECT * FROM sessions ORDER BY id DESC").all().map(rowToSession);
  },
  getSession(id) {
    const r = sqlite.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return r ? rowToSession(r) : undefined;
  },
  createSession(data) {
    const r = sqlite.prepare(
      "INSERT INTO sessions (name, date, notes, created_at, starting_amount, finished_amount, layout_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *"
    ).get(data.name, data.date, data.notes ?? "", new Date().toISOString(),
      (data as any).startingAmount ?? 0, (data as any).finishedAmount ?? 0,
      (data as any).layoutId ?? 1);
    return rowToSession(r);
  },
  updateSession(id, data) {
    const existing = sqlite.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    if (!existing) return undefined;
    const r = sqlite.prepare(
      "UPDATE sessions SET name=?, date=?, notes=?, starting_amount=?, finished_amount=?, started_at=?, ended_at=?, breaks=?, cab_machine_order=?, layout_id=? WHERE id=? RETURNING *"
    ).get(
      data.name ?? existing.name,
      data.date ?? existing.date,
      data.notes ?? existing.notes,
      (data as any).startingAmount ?? existing.starting_amount ?? 0,
      (data as any).finishedAmount ?? existing.finished_amount ?? 0,
      (data as any).startedAt ?? existing.started_at ?? "",
      (data as any).endedAt ?? existing.ended_at ?? "",
      (data as any).breaks ?? existing.breaks ?? "[]",
      (data as any).cabMachineOrder ?? existing.cab_machine_order ?? "",
      (data as any).layoutId ?? existing.layout_id ?? 1,
      id
    );
    return r ? rowToSession(r) : undefined;
  },
  saveCabinetOrder(sessionId, order) {
    const r = sqlite.prepare(
      "UPDATE sessions SET cabinet_order=? WHERE id=? RETURNING *"
    ).get(JSON.stringify(order), sessionId);
    return r ? rowToSession(r) : undefined;
  },
  deleteSession(id) {
    sqlite.prepare("DELETE FROM machines WHERE session_id = ?").run(id);
    sqlite.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  },

  getMachinesForSession(sessionId) {
    return sqlite.prepare("SELECT * FROM machines WHERE session_id = ?").all(sessionId).map(rowToMachine);
  },
  getMachine(id) {
    const r = sqlite.prepare("SELECT * FROM machines WHERE id = ?").get(id);
    return r ? rowToMachine(r) : undefined;
  },
  createMachine(data) {
    const now = new Date().toISOString();
    const r = sqlite.prepare(`
      INSERT INTO machines (session_id, machine_number, zone, machine_type, status, ap_signal,
        wild_count, coin_count, bet_level, player_state, priority, notes, last_updated, status_changed_at,
        outcome_type, outcome_amount, player_type, alarm_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `).get(
      data.sessionId, data.machineNumber, data.zone,
      data.machineType ?? "Duo Fu Duo Cai Ingotcha",
      data.status ?? "unplayed", data.apSignal ?? "none",
      data.wildCount ?? 0, data.coinCount ?? 0,
      data.betLevel ?? "", data.playerState ?? "",
      data.priority ?? 0, data.notes ?? "",
      now, (data as any).statusChangedAt ?? now,
      (data as any).outcomeType ?? "", (data as any).outcomeAmount ?? 0,
      (data as any).playerType ?? "", (data as any).alarmAt ?? ""
    );
    return rowToMachine(r);
  },
  updateMachine(id, data) {
    const now = new Date().toISOString();
    const existing = sqlite.prepare("SELECT * FROM machines WHERE id = ?").get(id) as any;
    if (!existing) return undefined;
    const statusChanged = data.status && data.status !== existing.status;
    const statusChangedAt = statusChanged ? now : (existing.status_changed_at || now);
    const r = sqlite.prepare(`
      UPDATE machines SET
        zone=?, machine_type=?, status=?, ap_signal=?, wild_count=?, coin_count=?,
        bet_level=?, player_state=?, priority=?, notes=?, last_updated=?, status_changed_at=?,
        outcome_type=?, outcome_amount=?, player_type=?, alarm_at=?
      WHERE id=? RETURNING *
    `).get(
      data.zone ?? existing.zone,
      data.machineType ?? existing.machine_type,
      data.status ?? existing.status,
      data.apSignal ?? existing.ap_signal,
      data.wildCount ?? existing.wild_count,
      data.coinCount ?? existing.coin_count,
      data.betLevel ?? existing.bet_level,
      data.playerState ?? existing.player_state,
      data.priority ?? existing.priority,
      data.notes ?? existing.notes,
      now, statusChangedAt,
      (data as any).outcomeType ?? existing.outcome_type ?? "",
      (data as any).outcomeAmount ?? existing.outcome_amount ?? 0,
      (data as any).playerType ?? existing.player_type ?? "",
      (data as any).alarmAt !== undefined ? (data as any).alarmAt : (existing.alarm_at ?? ""),
      id
    );
    return r ? rowToMachine(r) : undefined;
  },
  deleteMachine(id) {
    sqlite.prepare("DELETE FROM machines WHERE id = ?").run(id);
  },
  upsertMachine(sessionId, machineNumber, zone, data) {
    const now = new Date().toISOString();
    const existing = sqlite.prepare(
      "SELECT * FROM machines WHERE session_id = ? AND machine_number = ?"
    ).get(sessionId, machineNumber) as any;

    if (existing) {
      const statusChanged = data.status && data.status !== existing.status;
      const statusChangedAt = statusChanged ? now : (existing.status_changed_at || now);
      const r = sqlite.prepare(`
        UPDATE machines SET
          zone=?, machine_type=?, status=?, ap_signal=?, wild_count=?, coin_count=?,
          bet_level=?, player_state=?, priority=?, notes=?, last_updated=?, status_changed_at=?,
          outcome_type=?, outcome_amount=?, player_type=?, alarm_at=?
        WHERE id=? RETURNING *
      `).get(
        zone || existing.zone,
        data.machineType ?? existing.machine_type,
        data.status ?? existing.status,
        data.apSignal ?? existing.ap_signal,
        data.wildCount ?? existing.wild_count,
        data.coinCount ?? existing.coin_count,
        data.betLevel ?? existing.bet_level,
        data.playerState ?? existing.player_state,
        data.priority ?? existing.priority,
        data.notes ?? existing.notes,
        now, statusChangedAt,
        (data as any).outcomeType ?? existing.outcome_type ?? "",
        (data as any).outcomeAmount ?? existing.outcome_amount ?? 0,
        (data as any).playerType ?? existing.player_type ?? "",
        (data as any).alarmAt !== undefined ? (data as any).alarmAt : (existing.alarm_at ?? ""),
        existing.id
      );
      return rowToMachine(r);
    } else {
      const r = sqlite.prepare(`
        INSERT INTO machines (session_id, machine_number, zone, machine_type, status, ap_signal,
          wild_count, coin_count, bet_level, player_state, priority, notes, last_updated, status_changed_at,
          outcome_type, outcome_amount, player_type, alarm_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
      `).get(
        sessionId, machineNumber, zone || "Pared/Carousel",
        data.machineType ?? "Duo Fu Duo Cai Ingotcha",
        data.status ?? "unplayed",
        data.apSignal ?? "none",
        data.wildCount ?? 0,
        data.coinCount ?? 0,
        data.betLevel ?? "",
        data.playerState ?? "",
        data.priority ?? 0,
        data.notes ?? "",
        now, now, "", 0, "", ""
      );
      return rowToMachine(r);
    }
  },

  // Layouts
  getLayouts() {
    return sqlite.prepare("SELECT * FROM layouts ORDER BY id DESC").all().map(rowToLayout);
  },
  getLayout(id) {
    const r = sqlite.prepare("SELECT * FROM layouts WHERE id = ?").get(id);
    return r ? rowToLayout(r) : undefined;
  },
  createLayout(data) {
    const r = sqlite.prepare(
      "INSERT INTO layouts (name, casino, created_at, zones_config) VALUES (?, ?, ?, ?) RETURNING *"
    ).get(data.name, data.casino ?? "", new Date().toISOString(), data.zonesConfig ?? "[]");
    return rowToLayout(r);
  },
  updateLayout(id, data) {
    const existing = sqlite.prepare("SELECT * FROM layouts WHERE id = ?").get(id) as any;
    if (!existing) return undefined;
    const r = sqlite.prepare(
      "UPDATE layouts SET name=?, casino=?, zones_config=? WHERE id=? RETURNING *"
    ).get(
      data.name ?? existing.name,
      data.casino ?? existing.casino,
      data.zonesConfig ?? existing.zones_config,
      id
    );
    return r ? rowToLayout(r) : undefined;
  },
  deleteLayout(id) {
    sqlite.prepare("DELETE FROM layouts WHERE id = ?").run(id);
  },

  // Machine types
  getMachineTypes() {
    return sqlite.prepare("SELECT * FROM machine_types ORDER BY is_custom ASC, name ASC").all().map(rowToMachineType);
  },
  addMachineType(name) {
    const r = sqlite.prepare(
      "INSERT INTO machine_types (name, is_custom) VALUES (?, 1) RETURNING *"
    ).get(name);
    return rowToMachineType(r);
  },
  deleteMachineType(id) {
    sqlite.prepare("DELETE FROM machine_types WHERE id = ? AND is_custom = 1").run(id);
  },
};
