import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore
import { submitBugReport, closeBugReport, getCooldownRemaining, getCaptured } from '../bugReport.js';

export function BugReportModal(): React.ReactElement {
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'offline'>('idle');
  const [cooldown, setCooldown] = useState(() => Math.ceil(getCooldownRemaining() / 1000));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => {
      const next = c - 1;
      if (next <= 0) clearInterval(t);
      return Math.max(0, next);
    }), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);

  const handleSubmit = useCallback(async () => {
    if (cooldown > 0 || !description.trim() || status !== 'idle') return;
    setStatus('submitting');
    const result = await submitBugReport(description.trim());
    if (result.ok) {
      setStatus('success');
      setTimeout(closeBugReport, 1500);
    } else {
      setStatus('offline');
    }
  }, [description, cooldown, status]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeBugReport();
  }, []);

  const { screenshot, autoTriggered } = getCaptured();
  const canSubmit = cooldown === 0 && description.trim().length > 0 && status === 'idle';
  const charsLeft = 1000 - description.length;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, pointerEvents: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) closeBugReport(); }}
      onKeyDown={handleKey}
    >
      <div
        style={{
          background: '#080d18', border: '1px solid #1a2230',
          width: 480, display: 'flex', flexDirection: 'column', gap: 12,
          padding: 20, fontFamily: "'Courier New', monospace",
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#8ab', fontSize: 12, letterSpacing: 2 }}>BUG REPORT</span>
          <button onClick={closeBugReport} style={ghostBtn}>✕</button>
        </div>

        {/* Auto-trigger notice */}
        {autoTriggered && (
          <div style={{ background: '#1a0f0a', border: '1px solid #5a2a1a', color: '#f84', fontSize: 10, padding: '4px 8px', letterSpacing: 1 }}>
            AN ERROR WAS DETECTED — logs captured automatically. Describe what you were doing.
          </div>
        )}

        {/* Screenshot preview */}
        {screenshot && (
          <img
            src={screenshot}
            alt="screenshot"
            style={{ width: '100%', border: '1px solid #1a2230', opacity: 0.9, display: 'block' }}
          />
        )}

        {/* Description */}
        <textarea
          autoFocus
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, 1000))}
          onKeyDown={e => e.stopPropagation()}
          placeholder="Describe what happened…"
          rows={5}
          style={{
            background: '#050a14', border: '1px solid #1a2230',
            color: '#cde', fontFamily: 'inherit', fontSize: 12,
            padding: 10, resize: 'vertical', outline: 'none', width: '100%',
            boxSizing: 'border-box',
          }}
        />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10 }}>
            {status === 'success'  && <span style={{ color: '#4c8' }}>✓ SENT</span>}
            {status === 'offline'  && <span style={{ color: '#f84' }}>SAVED — will retry on next launch</span>}
            {status === 'submitting' && <span style={{ color: '#8ab' }}>SENDING…</span>}
            {status === 'idle' && cooldown > 0 && <span style={{ color: '#557' }}>COOLDOWN {cooldown}s</span>}
            {status === 'idle' && cooldown === 0 && <span style={{ color: '#334' }}>{charsLeft} chars left</span>}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? '#0f2a14' : '#0a0f18',
              border: `1px solid ${canSubmit ? '#2a6' : '#1a2230'}`,
              color: canSubmit ? '#4d8' : '#334',
              fontFamily: 'inherit', fontSize: 11, letterSpacing: 1,
              padding: '4px 16px', cursor: canSubmit ? 'pointer' : 'default',
            }}
          >
            SUBMIT
          </button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #1a2230', color: '#446',
  fontFamily: "'Courier New', monospace", fontSize: 11,
  padding: '2px 8px', cursor: 'pointer',
};
