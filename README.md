# Relay — drone delivery and drone rental across London

Two things, one app:

- **Send a parcel** across London by drone in minutes: no post office, no queue. Relay shows what Waymo, Uber and other couriers would charge for the same trip, so you can see how the drone compares.
- **Drone rental**: a licensed pilot comes to you with a drone for aerial photos, events or a roof and gutter check. For anything else, you describe the job and get a personalised quote.

**Coming soon: charging stations.** We will have charging stations for our drones at petrol stations and EV charging stations, so that the drones will be ready to deploy whenever needed in the city.

Built for *the PROBLEM day* hackathon (31 Oct 2026). Branch `Arman-Mobile`: the people-first delivery app. The earlier operations dashboard (own fleets, warehouses, control panel) is still on `main`.

---

## Quick start

```bash
npm install
npm run dev          # website on http://localhost:5173 + API server on :8787
```

| URL | What you get |
|---|---|
| http://localhost:5173/ | **Website**: booking panel on the left, big map on the right |
| http://localhost:5173/mobile/ | **Phone app**: the same app laid out for a phone (shown in a phone frame on a laptop) |

To try it on a real phone, run `npm run dev:phone` and open the "Network" address Vite prints, plus `/mobile/`, on a phone on the same Wi-Fi. It can be added to the home screen like an app.

Requires Node 20.19+ (Node 22 recommended). Everything works with **no keys at all**. Production build: `npm run build && npm start` (the API server then serves the app on :8787).

## How it works

The **Home** page has both services side by side, shortcuts (collect from a shop, aerial photos, event filming, roof check, something else), anything in progress and your recent activity.

### Send a parcel

One simple flow, the same on the website and the phone:

1. **Where from, where to.** Home is pre-filled; search any London area or UK postcode.
2. **How should it arrive?**
   - **To the door**: the drone hovers and lowers the parcel on a line.
   - **Collect**: a nearby partner shop (corner shop, newsagent, pharmacy…) takes it from the drone and holds it for 3 days. You pick it up later with a code. The shops show on the map and in a list (walk time, opening hours), and it's £1 cheaper.
3. **How big is it?** Pocket (up to 300 g), Shoebox (up to 2 kg) or **Custom**. With Custom you enter length, width, height and weight, and a fit check compares each side with the drone's payload bay (45 × 35 × 25 cm, 5 kg), turned whichever way fits best.
4. **Fragile.** The drone flies slower and won't take off in gusty air, so deliveries might take longer. The form says so under the toggle.
5. **When.** Now, or a time slot today, tomorrow or the day after.
6. **Prices.** The Relay drone is the option you book: price, arrival time, how much you save, and the route notes. **Waymo, Uber Courier, a cargo bike and a courier van** are shown underneath as estimates to compare.
7. **Track it live.** The drone flies from its Relay port to you, picks up, and flies to the drop-off or shop. You get a PIN, a share link and a collection code. Demo time runs about 24× faster, and "Demo: skip ahead" jumps to the next step.

### Drone rental

1. **What's it for?**
   - **Aerial view**: 15, 30 or 60 minutes in the air (£29 / £49 / £89).
   - **Event**: weddings, parties, sport, launches. **The event length is required**, because event pilots are paid by the hour: £69/h with Drone + pilot, £119/h with Pro, plus £15 for setup. The price updates as soon as you pick the hours.
   - **Roof & gutter check**: £59 for a house, or £89 for flats and larger buildings.
   - **Other**: describe what you need and roughly how long. You get an estimate straight away, then a pilot sends a fixed, personalised quote, and nothing is charged until you accept it.
2. **Where and when**: any address or postcode, as soon as possible or a time slot. The spot is checked against the no-fly zones and the wind at that time.
3. **Choose a package**:
   - **Drone + pilot**: a licensed pilot flies for you.
   - **Pro**: a senior pilot, 4K kit and editing. On a roof check, Pro adds a thermal camera and a written report.
4. **Track it**: the pilot travels to you, runs safety checks, and the drone circles the spot (at its real height in 3D). At the end you get the photos and video, the event film, or a roof report listing what was found.

### Coming soon: charging stations

A "Coming soon" page (in the top bar, and linked from Home) explains the plan: landing and charging pads on petrol station canopies and at EV charging hubs, so a charged drone is always nearby. The map shows 24 planned sites (12 petrol stations, 12 EV hubs, illustrative) with the area each would cover, and you can ask to be notified at launch.

### The map (2D and 3D)

- **No-fly zones (demo only)**: airports, restricted areas, prisons, Royal Parks, a heliport and an event zone, drawn in red and labelled. In 3D they are red volumes.
- **Routes go around them.** The flight line is the shortest path that stays outside every zone (plus a safety margin) and away from tall buildings. Pickups or drop-offs *inside* a zone are refused, and the app offers to deliver to a shop outside the zone instead.
- **Wind and weather**: arrows show the wind direction across the map, and a chip shows wind, gusts and whether drones can fly. Too windy grounds the drone; breezy slows it down.
- **3D**: tilted view, 3D buildings (OpenFreeMap when online; a bundled skyline offline), with the flight line and live drone drawn at their real flying height (90 m).

