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
  small_arms: { infantry: 1.0,  light: 0.35, heavy: 0.1,  building: 0.05 },
  rockets:    { infantry: 0.3,  light: 0.8,  heavy: 1.5,  building: 0.7  },
  cannon:     { infantry: 0.25, light: 0.8,  heavy: 1.0,  building: 0.75 },
  gun:        { infantry: 0.9,  light: 0.7,  heavy: 0.5,  building: 0.3  },
});

export const BDEF = Object.freeze({
  command:  { name: 'Command Ctr', w: 3, h: 3, cost: 0,   power: -2, hp: 1200, btime: 0,  prereq: null,       armor: 'building', weapon: null,  desc: 'Main base' },
  power:    { name: 'Power Plant', w: 2, h: 2, cost: 300,  power:  5, hp: 350,  btime: 8,  prereq: 'command',  armor: 'building', weapon: null,  desc: '+5 power' },
  refinery: { name: 'Refinery',    w: 3, h: 2, cost: 500,  power: -1, hp: 600,  btime: 12, prereq: 'command',  armor: 'building', weapon: null,  desc: 'Ore · spawns Harvester' },
  barracks: { name: 'Barracks',    w: 2, h: 2, cost: 400,  power: -1, hp: 500,  btime: 10, prereq: 'power',    armor: 'building', weapon: null,  desc: 'Trains infantry' },
  factory:  { name: 'War Factory', w: 3, h: 2, cost: 700,  power: -2, hp: 700,  btime: 16, prereq: 'power',    armor: 'building', weapon: null,  desc: 'Trains vehicles' },
  turret:   { name: 'Turret',      w: 1, h: 1, cost: 350,  power: -1, hp: 280,  btime: 8,  prereq: 'barracks', armor: 'building', weapon: 'gun', desc: 'Defense gun', range: 6, dmg: 18, aspd: 55 },
});

export const UDEF = Object.freeze({
  harvester: { name: 'Harvester', cost: 800, hp: 200, speed: 1.4, dmg: 0,  range: 0, aspd: 0,  ttime: 14, desc: 'Collects ore',  armor: 'light',    weapon: null },
  rifleman:  { name: 'Rifleman',  cost: 200, hp: 80,  speed: 2.2, dmg: 14, range: 5, aspd: 50, ttime: 6,  desc: 'Anti-infantry', armor: 'infantry', weapon: 'small_arms' },
  rocketeer: { name: 'Rocketeer', cost: 350, hp: 60,  speed: 1.9, dmg: 28, range: 6, aspd: 90, ttime: 9,  desc: 'Anti-armor',   armor: 'infantry', weapon: 'rockets' },
  tank:      { name: 'Tank',      cost: 650, hp: 320, speed: 1.6, dmg: 35, range: 5, aspd: 85, ttime: 15, desc: 'Heavy armor',  armor: 'heavy',    weapon: 'cannon' },
});

export const BUILD_TYPES = ['power', 'refinery', 'barracks', 'factory', 'turret'];
export const TRAIN_FROM  = Object.freeze({ barracks: ['rifleman', 'rocketeer'], factory: ['harvester', 'tank'] });
