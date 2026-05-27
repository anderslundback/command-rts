import React from 'react';

// ─── Brand colours ────────────────────────────────────────────────────────────
const GOLD       = '#c9aa50';
const GOLD_FILL  = 'rgba(201,170,80,0.10)';
const GOLD_INNER = 'rgba(201,170,80,0.38)';
const GOLD_DOT   = 'rgba(201,170,80,0.40)';

// ─── Tactical diamond crosshair mark ─────────────────────────────────────────
// Renders as a pure-SVG <g> so it can be embedded inside any svg viewBox.
interface MarkProps {
  cx: number;
  cy: number;
  /** Half-diagonal of the outer diamond in viewBox units */
  d: number;
}

function Mark({ cx, cy, d }: MarkProps) {
  const di   = d * 0.5;           // inner diamond half-diagonal
  const gap  = d * 0.079;         // tick gap from vertex (~3px at d=38)
  const tlen = d * 0.237;         // tick length            (~9px at d=38)
  const sw   = Math.max(0.75, d * 0.04); // stroke width
  const cdist = d * 0.46;         // corner dot distance from centre (45°)

  // outer diamond vertices
  const T = { x: cx,     y: cy - d };
  const R = { x: cx + d, y: cy     };
  const B = { x: cx,     y: cy + d };
  const L = { x: cx - d, y: cy     };

  return (
    <g>
      {/* Corner accent dots (between outer & inner diamond, at 45°) */}
      <circle cx={cx - cdist} cy={cy - cdist} r={d * 0.053} fill={GOLD_DOT}/>
      <circle cx={cx + cdist} cy={cy - cdist} r={d * 0.053} fill={GOLD_DOT}/>
      <circle cx={cx - cdist} cy={cy + cdist} r={d * 0.053} fill={GOLD_DOT}/>
      <circle cx={cx + cdist} cy={cy + cdist} r={d * 0.053} fill={GOLD_DOT}/>

      {/* Outer diamond */}
      <polygon
        points={`${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`}
        fill={GOLD_FILL}
        stroke={GOLD}
        strokeWidth={sw}
        strokeLinejoin="miter"
      />

      {/* Inner nested diamond */}
      <polygon
        points={`${cx},${cy-di} ${cx+di},${cy} ${cx},${cy+di} ${cx-di},${cy}`}
        fill="none"
        stroke={GOLD}
        strokeWidth={sw * 0.5}
        strokeOpacity="0.38"
      />

      {/* Crosshair ticks */}
      {/* Top    */ }
      <line x1={T.x} y1={T.y - gap}        x2={T.x} y2={T.y - gap - tlen}
            stroke={GOLD} strokeWidth={sw} strokeLinecap="square"/>
      {/* Bottom */}
      <line x1={B.x} y1={B.y + gap}        x2={B.x} y2={B.y + gap + tlen}
            stroke={GOLD} strokeWidth={sw} strokeLinecap="square"/>
      {/* Left   */}
      <line x1={L.x - gap} y1={L.y}        x2={L.x - gap - tlen} y2={L.y}
            stroke={GOLD} strokeWidth={sw} strokeLinecap="square"/>
      {/* Right  */}
      <line x1={R.x + gap} y1={R.y}        x2={R.x + gap + tlen} y2={R.y}
            stroke={GOLD} strokeWidth={sw} strokeLinecap="square"/>

      {/* Centre dot */}
      <circle cx={cx} cy={cy} r={d * 0.072} fill={GOLD}/>
    </g>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
interface LogoProps {
  /** Rendered pixel width; height is derived from the 480×256 aspect ratio */
  width?: number;
  /** 'full'  = mark + wordmark + subtitle (for menu / social)
   *  'mark'  = icon only (for compact placements)               */
  variant?: 'full' | 'mark';
  style?: React.CSSProperties;
}

export function Logo({ width = 380, variant = 'full', style }: LogoProps) {
  // ── Icon-only variant ─────────────────────────────────────────────────────
  if (variant === 'mark') {
    return (
      <svg
        viewBox="0 0 100 100"
        width={width}
        height={width}
        xmlns="http://www.w3.org/2000/svg"
        style={style}
      >
        <Mark cx={50} cy={50} d={34}/>
      </svg>
    );
  }

  // ── Full wordmark ─────────────────────────────────────────────────────────
  // viewBox: 480 × 256
  // Layout (all y values are in viewBox units):
  //   Mark centre          y = 66
  //   Bottom tick end      y ≈ 116
  //   Rule double (above)  y = 130, 134
  //   "COMMAND" baseline   y = 200   (cap-top ≈ 146, leaves ~12px breathing room)
  //   Rule double (below)  y = 210, 214
  //   Subtitle baseline    y = 234

  const W = 480;
  const H = 256;
  const cx = 240;

  // SVG letter-spacing adds trailing space AFTER every glyph including the last.
  // With letter-spacing=10 on a 7-char word the visual centre is shifted +5px.
  // Compensate by placing the text at cx − 5:
  const TX = cx - 5;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={Math.round(width * H / W)}
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      {/* Tactical crosshair mark */}
      <Mark cx={cx} cy={66} d={38}/>

      {/* ── Rule above ─────────────────────────────────────────────────── */}
      <line x1="48"  y1="130" x2="432" y2="130" stroke={GOLD} strokeWidth="1.5" opacity="0.72"/>
      <line x1="68"  y1="134" x2="412" y2="134" stroke={GOLD} strokeWidth="0.5" opacity="0.35"/>

      {/* ── Wordmark ────────────────────────────────────────────────────── */}
      <text
        x={TX}
        y="200"
        fontFamily="'Bebas Neue', Impact, 'Arial Black', sans-serif"
        fontSize="64"
        letterSpacing="10"
        textAnchor="middle"
        fill={GOLD}
      >
        COMMAND
      </text>

      {/* ── Rule below ─────────────────────────────────────────────────── */}
      <line x1="68"  y1="210" x2="412" y2="210" stroke={GOLD} strokeWidth="0.5" opacity="0.35"/>
      <line x1="48"  y1="214" x2="432" y2="214" stroke={GOLD} strokeWidth="1.5" opacity="0.72"/>

      {/* ── Subtitle ───────────────────────────────────────────────────── */}
      <text
        x={cx}
        y="234"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="10"
        letterSpacing="5"
        textAnchor="middle"
        fill={GOLD}
        opacity="0.55"
      >
        REAL-TIME STRATEGY
      </text>
    </svg>
  );
}
