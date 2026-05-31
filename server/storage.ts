import Database from "better-sqlite3";
import { type Session, type InsertSession, type Machine, type InsertMachine } from "@shared/schema";

const sqlite = new Database("data.db");

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

// Raw row → typed Machine mapper (snake_case → camelCase)
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
  };
}

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
      "INSERT INTO sessions (name, date, notes, created_at, starting_amount, finished_amount) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
    ).get(data.name, data.date, data.notes ?? "", new Date().toISOString(),
      (data as any).startingAmount ?? 0, (data as any).finishedAmount ?? 0);
    return rowToSession(r);
  },
  updateSession(id, data) {
    const existing = sqlite.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    if (!existing) return undefined;
    const r = sqlite.prepare(
      "UPDATE sessions SET name=?, date=?, notes=?, starting_amount=?, finished_amount=?, started_at=?, ended_at=?, breaks=?, cab_machine_order=? WHERE id=? RETURNING *"
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
        outcome_type, outcome_amount, player_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `).get(
      data.sessionId, data.machineNumber, data.zone,
      data.machineType ?? "Duo Fu Duo Cai Ingotcha",
      data.status ?? "unplayed", data.apSignal ?? "none",
      data.wildCount ?? 0, data.coinCount ?? 0,
      data.betLevel ?? "", data.playerState ?? "",
      data.priority ?? 0, data.notes ?? "",
      now, (data as any).statusChangedAt ?? now,
      (data as any).outcomeType ?? "", (data as any).outcomeAmount ?? 0,
      (data as any).playerType ?? ""
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
        outcome_type=?, outcome_amount=?, player_type=?
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
          outcome_type=?, outcome_amount=?, player_type=?
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
        existing.id
      );
      return rowToMachine(r);
    } else {
      const r = sqlite.prepare(`
        INSERT INTO machines (session_id, machine_number, zone, machine_type, status, ap_signal,
          wild_count, coin_count, bet_level, player_state, priority, notes, last_updated, status_changed_at,
          outcome_type, outcome_amount, player_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
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
        now, now, "", 0, ""
      );
      return rowToMachine(r);
    }
  },
};
