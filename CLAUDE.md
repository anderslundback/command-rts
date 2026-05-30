# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and run

```bash
pnpm install
pnpm dev        # http://localhost:5173 with HMR
pnpm build      # type-check → bundle → dist/
pnpm test       # run determinism/logic tests (Node.js, no browser required)
pnpm exec tsc --noEmit  # type-check only

# Multiplayer server (separate process)
cd server && node server.js   # WebSocket server on :3001
```

`pnpm test` runs `test/verify.js` — pure Node.js checks of `rng.js` and the entity-hash formula. No test framework, no browser needed. Add tests there for any new pure functions.

## Architecture: split engine + React overlay

**Entry point:** `index.html` → `js/main.ts`. Mounts React on `<div id="ui-root">`, wires `<canvas id="canvas">`, calls `initInput()`.

**Canvas engine** (pure JS, `js/*.js`): draws everything via `state.js`'s mutable singleton. The game loop in `game.js` runs at a fixed 20Hz accumulator rate, updates entities, runs AI, then calls `syncFromGameState()` once per tick to push a plain-data snapshot into the Zustand UI store. Rendering is decoupled at 60fps via sub-tick alpha interpolation (`e.prevPx/prevPy`).

**Multiplayer — deterministic rollback:** All players run the full simulation locally. Commands are applied immediately and relayed via the WebSocket server. If a remote input arrives late, the engine rolls back to the nearest snapshot and re-simulates. The server is a pure relay — no game logic. `js/lockstep.js` owns snapshot save/restore, rollback, and input scheduling. `js/rng.js` provides a seeded, restorable PRNG so all randomness is deterministic.

**React overlay** (`js/ui/*.tsx`, `js/store.ts`): React reads only from the Zustand `uiStore` — never from `state.js` directly. Components are fixed-position overlays with `pointer-events: none` on the root and `pointer-events: auto` on interactive children. The sidebar radar canvas is owned by React (`<canvas id="radar">` in `Sidebar.tsx`) and its ref is written into `state.radar` via `useEffect` so `renderer.js` can draw to it.

### State access patterns

| Who | Reads | Writes |
|---|---|---|
| Canvas engine (`.js` files) | `state` directly | `state` directly |
| `syncFromGameState()` | `state` | `uiStore.setState({...})` |
| React components | `useUIStore(selector)` | `state` directly then call `syncFromGameState()` |
| `netClient.js` | WebSocket messages | `uiStore.setState(...)` directly (lobby/net slices only) |

**Rule:** Game-logic mutations happen in the JS engine or in React event handlers that write to `state` directly. React never reads from `state`. The Zustand store (`uiStore`) is read-only from React's perspective.

### Game loop structure

```
loop() [requestAnimationFrame / setTimeout when tab hidden]
  ├── accumulator += dt
  ├── while accumulator >= tickMs: gameTick()   ← fixed 20Hz simulation
  ├── updateParticles()                          ← cosmetic, per render frame
  ├── advance damageNumbers (age/position)       ← cosmetic, per render frame
  ├── syncFromGameState()
  ├── _applyRenderAlpha(alpha)                   ← lerp unit positions for 60fps
  ├── render() / renderMinimap()
  └── _restoreRenderAlpha()
```

`gameTick()` is also exported as `_gameTick()` for `lockstep.js` rollback replay.

## Module map

