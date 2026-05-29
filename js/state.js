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
  shells: [],
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
  gameSpeed: 4, // 0=slowest 1=slow 2=normal 3=fast 4=fastest
  volume: 0.5,
  _dirty: false,
  factionEliminated: [false, false, false],
  gameOverDelay: 0,
  gameStats: { unitsLost: 0, enemiesKilled: 0, startTick: 0, endTick: 0, powerHistory: [] },
  fog: { explored: null, visible: null },
  net: null, // null = skirmish; { role, myFaction, commandQueue, snapshotTick } = multiplayer
  rng: null, // seeded PRNG — set by startGame/startNetGame; all game-logic randomness must use this
  isRollingBack: false,
  rollback: null, // set by startNetGame; { buffer, inputHistory, predictions }
  controlGroups: [[], [], [], [], [], [], [], [], []],
  atkMoveMode: false,
  patrolMode: false,
  forceAtkMode: false,
  menuOpen: false,
  replayMode: false,
  _replayEndTick: 0,
  _lastGroupKey: -1,
  _lastGroupTime: 0,
  damageNumbers: [],
  underAttackTimer: 0,
  syncDebug: null, // populated during net games: { entityH, creditsH, rngH, shellH, tick, resyncs, lastDesyncTick, diverged }
  mapDirty: false,    // set by map.js/placement.js when a tile changes; cleared after snapshot
  _bldgCounts: null,  // Map<"faction:type", count> — rebuilt each tick in gameLoop for train speedMult
  factionCache: null, // [faction] = { units, buildings, doneBuildings } — derived per-tick cache; NEVER snapshotted
  grid: null,         // spatial bucket grid — derived per-tick from state.entities; NEVER snapshotted
  _lastNetStall: false, // debounce: tracks last value pushed to uiStore.netStall
};
