# COMMAND — Game Design Document

Version 0.4 | 2026-05-28

---

## 1. Overview

COMMAND is a minimalist real-time strategy game played entirely in the browser. Players choose one of three asymmetric factions, establish a base on a procedurally generated tile map, harvest ore to fund construction and training, and fight to destroy all enemy structures. The tone is brisk and functional — no narrative wrapper, no cutscenes — drawing on the mechanical clarity of classic C&C-era RTS games while stripping everything back to the essential loop: expand, produce, attack. The engine is a Canvas 2D game loop with a React overlay for UI, making it instantly playable at any URL with no install.

Supports skirmish (single player vs AI), multiplayer (2-player deterministic lockstep with rollback), and replay playback.

---

## 2. Core Loop

```
Harvest ore → earn credits
         ↓
Queue buildings (power → economy → military)
         ↓
Train combat units + Harvesters
         ↓
Expand / defend with Turrets & Anti-Air
         ↓
Launch attack waves against enemy structures
         ↓
Destroy all enemy structures → Victory
```

**Moment-to-moment:**

1. The player starts with a Command Center, Power Plant, Refinery, a Harvester, and 3 Riflemen — and 1 500 credits.
2. The Harvester auto-pathfinds to the nearest ore deposit and returns ore to the Refinery for credits.
3. The player queues buildings. Each structure completes in the build queue; the player then clicks to place it on the map near the Command Center. Construction draws down credits in integer installments as it progresses — you can queue a building before you have the full cost and it will stall until you can pay.
4. Power Plants must be built early — buildings stop functioning without sufficient power.
5. Once a Barracks and/or War Factory is operational, units can be trained.
6. The player manages a mix of economy (keeping Harvesters running), defence (Turret/Anti-Air placement, unit patrols), and offence (wave attacks on enemy bases).
7. The MCV can be trained at a War Factory (requires Service Depot) and deployed (F key) to create a forward Command Center, enabling construction at a new location.
8. Eliminating all structures of a faction removes it from the game. Last faction with any structure standing wins.

---

## 3. Factions

| Faction | Index | Playstyle | Stat Bonuses |
|---|---|---|---|
| ALLIANCE | 0 | Balanced | Standard stats; 15% faster construction |
| BROTHERHOOD | 1 | Heavy armor | +30% HP on all units; −15% speed; −15% credits from ore; 10% slower training |
| SYNDICATE | 2 | Swift economy | +20% credits from ore; +10% speed; −15% HP on all units; 10% faster training |

**Design intent:**
- ALLIANCE suits new players — minor construction speed bonus but no significant trade-offs.
- BROTHERHOOD rewards slow, deliberate pushes with durable forces but punishes credit shortfalls (slower economy means construction stalls more frequently).
- SYNDICATE rewards aggressive early expansion; its economic edge compounds, but units die faster in sustained fights.

---

## 4. Buildings

### Construction Structures

| Building | Cost | HP | Power | Prereqs | Notes |
|---|---|---|---|---|---|
| Command Center | — | 1200 | −2 | None | Player must protect this above all else |
| Power Plant | $300 | 350 | +5 | Command Center | Build early; shortfalls slow or disable other structures |
| Refinery | $700 | 600 | −1 | Command Center | Harvesters deliver here; spawns a Harvester on placement |
| Barracks | $400 | 500 | −1 | Power Plant | Trains infantry |
| War Factory | $700 | 700 | −2 | Power Plant | Trains vehicles |
| Service Depot | $600 | 450 | −1 | War Factory | Repairs vehicles on-pad; unlocks MCV training |
| Radar | $500 | 300 | −2 | Refinery | Enables minimap; unlocks artillery, airfield, Anti-Air |
| Airfield | $800 | 400 | −2 | Radar | Trains faction aircraft |

### Defence Structures

| Building | Cost | HP | Power | Prereqs | Notes |
|---|---|---|---|---|---|
| Turret | $350 | 280 | −1 | Barracks | ATK 18, RNG 6; stops auto-firing without power |
| Anti-Air | $400 | 250 | −1 | Radar | ATK 30, RNG 8; prioritises aircraft; flak weapon |

---

## 5. Units

