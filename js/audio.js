const synth = window.speechSynthesis ?? null;

let _actx = null;
let _master = null;

function getCtx() {
  if (!_actx) {
    _actx = new (window.AudioContext || window.webkitAudioContext)();
    _master = _actx.createGain();
    _master.gain.value = 0.5;
    _master.connect(_actx.destination);
  }
  return _actx;
}

export function setVolume(v) {
  if (_master) _master.gain.value = v;
}

export function playShot(type) {
  try {
    const c = getCtx();
    if (type === 'rifleman' || type === 'soldier') {
      const buf = c.createBuffer(1, (c.sampleRate * 0.08) | 0, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / d.length * 5);
      const src = c.createBufferSource();
      src.buffer = buf;
      const flt = c.createBiquadFilter();
      flt.type = 'bandpass'; flt.frequency.value = 1800; flt.Q.value = 0.6;
      const g = c.createGain(); g.gain.value = 0.35;
      src.connect(flt); flt.connect(g); g.connect(_master);
      src.start();
    } else if (type === 'tank') {
      const buf = c.createBuffer(1, (c.sampleRate * 0.18) | 0, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / d.length * 2.2);
      const src = c.createBufferSource();
      src.buffer = buf;
      const flt = c.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 420;
      const g = c.createGain(); g.gain.value = 0.55;
      src.connect(flt); flt.connect(g); g.connect(_master);
      src.start();
    } else if (type === 'rocketeer') {
      // Whoosh launch + distant thump
      const buf = c.createBuffer(1, (c.sampleRate * 0.22) | 0, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - t * 3.5) * (1 - t);
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const flt = c.createBiquadFilter();
      flt.type = 'bandpass'; flt.frequency.value = 600; flt.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = 0.5;
      src.connect(flt); flt.connect(g); g.connect(_master);
      src.start();
    } else if (type === 'turret' || type === 'antiair' || type === 'aatrack') {
      for (let shot = 0; shot < 3; shot++) {
        setTimeout(() => {
          try {
            const c2 = getCtx();
            const buf = c2.createBuffer(1, (c2.sampleRate * 0.06) | 0, c2.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / d.length * 6);
            const src = c2.createBufferSource();
            src.buffer = buf;
            const flt = c2.createBiquadFilter();
            flt.type = 'bandpass'; flt.frequency.value = 2200; flt.Q.value = 0.9;
            const g = c2.createGain(); g.gain.value = 0.28;
            src.connect(flt); flt.connect(g); g.connect(_master);
            src.start();
          } catch (_) {}
        }, shot * 75);
      }
    } else if (type === 'artillery' || type === 'v2rocket' || type === 'tomahawk') {
      const buf = c.createBuffer(1, (c.sampleRate * 0.35) | 0, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / d.length * 1.4);
      const src = c.createBufferSource(); src.buffer = buf;
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 180;
      const g = c.createGain(); g.gain.value = 0.7;
      src.connect(flt); flt.connect(g); g.connect(_master); src.start();
    } else if (type === 'gunship') {
      const buf = c.createBuffer(1, (c.sampleRate * 0.28) | 0, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / d.length * 1.8);
      const src = c.createBufferSource(); src.buffer = buf;
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 280;
      const g = c.createGain(); g.gain.value = 0.65;
      src.connect(flt); flt.connect(g); g.connect(_master); src.start();
    } else if (type === 'fighter' || type === 'drone' || type === 'scout') {
      const buf = c.createBuffer(1, (c.sampleRate * 0.12) | 0, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / d.length * 5);
      const src = c.createBufferSource(); src.buffer = buf;
      const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 2000; flt.Q.value = 0.7;
      const g = c.createGain(); g.gain.value = 0.32;
      src.connect(flt); flt.connect(g); g.connect(_master); src.start();
    }
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
