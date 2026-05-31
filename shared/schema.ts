import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Sessions table — one per casino visit
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "Parisian 2026-05-30"
  date: text("date").notNull(), // ISO date string
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull(),
  cabinetOrder: text("cabinet_order").default(""), // JSON array of cabinet IDs in user-defined order
  startingAmount: real("starting_amount").default(0), // HKD bankroll at session start
  finishedAmount: real("finished_amount").default(0), // HKD cash-out at session end (0 = not yet set)
  startedAt: text("started_at").default(""),    // ISO timestamp when session was first opened
  endedAt: text("ended_at").default(""),         // ISO timestamp when Finish was clicked
  breaks: text("breaks").default("[]"),           // JSON: [{type,startedAt,endedAt|null}]
  cabMachineOrder: text("cab_machine_order").default(""), // JSON: {cabId: string[]} intra-cab machine order
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Machine status categories for AP tracking
// Each machine in the casino gets a record per session
export const machines = sqliteTable("machines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  machineNumber: text("machine_number").notNull(), // e.g. "A-01", "B-14"
  zone: text("zone").notNull(), // floor zone/section
  machineType: text("machine_type").notNull().default("Duo Fu Duo Cai Ingotcha"),
  status: text("status").notNull().default("unplayed"), // see STATUS_OPTIONS
  apSignal: text("ap_signal").notNull().default("none"), // the specific AP event observed
  wildCount: integer("wild_count").default(0), // number of sticky wilds present
  coinCount: integer("coin_count").default(0), // coins in the board
  betLevel: text("bet_level").default(""), // last known bet level
  playerState: text("player_state").default(""), // observation about current/last player
  priority: integer("priority").default(0), // 0=low, 1=medium, 2=high
  notes: text("notes").default(""),
  lastUpdated: text("last_updated").notNull(),
  statusChangedAt: text("status_changed_at").notNull().default(""), // ISO timestamp when status last changed
  outcomeType: text("outcome_type").default(""), // "won" | "lost" | "" — only set when played_by_me
  outcomeAmount: real("outcome_amount").default(0), // absolute value in HKD/chips
  playerType: text("player_type").default(""), // BEING_PLAYED_OPTIONS value — only set when being_played
});

export const insertMachineSchema = createInsertSchema(machines).omit({ id: true, lastUpdated: true });
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machines.$inferSelect;

// Predefined machine zones for the Parisian casino
export const PARISIAN_ZONES = [
  "Pared/Carousel",
  "Pasillo",
  "Smoking Room",
] as const;

// Player type options when setting Being Played status
export const BEING_PLAYED_OPTIONS = [
  { value: "long_time",      label: "Long Time Run" },
  { value: "money_out",      label: "Money Running Out" },
  { value: "high_amount",    label: "Playing High Amount" },
  { value: "jumping_bets",   label: "Jumping Bets" },
  { value: "senior",         label: "Senior Player" },
  { value: "beginner",       label: "Beginner" },
  { value: "normal",         label: "Normal" },
  { value: "other",          label: "Other" },
] as const;

// Status options — what the machine is doing right now
export const STATUS_OPTIONS = [
  { value: "unplayed", label: "Unplayed / Cold", color: "slate", description: "Not played recently, no info" },
  { value: "being_played", label: "Being Played", color: "blue", description: "Someone is currently on it" },
  { value: "played_by_me", label: "Played by Me", color: "green", description: "I played this machine this session" },
  { value: "checked", label: "Checked / Nothing", color: "teal", description: "Searched it — nothing there" },
  { value: "out_of_service", label: "Out of Service", color: "red", description: "Machine is broken / offline" },
  { value: "out_of_paper", label: "Out of Paper", color: "purple", description: "Ticket printer empty — attendant needed" },
  { value: "running_out_of_money", label: "Running Out of Money", color: "orange", description: "Player is low on credits — AP opportunity incoming" },
] as const;

// AP Signal options — the specific advantage play event
export const AP_SIGNAL_OPTIONS = [
  { value: "none", label: "No signal", category: "default" },
  { value: "low_credits_player", label: "Player running low on credits", category: "player" },
  { value: "bet_size_change", label: "Player changed bet size", category: "player" },
  { value: "wild_left_behind", label: "Wild(s) left behind after bet change", category: "wild" },
  { value: "sticky_wilds_building", label: "Sticky wilds building (2-5 present)", category: "wild" },
  { value: "5_wilds_ready", label: "5 wilds — one away from Bei Bei Gao", category: "wild" },
  { value: "coins_on_board", label: "Coins present on board", category: "coin" },
  { value: "jackpot_feature_near", label: "Jackpot feature triggered nearby", category: "jackpot" },
  { value: "bei_bei_gao_triggered", label: "Bei Bei Gao feature just triggered", category: "jackpot" },
  { value: "player_tilting", label: "Player appears frustrated / tilting", category: "player" },
  { value: "max_bet_player_leaving", label: "Max bet player leaving", category: "player" },
  { value: "long_dry_streak", label: "Long dry streak observed", category: "other" },
  { value: "other", label: "Other (see notes)", category: "other" },
] as const;

export const MACHINE_TYPES = [
  "Duo Fu Duo Cai Ingotcha",
  "Duo Fu Duo Cai Grand",
  "Duo Fu Duo Cai Dragons",
  "88 Fortunes",
  "5 Treasures",
  "Dancing Drums",
  "Coin Combo",
  "Other",
] as const;
