# Command

A browser-based real-time strategy game rendered entirely with Canvas 2D — no sprite images, no game engine framework. Build bases, harvest ore, train armies, and destroy your opponents across procedurally generated maps.

## Features

- **Three asymmetric factions** — ALLIANCE (balanced), BROTHERHOOD (slow and tough, credit penalty), SYNDICATE (fast and fragile, credit bonus)
- **Full tech tree** — infantry, vehicles, and aircraft unlocked through a building prerequisite chain
- **Armor and weapon types** — eight weapon classes with a damage multiplier matrix covering infantry, light, heavy, building, and air armor
- **Skirmish mode** — single-player vs. two AI opponents on a randomly seeded procedural map
- **Internet multiplayer** — up to three human players; deterministic rollback netcode keeps all clients in sync with zero input delay
- **Fog of war** and minimap radar
- **All graphics procedural** — no external image assets; everything is Canvas 2D geometry and fill
- **Replays** — save and watch back any multiplayer match
- **Combat feedback** — floating damage numbers, attack range rings, "under attack" screen alert

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
pnpm test           # run determinism and logic verification (Node.js, no browser)
pnpm exec tsc --noEmit  # type-check only, no output
pnpm preview        # serve the dist/ build locally
```

## How to Play

### Skirmish (vs AI)

From the main menu, choose **Skirmish**, select your faction, and start. You begin with an MCV (Mobile Construction Vehicle) on the map.

1. Select the MCV and press **F** to deploy it as your Command Center.
2. Build a Power Plant, then a Refinery. The Refinery spawns a Harvester automatically.
3. Harvesters collect ore tiles and return credits to your Refinery.
4. Expand your tech tree — Barracks unlocks infantry, War Factory unlocks vehicles, Airfield unlocks aircraft.
5. Destroy all enemy buildings to win.

### Multiplayer

From the main menu, choose **Create Game** to host a room. Share the four-character room code with other players, who choose **Join Game** and enter the code. All players select factions in the lobby and ready up. The host starts the game.

All players run a full deterministic simulation locally. Commands are broadcast via the server and replayed with rollback if any arrive late — input delay is zero from each player's perspective.

### Controls

| Input | Action |
|---|---|
| Left-click | Select unit or building |
| Left-click + drag | Box-select multiple units |
| Double-click unit | Select all visible units of that type |
| Shift + click | Add to / remove from selection |
| Shift + right-click / order | Queue command (shift-queue) |
| Right-click enemy | Attack |
| Right-click own building | Set as primary / set waypoint |
| Right-click while paused | Cancel front queue item (full refund) |
| Mouse edge / Arrow keys | Scroll camera |
| Mouse wheel | Scroll camera |
| Click or drag minimap | Jump / pan camera |
| **Escape** | Cancel active mode (build / repair / sell / A / P) → deselect → **pause** |
| **A** | Attack-move mode (click destination) |
| **P** | Patrol mode (click destination; unit bounces A↔B, auto-attacks) |
| **S** | Stop selected units |
| **F** | Deploy selected MCV |
| **H** | Jump camera to Command Center |
| **B** | Switch sidebar to Build tab |
| **T** | Switch sidebar to Train tab |
| **Ctrl/Cmd + A** | Select all own units |
| **1–9** | Recall control group (double-tap to center camera) |
| **Ctrl + 1–9** | Assign selection to control group |

### Speed Control

The speed bar in the top-right (`◄ NORMAL ►`) adjusts simulation rate: Slowest → Slow → Normal → Fast → Fastest. In multiplayer only the host can change speed.

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

The repository includes `vercel.json` with a catch-all SPA rewrite. Import the repository into Vercel and it deploys automatically on push.

Add one environment variable in your Vercel project settings:

| Variable | Value |
|---|---|
| `VITE_WS_URL` | `wss://your-server.up.railway.app` |

### Multiplayer Server — Railway

The `server/` directory contains `railway.json` preconfigured for Railway's Nixpacks builder:

1. Create a new Railway project pointing at the `server/` directory.
2. Railway reads `railway.json` and runs `node server.js`.
3. Copy the public Railway URL and set it as `VITE_WS_URL` in Vercel.

For local multiplayer testing, no environment variable is needed — the client falls back to `ws://localhost:3001`.

## Tech Stack

| Layer | Technology |
|---|---|
| Bundler | Vite 6 |
| UI framework | React 19 |
| State management | Zustand 5 (vanilla store, no React context) |
| Language | TypeScript 5 (strict); game engine in plain JS |
| Rendering | Canvas 2D API (no WebGL, no sprite sheets) |
| Multiplayer transport | WebSocket (`ws` npm package, Node.js server) |
| Netcode | Deterministic rollback (GGPO-style) — all clients simulate locally |
| Frontend hosting | Vercel |
| Server hosting | Railway |

## Architecture Overview

The game uses a split engine + React overlay pattern. A pure-JavaScript game loop owns all simulation state in a mutable singleton (`js/state.js`) and renders to a `<canvas>` element. React components are fixed-position overlays that read exclusively from a Zustand store (`js/store.ts`). The engine pushes snapshots via `syncFromGameState()` once per tick; React never reads game state directly.

### Multiplayer (rollback netcode)

All players run the full simulation locally on a fixed 20Hz tick rate. When a player issues a command it is applied immediately (zero input delay) and sent to the server, which relays it to all other clients. If a remote input arrives after the tick it belongs to, the engine rolls back to the last snapshot before that tick, re-simulates with the correct inputs, and resumes — invisible at typical latencies. A ring buffer of 8 snapshots (400ms at 20Hz) covers the rollback window. Every 20 ticks each client sends an entity hash for desync detection.

### Skirmish

Single-player mode bypasses all networking. The same simulation loop runs without rollback; AI opponents are deterministic via a seeded PRNG (`js/rng.js`).

## License

Private repository — all rights reserved.
