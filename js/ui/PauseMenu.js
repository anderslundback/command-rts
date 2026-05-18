import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from 'react';
// @ts-ignore
import * as _S from '../state.js';
// @ts-ignore
import * as _A from '../audio.js';
const state = _S.state;
const setVolume = _A.setVolume;
export function PauseMenu() {
    const [volume, setVolumeState] = useState(() => state.volume ?? 0.5);
    const handleResume = () => {
        // @ts-ignore
        import('../game.js').then((m) => m.togglePause()).catch(console.error);
    };
    const handleQuit = () => {
        // @ts-ignore
        import('../game.js').then((m) => m.showMenu()).catch(console.error);
    };
    const handleVolume = (ev) => {
        const v = parseFloat(ev.target.value);
        setVolumeState(v);
        state.volume = v;
        setVolume(v);
    };
    return (_jsxs("div", { style: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            zIndex: 60,
            gap: 20,
            fontFamily: "'Courier New', monospace",
        }, children: [_jsx("div", { style: {
                    fontSize: 32,
                    fontWeight: 'bold',
                    letterSpacing: 8,
                    color: '#fc4',
                    textShadow: '0 0 20px #fc48',
                }, children: "PAUSED" }), _jsxs("div", { style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    background: '#06080e',
                    border: '1px solid #1a2230',
                    padding: '14px 24px',
                }, children: [_jsx("label", { htmlFor: "pause-volume", style: { color: '#668', fontSize: 10, letterSpacing: 2 }, children: "VOLUME" }), _jsx("input", { id: "pause-volume", type: "range", min: 0, max: 1, step: 0.01, value: volume, onChange: handleVolume, style: { width: 160, accentColor: '#4af' } }), _jsxs("span", { style: { color: '#9ab', fontSize: 10 }, children: [Math.round(volume * 100), "%"] })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsx(PauseBtn, { label: "RESUME", color: "#4d8", onClick: handleResume }), _jsx(PauseBtn, { label: "QUIT TO MENU", color: "#f64", onClick: handleQuit })] })] }));
}
function PauseBtn({ label, color, onClick, }) {
    const [hovered, setHovered] = React.useState(false);
    return (_jsx("button", { onClick: onClick, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), style: {
            background: hovered ? '#0a1018' : '#06080e',
            border: `2px solid ${hovered ? color : '#1a2230'}`,
            color: hovered ? color : '#8ab',
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            fontWeight: 'bold',
            letterSpacing: 3,
            padding: '10px 36px',
            cursor: 'pointer',
            width: 220,
            transition: 'all 0.1s',
        }, children: label }));
}
