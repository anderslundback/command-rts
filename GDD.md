# COMMAND — Game Design Document

Version 0.1 | 2026-05-18

---

## 1. Overview

COMMAND is a minimalist real-time strategy game played entirely in the browser. Players choose one of three asymmetric factions, establish a base on a procedurally generated tile map, harvest ore to fund construction and training, and fight to destroy all enemy structures. The tone is brisk and functional — no narrative wrapper, no cutscenes — drawing on the mechanical clarity of classic C&C-era RTS games while stripping everything back to the essential loop: expand, produce, attack. The engine is a Canvas 2D game loop with a React overlay for UI, making it instantly playable at any URL with no install.

---

## 2. Core Loop

```
Harvest ore → earn credits
         ↓
Queue buildings (power → economy → military)
         ↓
Train combat units + Harvesters
         ↓
Expand / defend with Turrets
         ↓
Launch attack waves against enemy structures
         ↓
Destroy all enemy Command Centers → Victory
```

**Moment-to-moment:**

1. The player starts with a Command Center, an MCV, and 1 000 credits.
2. A Harvester is trained and sent to the nearest ore deposit; it returns ore to the Refinery for credits.
3. The player queues buildings. Each structure completes in the build queue; the player then clicks to place it on the map near the Command Center.
4. Power Plants must be built early — other buildings stop functioning without sufficient power.
5. Once a Barracks and/or War Factory is operational, units can be trained.
6. The player manages a mix of economy (keeping Harvesters running), defence (Turret placement, unit patrols), and offence (wave attacks on AI bases).
7. The MCV can be redeployed (F key) to create a forward Command Center, enabling construction at a new location.
8. Eliminating all structures of a faction removes it from the game. Last faction standing wins.

---

## 3. Factions

| Faction | Index | Playstyle | Stat Bonuses |
|---|---|---|---|
| ALLIANCE | 0 | Balanced | Standard stats across the board |
| BROTHERHOOD | 1 | Heavy armor | +30% HP on all units; cheaper tanks; slower economy |
| SYNDICATE | 2 | Swift economy | +30% credits from ore; faster unit movement; lighter armor |

**Design intent:**
- ALLIANCE suits new players — no trade-offs to manage.
- BROTHERHOOD rewards slow, deliberate pushes with durable forces but punishes credit shortfalls.
- SYNDICATE rewards aggressive early expansion; its economic edge compounds, but units die faster in sustained fights.

---

## 4. Buildings

### Construction Structures

| Building | Function | Prereqs | Notes |
|---|---|---|---|
| Command Center | HQ; required for all construction adjacency; losing it is not immediately fatal but losing all buildings ends the faction | None | Player must protect this above all else |
| Power Plant | Generates power; buildings and turrets require power to operate | Command Center | Build early; shortfalls disable structures |
| Barracks | Trains Riflemen and Rocketeers | Command Center + Power | Provides basic infantry production |
| War Factory | Trains Harvesters, Tanks, and MCV | Command Center + Power | Core vehicle production facility |
| Refinery | Stores harvested ore; Harvesters deliver here to convert ore to credits | Command Center + Power | More Refineries = more storage capacity |
| Service Depot | Repairs vehicles; unlocks MCV production at the War Factory | War Factory | Required prereq before MCV can be trained |
| Radar | Unlocks extended map information | Command Center + Power | Precise effect TBD in implementation |

### Defence Structures

| Building | Function | Prereqs | Notes |
|---|---|---|---|
| Turret | Auto-attacks enemies within range using `gun` weapon type | Power Plant (active power) | Stops firing when power is insufficient |

> **Costs:** Specific credit costs are not yet defined in this document. All costs are marked — pending balance pass.

---

## 5. Units

| Unit | Trains From | Role | Weapon Type | Notes |
|---|---|---|---|---|
| Rifleman | Barracks | Light anti-infantry | small_arms | Cheap, fast to train; weak vs. armor |
| Rocketeer | Barracks | Anti-armor infantry | rockets | Effective vs. vehicles and structures |
| Harvester | War Factory | Economy — collects ore | None (unarmed) | Automatically pathfinds to ore and returns to Refinery |
| Tank | War Factory | Heavy assault vehicle | cannon | BROTHERHOOD gets cheaper tanks + HP bonus |
| MCV | War Factory | Mobile Command Vehicle | None (unarmed) | Deploying it (F / button) creates a new Command Center on the spot; requires Service Depot as prereq |

---

## 6. Economy

### Credits

- Earned exclusively by harvesting ore.
- Starting credits: **player = 1 000**, **each AI faction = 2 000**.
- Harvesters automatically seek the nearest ore deposit, collect, and return to the Refinery.
- Ore deposits regenerate slowly over time, preventing the map from running dry indefinitely.