| Unit | Cost | HP | Trains From | Role | Weapon | Notes |
|---|---|---|---|---|---|---|
| Rifleman | $200 | 80 | Barracks | Light anti-infantry | small_arms | Cheap, fast to train; weak vs. armor |
| Rocketeer | $350 | 60 | Barracks | Anti-armor infantry | rockets | Effective vs. vehicles and structures |
| Harvester | $800 | 200 | War Factory | Economy — collects ore | — | Auto-pathfinds ore, returns to Refinery; slow self-repair to 50% HP |
| Scout | $480 | 90 | War Factory | Fast anti-infantry | machinegun | Faster than Tank; shreds infantry; light armor |
| AA Track | $520 | 130 | War Factory | Mobile anti-air | flak | Fast; targets aircraft only; requires Radar |
| Tank | $650 | 320 | War Factory | Heavy assault vehicle | cannon | Slow but durable; BROTHERHOOD gets +30% HP |
| MCV | $1200 | 300 | War Factory | Mobile Command Vehicle | — | Deploy (F) → new Command Center; requires Service Depot |
| Artillery *(ALLIANCE)* | $900 | 120 | War Factory | Long-range siege | cannon | RNG 11, splash 1.5t; requires Radar |
| V2 Rocket *(BROTHERHOOD)* | $900 | 120 | War Factory | Rocket artillery | rockets | RNG 11, splash 1.5t; requires Radar |
| Tomahawk *(SYNDICATE)* | $850 | 100 | War Factory | Precision missiles | rockets | RNG 11, splash 1.5t; requires Radar |
| Fighter *(ALLIANCE)* | $800 | 80 | Airfield | Air superiority | strafe | Flies over terrain; fast; weak vs. ground |
| Gunship *(BROTHERHOOD)* | $950 | 180 | Airfield | Heavy bomber | bombs | Splash damage; devastates buildings |
| Drone *(SYNDICATE)* | $600 | 60 | Airfield | Fast attack drone | strafe | Very fast; swarm tactics |

---

## 6. Economy

### Credits

- Earned exclusively by harvesting ore.
- Starting credits: **1 500 for all factions** (player and AI).
- Harvesters automatically seek the nearest ore deposit, collect a full load, and return to the Refinery. Ore deposits regenerate slowly over time.
- Harvester ore yield is multiplied by faction `creditMult` (SYNDICATE +20%, BROTHERHOOD −15%) and rounded to the nearest integer.

### Credit Installments

Buildings and units draw down credits in **integer installments** as construction progresses (not as an upfront payment). Each tick the construction accumulator advances proportionally to available power; one whole credit is deducted each time the running total crosses the next threshold (Bresenham DDA). Construction stalls only when `credits < 1` and a deduction is due.

Practical consequence: you can queue a $700 Refinery with $200 in the bank. Construction will proceed, pause when you run out, then resume when your Harvester drops off ore.

Cancelling a queued item refunds `item.paid` — the amount actually deducted so far. Early cancels return a partial amount, not the full cost.

### Power

- Power Plants generate power; most buildings consume it.
- When consumption exceeds generation, `getPowerRatio(f)` falls below 1.0, which slows construction and training proportionally. `pwr` is clamped to a minimum of 0.25 so production never fully stops.
- Turrets stop auto-firing without net positive power.

### Build Queues

- **Structure queue** (`hudBuildQueue[faction]`): buildings queue and auto-construct; the player places each one manually when complete (ghost cursor appears on the map).
- **Defence queue** (`hudDefQueue[faction]`): same flow for Turrets and Anti-Air.
- **Unit train queue** (`building.trainQ`): each production building has its own queue; units exit the building on completion. Multiple buildings of the same type speed up training proportionally.
- Ctrl+click a train button queues ×5 in one action.
- Right-click while paused cancels the front queue item (refunds `item.paid`). The cancel button in the sidebar also works during live play.

### Placement Rules

- Buildings must be placed adjacent to an existing friendly structure (connected base grid).
- `canPlace` validation blocks overlapping tiles, water, and disconnected placement.
- Refineries auto-spawn a Harvester and send it to the nearest ore on placement.

---

## 7. Combat System

### Damage Model

Damage is resolved through a weapon-type × armor-type multiplier table (`ARMOR_MULT`). This creates a rock-paper-scissors relationship between unit classes.

| Weapon Type | Source | Effective Against | Poor Against |
|---|---|---|---|
| small_arms | Rifleman | Infantry | Vehicles, aircraft |
| rockets | Rocketeer, V2, Tomahawk | Heavy vehicles, structures | Infantry |
| cannon | Tank, Artillery | Heavy armor, structures | Infantry, aircraft |
| gun | Turret | General purpose | Aircraft |
| machinegun | Scout | Infantry | Heavy armor |
| strafe | Fighter, Drone | Infantry, light vehicles | Heavy armor, buildings |
| bombs | Gunship | Structures, vehicles (splash) | Aircraft |
| flak | Anti-Air turret, AA Track | **Aircraft** (×2.5) | Heavy armor, buildings |

Aircraft have `air` armor type. Ground weapons deal 0–25% damage vs. aircraft; only `flak` weapons are fully effective.

### Combat Flow

- Units within range auto-attack the nearest enemy when idle.
- Turrets auto-acquire and fire on any enemy within radius while powered.
- The Service Depot repairs damaged vehicles parked idle on its pad: 10 HP per 20 ticks for 1 credit.
- Building repair (toggle in sidebar): 20 HP per 40 ticks for 1 credit.
- Harvesters slowly self-repair up to 50% HP when undamaged and below the threshold.
- Units and buildings have HP; reaching 0 marks the entity dead and removes it at the next frame.

### Targeting and Movement

