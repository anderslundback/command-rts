const synth = window.speechSynthesis ?? null;

let _actx = null;
let _master = null;
let _cache = null;

function _initCache(c) {
  function noise(dur, fill) {
    const len = (c.sampleRate * dur) | 0;
    const buf = c.createBuffer(1, len, c.sampleRate);
    fill(buf.getChannelData(0), len);
    return buf;
  }
  _cache = {
    rifleman:   noise(0.08,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1) * Math.max(0, 1 - i/n*5); }),
    tank:       noise(0.18,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1) * Math.max(0, 1 - i/n*2.2); }),
    rocketeer:  noise(0.22,  (d, n) => { for (let i = 0; i < n; i++) { const t = i/n; d[i] = (Math.random()*2-1)*Math.max(0,1-t*3.5)*(1-t); } }),
    burst:      noise(0.06,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1) * Math.max(0, 1 - i/n*6); }),
    artillery:  noise(0.35,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1) * Math.max(0, 1 - i/n*1.4); }),
    rocket:     noise(0.55,  (d, n) => { for (let i = 0; i < n; i++) { const t = i/n; d[i] = (Math.random()*2-1)*Math.exp(-t*2.5)*(0.6+0.4*t); } }),
    crack:      noise(0.04,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1)*(1-i/n); }),
    gunship:    noise(0.28,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1) * Math.max(0, 1 - i/n*1.8); }),
    fighter:    noise(0.12,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1) * Math.max(0, 1 - i/n*5); }),
    buildClunk: noise(0.08,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1)*Math.exp(-i/n*18); }),
    explosion:  noise(0.60,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1)*Math.exp(-i/n*4); }),
    expCrack:   noise(0.05,  (d, n) => { for (let i = 0; i < n; i++) d[i] = (Math.random()*2-1)*(1-i/n); }),
  };
}

function getCtx() {
  if (!_actx) {
    _actx = new (window.AudioContext || window.webkitAudioContext)();
    _master = _actx.createGain();
    _master.gain.value = 0.5;
    _master.connect(_actx.destination);
    _initCache(_actx);
  }
  return _actx;
}

export function setVolume(v) {
  if (_master) _master.gain.value = v;
}

// Play a cached buffer through a filter+gain chain; auto-disconnects when done.
function _play(c, buf, fltType, fltFreq, fltQ, gainVal) {
  const src = c.createBufferSource();
  src.buffer = buf;
  const flt = c.createBiquadFilter();
  flt.type = fltType;
  flt.frequency.value = fltFreq;
  if (fltQ != null) flt.Q.value = fltQ;
  const g = c.createGain();
  g.gain.value = gainVal;
  src.connect(flt); flt.connect(g); g.connect(_master);
  src.onended = () => { src.disconnect(); flt.disconnect(); g.disconnect(); };
  src.start();
  return { src, flt, g };
}

// Play a cached buffer through just a gain (no filter); auto-disconnects when done.
function _playDry(c, buf, gainVal) {
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gainVal;
  src.connect(g); g.connect(_master);
  src.onended = () => { src.disconnect(); g.disconnect(); };
  src.start();
}

export function playShot(type) {
  try {
    const c = getCtx();
    if (type === 'rifleman' || type === 'soldier') {
      _play(c, _cache.rifleman, 'bandpass', 1800, 0.6, 0.35);
    } else if (type === 'tank') {
      _play(c, _cache.tank, 'lowpass', 420, null, 0.55);
    } else if (type === 'rocketeer') {
      _play(c, _cache.rocketeer, 'bandpass', 600, 0.5, 0.5);
    } else if (type === 'turret' || type === 'antiair' || type === 'aatrack') {
      for (let shot = 0; shot < 3; shot++) {
        setTimeout(() => {
          try { _play(getCtx(), _cache.burst, 'bandpass', 2200, 0.9, 0.28); } catch (_) {}
        }, shot * 75);
      }
    } else if (type === 'artillery') {
      _play(c, _cache.artillery, 'lowpass', 180, null, 0.7);
    } else if (type === 'v2rocket' || type === 'tomahawk') {
      // Rocket launch: rising whoosh + ignition crack
      const src = c.createBufferSource();
      src.buffer = _cache.rocket;
      const flt = c.createBiquadFilter();
      flt.type = 'bandpass'; flt.Q.value = 1.0;
      const now = c.currentTime;
      flt.frequency.setValueAtTime(180, now);
      flt.frequency.exponentialRampToValueAtTime(2400, now + 0.45);
      const g = c.createGain(); g.gain.value = 0.65;
      src.connect(flt); flt.connect(g); g.connect(_master);
      src.onended = () => { src.disconnect(); flt.disconnect(); g.disconnect(); };
      src.start();
      _playDry(c, _cache.crack, 0.5);
    } else if (type === 'gunship') {
      _play(c, _cache.gunship, 'lowpass', 280, null, 0.65);
    } else if (type === 'fighter' || type === 'drone' || type === 'scout') {
      _play(c, _cache.fighter, 'bandpass', 2000, 0.7, 0.32);
    }
  } catch (_) {}
}

