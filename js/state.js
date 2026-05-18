export const state = {
  canvas: null, ctx: null,
  radar: null,  radarCtx: null,

  map: [],
  oreHistory: new Set(),

  entities: [],
  entById: new Map(),

  tick: 0,
  playerFaction: 0,
  credits:   [0, 0, 0],
  powerUsed: [0, 0, 0],
  powerGen:  [0, 0, 0],
  AI: [null, null, null],

  cam: { x: 0, y: 0 },

  selected: [],
  buildMode: null,
  buildReady: false,
  mouse: { sx: 0, sy: 0, wx: 0, wy: 0, tx: 0, ty: 0 },
  dragStart: null,
  dragBox: null,
  lastClickTime: 0,
  lastClickEnt: null,

  particles: [],
  moveIndicators: [],

  statusMsg: '',
  statusTimer: 0,

  frameId: null,
  gameStarted: false,
  gameOver: false,

  activeTab: 'build',
  minimapDirty: true,

  hudBuildQueue: [[], [], []],
  hudDefQueue:   [[], [], []],
  deployMcvId: null,
  repairMode: false,
  sellMode: false,
  primaryBuilding: {},
  fpsLastTime: 0,
  fpsSmooth: 60,
  paused: false,
  volume: 0.5,
  factionEliminated: [false, false, false],
};