### Power

- Power Plants generate power; most buildings consume it.
- When total consumption exceeds total generation, buildings enter a low-power state.
- Turrets stop auto-firing without power. Other buildings may stop functioning (exact effect per building TBD).
- The top HUD bar always shows current power status.

### Build Queues

- **Structure queue** (`hudBuildQueue[faction]`): buildings queue and auto-construct; the player places each one manually when it completes.
- **Defence queue** (`hudDefQueue[faction]`): same flow for Turrets.
- **Unit train queue** (`building.trainQ`): each production building has its own queue; units exit the building on completion.
- Ctrl+click a train button queues ×5 in one action.
- Cancelling a queued item (right-click while paused, or cancel button) gives a full credit refund.

### Placement Rules

- Buildings must be placed in adjacency to an existing structure (connected to the player's base grid).
- `canPlace` validation prevents overlapping tiles, water placement, and invalid adjacency.

---

## 7. Combat System

### Damage Model

Damage is resolved through a weapon-type × armor-type multiplier table (`ARMOR_MULT`). This creates a rock-paper-scissors relationship between unit classes.

| Weapon Type | Source | Effective Against |
|---|---|---|
| small_arms | Rifleman | Infantry |
| rockets | Rocketeer | Vehicles, structures |
| cannon | Tank | Structures, vehicles |
| gun | Turret | General purpose |

Exact multiplier values are defined in `ARMOR_MULT` and subject to balance tuning.

### Combat Flow

- Units attack on contact with enemies within range (range TBD per unit type).
- Turrets auto-acquire and fire on any enemy entering their radius while powered.
- The Service Depot repairs damaged vehicles that move adjacent to it.
- Units and buildings have HP; reaching 0 marks the entity as dead and it is removed at the next frame.

### Targeting and Movement

- Units move tile-by-tile on the 80×60 grid using pathfinding that respects impassable tiles (water).
- Attack-move (RMB on an enemy) causes units to engage the target and then hold position.
- Right-click on empty ground moves selected units to that tile.

---

## 8. AI Behaviour

Each non-player faction runs an independent AI controller with the following ordered build priority:

1. Power Plant
2. Refinery (+ trains a Harvester)
3. Barracks
4. War Factory
5. Service Depot

Once the economic and production base is established, the AI trains a mix of combat units and launches periodic wave attacks against the player. AI factions start with a 2 000-credit advantage to compensate for sub-optimal play.

All three factions coexist: the AI factions will also fight each other, creating a three-way conflict that can result in an AI faction being eliminated before the player.

---

## 9. Controls Reference

### Mouse

| Action | Result |
|---|---|
| LMB on unit/building | Select entity |
| LMB on empty ground | Move selected units to tile |
| RMB on unit/building | Attack-move / issue order |
| RMB on empty ground | Pause game |
| LMB while paused | Resume game |
| RMB while paused | Cancel front item in build/train queue (full refund) |
| Double-click unit | Select all visible units of the same type |

### Keyboard

| Key | Action |
|---|---|
| F | Deploy selected MCV into Command Center |
| B | Switch sidebar to Build tab |
| T | Switch sidebar to Train tab |
| H | Jump camera to player's base |
| P / ESC | Toggle pause |
| Ctrl+A | Select all player units |
| Ctrl+click train button | Queue unit ×5 |

---

## 10. Victory / Defeat Conditions

### Victory

Destroy **all structures** belonging to every opposing faction. A faction is eliminated the moment it loses its last building. The last faction with any structure standing wins.

### Defeat

The player is eliminated when all of their own structures are destroyed. The game transitions to a game-over screen.

### Notes

- Losing the Command Center is not immediately fatal; the player can continue if other buildings remain.
- An MCV can be deployed to create a new Command Center, allowing recovery after a base is overrun — provided the MCV survives.
- The three-way faction dynamic means two AI factions can destroy each other, leaving the player in a favourable position without direct engagement.

---

## 11. Future Design Space

- **Additional unit types** — artillery (long-range, low accuracy), scouts (fast/cheap reveal), engineers (capture/repair).
- **Tech tiers** — gating advanced units behind additional prerequisite structures to create more meaningful mid/late-game progressions.
- **Multiplayer** — the architecture (clean state singleton, Zustand bridge) could support a server-authoritative model; network sync would be the primary engineering challenge.
- **Fog of war** — the Radar building is already in the structure list as a candidate unlock; a visibility layer per faction would raise strategic depth significantly.
- **Faction-specific special abilities** — a one-time or cooldown-gated power unique to each faction (e.g., BROTHERHOOD orbital strike, SYNDICATE unit cloak) to reinforce faction identity beyond stat differences.
