import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useUIStore, uiStore } from '../store';
// Import JS modules — all used as `any` to avoid strict-index type errors
// @ts-ignore
import * as _C from '../constants.js';
// @ts-ignore
import * as _S from '../state.js';
const BDEF = _C.BDEF;
const UDEF = _C.UDEF;
const FBONUSES = _C.FBONUSES;
const BUILD_TYPES = _C.BUILD_TYPES;
const DEFENSE_TYPES = _C.DEFENSE_TYPES;
const TRAIN_FROM = _C.TRAIN_FROM;
const state = _S.state;
// ── Helpers ──────────────────────────────────────────────────────────────────
function mutate(fn) {
    fn(state);
    const f = state.playerFaction;
    uiStore.setState({
        buildMode: state.buildMode,
        buildReady: state.buildReady,
        repairMode: state.repairMode,
        sellMode: state.sellMode,
        buildQueue: state.hudBuildQueue[f].map((it) => ({ ...it })),
        defQueue: state.hudDefQueue[f].map((it) => ({ ...it })),
        activeTab: state.activeTab,
    });
}
// ── Queue row (shared by build + defense queues) ─────────────────────────────
function QueueRow({ item, index, accentColor, progressBg, isDefQueue, }) {
    const pct = item.total > 0 ? Math.min(1, item.t / item.total) : 1;
    const handlePlace = (ev) => {
        ev.stopPropagation();
        mutate(s => {
            s.buildMode = item.type;
            s.buildReady = true;
        });
    };
    const handleCancel = (ev) => {
        ev.stopPropagation();
        mutate(s => {
            const f = s.playerFaction;
            const q = isDefQueue ? s.hudDefQueue[f] : s.hudBuildQueue[f];
            s.credits[f] += BDEF[item.type].cost;
            q.splice(index, 1);
            if (index === 0) {
                s.buildMode = null;
                s.buildReady = false;
            }
        });
    };
    return (_jsxs("div", { style: {
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 2px',
            position: 'relative',
            overflow: 'hidden',
        }, children: [_jsx("div", { style: {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${(pct * 100).toFixed(1)}%`,
                    background: progressBg,
                    pointerEvents: 'none',
                } }), _jsxs("span", { style: {
                    flex: 1,
                    fontSize: 9,
                    color: item.ready ? accentColor : '#9ab',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    position: 'relative',
                }, children: [BDEF[item.type]?.name ?? item.type, item.ready ? ' ✓' : ` ${(pct * 100).toFixed(0)}%`] }), item.ready && (_jsx("button", { onClick: handlePlace, style: {
                    fontSize: 8,
                    padding: '1px 4px',
                    background: isDefQueue ? '#0a1828' : '#0a2a18',
                    border: `1px solid ${accentColor}`,
                    color: accentColor,
                    cursor: 'pointer',
                    fontFamily: "'Courier New', monospace",
                    flexShrink: 0,
                }, children: "PLACE" })), _jsx("button", { onClick: handleCancel, style: {
                    fontSize: 8,
                    padding: '1px 4px',
                    background: '#1a0808',
                    border: '1px solid #633',
                    color: '#966',
                    cursor: 'pointer',
                    fontFamily: "'Courier New', monospace",
                    flexShrink: 0,
                }, children: "X" })] }));
}
// ── Build button ──────────────────────────────────────────────────────────────
function BuildBtn({ name, sub, disabled, affordable, color, dataType, onClick, progressPct, }) {
    return (_jsxs("button", { className: 'build-btn' + (disabled ? ' disabled' : ''), "data-btype": dataType, onClick: !disabled && onClick
            ? (ev) => {
                ev.stopPropagation();
                onClick(ev);
            }
            : undefined, style: color ? { color, borderColor: color } : undefined, children: [_jsx("span", { className: "btn-name", children: name }), _jsx("span", { className: 'btn-cost' + (!affordable ? ' no' : ''), children: sub }), progressPct !== undefined && progressPct > 0 && (_jsx("div", { className: "btn-progress", style: { width: `${progressPct.toFixed(1)}%` } }))] }));
}
// ── Section helpers ───────────────────────────────────────────────────────────
function SectionHeader({ label }) {
    return (_jsx("div", { style: { width: '100%', padding: '4px 2px 2px', fontSize: 9, color: '#668', letterSpacing: 1 }, children: label }));
}
function Divider() {
    return _jsx("div", { style: { width: '100%', borderTop: '1px solid #1a2230', margin: '3px 0 2px' } });
}
// ── Train cancel row ─────────────────────────────────────────────────────────
function TrainRow({ bldgId, item, itemIndex, }) {
    const isFirst = itemIndex === 0;
    const pct = isFirst && item.total > 0 ? Math.min(1, item.t / item.total) : 0;
    const handleCancel = (ev) => {
        ev.stopPropagation();
        mutate(s => {
            const bldg = s.entities.find((e) => e.id === bldgId);
            if (bldg && bldg.trainQ) {
                s.credits[s.playerFaction] += UDEF[item.type]?.cost ?? 0;
                bldg.trainQ.splice(itemIndex, 1);
            }
        });
    };
    return (_jsxs("div", { style: {
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px',
            position: 'relative',
            overflow: 'hidden',
        }, children: [isFirst && pct > 0 && (_jsx("div", { style: {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${(pct * 100).toFixed(1)}%`,
                    background: 'rgba(0,100,60,0.18)',
                    pointerEvents: 'none',
                } })), _jsxs("span", { style: {
                    flex: 1,
                    fontSize: 9,
                    color: '#9ab',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    position: 'relative',
                }, children: [UDEF[item.type]?.name ?? item.type, ' ', isFirst && item.total > 0 ? `${(pct * 100).toFixed(0)}%` : 'queued'] }), _jsx("button", { onClick: handleCancel, style: {
                    fontSize: 8,
                    padding: '1px 4px',
                    background: '#1a0808',
                    border: '1px solid #633',
                    color: '#966',
                    cursor: 'pointer',
                    fontFamily: "'Courier New', monospace",
                    flexShrink: 0,
                }, children: "X" })] }));
}
// ── Build tab ────────────────────────────────────────────────────────────────
function BuildTab() {
    const { repairMode, sellMode, buildMode, buildReady, buildQueue, defQueue, doneTypes, credits } = useUIStore(s => ({
        repairMode: s.repairMode,
        sellMode: s.sellMode,
        buildMode: s.buildMode,
        buildReady: s.buildReady,
        buildQueue: s.buildQueue,
        defQueue: s.defQueue,
        doneTypes: s.doneTypes,
        credits: s.credits,
    }));
    // Ghost placement mode — just show cancel
    if (buildMode && buildReady) {
        const d = BDEF[buildMode];
        return (_jsx("div", { style: { padding: 4 }, children: _jsx(BuildBtn, { name: "CANCEL PLACE", sub: d?.name ?? buildMode, disabled: false, affordable: true, color: "#f64", onClick: () => mutate(s => {
                    s.buildMode = null;
                    s.buildReady = false;
                    s.canvas.style.cursor = 'default';
                }) }) }));
    }
    const handleRepair = () => mutate(s => {
        s.repairMode = !s.repairMode;
        s.sellMode = false;
        s.buildMode = null;
        s.buildReady = false;
        s.canvas.style.cursor = s.repairMode ? 'crosshair' : 'default';
        if (!s.repairMode) {
            for (const e of s.entities) {
                if (e.isBuilding && e.faction === s.playerFaction)
                    e.repairing = false;
            }
        }
    });
    const handleSell = () => mutate(s => {
        s.sellMode = !s.sellMode;
        s.repairMode = false;
        s.buildMode = null;
        s.buildReady = false;
        s.canvas.style.cursor = s.sellMode ? 'crosshair' : 'default';
        if (!s.sellMode) {
            for (const e of s.entities) {
                if (e.isBuilding && e.faction === s.playerFaction)
                    e.repairing = false;
            }
        }
    });
    const handleBuild = (type) => {
        const f = state.playerFaction;
        state.hudBuildQueue[f].push({
            type,
            t: 0,
            total: BDEF[type].btime * 60,
            paid: 0,
            ready: false,
        });
        mutate(() => { });
    };
    const handleDefBuild = (type) => {
        const f = state.playerFaction;
        state.hudDefQueue[f].push({
            type,
            t: 0,
            total: BDEF[type].btime * 60,
            paid: 0,
            ready: false,
        });
        mutate(() => { });
    };
    return (_jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 3, padding: 4, alignContent: 'flex-start' }, children: [_jsx(BuildBtn, { name: repairMode ? 'REPAIRING' : 'REPAIR', sub: "click bldg", disabled: false, affordable: true, color: repairMode ? '#4d8' : undefined, onClick: handleRepair }), _jsx(BuildBtn, { name: sellMode ? 'SELLING' : 'SELL', sub: "50% refund", disabled: false, affordable: true, color: sellMode ? '#fa4' : undefined, onClick: handleSell }), buildQueue.length > 0 && (_jsxs("div", { style: { width: '100%' }, children: [_jsx(SectionHeader, { label: "CONSTRUCTING:" }), buildQueue.map((item, i) => (_jsx(QueueRow, { item: item, index: i, accentColor: "#4d8", progressBg: "rgba(0,100,60,0.18)", isDefQueue: false }, i))), _jsx(Divider, {})] })), BUILD_TYPES.map((type) => {
                const d = BDEF[type];
                const prereqOk = !d.prereq || doneTypes.includes(d.prereq);
                const canAfford = credits >= d.cost;
                const beingBuilt = state.entities.find((e) => !e.dead &&
                    e.isBuilding &&
                    e.faction === state.playerFaction &&
                    e.type === type &&
                    !e.done);
                return (_jsx(BuildBtn, { name: d.name, sub: `$${d.cost}`, disabled: !prereqOk, affordable: canAfford, dataType: type, onClick: () => handleBuild(type), progressPct: beingBuilt ? beingBuilt.bprog * 100 : undefined }, type));
            }), _jsxs("div", { style: { width: '100%' }, children: [_jsx("div", { style: { width: '100%', borderTop: '1px solid #1a2230', margin: '4px 0 2px' } }), _jsx(SectionHeader, { label: "DEFENSE:" }), defQueue.length > 0 &&
                        defQueue.map((item, i) => (_jsx(QueueRow, { item: item, index: i, accentColor: "#4af", progressBg: "rgba(0,60,100,0.22)", isDefQueue: true }, i)))] }), DEFENSE_TYPES.map((type) => {
                const d = BDEF[type];
                const prereqOk = !d.prereq || doneTypes.includes(d.prereq);
                const canAfford = credits >= d.cost;
                return (_jsx(BuildBtn, { name: d.name, sub: `$${d.cost}`, disabled: !prereqOk, affordable: canAfford, dataType: type, onClick: () => handleDefBuild(type) }, type));
            })] }));
}
// ── Train tab ────────────────────────────────────────────────────────────────
function TrainTab() {
    const { trainQueues, doneTypes, credits, playerFaction } = useUIStore(s => ({
        trainQueues: s.trainQueues,
        doneTypes: s.doneTypes,
        credits: s.credits,
        playerFaction: s.playerFaction,
    }));
    const fb = FBONUSES[playerFaction];
    const trainEntries = [];
    for (const [btype, utypes] of Object.entries(TRAIN_FROM)) {
        if (!doneTypes.includes(btype))
            continue;
        for (const utype of utypes) {
            trainEntries.push({ bldgType: btype, utype });
        }
    }
    const handleTrain = (bldgType, utype, count) => {
        const f = state.playerFaction;
        const done = state.entities.filter((e) => !e.dead && e.isBuilding && e.faction === f && e.done);
        const pid = state.primaryBuilding[bldgType];
        const primaryEnt = pid ? state.entities.find((e) => e.id === pid) : null;
        const building = primaryEnt && !primaryEnt.dead && primaryEnt.type === bldgType
            ? primaryEnt
            : done.find((b) => b.type === bldgType);
        if (!building)
            return;
        const d = UDEF[utype];
        for (let i = 0; i < count && building.trainQ.length < 5; i++) {
            building.trainQ.push({
                type: utype,
                t: 0,
                total: ((d.ttime * fb.trainMult * 60) | 0),
            });
        }
        mutate(() => { });
    };
    return (_jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 3, padding: 4, alignContent: 'flex-start' }, children: [trainQueues.length > 0 && (_jsxs("div", { style: { width: '100%' }, children: [_jsx(SectionHeader, { label: "TRAINING:" }), trainQueues.map(tq => tq.items.map((item, i) => (_jsx(TrainRow, { bldgId: tq.bldgId, item: item, itemIndex: i }, `${tq.bldgId}-${i}`)))), _jsx(Divider, {})] })), trainEntries.map(({ bldgType, utype }) => {
                const d = UDEF[utype];
                const canAfford = credits >= d.cost;
                const depotOk = utype !== 'mcv' || doneTypes.includes('depot');
                const f = state.playerFaction;
                const done = state.entities.filter((e) => !e.dead && e.isBuilding && e.faction === f && e.done);
                const pid = state.primaryBuilding[bldgType];
                const primaryEnt = pid ? state.entities.find((e) => e.id === pid) : null;
                const building = primaryEnt && !primaryEnt.dead && primaryEnt.type === bldgType
                    ? primaryEnt
                    : done.find((b) => b.type === bldgType);
                const qFull = !building || building.trainQ.length >= 5 || !depotOk;
                const activeItem = building?.trainQ?.length > 0 && building.trainQ[0].type === utype
                    ? building.trainQ[0]
                    : null;
                const progressPct = activeItem && activeItem.total > 0
                    ? (activeItem.t / activeItem.total) * 100
                    : undefined;
                return (_jsx(BuildBtn, { name: d.name, sub: utype === 'mcv' && !depotOk ? 'needs depot' : `$${d.cost}`, disabled: qFull, affordable: canAfford, dataType: utype, onClick: ev => handleTrain(bldgType, utype, ev.ctrlKey ? 5 : 1), progressPct: progressPct }, `${bldgType}-${utype}`));
            }), trainEntries.length === 0 && (_jsx("div", { style: { color: '#789', fontSize: 10, padding: '8px 4px', lineHeight: 1.6 }, children: "Build Barracks or War Factory to train units." }))] }));
}
// ── Root panel ────────────────────────────────────────────────────────────────
export function BuildPanel() {
    const activeTab = useUIStore(s => s.activeTab);
    return (_jsx("div", { id: "build-buttons", style: { flex: 1, overflowY: 'auto', overflowX: 'hidden' }, children: activeTab === 'build' ? _jsx(BuildTab, {}) : _jsx(TrainTab, {}) }));
}
