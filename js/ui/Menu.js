import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { useUIStore } from '../store';
// @ts-ignore
import { FDATA } from '../constants.js';
function FactionButton({ index, fd, onSelect, }) {
    const [hovered, setHovered] = React.useState(false);
    return (_jsx("button", { onClick: () => onSelect(index), onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), style: {
            background: hovered ? fd.dark : '#06080e',
            border: `2px solid ${hovered ? fd.color : '#1a2230'}`,
            color: fd.color,
            fontFamily: "'Courier New', monospace",
            fontSize: 15,
            fontWeight: 'bold',
            letterSpacing: 3,
            padding: '14px 32px',
            cursor: 'pointer',
            width: 220,
            transition: 'all 0.12s',
        }, children: fd.name }));
}
export function Menu() {
    const { phase, winnerFaction, winnerName, playerFaction } = useUIStore(s => ({
        phase: s.phase,
        winnerFaction: s.winnerFaction,
        winnerName: s.winnerName,
        playerFaction: s.playerFaction,
    }));
    const handleFactionSelect = (i) => {
        // @ts-ignore
        import('../game.js').then((m) => m.startGame(i)).catch(console.error);
    };
    const handleReturnToMenu = () => {
        // @ts-ignore
        import('../game.js').then((m) => m.showMenu()).catch(console.error);
    };
    const isWin = phase === 'gameover' && winnerFaction === playerFaction;
    return (_jsxs("div", { style: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            zIndex: 50,
            gap: 24,
            fontFamily: "'Courier New', monospace",
        }, children: [phase === 'menu' && (_jsxs(_Fragment, { children: [_jsx("div", { style: {
                            fontSize: 42,
                            fontWeight: 'bold',
                            letterSpacing: 10,
                            color: '#4af',
                            textShadow: '0 0 24px #4af8',
                            marginBottom: 8,
                        }, children: "COMMAND" }), _jsx("div", { style: { color: '#668', fontSize: 12, letterSpacing: 2, marginBottom: 8 }, children: "SELECT YOUR FACTION" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: FDATA.map((fd, i) => (_jsx(FactionButton, { index: i, fd: fd, onSelect: handleFactionSelect }, i))) })] })), phase === 'gameover' && (_jsxs(_Fragment, { children: [_jsx("div", { style: {
                            fontSize: 48,
                            fontWeight: 'bold',
                            letterSpacing: 8,
                            color: isWin ? '#4d8' : '#f64',
                            textShadow: `0 0 30px ${isWin ? '#4d8' : '#f64'}88`,
                        }, children: isWin ? 'VICTORY' : 'DEFEAT' }), _jsx("div", { style: { color: '#9ab', fontSize: 14, letterSpacing: 2 }, children: winnerFaction >= 0 ? `${winnerName} wins` : 'All factions destroyed' }), _jsx("button", { onClick: handleReturnToMenu, style: {
                            marginTop: 16,
                            background: '#06080e',
                            border: '2px solid #1a2230',
                            color: '#8ab',
                            fontFamily: "'Courier New', monospace",
                            fontSize: 13,
                            letterSpacing: 2,
                            padding: '10px 28px',
                            cursor: 'pointer',
                        }, onMouseEnter: e => (e.target.style.borderColor = '#4af'), onMouseLeave: e => (e.target.style.borderColor = '#1a2230'), children: "RETURN TO MENU" })] }))] }));
}
