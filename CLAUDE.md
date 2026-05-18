# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and run

```bash
pnpm install
pnpm dev        # http://localhost:5173 with HMR
pnpm build      # type-check → bundle → dist/
pnpm exec tsc --noEmit  # type-check only
```

No tests, no linter.

## Architecture: split engine + React overlay

**Entry point:** `index.html` → `js/main.ts`. Mounts React on `<div id="ui-root">`, wires `<canvas id="canvas">`, calls `initInput()`.

**Canvas engine** (pure JS, `js/*.js`): draws everything via `state.js`'s mutable singleton. The game loop in `game.js` updates entities, runs AI, then calls `syncFromGameState()` once per tick to push a plain-data snapshot into the Zustand UI store.

**React overlay** (`js/ui/*.tsx`, `js/store.ts`): React reads only from the Zustand `uiStore` — never from `state.js` directly. Components are fixed-position overlays with `pointer-events: none` on the root and `pointer-events: auto` on interactive children. The sidebar radar canvas is owned by React (`<canvas id="radar">` in `Sidebar.tsx`) and its ref is written into `state.radar` via `useEffect` so `renderer.js` can draw to it.

### State access patterns

| Who | Reads | Writes |
|---|---|---|
| Canvas engine (`.js` files) | `state` directly | `state` directly |
| `syncFromGameState()` | `state` | `uiStore.setState({...})` |
| React components | `useUIStore(selector)` | `state` directly then call `syncFromGameState()` (via `import('../game.js').then(...)` for game lifecycle, or the `mutate()` helper in `BuildPanel.tsx` for mid-game actions) |

**Rule:** Game-logic mutations happen in the JS engine or in React event handlers that write to `state` directly. React never reads from `state`. The Zustand store (`uiStore`) is read-only from React's perspective.

### Tick ownership

All entity updates happen in `game.js`'s `loop()`. The loop calls `syncFromGameState()` at the end of each non-paused tick. `setMsg()` and `updateBuildPanel()` in `hud.js` are now thin wrappers that call `syncFromGameState()` — they exist only so the JS engine can call them without knowing about React.

## Module map

| File(s) | Role |
|---|---|
| `js/state.js` | Mutable game-state singleton |
| `js/game.js` | `startGame`, `showMenu`, `togglePause`, game loop |
| `js/constants.js` | `BDEF`, `UDEF`, `FDATA`, `FBONUSES`, `ARMOR_MULT`, `BUILD_TYPES`, `DEFENSE_TYPES`, `TRAIN_FROM` |
| `js/entities.js` | `Ent`, `Building`, `Unit` classes; `addEnt`, `getEnt`, `removeDeadEnts` |
| `js/renderer.js` | Canvas 2D rendering; `renderMinimap()` null-guards `state.radar` |
| `js/input.js` | Mouse/keyboard handlers; F=deploy MCV; right-click-pause |
| `js/hud.js` | Thin wrappers: `setMsg`, `updateHUD`, `updateBuildPanel`, `switchTab` — all call `syncFromGameState()` |
| `js/store.ts` | `uiStore` (Zustand vanilla), `syncFromGameState()`, `useUIStore` hook |
| `js/ui/App.tsx` | Root React component; renders HUD+Sidebar when playing, Menu when in menu/gameover, PauseMenu overlay |
| `js/ui/HUD.tsx` | Fixed 36px top bar: faction, credits, power, status msg, FPS |
| `js/ui/Sidebar.tsx` | Fixed 200px right panel: radar canvas, power bar, InfoPanel, tab buttons, BuildPanel |
| `js/ui/BuildPanel.tsx` | Build/train tabs with queue rows and cancel buttons; writes to `state` then calls `syncFromGameState()` |
| `js/ui/InfoPanel.tsx` | Selected entity details; DEPLOY MCV button |
| `js/ui/Menu.tsx` | Faction select screen and game-over screen |
| `js/ui/PauseMenu.tsx` | Pause overlay with resume/volume/quit |
| `js/ai.js` | Per-faction AI controller |
| `js/map.js` | Procedural map gen, tile passability, ore regen |
| `js/placement.js` | `canPlace`, `placeBuilding`, `spawnUnit`, `deployMcvInPlace` |
| `js/combat.js`, `js/orders.js`, `js/pathfinding.js`, `js/resources.js` | Pure helpers |
| `js/particles.js`, `js/audio.js` | Effects and voice lines |

## Key conventions

**Faction indices:** 0=ALLIANCE, 1=BROTHERHOOD, 2=SYNDICATE. `FBONUSES[f]` gives per-faction stat multipliers.

**Coordinates:** Tiles are 32×32px (`TS=32`). Map is 80×60 tiles. `e.x/e.y` = tile coords; `e.px/e.py` = pixel (interpolated). Camera at `state.cam.x/y` pixel offset.

**Entity lifecycle:** `addEnt(new Building/Unit(...))` → set `e.dead = true` to kill → `removeDeadEnts()` purges each frame.

**Build queues:** `state.hudBuildQueue[faction]` for structures, `state.hudDefQueue[faction]` for defenses, `building.trainQ` for units. Items: `{ type, t, total, paid, ready }`.

**MCV deploy:** `deployMcvInPlace(mcv)` in `placement.js` — instantly transforms MCV into Command Center at the nearest valid position. No buildMode cursor.

**Pause/cancel:** Right-click empty ground → pause. While paused, right-click cancels front build/def/train queue item (full credit refund). Left-click resumes.

**Circular import prevention:** `combat.js`, `orders.js`, `pathfinding.js`, `resources.js` don't import from `units.js`/`buildings.js`.

**JS/TS interop:** TypeScript files import JS modules with `// @ts-ignore` + typed as `any`. Example: `import { state as _s } from './state.js'; const s: any = _s;`

## Code style

- No comments unless the WHY is non-obvious
- React components use inline styles for layout; CSS classes (`.build-btn`, `.build-tab`, `.faction-btn`, `.pause-btn`) for interactive styling that needs hover states
- TypeScript strict mode; `any` is acceptable at JS/TS boundaries
- `syncFromGameState()` is the only bridge from JS engine → React; call it after any state change that React needs to reflect
