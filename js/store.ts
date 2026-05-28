import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
// @ts-ignore
import { state as _s } from './state.js';
const s: any = _s;
// @ts-ignore
import { FDATA } from './constants.js';

// ── Shared sub-types ────────────────────────────────────────────────────────

export interface QueueItemUI {
  type: string;
  t: number;
  total: number;
  paid: number;
  ready: boolean;
}

export interface TrainItemUI {
  type: string;
  t: number;
  total: number;
}

export interface TrainQueueUI {
  bldgId: number;
  bldgType: string;
  items: TrainItemUI[];
}

export interface EntUI {
  id: number;
  type: string;
  isBuilding: boolean;
  hp: number;
  maxHp: number;
  faction: number;
  unitState: string;
  ore: number;
  maxOre: number;
  dmg: number;
  range: number;
  weaponType: string | null;
  bprog: number;
  done: boolean;
  trainQ: TrainItemUI[];
  waypoint: { tx: number; ty: number } | null;
  repairing: boolean;
}

// ── Multiplayer types ────────────────────────────────────────────────────────

export interface PlayerEntry {
  slot: number;
  name: string;
  faction: number | null;
  ready: boolean;
  isHost: boolean;
  isAI: boolean;
  isEmpty: boolean;
  latencyMs: number;
}

export interface LobbyState {
  roomCode: string;
  players: PlayerEntry[];
  chatMessages: { slot: number; name: string; text: string }[];
  mySlot: number;
  isHost: boolean;
  myName: string;
  lobbyGameSpeed: number;
}

export interface NetState {
  connected: boolean;
  role: 'none' | 'player';
  latencyMs: number;
}

// ── Sync debug ───────────────────────────────────────────────────────────────

export interface SyncDebugState {
  entityH: number;
  creditsH: number;
  rngH: number;
  shellH: number;
  mapH: number;
  tick: number;
  resyncs: number;
  lastDesyncTick: number;
  diverged: string[];
  stallCount: number;
  nullsSent: number;
  log: string[];
  hasWarning: boolean;
  cred: [number, number, number];
  entN: [number, number, number];
  entH: [number, number, number];
  hpH: number;
  posH: number;
  oreH: number;
  bprogH: number;
}

// ── Store shape ──────────────────────────────────────────────────────────────

export interface PowerPoint {
  tick: number;
  scores: number[];
}

export interface GameStats {
  duration: number;
  enemiesKilled: number;
  unitsLost: number;
  powerHistory: PowerPoint[];
}

export interface UIState {
  phase: 'menu' | 'lobby' | 'playing' | 'paused' | 'gameover';
  playerFaction: number;
  winnerFaction: number;
  winnerName: string;
  gameStats: GameStats;
  credits: number;
  powerUsed: number;
  powerGen: number;
  statusMsg: string;
  fps: number;
  gameSpeed: number;
  activeTab: 'build' | 'train';
  buildMode: string | null;
  buildReady: boolean;
  repairMode: boolean;
  sellMode: boolean;
  buildQueue: QueueItemUI[];
  defQueue: QueueItemUI[];
  doneTypes: string[];
  sel: EntUI[];
  trainQueues: TrainQueueUI[];
  primaryBuilding: Record<string, number>;
  lobby: LobbyState | null;
  net: NetState;
  bootMsg: string;
  replayMode: boolean;
  mapSeed: number | null;
  desync: boolean;
  netStall: boolean;
  syncDebug: SyncDebugState | null;
  bugReportOpen: boolean;
  menuOpen: boolean;
  netPauseCredits: [number, number, number];
  netPausedBySlot: number;
}

// ── Initial state ────────────────────────────────────────────────────────────

const initialState: UIState = {
  phase: 'menu',
  playerFaction: 0,
  winnerFaction: -1,
  winnerName: '',
  gameStats: { duration: 0, enemiesKilled: 0, unitsLost: 0, powerHistory: [] },
  credits: 0,
  powerUsed: 0,
  powerGen: 0,
  statusMsg: '',
  fps: 60,
  gameSpeed: 2,
  activeTab: 'build',
  buildMode: null,
  buildReady: false,
  repairMode: false,
  sellMode: false,
  buildQueue: [],
  defQueue: [],
  doneTypes: [],
  sel: [],
  trainQueues: [],
  primaryBuilding: {},
  lobby: null,
  net: { connected: false, role: 'none', latencyMs: 0 },
  bootMsg: '',
  replayMode: false,
  mapSeed: null,
  desync: false,
  netStall: false,
  syncDebug: null,
  bugReportOpen: false,
  menuOpen: false,
  netPauseCredits: [3, 3, 3],
  netPausedBySlot: -1,
};

