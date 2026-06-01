# AP Tracker v2 Build Notes

## Step 1: DB Migrations
- Added `layouts` table with `id, name, casino, created_at, zones_config`
- Added `machine_types` table with `id, name, is_custom`
- Added `alarm_at TEXT DEFAULT ''` to machines (runtime migration)
- Added `layout_id INTEGER DEFAULT 1` to sessions (runtime migration)
- Seeded Parisian Macao layout as id=1 with all zones/cabinets
- Seeded 13 built-in machine types including new ones

## Step 2: Schema Updates (shared/schema.ts)
- Added `Layout`, `MachineType`, `CabinetConfig`, `ZoneConfig` interfaces
- Added `alarmAt` field to machines
- Added `layoutId` field to sessions
- Extended MACHINE_TYPES with Prosperity Peaks, Golden Egypt, Ocean Magic, Forbidden Beauty, Extreme Wild Lanterns

## Step 3: Backend (server/routes.ts + storage.ts)
- SSE endpoint: `GET /api/sessions/:id/events` with heartbeat
- SSE broadcast on every machine upsert/patch/delete
- SSE broadcast on session PATCH
- Layouts CRUD: GET/POST/PUT/DELETE /api/layouts
- Machine types CRUD: GET/POST/DELETE /api/machine-types
- storage.ts: all new DB operations in raw SQL

## Step 4: Sessions Page
- Layout picker dropdown when creating sessions
- Link to layout builder
- Shows non-default layout name on session cards

## Step 5: FloorMap Major Overhaul
- Loads layout from DB via session's layoutId (falls back to layout 1)
- SSE subscription using EventSource at `__PORT_5000__` URL pattern
- Edit Mode (Lock/Unlock toggle) — inline rename zones/cabinets/machines, add/remove
- Player type color pills on MachineTile (LT, M$, H$, JB, SR, BG, NR, ?)
- Priority auto-rules in MachineEditor (computeAutoRules function)
- 5-min alarm: alarmAt stored, useAlarmToast polling hook fires toasts
- Alarm resets fire every 5 minutes via firedRef cleanup
- Dynamic zones rendered from layout DB, not hardcoded constants
- Circular cabinet detection via `circular: true` on cabinet config

## Step 6: Layout Builder Page
- New page at /layout-builder and /layout-builder/:layoutId
- Add/remove/rename zones with color picker
- Add/remove/rename cabinets with row/col positioning
- Toggle circular display per cabinet
- Add/remove/rename machine slot IDs inline
- Save persists to DB

## Step 7: MachineEditor Machine Types
- Replaced static MACHINE_TYPES dropdown with dynamic list from /api/machine-types
- Search/filter input
- "Add new type..." inline input with POST /api/machine-types
- Custom types marked with "custom" badge

## Step 8: README.md
- Deploy instructions, feature list, tech stack, DB schema, layout JSON schema

## Build: 2025
- `npm run build` from /home/user/workspace/ap-tracker
- Deploy via pplx-tool deploy_website
