import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useUIStore } from '../store';
import { HUD } from './HUD';
import { Sidebar } from './Sidebar';
import { Menu } from './Menu';
import { PauseMenu } from './PauseMenu';
export function App() {
    const phase = useUIStore(s => s.phase);
    return (_jsxs("div", { style: {
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 10,
            fontFamily: "'Courier New', monospace",
        }, children: [(phase === 'playing' || phase === 'paused') && (_jsxs(_Fragment, { children: [_jsx(HUD, {}), _jsx(Sidebar, {})] })), (phase === 'menu' || phase === 'gameover') && _jsx(Menu, {}), phase === 'paused' && _jsx(PauseMenu, {})] }));
}
