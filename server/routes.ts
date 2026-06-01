import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage, addSSEClient, removeSSEClient, broadcastToSession } from "./storage";
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
    broadcastToSession(Number(req.params.id), { type: "session_update", session });
    res.json(session);
  });

  app.delete("/api/sessions/:id", (req, res) => {
    storage.deleteSession(Number(req.params.id));
    res.json({ ok: true });
  });

  // Save cabinet order for a session
  app.put("/api/sessions/:id/cabinet-order", (req, res) => {
    const body = req.body;
    const payload = body.positions ?? body.order;
    if (!payload) return res.status(400).json({ error: "positions or order required" });
    const session = storage.saveCabinetOrder(Number(req.params.id), payload);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  // ── SSE endpoint ──────────────────────────────────────────────
  app.get("/api/sessions/:id/events", (req: Request, res: Response) => {
    const sessionId = Number(req.params.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send initial heartbeat
    res.write("data: {\"type\":\"connected\"}\n\n");

    const client = { sessionId, res };
    addSSEClient(sessionId, client);

    // Heartbeat every 15s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write("data: {\"type\":\"heartbeat\"}\n\n");
      } catch (_) {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeSSEClient(sessionId, client);
    });
  });

  // ── Machines ──────────────────────────────────────────────────
  app.get("/api/sessions/:sessionId/machines", (req, res) => {
    res.json(storage.getMachinesForSession(Number(req.params.sessionId)));
  });

  app.post("/api/sessions/:sessionId/machines", (req, res) => {
    const data = { ...req.body, sessionId: Number(req.params.sessionId) };
    const parsed = insertMachineSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const machine = storage.createMachine(parsed.data);
    broadcastToSession(Number(req.params.sessionId), { type: "machine_update", machine });
    res.json(machine);
  });

  app.patch("/api/machines/:id", (req, res) => {
    const machine = storage.updateMachine(Number(req.params.id), req.body);
    if (!machine) return res.status(404).json({ error: "Machine not found" });
    broadcastToSession(machine.sessionId, { type: "machine_update", machine });
    res.json(machine);
  });

  app.delete("/api/machines/:id", (req, res) => {
    const machine = storage.getMachine(Number(req.params.id));
    storage.deleteMachine(Number(req.params.id));
    if (machine) {
      broadcastToSession(machine.sessionId, { type: "machine_deleted", machineId: machine.id, machineNumber: machine.machineNumber });
    }
    res.json({ ok: true });
  });

  // Upsert machine by session + machine number (quick update from floor map)
  app.put("/api/sessions/:sessionId/machines/upsert", (req, res) => {
    const { machineNumber, zone, ...data } = req.body;
    if (!machineNumber) return res.status(400).json({ error: "machineNumber required" });
    const machine = storage.upsertMachine(Number(req.params.sessionId), machineNumber, zone, data);
    broadcastToSession(Number(req.params.sessionId), { type: "machine_update", machine });
    res.json(machine);
  });

  // Bulk set status for a list of machines in a session
  app.put("/api/sessions/:sessionId/machines/bulk-status", (req, res) => {
    const { machines, status } = req.body;
    if (!Array.isArray(machines) || !status) {
      return res.status(400).json({ error: "machines array and status required" });
    }
    const sessionId = Number(req.params.sessionId);
    const resetPriority = status === "unplayed" || status === "checked";
    const updated = machines.map(({ machineNumber, zone }: { machineNumber: string; zone: string }) => {
      const machine = storage.upsertMachine(sessionId, machineNumber, zone, { status, ...(resetPriority ? { priority: 0 } : {}) });
      broadcastToSession(sessionId, { type: "machine_update", machine });
      return machine;
    });
    res.json(updated);
  });

  // ── Layouts ──────────────────────────────────────────────────
  app.get("/api/layouts", (_req, res) => {
    res.json(storage.getLayouts());
  });

  app.get("/api/layouts/:id", (req, res) => {
    const layout = storage.getLayout(Number(req.params.id));
    if (!layout) return res.status(404).json({ error: "Layout not found" });
    res.json(layout);
  });

  app.post("/api/layouts", (req, res) => {
    const { name, casino, zonesConfig } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const layout = storage.createLayout({ name, casino: casino ?? "", zonesConfig: zonesConfig ?? "[]" });
    res.json(layout);
  });

  app.put("/api/layouts/:id", (req, res) => {
    const { name, casino, zonesConfig } = req.body;
    const layout = storage.updateLayout(Number(req.params.id), { name, casino, zonesConfig });
    if (!layout) return res.status(404).json({ error: "Layout not found" });
    res.json(layout);
  });

  app.delete("/api/layouts/:id", (req, res) => {
    const id = Number(req.params.id);
    if (id === 1) return res.status(403).json({ error: "Cannot delete default layout" });
    storage.deleteLayout(id);
    res.json({ ok: true });
  });

  // ── Machine Types ─────────────────────────────────────────────
  app.get("/api/machine-types", (_req, res) => {
    res.json(storage.getMachineTypes());
  });

  app.post("/api/machine-types", (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name required" });
    try {
      const mt = storage.addMachineType(name.trim());
      res.json(mt);
    } catch (e: any) {
      res.status(400).json({ error: "Machine type already exists" });
    }
  });

  app.delete("/api/machine-types/:id", (req, res) => {
    storage.deleteMachineType(Number(req.params.id));
    res.json({ ok: true });
  });

}