| File(s) | Role |
|---|---|
| `js/state.js` | Mutable game-state singleton; `state.net` is null in skirmish |
| `js/game.js` | `startGame`, `startNetGame`, `showMenu`, `togglePause`, `setGameSpeed`, `saveReplay`, `startReplay`; game loop |
| `js/lockstep.js` | `saveSnapshot`, `restoreSnapshot`, `scheduleInput`, `storeTickSnapshot`, `onRemoteInput`, `entityHash`; rollback ring buffer |
| `js/rng.js` | `makeLCG(seed)` — Mulberry32 PRNG with `getState`/`setState` for rollback |
| `js/commands.js` | `applyCommand(cmd)` — applies all action types; used by both local skirmish and rollback replay |
| `js/net/netClient.js` | Browser WebSocket singleton; `scheduleInput(cmd)` routes commands through rollback in multiplayer; `registerGameCallbacks()` avoids circular imports |
| `js/constants.js` | `BDEF`, `UDEF`, `FDATA`, `FBONUSES`, `ARMOR_MULT`, `BUILD_TYPES`, `DEFENSE_TYPES`, `TRAIN_FROM` |
| `js/entities.js` | `Ent`, `Building`, `Unit` classes; `addEnt`, `getEnt`, `removeDeadEnts` |
| `js/renderer.js` | Canvas 2D rendering; range rings for selected armed entities; floating damage numbers; under-attack border; `renderMinimap()` |
| `js/input.js` | Mouse/keyboard handlers; Escape = layered cancel → pause; A = attack-move mode; P = patrol mode; 1–9 control groups; `onRadarRightClick` for minimap move orders |
| `js/orders.js` | `orderMove`, `orderAttack`, `orderAttackMove`, `orderPatrol`, `orderStop`, `orderHarvest` |
| `js/hud.js` | Thin wrappers: `setMsg`, `updateHUD`, `updateBuildPanel`, `switchTab` — all call `syncFromGameState()` |
| `js/store.ts` | `uiStore` (Zustand vanilla), `syncFromGameState()`, `useUIStore` hook |
| `js/ui/App.tsx` | Root React component; renders HUD+Sidebar when playing, Menu when in menu/gameover, PauseMenu overlay |
| `js/ui/HUD.tsx` | Fixed 36px top bar: faction, credits, power, status msg, speed control, FPS, replay badge |
| `js/ui/Sidebar.tsx` | Fixed 200px right panel: radar canvas (with drag-to-pan), power bar, InfoPanel, tab buttons, BuildPanel |
| `js/ui/BuildPanel.tsx` | Build/train tabs with queue rows and cancel buttons |
| `js/ui/InfoPanel.tsx` | Selected entity details; DEPLOY MCV button |
| `js/ui/Menu.tsx` | SKIRMISH / CREATE GAME / JOIN GAME sub-phases; faction select; game-over screen with Save Replay |
| `js/ui/LobbyScreen.tsx` | Pre-game lobby: player list, faction selects, chat, ready/start |
| `js/ui/PauseMenu.tsx` | Pause overlay with resume/volume/quit |
| `js/ai.js` | Per-faction AI: building construction, unit training, harvester management, attack waves, harvester harassment, defensive recall, building repair |
| `js/map.js` | Procedural map gen, tile passability, ore regen |
| `js/placement.js` | `canPlace`, `placeBuilding`, `spawnUnit`, `deployMcvInPlace` |
| `js/combat.js` | `dealDmg`, `dealSplash`, `autoAttack`; pushes `state.damageNumbers`; sets `state.underAttackTimer` |
| `js/units.js` | `updateUnit`, `updateAirUnit`; handles idle/move/attack/attack_move/patrol/harvest/return states; `dequeueNext` for shift-queue |
| `js/pathfinding.js` | 8-direction A* (`astar`, `astarNaval`) — cardinals cost 1, diagonals cost √2; octile heuristic; corner-cut prevention; per-tick occupancy cache |
| `js/resources.js` | Pure power/credit helpers |
| `js/particles.js`, `js/audio.js` | Cosmetic effects and voice lines |
| `js/shells.js` | Projectile simulation and collision |
| `js/fog.js` | Fog-of-war bitmap |
| `server/server.js` | Node.js WebSocket relay; room/lobby management; desync detection; no game logic |
| `test/verify.js` | Node.js tests for `makeLCG`, `entityHash`, Bresenham installments, power quantisation, credit determinism |

## Key conventions

**Faction indices:** 0=ALLIANCE, 1=BROTHERHOOD, 2=SYNDICATE. `FBONUSES[f]` gives per-faction stat multipliers. Faction-exclusive units use `factionOnly: 0|1|2` in UDEF; BuildPanel filters them by player faction.

