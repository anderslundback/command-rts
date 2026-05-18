import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
// @ts-ignore
import { state as _s } from './state.js';
const s = _s;
// @ts-ignore
import { FDATA } from './constants.js';
// ── Initial state ────────────────────────────────────────────────────────────
const initialState = {
    phase: 'menu',
    playerFaction: 0,
    winnerFaction: -1,
    winnerName: '',
    credits: 0,
    powerUsed: 0,
    powerGen: 0,
    statusMsg: '',
    fps: 60,
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
};
// ── Zustand vanilla store ────────────────────────────────────────────────────
export const uiStore = createStore()(() => initialState);
// Convenience hook for React components
export function useUIStore(selector) {
    return useStore(uiStore, selector);
}
// ── Sync function (called each game tick from game.js) ───────────────────────
export function syncFromGameState() {
    const f = s.playerFaction;
    const done = s.entities.filter((e) => !e.dead && e.isBuilding && e.faction === f && e.done);
    // Derive phase
    let phase = 'menu';
    if (s.gameStarted && !s.gameOver) {
        phase = s.paused ? 'paused' : 'playing';
    }
    else if (s.gameOver) {
        phase = 'gameover';
    }
    // Derive winner
    let winnerFaction = -1;
    let winnerName = '';
    if (s.gameOver) {
        const alive = [false, false, false];
        for (const e of s.entities) {
            if (!e.dead && e.isBuilding)
                alive[e.faction] = true;
        }
        winnerFaction = alive.indexOf(true);
        winnerName = winnerFaction >= 0 ? FDATA[winnerFaction].name : 'Draw';
    }
    // Serialize selected entities
    const sel = s.selected
        .map((id) => s.entities.find((e) => e.id === id))
        .filter(Boolean)
        .map((e) => ({
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
        trainQ: Array.isArray(e.trainQ) ? e.trainQ.map((it) => ({ ...it })) : [],
        waypoint: e.waypoint ? { ...e.waypoint } : null,
        repairing: !!e.repairing,
    }));
    // Serialize training queues across all player buildings
    const trainQueues = done
        .filter((b) => b.trainQ && b.trainQ.length > 0)
        .map((b) => ({
        bldgId: b.id,
        bldgType: b.type,
        items: b.trainQ.map((it) => ({ ...it })),
    }));
    uiStore.setState({
        phase,
        playerFaction: f,
        winnerFaction,
        winnerName,
        credits: Math.floor(s.credits[f]),
        powerUsed: s.powerUsed[f],
        powerGen: s.powerGen[f],
        statusMsg: s.statusTimer > 0 ? s.statusMsg : '',
        fps: Math.round(s.fpsSmooth),
        activeTab: s.activeTab,
        buildMode: s.buildMode,
        buildReady: s.buildReady,
        repairMode: s.repairMode,
        sellMode: s.sellMode,
        buildQueue: s.hudBuildQueue[f].map((it) => ({ ...it })),
        defQueue: s.hudDefQueue[f].map((it) => ({ ...it })),
        doneTypes: done.map((b) => b.type),
        sel,
        trainQueues,
        primaryBuilding: { ...s.primaryBuilding },
    });
}
