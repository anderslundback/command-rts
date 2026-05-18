import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useUIStore } from '../store';
// @ts-ignore
import { FDATA } from '../constants.js';
export function HUD() {
    const { playerFaction, credits, powerUsed, powerGen, statusMsg, fps } = useUIStore(s => ({
        playerFaction: s.playerFaction,
        credits: s.credits,
        powerUsed: s.powerUsed,
        powerGen: s.powerGen,
        statusMsg: s.statusMsg,
        fps: s.fps,
    }));
    const fd = FDATA[playerFaction];
    const powerOk = powerGen >= powerUsed;
    return (_jsxs("div", { style: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 36,
            background: '#06080e',
            borderBottom: '1px solid #1a2230',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 16,
            pointerEvents: 'auto',
            zIndex: 20,
            userSelect: 'none',
        }, children: [_jsx("span", { style: {
                    color: fd.color,
                    fontWeight: 'bold',
                    fontSize: 13,
                    letterSpacing: 2,
                    minWidth: 110,
                }, children: fd.name }), _jsxs("span", { style: { color: '#8ab', fontSize: 11 }, children: [_jsx("span", { style: { color: '#668', fontSize: 10 }, children: "CREDITS " }), _jsx("span", { style: { color: '#fc4', fontWeight: 'bold' }, children: credits.toLocaleString() })] }), _jsxs("span", { style: { color: '#8ab', fontSize: 11 }, children: [_jsx("span", { style: { color: '#668', fontSize: 10 }, children: "PWR " }), _jsxs("span", { style: { color: powerOk ? '#fc4' : '#f44', fontWeight: 'bold' }, children: [powerUsed, "/", powerGen] })] }), statusMsg && (_jsx("span", { style: {
                    color: '#9ab',
                    fontSize: 11,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }, children: statusMsg })), _jsx("div", { style: { flex: 1 } }), _jsxs("span", { style: { color: '#445', fontSize: 10 }, children: [fps, " FPS"] })] }));
}