export function playTrainingStart() {
  try {
    const c = getCtx();
    const now = c.currentTime;
    for (const [freq, delay] of [[660, 0], [880, 0.07]]) {
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.12, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);
      osc.connect(g); g.connect(_master);
      osc.start(now + delay);
      osc.stop(now + delay + 0.07);
      osc.onended = () => { osc.disconnect(); g.disconnect(); };
    }
  } catch (_) {}
}

export function playCancel() {
  try {
    const c = getCtx();
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g); g.connect(_master);
    osc.start(now); osc.stop(now + 0.15);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  } catch (_) {}
}

export function playBuildStart() {
  try {
    const c = getCtx();
    const now = c.currentTime;
    const { src, flt, g } = _play(c, _cache.buildClunk, 'bandpass', 900, 1.2, 0.45);
    // Mechanical tick overlay
    const osc = c.createOscillator();
    osc.type = 'square'; osc.frequency.value = 120;
    const og = c.createGain();
    og.gain.setValueAtTime(0.08, now + 0.04);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(og); og.connect(_master);
    osc.start(now + 0.04); osc.stop(now + 0.1);
    osc.onended = () => { osc.disconnect(); og.disconnect(); };
  } catch (_) {}
}

export function playExplosion() {
  try {
    const c = getCtx();
    const now = c.currentTime;
    // Low boom
    _play(c, _cache.explosion, 'lowpass', 140, null, 0.8);
    // Sub-bass sweep
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.35);
    const og = c.createGain();
    og.gain.setValueAtTime(0.5, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(og); og.connect(_master);
    osc.start(now); osc.stop(now + 0.42);
    osc.onended = () => { osc.disconnect(); og.disconnect(); };
    // Mid crack
    _play(c, _cache.expCrack, 'bandpass', 1200, 0.8, 0.6);
  } catch (_) {}
}

export function playCash() {
  try {
    const c = getCtx();
    const now = c.currentTime;
    for (const [freq, delay, dur] of [[880, 0, 0.07], [1760, 0.055, 0.055]]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.22, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(g); g.connect(_master);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.01);
      osc.onended = () => { osc.disconnect(); g.disconnect(); };
    }
  } catch (_) {}
}

export function speak(text) {
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.volume = 0.8; u.rate = 1.1; u.pitch = 0.9;
  synth.speak(u);
}

const UNIT_LINES = {
  rifleman:  'Rifleman reporting',
  rocketeer: 'Rocketeer armed and ready',
  harvester: 'Harvester online',
  scout:     'Scout ready',
  aatrack:   'AA Track online',
  tank:      'Tank ready for combat',
  mcv:       'MCV ready for deployment',
  artillery: 'Artillery in position',
  v2rocket:  'V2 launch ready',
  tomahawk:  'Tomahawk armed',
  fighter:   'Fighter airborne',
  gunship:   'Gunship ready',
  drone:     'Drone launched',
};

const BUILD_LINES = {
  power:    'Power plant online',
  refinery: 'Refinery operational',
  barracks: 'Barracks complete',
  factory:  'War factory online',
  depot:    'Service depot operational',
  radar:    'Radar online',
  airfield: 'Airfield operational',
  turret:   'Defense turret active',
  antiair:  'Anti-air battery active',
};

export function speakUnit(type) {
  speak(UNIT_LINES[type] ?? 'Unit ready');
}

export function speakBuilding(type) {
  speak(BUILD_LINES[type] ?? 'Construction complete');
}
