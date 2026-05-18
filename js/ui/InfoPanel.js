import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useUIStore } from '../store';
// @ts-ignore
import * as _C from '../constants.js';
// @ts-ignore
import * as _S from '../state.js';
// @ts-ignore
import * as _P from '../placement.js';
const BDEF = _C.BDEF;
const UDEF = _C.UDEF;
const FDATA = _C.FDATA;
const state = _S.state;
const deployMcvInPlace = _P.deployMcvInPlace;
const UNIT_STATE_LABELS = {
    idle: 'Idle',
    move: 'Moving',
    attack: 'Attacking',
    harvest: 'Harvesting',
    return: 'Returning',
};
const WEAPON_NAMES = {
    small_arms: 'Small Arms',
    rockets: 'Rockets',
    cannon: 'Cannon',
    gun: 'Auto-Gun',
};
// ── HP bar ────────────────────────────────────────────────────────────────────
function HPBar({ hp, maxHp }) {
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    const color = ratio > 0.5 ? '#4d8' : ratio > 0.25 ? '#fc4' : '#f44';
    return (_jsxs("div", { style: { marginBottom: 4 }, children: [_jsx("div", { style: {
                    height: 4,
                    background: '#1a2230',
                    borderRadius: 2,
                    overflow: 'hidden',
                    marginBottom: 2,
                }, children: _jsx("div", { style: { height: '100%', width: `${(ratio * 100).toFixed(1)}%`, background: color } }) }), _jsx("span", { style: { color, fontSize: 10 }, children: hp }), _jsxs("span", { style: { color: '#445', fontSize: 10 }, children: ["/", maxHp] })] }));
}
// ── Entity detail ─────────────────────────────────────────────────────────────
function EntityDetail({ e, playerFaction, }) {
    const fd = FDATA[e.faction];
    const defName = e.isBuilding
        ? (BDEF[e.type]?.name ?? e.type)
        : (UDEF[e.type]?.name ?? e.type);
    const isPrimary = e.isBuilding && state.primaryBuilding?.[e.type] === e.id;
    const handleDeploy = (ev) => {
        ev.stopPropagation();
        const liveEnt = state.entities.find((ent) => ent.id === e.id);
        if (!liveEnt)
            return;
        const b = deployMcvInPlace(liveEnt);
        if (b) {
            state.selected = [b.id];
            // Notify via hud setMsg — lazy import avoids circular dependency
            // @ts-ignore
            import('../hud.js')
                .then((m) => m.setMsg('MCV deployed — Command Center established', 180))
                .catch(() => { });
        }
        else {
            // @ts-ignore
            import('../hud.js')
                .then((m) => m.setMsg('No space to deploy here — move MCV to open ground', 150))
                .catch(() => { });
        }
        // Force immediate store sync
        // @ts-ignore
        import('../store.js')
            .then((m) => m.syncFromGameState())
            .catch(() => { });
    };
    return (_jsxs("div", { children: [_jsxs("div", { style: {
                    color: fd.color,
                    fontWeight: 'bold',
                    fontSize: 11,
                    marginBottom: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }, children: [defName, e.isBuilding && e.trainQ.length > 0 && (_jsxs("span", { style: {
                            background: '#4af',
                            color: '#000',
                            borderRadius: 2,
                            padding: '0 3px',
                            fontSize: 9,
                            marginLeft: 4,
                        }, children: ["\u00D7", e.trainQ.length] })), isPrimary && (_jsx("span", { style: {
                            background: '#fa4',
                            color: '#000',
                            borderRadius: 2,
                            padding: '0 3px',
                            fontSize: 9,
                            marginLeft: 4,
                        }, children: "\u2605" }))] }), _jsx(HPBar, { hp: e.hp, maxHp: e.maxHp }), e.isBuilding && (_jsxs(_Fragment, { children: [!e.done && (_jsxs("div", { style: { color: '#99c', fontSize: 10, marginBottom: 2 }, children: ["Building: ", (e.bprog * 100).toFixed(0), "%"] })), e.done && e.trainQ.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { color: '#9ab', fontSize: 10, marginBottom: 1 }, children: ["Training: ", UDEF[e.trainQ[0].type]?.name ?? e.trainQ[0].type, ' ', e.trainQ[0].total > 0
                                        ? ((e.trainQ[0].t / e.trainQ[0].total) * 100).toFixed(0)
                                        : 0, "%"] }), e.trainQ.length > 1 && (_jsxs("div", { style: { color: '#789', fontSize: 10 }, children: ["+", e.trainQ.length - 1, " queued"] }))] })), e.done && e.dmg > 0 && (_jsxs("div", { style: { color: '#789', fontSize: 10, marginTop: 2 }, children: ["ATK ", e.dmg, " \u00B7 RNG ", e.range] })), e.waypoint && (_jsxs("div", { style: { color: '#789', fontSize: 10, marginTop: 2 }, children: ["WP: ", e.waypoint.tx, ",", e.waypoint.ty] })), e.repairing && (_jsx("div", { style: { color: '#4d8', fontSize: 10, marginTop: 2 }, children: "Repairing\u2026" }))] })), !e.isBuilding && (_jsxs(_Fragment, { children: [_jsx("div", { style: { color: '#899', fontSize: 10, marginBottom: 2 }, children: UNIT_STATE_LABELS[e.unitState] ?? e.unitState }), e.type === 'harvester' && (_jsxs("div", { style: { fontSize: 10 }, children: ["Ore: ", _jsx("span", { style: { color: '#8d5' }, children: e.ore }), _jsxs("span", { style: { color: '#445' }, children: ["/", e.maxOre] })] })), e.dmg > 0 && (_jsxs("div", { style: { color: '#789', fontSize: 10, marginTop: 2 }, children: ["ATK ", e.dmg, " \u00B7 RNG ", e.range, e.weaponType ? ` · ${WEAPON_NAMES[e.weaponType] ?? e.weaponType}` : ''] })), e.type === 'mcv' && e.faction === playerFaction && (_jsx("button", { onClick: handleDeploy, className: "build-btn", style: { marginTop: 6, width: '100%', color: '#4af', borderColor: '#2a4a6a' }, children: "DEPLOY MCV [F]" }))] }))] }));
}
// ── Info panel ────────────────────────────────────────────────────────────────
export function InfoPanel() {
    const { sel, playerFaction } = useUIStore(s => ({ sel: s.sel, playerFaction: s.playerFaction }));
    return (_jsx("div", { style: {
            padding: 8,
            borderBottom: '1px solid #1a2230',
            minHeight: 80,
            flexShrink: 0,
        }, children: sel.length === 0 ? (_jsx("span", { style: { color: '#668', fontSize: 10 }, children: "No selection" })) : (_jsxs(_Fragment, { children: [_jsx(EntityDetail, { e: sel[0], playerFaction: playerFaction }), sel.length > 1 && (_jsxs("div", { style: { color: '#789', fontSize: 10, marginTop: 4 }, children: ["+", sel.length - 1, " selected"] }))] })) }));
}
