import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertSessionSchema, insertMachineSchema } from "@shared/schema";

export function registerRoutes(httpServer: Server, app: Express) {

  // ── Sessions ──────────────────────────────────────────────────
  app.get("/api/sessions", (_req, res) => {
    res.json(storage.getSessions());
  });

  app.get("/api/sessions/:id", (req, res) => {
    const session = storage.getSession(Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.post("/api/sessions", (req, res) => {
    const parsed = insertSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(storage.createSession(parsed.data));
  });

  app.patch("/api/sessions/:id", (req, res) => {
    const session = storage.updateSession(Number(req.params.id), req.body);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.delete("/api/sessions/:id", (req, res) => {
    storage.deleteSession(Number(req.params.id));
    res.json({ ok: true });
  });

  // Save cabinet order for a session
  app.put("/api/sessions/:id/cabinet-order", (req, res) => {
    // Accept either legacy array [{id}] or new positions object {cabId: {col, row}}
    const body = req.body;
    const payload = body.positions ?? body.order;
    if (!payload) return res.status(400).json({ error: "positions or order required" });
    const session = storage.saveCabinetOrder(Number(req.params.id), payload);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  // ── Machines ──────────────────────────────────────────────────
  app.get("/api/sessions/:sessionId/machines", (req, res) => {
    res.json(storage.getMachinesForSession(Number(req.params.sessionId)));
  });

  app.post("/api/sessions/:sessionId/machines", (req, res) => {
    const data = { ...req.body, sessionId: Number(req.params.sessionId) };
    const parsed = insertMachineSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    res.json(storage.createMachine(parsed.data));
  });

  app.patch("/api/machines/:id", (req, res) => {
    const machine = storage.updateMachine(Number(req.params.id), req.body);
    if (!machine) return res.status(404).json({ error: "Machine not found" });
    res.json(machine);
  });

  app.delete("/api/machines/:id", (req, res) => {
    storage.deleteMachine(Number(req.params.id));
    res.json({ ok: true });
  });

  // Upsert machine by session + machine number (quick update from floor map)
  app.put("/api/sessions/:sessionId/machines/upsert", (req, res) => {
    const { machineNumber, zone, ...data } = req.body;
    if (!machineNumber) return res.status(400).json({ error: "machineNumber required" });
    const machine = storage.upsertMachine(Number(req.params.sessionId), machineNumber, zone, data);
    res.json(machine);
  });

  // Bulk set status for a list of machines in a session
  app.put("/api/sessions/:sessionId/machines/bulk-status", (req, res) => {
    const { machines, status } = req.body;
    // machines: Array<{ machineNumber: string; zone: string }>
    if (!Array.isArray(machines) || !status) {
      return res.status(400).json({ error: "machines array and status required" });
    }
    const sessionId = Number(req.params.sessionId);
    const resetPriority = status === "unplayed" || status === "checked";
    const updated = machines.map(({ machineNumber, zone }: { machineNumber: string; zone: string }) =>
      storage.upsertMachine(sessionId, machineNumber, zone, { status, ...(resetPriority ? { priority: 0 } : {}) })
    );
    res.json(updated);
  });

}
