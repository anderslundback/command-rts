# Command

A browser-based real-time strategy game rendered entirely with Canvas 2D — no sprite images, no game engine framework. Build bases, harvest ore, train armies, and destroy your opponents across procedurally generated maps.

## Features

- **Three asymmetric factions** — ALLIANCE (balanced), BROTHERHOOD (slow and tough, credit penalty), SYNDICATE (fast and fragile, credit bonus)
- **Full tech tree** — infantry, vehicles, and aircraft unlocked through a building prerequisite chain
- **Armor and weapon types** — eight weapon classes with a damage multiplier matrix covering infantry, light, heavy, building, and air armor
- **Skirmish mode** — single-player vs. up to two AI opponents on a randomly seeded procedural map
- **Internet multiplayer** — up to three human players in a shared lobby; host runs the authoritative simulation and broadcasts snapshots; clients send commands
- **Fog of war** and minimap radar
- **All graphics procedural** — no external image assets; everything is Canvas 2D geometry and fill

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

## Local Development

```bash
git clone <repo-url>
cd Command
pnpm install
pnpm dev
```

The frontend is available at `http://localhost:5173` with hot module replacement.

To run the multiplayer server locally alongside the frontend:

```bash
cd server
node server.js
# WebSocket server starts on ws://localhost:3001
```

You can override the port with the `PORT` environment variable:

```bash
PORT=3001 node server.js
```

Other useful commands:

```bash
pnpm build          # type-check, then bundle to dist/
pnpm exec tsc --noEmit  # type-check only, no output
pnpm preview        # serve the dist/ build locally
```

There are no tests and no linter configured.

## How to Play

### Skirmish (vs AI)

From the main menu, choose **Skirmish**, select your faction, and start. You begin with an MCV (Mobile Construction Vehicle) on the map.

1. Select the MCV and press **F** to deploy it as your Command Center.
2. Build a Power Plant, then a Refinery. The Refinery spawns a Harvester automatically.
3. Harvesters collect ore tiles and return credits to your Refinery.
4. Expand your tech tree — Barracks unlocks infantry, War Factory unlocks vehicles, Airfield unlocks aircraft.
5. Destroy the enemy Command Center to win.

### Multiplayer

From the main menu, choose **Create Game** to host a room. Share the four-character room code with other players, who choose **Join Game** and enter the code. All players select factions in the lobby and ready up. The host starts the game.

### Controls

| Input | Action |
|---|---|
| Left-click | Select unit or building |
| Left-click + drag | Box-select multiple units |
| Double-click unit | Select all visible units of that type |
| Shift + click | Add to or remove from selection |
| Right-click empty ground | Pause / unpause |
| Right-click enemy | Attack |
| Right-click ore tile | Harvest (Harvester only) |
| Right-click own Refinery | Order Harvester to return |
| Right-click own building | Set as primary production building |
| Right-click selected building | Set rally / waypoint |
| Right-click while paused | Cancel front queue item (full refund) |
| Left-click while paused | Resume |
| Mouse edge / Arrow keys | Scroll camera |
| Mouse wheel | Scroll camera |
| Click minimap | Jump camera |
| F | Deploy selected MCV |
| S | Stop selected units |
| H | Jump camera to Command Center |
| P | Toggle pause |
| Escape | Cancel build / repair / sell mode; deselect all; resume if paused |
| B | Switch sidebar to Build tab |
| T | Switch sidebar to Train tab |
| Ctrl/Cmd + A | Select all own units |

## Factions

| Faction | Color | Trait |
|---|---|---|
| ALLIANCE | Blue (`#4aaeff`) | Balanced stats. Faction-exclusive: Artillery, Fighter |
| BROTHERHOOD | Red-orange (`#ff6644`) | +30% HP, -20% credits, slower training. Exclusive: V2 Rocket, Gunship |
| SYNDICATE | Green (`#44dd88`) | +30% credits, faster units, lower HP. Exclusive: Tomahawk, Drone |

## Building Tech Tree

```
Command Center
├── Power Plant ─────┬── Barracks ──── Rifleman, Rocketeer
│                   │                 Turret (defense)
│                   └── War Factory ── Harvester, Scout, AA Track, Tank, MCV
│                                      Artillery / V2 Rocket / Tomahawk (with Radar)
├── Refinery ─────── Radar ──────────── Anti-Air (defense)
│                           └── Airfield ── Fighter / Gunship / Drone
└── (War Factory) ─ Service Depot ─── MCV (unlocks), vehicle repair
```

## Deployment

### Frontend — Vercel

The repository includes `vercel.json` with a catch-all SPA rewrite. Import the repository into Vercel and it deploys automatically on push. No additional build configuration is needed beyond what Vite reads from `package.json`.

You must add one environment variable in your Vercel project settings before the multiplayer client can connect:

| Variable | Value |
|---|---|
| `VITE_WS_URL` | `wss://your-server.up.railway.app` |

The `VITE_` prefix is required for Vite to expose the value to the browser bundle. See `.env.example` for reference.

### Multiplayer Server — Railway

The `server/` directory contains `railway.json` preconfigured for Railway's Nixpacks builder. To deploy:

1. Create a new Railway project and point it at the `server/` directory (or the full repo with root directory set to `server/`).
2. Railway reads `railway.json` and runs `node server.js`.
3. Railway injects a `PORT` environment variable automatically; the server uses it (`process.env.PORT ?? 3001`).
4. Copy the public Railway URL (WebSocket-capable) and set it as `VITE_WS_URL` in your Vercel project settings in the form `wss://your-server.up.railway.app`.

### Wiring Frontend to Server

The frontend reads `import.meta.env.VITE_WS_URL` at runtime to know where to connect. Set this in Vercel project settings (not in a committed `.env` file) and redeploy the frontend after adding it.

For local multiplayer testing, no environment variable is needed — the client falls back to `ws://localhost:3001`.

## Tech Stack

| Layer | Technology |
|---|---|
| Bundler | Vite 6 |
| UI framework | React 19 |
| State management | Zustand 5 (vanilla store, no React context) |
| Language | TypeScript 5 (strict); game engine files in plain JS |
| Rendering | Canvas 2D API (no WebGL, no sprite sheets) |
| Multiplayer transport | WebSocket (`ws` npm package, Node.js server) |
| Frontend hosting | Vercel |
| Server hosting | Railway |

## Architecture Overview

The game uses a split engine + React overlay pattern. A pure-JavaScript game loop owns all simulation state in a mutable singleton (`js/state.js`) and renders to a `<canvas>` element. React components are fixed-position overlays that read exclusively from a Zustand store (`js/store.ts`). The engine pushes snapshots into the store via `syncFromGameState()` once per tick; React never reads game state directly.

In multiplayer, the host runs the full simulation. Clients send input commands via WebSocket and render only the snapshots the host broadcasts. The Node.js server is a pure relay — it holds no game logic.

## License

Private repository — all rights reserved.