// ── Zustand vanilla store ────────────────────────────────────────────────────

export const uiStore = createStore<UIState>()(() => initialState);

// Convenience hook for React components
export function useUIStore<T>(selector: (state: UIState) => T): T {
  return useStore(uiStore, selector);
}

// ── Sync function (called each game tick from game.js) ───────────────────────

export function syncFromGameState(): void {
  const f: number = s.playerFaction;
  const done: any[] = s.entities.filter(
    (e: any) => !e.dead && e.isBuilding && e.faction === f && e.done
  );

  // Derive phase — stay 'playing' during the canvas announcement window
  let phase: UIState['phase'] = 'menu';
  if (s.gameOver && s.gameOverDelay <= 0) {
    phase = 'gameover';
  } else if (s.gameStarted) {
    phase = s.paused ? 'paused' : 'playing';
  }

  // Derive winner
  let winnerFaction = -1;
  let winnerName = '';
  if (s.gameOver) {
    const alive: [boolean, boolean, boolean] = [false, false, false];
    for (const e of s.entities) {
      if (!e.dead && e.isBuilding) alive[e.faction as 0 | 1 | 2] = true;
    }
    winnerFaction = alive.indexOf(true);
    winnerName = winnerFaction >= 0 ? FDATA[winnerFaction].name : 'Draw';
  }

  // Serialize selected entities
  const sel: EntUI[] = (s.selected as number[])
    .map((id: number) => (s.entById as Map<number, any>).get(id))
    .filter(Boolean)
    .map((e: any): EntUI => ({
      id: e.id,
      type: e.type,
      isBuilding: !!e.isBuilding,
      hp: e.hp,
      maxHp: e.maxHp,
      faction: e.faction,
      unitState: e.state,
      ore: e.ore ?? 0,
      maxOre: e.maxOre ?? 0,
      dmg: e.dmg ?? 0,
      range: e.range ?? 0,
      weaponType: e.weaponType ?? null,
      bprog: e.bprog ?? 0,
      done: !!e.done,
      trainQ: [], // BuildPanel reads from trainQueues; duplicating here is wasted work
      waypoint: e.waypoint ? { ...e.waypoint } : null,
      repairing: !!e.repairing,
    }));

  // Serialize training queues across all player buildings
  const trainQueues: TrainQueueUI[] = done
    .filter((b: any) => b.trainQ && b.trainQ.length > 0)
    .map((b: any): TrainQueueUI => ({
      bldgId: b.id,
      bldgType: b.type,
      items: b.trainQ.map((it: any) => ({ ...it })),
    }));

  const endTick: number = s.gameStats?.endTick || s.tick;
  const duration: number = Math.floor((endTick - (s.gameStats?.startTick ?? 0)) / 60);

  uiStore.setState({
    phase,
    playerFaction: f,
    winnerFaction,
    winnerName,
    gameStats: {
      duration,
      enemiesKilled: s.gameStats?.enemiesKilled ?? 0,
      unitsLost: s.gameStats?.unitsLost ?? 0,
      powerHistory: s.gameStats?.powerHistory ?? [],
    },
    credits: Math.floor(s.credits[f]),
    powerUsed: s.powerUsed[f],
    powerGen: s.powerGen[f],
    statusMsg: s.statusTimer > 0 ? s.statusMsg : '',
    fps: Math.round(s.fpsSmooth),
    gameSpeed: s.gameSpeed ?? 2,
    activeTab: s.activeTab as 'build' | 'train',
    buildMode: s.buildMode,
    buildReady: s.buildReady,
    repairMode: s.repairMode,
    sellMode: s.sellMode,
    buildQueue: (s.hudBuildQueue[f] as any[]).map((it: any) => ({ ...it })),
    defQueue: (s.hudDefQueue[f] as any[]).map((it: any) => ({ ...it })),
    doneTypes: done.map((b: any) => b.type as string),
    sel,
    trainQueues,
    primaryBuilding: { ...s.primaryBuilding },
    replayMode: s.replayMode ?? false,
    mapSeed: s.mapSeed ?? null,
    netStall: !!(s.rollback?._stallStart != null),
    syncDebug: s.syncDebug ? { ...s.syncDebug } : null,
    menuOpen: s.menuOpen ?? false,
    netPauseCredits: s.net?.pauseCredits ? ([...s.net.pauseCredits] as [number, number, number]) : [3, 3, 3],
    netPausedBySlot: s.net?.pausedBySlot ?? -1,
  });
}