**Air units** (`armorType === 'air'`): bypass `updateUnit` → `updateAirUnit`. Move pixel-by-pixel with `moveAirToward()` — no A* pathfinding. Immune to crush, invisible to ground-unit path-blockers. `orderMove` sets `u.destPx/u.destPy` for air units instead of a tile path.

**Coordinates:** Tiles are 32×32px (`TS=32`). Map is 80×60 tiles. `e.x/e.y` = tile coords; `e.px/e.py` = pixel (interpolated). Camera at `state.cam.x/y` pixel offset.

**Entity lifecycle:** `addEnt(new Building/Unit(...))` → set `e.dead = true` to kill → `removeDeadEnts()` purges each frame.

**Build queues:** `state.hudBuildQueue[faction]` for structures, `state.hudDefQueue[faction]` for defenses, `building.trainQ` for units. Items: `{ type, t, total, paid, creditAcc, ready }`. `paid` tracks integer credits deducted so far (refunded on cancel). `creditAcc` is the Bresenham accumulator for integer installments (see below).

**Order system:** All order functions in `orders.js` accept a `queued` boolean. When `queued=true` the order is pushed onto `u.orderQueue`; `dequeueNext(u)` in `units.js` pops and executes the next order when the current one completes. The `'patrol'` state bounces between `u.patrolA`/`u.patrolB`, auto-attacking enemies in range, and resuming patrol after each kill.

**MCV deploy:** `deployMcvInPlace(mcv)` in `placement.js` — instantly transforms MCV into Command Center at the nearest valid position. No buildMode cursor.

**Escape key — layered cancel:** Escape cancels the most recently entered mode in priority order: atkMoveMode → patrolMode → buildMode/repairMode/sellMode → clear selection → `togglePause()`. When paused, Escape always unpauses first.

**Pause:** Right-click empty ground OR Escape (when nothing to cancel) → `togglePause()`. While paused, right-click cancels the front queue item (full refund). Left-click on canvas resumes.

**Rollback snapshot discipline:** `snapshotEnt` in `lockstep.js` walks `for (const k in e)` so primitive own properties (e.g. `facing`, `chassisFacing`, `scoopEvent`, `dumpEvent`) are captured automatically. The explicit allowlist after the for-in is for **reference fields that must be cloned**, currently: `path`, `trainQ`, `harvestTile`, `waypoint`, `orderQueue`, `atkMoveDest`, `patrolA`, `patrolB`, `cargo`. If you add a new mutable **object/array** field to `Unit` or `Building`, add it to `snapshotEnt`/`restoreEnt` or rollback will mutate the snapshot in place. Primitive fields just work.

**Cosmetic vs. simulation state:** `state.damageNumbers` and `state.particles` are cosmetic — updated per render frame in `loop()`, not in `gameTick()`, and never snapshotted. `state.underAttackTimer` is simulation state (decremented in `gameTick()`), but only set for the local player's buildings and gated on `!state.isRollingBack` in `combat.js`, so it stays client-local.

