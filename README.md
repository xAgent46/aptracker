# AP Tracker v2

Casino slot machine Advantage Play (AP) tracker app with real-time multi-user sync.

## Features

- **Custom Layouts** — Create, edit, and save floor layouts with zones, cabinets, and machine slots
- **Parisian Macao** — Pre-seeded default layout (Carousel/Pared, Pasillo, Smoking Room)
- **Real-time Sync** — Server-Sent Events (SSE) for live updates across multiple devices
- **Master Edit Mode** — Lock/unlock to inline-edit zone names, cabinet labels, machine IDs
- **Priority Auto-rules** — Automatic priority/alarm based on status + player type
- **5-minute Alarms** — Toast notifications when high-priority machine timers expire
- **Player Type Tags** — Color-coded pills (LT, M$, H$, JB, SR, BG) on machine tiles
- **Machine Type Search** — Dynamic search + add custom types in the editor
- **Session Reports** — Full P&L, timing, break tracking, AP signal summary
- **Break Tracking** — Smoke, food, or other breaks with elapsed timers
- **Drag & Drop** — Reorder cabinets and machines within the floor map
- **Bulk Status** — Set all machines in a zone to any status at once
- **Dark Casino Theme** — Optimized for low-light casino environments

## Deploy

```bash
npm install
npm run build
node dist/index.cjs
```

The server runs on port 5000.

## Development

```bash
npm run dev
```

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express + SQLite (better-sqlite3)
- **Real-time**: Server-Sent Events (SSE)
- **Routing**: Wouter with hash routing
- **Drag & Drop**: @dnd-kit/core + @dnd-kit/sortable

## Database

SQLite at `data.db`. Tables:
- `sessions` — Casino sessions
- `machines` — Machine status per session
- `layouts` — Floor layout configurations (JSON zones config)
- `machine_types` — Built-in and custom machine types

## Layout JSON Schema

```json
[{
  "id": "zone_id",
  "name": "Zone Name",
  "color": "border-amber-600",
  "cabinets": [{
    "id": "cab_id",
    "label": "CAB A",
    "machineIds": ["P-01", "P-02"],
    "row": 0,
    "col": 0,
    "circular": false
  }]
}]
```
