# HIVE — Autonomous Operations, London

One dashboard to **price, book, plan and control every way of moving goods around London**: Hive drones, Waymo robotaxis, couriers, partner vans and cargo bikes, and a company's **own fleet** — vans, trucks, drivers, humanoid robots, warehouse AMRs, sidewalk robots and robot arms.

Built for *the PROBLEM day* hackathon (31 Oct 2026).

---

## Quick start

```bash
npm install
npm run dev          # web app on http://localhost:5173 + API server on :8787
```

Requires Node 20.19+ (Node 22 recommended). Everything works with **no keys at all** — providers, devices and weather fall back to a built-in simulation. To switch real services on, copy `.env.example` to `.env` and fill in what you have (see *Connecting real services*).

Production build: `npm run build && npm start` (the API server then also serves the app on :8787).

## What's in it

| Page | What it does |
|---|---|
| **Overview** | Live KPIs, a London map with machines on jobs coloured by time-to-drop-off, fleet status, deliveries per hour, delivery mix, airspace & weather. |
| **Live Map** | Every machine and vehicle in London. **2D / 3D** (3D buildings + skyline, extruded no-fly zones, drone altitude stalks, wind field), drone-ops panel (wind at 120 m, gusts, GO / CAUTION / NO-GO per model), layer toggles, fly-to presets. Select machines by **Shift-drag box**, click, or the list on the left; command them from the right panel. |
| **Request Job** | Chat with the **assistant** or fill the form — they stay in sync. One-off, scheduled or **repeating** jobs. Every method is priced side by side, Uber-style (drone, Waymo, courier, partner van, cargo bike, each of your own vehicles) with badges (cheapest / fastest / greenest / best match) and a **“your fleet vs marketplace”** comparison that includes driver time, fuel/charging, wear, Congestion Charge and ULEZ. |
| **Jobs** | Active, scheduled, recurring and completed jobs; detail drawer with route map, timeline, change method, duplicate, cancel / stop series. |
| **Fleet** | Registry of machines, people and locations. Register any machine (drone, van, truck, car, robotaxi, cargo bike, humanoid, AMR, sidewalk robot, robot arm) with specs, compliance and connection protocol. Bulk-assign machines to locations, assign drivers/pilots. |
| **Locations** | Warehouses, stores, depots, drone ports and charging hubs, each with its machines, a **warehouse floor view** (which robot is in which zone doing what), tasks and deliveries in/out. |
| **Machine Tasks** | Give machines work **in a time window, before or after a delivery, between two deliveries, or whenever idle**, optionally repeating. Timeline of tasks and deliveries per machine. Fleet-wide automations (auto-charge, weather fallback, return home, fill idle time, airspace guard). |
| **Control Panel** | Control anything registered: pause/resume/hold, return to base, go-to, take off/land, **E-STOP** (with hold-to-confirm for the global one), charge, payload bay, lights/horn, sleep/wake, reboot, firmware, speed limits, reassignment, driver messages, cancel provider trips. **Playbooks** (storm protocol, ground all drones, recall, night mode…), live telemetry and a full command audit log. Natural-language commands too: “return all drones at Nine Elms”. |
| **Integrations** | Status and test buttons for providers, device adapters, AI and data feeds. |
| **Settings** | Own-fleet cost model, simulation speed, weather override (calm / breezy / storm to demo drone groundings), demo reset. |

`⌘K` / `Ctrl K` opens a command palette: jump anywhere, find any machine/job/location, or type a command or a delivery request.

## Demo script (3 minutes)

1. **Overview** — “this is London right now”: jobs in flight, on-time rate, drone weather status.
2. **Request Job** → click *“30 kg of catering from Shoreditch store to Bank now”* — Waymo, a cargo bike and a partner van are priced next to your own vans, and the *your fleet vs marketplace* card shows what your van really costs once driver time, charging, wear and London charges are counted.
3. Try *“2 kg parcel from Kensington store to Notting Hill now”* → drone vs Waymo vs Uber vs your sidewalk robot. Say **“book it”**. Then *“6 pallets chilled from Park Royal warehouse to King's Cross store tomorrow at 7am”* — everything that can't carry 1.5 t of chilled goods drops out with a reason, leaving your refrigerated truck.
4. **Live Map** → 3D → the City skyline, no-fly cylinders, drones flying around them. Settings → weather **Storm** → drones go NO-GO and waiting drone jobs are automatically re-booked by road.
5. **Control Panel** → select all drones → *Return to base*, or run the **Storm protocol** playbook. Show the audit log.
6. **Locations** → Park Royal DC → floor view; **Machine Tasks** → “load TR-01 10 min before J-1003 leaves”.

## Architecture

```
src/                     React 19 + Vite + Tailwind 4 web app
  pages/                 Overview, LiveMap, RequestJob, Jobs, Fleet(+Locations), Tasks, ControlPanel, Integrations, Settings
  components/map/        MapLibre GL + deck.gl (FleetMap, layers, dark styles, offline fallback)
  store/useStore.ts      zustand store (persisted to localStorage) — the single source of truth
  sim/                   simulation engine: dispatch, movement, tasks, automations, demo traffic
  integrations/
    assistant.ts         chat → intent (Claude via the API server, or the offline parser) → draft/quotes/booking/commands
    devices/             capabilities per machine type, protocol translations, simulator (digital twin)
    weather.ts           Open-Meteo (wind at 10/80/120 m, gusts, rain, visibility)
    geocode.ts           sites + London places + postcodes.io
shared/                  code used by both web and server
  types.ts               domain model
  pricing.ts             quote engine for every provider + own-fleet costing + ranking
  routing.ts             drone routes around no-fly zones and tall buildings; road approximations
  parser.ts              offline natural-language parser (jobs, timing, recurrence, cargo, commands)
  schedule.ts            recurrence rules (daily / weekdays / specific days / hourly / monthly)
  providers.ts           marketplace provider catalogue
  data/london.ts         London places, tall buildings, demo airspace, congestion zone
server/                  Express 5 API (keeps keys off the browser)
  ai/assistant.ts        Claude tool-use intent extraction
  providers/             adapter contract + Uber Direct + Waymo (partner) adapters
  devices/               MAVLink / ROS 2 / VDA 5050 / vendor / MQTT bridge slots
```

