export const TS = 32;
export const MW = 80;
export const MH = 60;
export const HUD_H = 36;
export const SIDEBAR_W = 200;
export const RADAR_H = 160;

export const T = Object.freeze({ GRASS: 0, WATER: 1, ORE: 2, ROCK: 3 });
export const TILE_COLORS = ['#253518', '#0e2235', '#3d6e28', '#3a3832'];

export const FDATA = Object.freeze([
  { name: 'ALLIANCE',    color: '#4aaeff', dark: '#1a3a6e', light: '#88ccff' },
  { name: 'BROTHERHOOD', color: '#ff6644', dark: '#7a2a1a', light: '#ff9977' },
  { name: 'SYNDICATE',   color: '#44dd88', dark: '#1a6a3a', light: '#88ffbb' },
]);

export const FBONUSES = Object.freeze([
  { creditMult: 1.0, hpMult: 1.0,  speedMult: 1.0,  trainMult: 1.0  },
  { creditMult: 0.8, hpMult: 1.3,  speedMult: 0.85, trainMult: 1.2  },
  { creditMult: 1.3, hpMult: 0.85, speedMult: 1.2,  trainMult: 0.85 },
]);

// ARMOR_MULT[weaponType][armorType] = damage multiplier
export const ARMOR_MULT = Object.freeze({
  small_arms: { infantry: 1.0,  light: 0.35, heavy: 0.1,  building: 0.05, air: 0.0  },
  rockets:    { infantry: 0.3,  light: 0.8,  heavy: 1.5,  building: 0.7,  air: 0.25 },
  cannon:     { infantry: 0.25, light: 0.8,  heavy: 1.0,  building: 0.75, air: 0.0  },
  gun:        { infantry: 0.9,  light: 0.7,  heavy: 0.5,  building: 0.3,  air: 0.05 },
  machinegun: { infantry: 1.3,  light: 0.4,  heavy: 0.05, building: 0.03, air: 0.1  },
  strafe:     { infantry: 0.8,  light: 0.6,  heavy: 0.2,  building: 0.1,  air: 0.5  },
  bombs:      { infantry: 0.5,  light: 0.8,  heavy: 0.9,  building: 1.1,  air: 0.0  },
  flak:       { infantry: 0.6,  light: 0.3,  heavy: 0.1,  building: 0.0,  air: 2.5  },
});

export const BDEF = Object.freeze({
  command:  { name: 'Command Ctr',   w: 3, h: 3, cost: 0,    power: -2, hp: 1200, btime: 0,  prereq: null,        armor: 'building', weapon: null,   desc: 'Main base' },
  power:    { name: 'Power Plant',   w: 2, h: 2, cost: 300,  power:  5, hp: 350,  btime: 8,  prereq: 'command',   armor: 'building', weapon: null,   desc: '+5 power' },
  refinery: { name: 'Refinery',      w: 3, h: 2, cost: 500,  power: -1, hp: 600,  btime: 12, prereq: 'command',   armor: 'building', weapon: null,   desc: 'Ore · spawns Harvester' },
  barracks: { name: 'Barracks',      w: 2, h: 2, cost: 400,  power: -1, hp: 500,  btime: 10, prereq: 'power',     armor: 'building', weapon: null,   desc: 'Trains infantry' },
  factory:  { name: 'War Factory',   w: 3, h: 2, cost: 700,  power: -2, hp: 700,  btime: 16, prereq: 'power',     armor: 'building', weapon: null,   desc: 'Trains vehicles' },
  depot:    { name: 'Service Depot', w: 3, h: 2, cost: 600,  power: -1, hp: 450,  btime: 14, prereq: 'factory',   armor: 'building', weapon: null,   desc: 'Repairs vehicles · unlocks MCV' },
  radar:    { name: 'Radar',         w: 2, h: 2, cost: 500,  power: -2, hp: 300,  btime: 12, prereq: 'refinery',  armor: 'building', weapon: null,   desc: 'Minimap · unlocks air tier' },
  airfield: { name: 'Airfield',      w: 3, h: 2, cost: 800,  power: -2, hp: 400,  btime: 18, prereq: 'radar',     armor: 'building', weapon: null,   desc: 'Trains aircraft' },
  turret:   { name: 'Turret',        w: 1, h: 1, cost: 350,  power: -1, hp: 280,  btime: 8,  prereq: 'barracks',  armor: 'building', weapon: 'gun',  desc: 'Defense gun',  range: 6, dmg: 18, aspd: 55 },
  antiair:  { name: 'Anti-Air',      w: 1, h: 1, cost: 400,  power: -1, hp: 250,  btime: 8,  prereq: 'radar',     armor: 'building', weapon: 'flak', desc: 'Air defense',  range: 8, dmg: 30, aspd: 60 },
});