- Ground units move tile-by-tile on the 80×60 grid using 8-direction A* pathfinding (cardinals + diagonals, √2 cost for diagonals) respecting impassable tiles (water, occupied tiles). Diagonal corner-cutting through walls is blocked.
- Air units move pixel-by-pixel; no pathfinding — fly directly over terrain.
- Vehicle chassis rotates to face movement direction; turret/barrel tracks the attack target independently (cruiser fore/aft turrets aim independently of hull).
- Attack-move (A+RMB or A key then click): units move and auto-engage any enemy en route, then hold position at destination.
- Patrol (P+click): units move between patrol start and destination, auto-engaging enemies along the path.
- Shift+RMB queues orders (move or attack) rather than replacing the current one.
- Force-attack (Ctrl+RMB): attack any entity including friendly.

---

## 8. AI Behaviour

Each non-player faction runs an independent AI controller with the following ordered build priority:

1. Power Plant
2. Refinery (+ trains a Harvester)
3. Barracks
4. War Factory
5. Service Depot (enables MCV)
6. Radar (enables advanced units)
7. Turrets (defensive ring)

Once the base is established, the AI trains a mix of combat units matching the faction's strengths and launches periodic wave attacks. The AI also manages harvesters, performs defensive recalls when its base is under attack, and enables building repair when HP falls below 50%.

All three factions coexist on the map: AI factions also fight each other, creating a three-way conflict that can eliminate an AI before the player engages it.

---

## 9. Multiplayer

Two-player multiplayer uses **deterministic lockstep with rollback**:

- Both clients run the full simulation locally. The server is a pure relay with no game logic.
- Player commands are scheduled one tick ahead and broadcast to all peers.
- If a remote input arrives after its tick was already simulated, the engine rolls back to the nearest snapshot and replays forward.
- A 64-snapshot ring buffer covers ~3.2 s of rollback headroom at normal speed.
- Every 20 ticks each client sends a state hash to the server; the server broadcasts a `desync` event if hashes diverge.
- The HUD shows a DESYNC banner and a sync debug panel (DBG button) with per-field sub-hashes (`hpH`, `posH`, `oreH`, `bprogH`) to aid diagnosis.

A lobby system handles room creation, faction selection, and chat before the game starts.

---

## 10. Replay

- After a multiplayer game the player can **Save Replay** from the game-over screen.
- Replays store the map seed, slot/faction assignments, and the complete input history.
- Playback runs the simulation forward from tick 0 using the recorded inputs.
- Replay mode enables 2× and 4× speed (in addition to the standard SLOWEST–FASTEST range).

---

## 11. Controls Reference

### Mouse

| Action | Result |
|---|---|
| LMB on unit/building | Select entity; double-click selects all visible of same type |
| LMB drag | Box-select |
| RMB on empty ground | Move selected units to that tile |
| RMB on enemy unit/building | Attack that target |
| RMB on friendly Refinery | Order selected Harvesters to harvest for it |
| RMB on Service Depot | Order selected vehicles to move onto the pad |
| RMB on empty ground (nothing selected) | Pause game |
| LMB while paused | Resume game |
| RMB while paused | Cancel front item in active build/train queue (refunds credits paid) |
| RMB on minimap | Move selected units to that map position |
| LMB on minimap | Pan camera to that position |
| LMB+drag on minimap | Drag camera continuously |

### Keyboard

| Key | Action |
|---|---|
| A | Attack-move mode (then click destination) |
| P | Patrol mode (then click destination) |
| S | Stop selected units |
| F | Deploy selected MCV into Command Center |
| B | Switch sidebar to Build tab |
| T | Switch sidebar to Train tab |
| H | Jump camera to player's Command Center |
| Escape | Layered cancel: atkMove → patrol → buildMode/repairMode/sellMode → deselect → pause |
| Ctrl+A | Select all visible player units |
| Ctrl+click train button | Queue unit ×5 |
| Shift+RMB | Queue move/attack order (append, don't replace) |
| 1–9 | Recall control group |
| Ctrl+1–9 | Assign selection to control group |
| Double-tap 1–9 | Recall group and centre camera on it |

---

## 12. Victory / Defeat Conditions

### Victory

Destroy **all structures** belonging to every opposing faction. A faction is eliminated the moment it loses its last building. The last faction with any structure standing wins.

### Defeat

The player is eliminated when all of their own structures are destroyed. The game transitions to a game-over screen with stats and a replay save option.

### Notes

- Losing the Command Center is not immediately fatal; the player can continue if other buildings remain.
- An MCV can be deployed to create a new Command Center, enabling recovery after a base is overrun — provided the MCV survives the journey.
- The three-way faction dynamic means two AI factions can fight each other to exhaustion, leaving the player in an advantageous position.

---

## 13. Future Design Space

- **Faction-specific special abilities** — a cooldown-gated power unique to each faction (e.g., BROTHERHOOD orbital strike, SYNDICATE decoy/cloak, ALLIANCE precision air-strike) to reinforce faction identity beyond stat differences.
- **Tech tier 2 buildings** — additional prerequisite structures to create more meaningful mid/late-game progressions (e.g., advanced weapons lab gating upgraded units).
- **Neutral structures** — capturable ore silos or tech buildings that provide passive income or unit upgrades.
- **Co-op multiplayer** — extend the two-player lockstep to 3+ slots; AI slots already supported in the net protocol.
- **Campaign / mission scripting** — scripted objectives layered over the existing skirmish engine.