The browser runs a **digital twin**: machines move along routes, jobs dispatch, tasks run, batteries drain and charge. The sim clock runs ×4 by default (change it from the clock in the top bar).

## Connecting real services

Nothing below is required for the demo.

### Claude (assistant)
Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`). The server sends the message, the current draft, your sites and machine ids to Claude with a single forced tool (`interpret_request`) and returns a structured intent. **Prices are always calculated by the app**, never by the model. Without a key the offline parser handles the same intents.

### Uber (Uber Direct)
`server/providers/uber-direct.ts` implements quote → deliver → cancel → status against the Uber Direct API (OAuth client credentials with the `eats.deliveries` scope; `POST /v1/customers/{customer_id}/delivery_quotes` and `/deliveries`). Add `UBER_DIRECT_CLIENT_ID`, `UBER_DIRECT_CLIENT_SECRET` and `UBER_DIRECT_CUSTOMER_ID` from the Direct dashboard (account approval may be needed) and check the field mapping against the docs for your account.

### Waymo
Waymo doesn't offer a public self-serve delivery API; its London launch is a ride-hailing service. `server/providers/waymo.ts` has the same contract with placeholder calls, ready for a partner API (`WAYMO_PARTNER_API_KEY`, `WAYMO_PARTNER_BASE_URL`).

### Another courier
Add a file in `server/providers/` implementing `ProviderAdapter` (quote, book, cancel, status), register it in `server/providers/index.ts` and add it to `shared/providers.ts` + `ROAD_PROVIDERS` in `shared/pricing.ts`.

### Real machines
Each machine has a `protocol` and `endpoint`. Commands are translated per protocol (see `src/integrations/devices/capabilities.ts` → `protocolMessage`, and `server/devices/index.ts`):

| Protocol | For | Bridge |
|---|---|---|
| MAVLink | PX4 / ArduPilot drones | `MAVLINK_BRIDGE_URL` (MAVSDK server / mavlink2rest) — `MAV_CMD_NAV_RETURN_TO_LAUNCH`, `MAV_CMD_DO_REPOSITION`, `MAV_CMD_DO_PAUSE_CONTINUE`… |
| ROS 2 | humanoids, sidewalk robots, arms | `ROSBRIDGE_URL` (rosbridge_suite) — Nav2 `NavigateToPose`, pause/resume services, latched e-stop topic |
| VDA 5050 | warehouse AMRs / AGVs | `VDA5050_MQTT_URL` — orders and instantActions (`startPause`, `stopPause`, `cancelOrder`) |
| Vendor API | vans, trucks (telematics / driver app) | `VENDOR_API_BASE_URL` |
| MQTT | anything custom | `DEVICE_MQTT_URL` — `devices/<id>/cmd`, `devices/<id>/state` |

Until a bridge is connected, commands run on the digital twin and the audit log says so (“via MAVLink bridge (not connected → simulated)”). Hardware E-STOPs must always remain the primary safety system.

## Data & assumptions

- **Airspace is illustrative** (approximate Heathrow / London City FRZs, RAF Northolt, a heliport, prisons, Royal Parks, a temporary event zone). Real flights need NATS / CAA data, permissions and a qualified operator. Never use this for real flight planning.
- Tall buildings for the skyline are approximate positions/heights; real 3D buildings come from OpenFreeMap (OpenStreetMap) tiles when online. Offline, a bundled borough map is used.
- London charges in the cost model: Congestion Charge **£18/day** (electric vans **£9** with Auto Pay; Mon–Fri 07:00–18:00, Sat–Sun 12:00–18:00), ULEZ **£12.50/day** for non-compliant vehicles. Check TfL before relying on them; they're editable in Settings.
- Uber courier limits follow Uber's published small-item rules (~15 lb / 6.8 kg, under £200). Thames Express and CityHop are **fictional** demo partners.
- Weather: Open-Meteo (free for non-commercial use); simulated when offline.

## Ideas for what's next

- Real-time multi-drop route optimisation (VRP) across own fleet + marketplace, and batching small orders onto one drone/robot run.
- Drone corridors & NOTAM ingestion, Remote ID broadcast monitor, and a pilot hand-over console (one pilot supervising many drones).
- Infrastructure inspection jobs (power lines, rooftops, rail) booked like deliveries, with the drone patrol flown automatically.
- Proof of delivery (photos, PIN, signature) and customer tracking links.
- Battery-swap scheduling, charger reservations and energy-price-aware charging.
- Live video tiles for drones and robots, and teleoperation hand-off for stuck robots.
- Multi-tenant orgs, roles & approvals (e.g. a supervisor must approve an E-STOP release), SSO and an audit export.
- Carbon reporting per job/customer and SLA penalties per provider.
- Rent-out marketplace: let companies list idle drones/robots for other companies' jobs.