export const UDEF = Object.freeze({
  harvester: { name: 'Harvester', cost: 800,  hp: 200, speed: 1.4, dmg: 0,  range: 0, aspd: 0,   ttime: 14, desc: 'Collects ore',             armor: 'light',    weapon: null },
  rifleman:  { name: 'Rifleman',  cost: 200,  hp: 80,  speed: 2.2, dmg: 14, range: 5, aspd: 50,  ttime: 6,  desc: 'Anti-infantry',             armor: 'infantry', weapon: 'small_arms' },
  rocketeer: { name: 'Rocketeer', cost: 350,  hp: 60,  speed: 1.9, dmg: 28, range: 6, aspd: 90,  ttime: 9,  desc: 'Anti-armor',                armor: 'infantry', weapon: 'rockets' },
  scout:     { name: 'Scout',     cost: 480,  hp: 150, speed: 2.3, dmg: 22, range: 5, aspd: 38,  ttime: 10, desc: 'Fast anti-infantry',        armor: 'light',    weapon: 'machinegun' },
  aatrack:   { name: 'AA Track',  cost: 520,  hp: 130, speed: 2.1, dmg: 25, range: 7, aspd: 50,  ttime: 12, desc: 'Mobile air defense',        armor: 'light',    weapon: 'flak',       prereq: 'radar' },
  tank:      { name: 'Tank',      cost: 650,  hp: 320, speed: 1.6, dmg: 35, range: 5, aspd: 85,  ttime: 15, desc: 'Heavy armor',               armor: 'heavy',    weapon: 'cannon' },
  mcv:       { name: 'MCV',       cost: 1200, hp: 300, speed: 1.1, dmg: 0,  range: 0, aspd: 0,   ttime: 25, desc: 'Deploys as Command Center', armor: 'heavy',    weapon: null,         prereq: 'depot' },
  artillery: { name: 'Artillery', cost: 900,  hp: 120, speed: 0.85, dmg: 55, range: 8, aspd: 120, ttime: 20, desc: 'Long-range siege',         armor: 'light',    weapon: 'cannon',     splash: 1.5, prereq: 'radar', factionOnly: 0 },
  v2rocket:  { name: 'V2 Rocket', cost: 900,  hp: 120, speed: 0.80, dmg: 52, range: 8, aspd: 130, ttime: 22, desc: 'Rocket artillery',         armor: 'light',    weapon: 'rockets',    splash: 1.5, prereq: 'radar', factionOnly: 1 },
  tomahawk:  { name: 'Tomahawk',  cost: 850,  hp: 100, speed: 0.90, dmg: 48, range: 8, aspd: 110, ttime: 18, desc: 'Precision missiles',       armor: 'light',    weapon: 'rockets',    splash: 1.5, prereq: 'radar', factionOnly: 2 },
  fighter:   { name: 'Fighter',   cost: 800,  hp: 80,  speed: 3.2, dmg: 22, range: 5, aspd: 40,  ttime: 18, desc: 'Fast air superiority',      armor: 'air',      weapon: 'strafe',     prereq: 'airfield', factionOnly: 0 },
  gunship:   { name: 'Gunship',   cost: 1100, hp: 220, speed: 1.6, dmg: 50, range: 5, aspd: 120, ttime: 26, desc: 'Heavy bomber',              armor: 'air',      weapon: 'bombs',      prereq: 'airfield', factionOnly: 1, splash: 1.2 },
  drone:     { name: 'Drone',     cost: 600,  hp: 60,  speed: 3.8, dmg: 16, range: 4, aspd: 35,  ttime: 14, desc: 'Fast attack drone',         armor: 'air',      weapon: 'strafe',     prereq: 'airfield', factionOnly: 2 },
});

export const BUILD_TYPES   = ['power', 'refinery', 'barracks', 'factory', 'depot', 'radar', 'airfield'];
export const DEFENSE_TYPES = ['turret', 'antiair'];
export const TRAIN_FROM    = Object.freeze({
  barracks: ['rifleman', 'rocketeer'],
  factory:  ['harvester', 'scout', 'aatrack', 'tank', 'mcv', 'artillery', 'v2rocket', 'tomahawk'],
  airfield: ['fighter', 'gunship', 'drone'],
});