## Demo script (3 minutes)

1. Website → **Send a parcel** → **Deliver to "Paddington"**: the line bends around Regent's Park (demo no-fly zone).
2. **Collect** → pick a shop on the map. **Custom size** 50 × 30 × 20 cm → "Too big for the drone"; change 50 to 40 → "It fits". Turn **Fragile** on.
3. **See prices**: the drone against Waymo and Uber. Switch to **3D**, **Book drone**, then "Demo: skip ahead" → **Ready to collect** with a code.
4. Try **"Canary Wharf"**: the drop-off is inside a zone. Use "Collect from a shop outside the zone".
5. **Home → Event filming**: "See options" stays disabled until you pick the event length. Pick 3 h, choose **Pro**, book, skip ahead, and watch the drone circle in **3D**.
6. **Home → Something else?**: describe a job, then **Request a quote**. The quote arrives a few seconds later; accept it.
7. **Coming soon**: the planned charging sites at petrol stations and EV hubs, with their coverage on the map.
8. **Account → Demo controls → Storm**: drones are grounded. (If real London wind grounds them during a demo, pick **Calm**.)
9. Open **/mobile/** for the phone version.

## Architecture

```
src/                       React 19 + Vite + Tailwind 4 (one app, two entry points)
  main.tsx / phone.tsx     website (/) and phone app (/mobile/)
  App.tsx                  routes, background work (weather, order ticks), phone frame
  store.ts                 zustand store (persisted): form, orders, saved places, settings
  screens/                 Home, Send, Prices, Track (delivery), Rent, RentOptions, RentTrack (rental), ComingSoon, Activity, Account
  map/                     MapView (MapLibre + deck.gl), light style, scene store
  lib/
    quotes.ts              drone price + comparison estimates
    drone.ts               aircraft limits, payload bay, fit check, Relay ports
    collect.ts             partner shops near a drop-off (demo data)
    orders.ts              delivery simulation (dispatch → pickup → flight → drop-off)
    rental.ts              drone rental: purposes, packages, prices, personalised quotes, pilot + flight simulation
    stations.ts            Coming soon: planned charging sites at petrol stations and EV hubs (demo)
    weather.ts geocode.ts  Open-Meteo, London places + postcodes.io
  ui/                      Shell (website vs phone layout), kit, art, PlacePicker, WhenPicker
shared/                    code used by both web and server
  routing.ts               drone route planner (visibility graph around zones and tall buildings)
  geo.ts weather.ts        geometry, flyability (wind, gusts, rain, temperature)
  data/london.ts           London places, tall buildings, demo airspace
server/                    Express 5 API (keeps keys off the browser)
  providers/               adapter contract + Uber Direct + Waymo (partner): prepared, not connected
```

## Connecting real services

Nothing below is needed for the demo. Comparison prices are estimates until a provider is connected.

### Uber (Uber Direct)
`server/providers/uber-direct.ts` implements quote → deliver → cancel → status against the Uber Direct API (OAuth client credentials with the `eats.deliveries` scope; `POST /v1/customers/{customer_id}/delivery_quotes` and `/deliveries`). Add `UBER_DIRECT_CLIENT_ID`, `UBER_DIRECT_CLIENT_SECRET` and `UBER_DIRECT_CUSTOMER_ID` from the Direct dashboard (account approval may be needed) and check the field mapping against the docs for your account.

### Waymo
Waymo doesn't offer a public self-serve delivery API; its London launch is a ride-hailing service. `server/providers/waymo.ts` has the same contract with placeholder calls, ready for a partner API (`WAYMO_PARTNER_API_KEY`, `WAYMO_PARTNER_BASE_URL`).

## Data & assumptions

- **No-fly zones are illustrative (demo only):** approximate airport FRZs, restricted areas, prisons, Royal Parks, a heliport and a temporary event zone. Real flights need NATS/CAA data, permissions and a qualified operator. Never use this for real flight planning.
- **The drone** (Relay Skylift H5) is fictional: 45 × 35 × 25 cm bay, 5 kg, 55 km/h cruise (38 km/h fragile), wind limit 12 m/s (10.5 m/s fragile), 28 km range, 90 m cruise height.
- **Partner shops** are generated near the drop-off with made-up names; closed shops can't be picked.
- **Charging sites** (Coming soon) are planned, illustrative locations on main roads; no real petrol station or charging network is involved.
- **Comparison prices** are estimates from typical fares. Uber's courier limit follows its published small-item rules (~15 lb / 6.8 kg). CityHop and Thames Express are fictional.
- **Weather** comes from Open-Meteo (free for non-commercial use) and is simulated offline. Account → Demo controls overrides it.
- Pilots, quotes, results (photos, films, roof reports), drones, tracking links and payments are simulated.