**Animation event-stamps:** Entity fields like `e.doorEvent`, `u.scoopEvent`, `u.dumpEvent` are tick stamps written from inside `gameTick` (so they're deterministic across clients) and read by the renderer as `tick - eventTick` to drive a finite animation window. They're primitives so the for-in in `snapshotEnt` captures them — rollback restores them automatically. Don't gate the write on `!state.isRollingBack`: replays must produce the same stamps so the animation lands at the same render tick on every client.

**Chassis vs aim:** `u.chassisFacing` is the body/hull direction (updated in `stepPath` from the next path tile's `atan2`). `u.facing` is the gun/turret aim direction (updated in `combat.js` and the `attack` state when locked onto a target). Vehicle renderers draw the chassis with `chassisFacing` and the turret/barrel with `facing` so chassis can lead the movement while the gun tracks targets. For chassis-only units (harvester, mcv, v2), use `chassisFacing` for the whole body. For aircraft, the air-pathless mover sets both to the same value.

**PRNG:** All game-logic randomness uses `state.rng()` (set by `startGame`/`startNetGame`). Cosmetic randomness in `particles.js`, `audio.js`, and tile rendering can use `Math.random()`. Never use `Math.random()` in `ai.js`, `map.js`, or anywhere that runs inside `gameTick()`.

**Control groups:** `state.controlGroups[0..8]`. Ctrl+1–9 assigns current selection; 1–9 recalls; double-tap centers camera on the group.

**Desync detection:** Every 20 ticks in multiplayer, each client sends `{ type: 'state_hash', tick, hash }` to the server. The server compares hashes across clients and broadcasts `{ type: 'desync' }` on mismatch. `entityHash` in `lockstep.js` XORs position and HP of all live entities.

**Multiplayer command flow:** `scheduleInput(cmd)` in `netClient.js` records the command in `rollback.inputHistory[tick+1][mySlot]` and sends it to the server. The command is applied during the next `gameTick` via the `inputHistory` loop — NOT immediately. Remote inputs arrive via the `'input'` WebSocket message, are stored in `inputHistory`, and trigger `onRemoteInput` which calls `rollbackAndReplay` if the tick was already simulated with a wrong prediction.

**Rollback snapshot timing:** `storeTickSnapshot()` is called at the **end** of `gameTick`, after all entity updates (unit movement, building queues, credit deductions, `removeDeadEnts`). This is critical — storing it before entity updates means each rollback silently skips one tick's worth of simulation, causing credits and entity state to drift. The snapshot at tick T represents the complete, final state at the end of tick T.

**Credit system — integer Bresenham installments:** All credit values are integers. Building/unit costs are deducted in 1-credit increments using a Bresenham/DDA accumulator: `creditAcc += cost * k` each tick (where `k = pwr * 4`, integer 1–4); 1 credit is deducted each time `creditAcc` crosses `4 * total`. Power ratio `pwr` is snapped to the nearest ¼ (`Math.round(pwr * 4) / 4`) so it is always exactly representable in IEEE 754 — ensuring `item.t` accumulation and credit deductions are bit-identical across all clients. Construction stalls only when `credits < 1` and a deduction is due (allowing partial-payment starts). `item.paid` tracks deductions made; `cancel_build`/`cancel_train` refund `item.paid`. Harvester deposits use `Math.round(ore * creditMult)`; sell refunds use `Math.floor(cost / 2)`.

**Minimap right-click:** `onRadarRightClick` in `input.js` converts the radar canvas position to tile coords and issues a `move` command for all selected units (same formation-spread logic as main-canvas right-click). Shift+right-click queues. `contextmenu` is suppressed on the radar canvas to prevent the browser save-image menu.

**Circular import prevention:** `combat.js`, `orders.js`, `pathfinding.js`, `resources.js` don't import from `units.js`/`buildings.js`. `netClient.js` ↔ `game.js` avoid circular dependency via `registerGameCallbacks()`.

**JS/TS interop:** TypeScript files import JS modules with `// @ts-ignore` + typed as `any`. Example: `import { state as _s } from './state.js'; const s: any = _s;`

## Code style

- No comments unless the WHY is non-obvious
- React components use inline styles for layout; CSS classes (`.build-btn`, `.build-tab`, `.faction-btn`, `.pause-btn`) for interactive styling that needs hover states
- TypeScript strict mode; `any` is acceptable at JS/TS boundaries
- `syncFromGameState()` is the only bridge from JS engine → React; call it after any state change that React needs to reflect
- **Zustand selectors must be primitive:** `useUIStore(s => ({ a: s.a, b: s.b }))` returns a new object reference each render and triggers React 18's `useSyncExternalStore` infinite-loop guard. Always select one primitive at a time: `const a = useUIStore(s => s.a); const b = useUIStore(s => s.b);`
