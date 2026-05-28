import { BDEF, UDEF, FBONUSES } from './constants.js';
import { state } from './state.js';
import { canPlace, placeBuilding, spawnNear } from './placement.js';
import { nearestRefinery } from './resources.js';
import { orderAttack, orderHarvest } from './orders.js';

export function makeAI(f) {
  return {
    f,
    btimer: 0,
    wtimer: f * 100,
    htimer: 200 + f * 80,

    myBuildings(type) {
      return state.entities.filter(e => !e.dead && e.isBuilding && e.faction === this.f && e.done && (!type || e.type === type));
    },
    myUnits(type) {
      return state.entities.filter(e => !e.dead && e.isUnit && e.faction === this.f && (!type || e.type === type));
    },

    update() {
      this.btimer++;
      const cr = state.credits[this.f];

      // Cache entity lists for this tick — avoids 15+ repeated filter() scans per update().
      const blist = state.entities.filter(e => !e.dead && e.isBuilding && e.faction === this.f && e.done);
      const ulist = state.entities.filter(e => !e.dead && e.isUnit && e.faction === this.f);
      const has  = t => blist.some(b => b.type === t);
      const bOf  = t => blist.filter(b => b.type === t);
      const uOf  = t => ulist.filter(u => u.type === t);
      const cmd  = blist.find(b => b.type === 'command');
      if (!cmd) return;

      if (this.btimer % 120 === 0) {
        const tried = [
          !has('power')    && cr >= 300 && ['power',    cmd.x + 4, cmd.y],
          !has('refinery') && has('power') && cr >= 500 && ['refinery', cmd.x, cmd.y + 4],
          !has('barracks') && has('refinery') && cr >= 400 && ['barracks', cmd.x + 4, cmd.y + 3],
          !has('factory')  && has('barracks') && cr >= 700 && ['factory',  cmd.x - 4, cmd.y],
          !has('depot')    && has('factory')  && cr >= 600 && ['depot',    cmd.x - 4, cmd.y + 3],
          !has('radar')    && has('refinery') && cr >= 500 && ['radar',    cmd.x + 3, cmd.y - 3],
          !has('airfield') && has('radar')    && cr >= 800 && ['airfield', cmd.x - 5, cmd.y],
          has('barracks')  && bOf('turret').length < 4 && cr >= 350 &&
            ['turret', cmd.x + ((state.rng() * 10 - 5) | 0), cmd.y + ((state.rng() * 10 - 5) | 0)],
          has('radar') && bOf('antiair').length < 2 && cr >= 400 &&
            ['antiair', cmd.x + ((state.rng() * 10 - 5) | 0), cmd.y + ((state.rng() * 10 - 5) | 0)],
        ].find(Boolean);
        if (tried) this._tryBuild(...tried);
      }

      if (this.btimer % 150 === 0) {
        const bar = bOf('barracks').find(b => b.trainQ.length < 3);
        const fac = bOf('factory').find(b => b.trainQ.length < 3);
        const airFac = bOf('airfield').find(b => b.trainQ.length < 3);
        const artType = ['artillery', 'v2rocket', 'tomahawk'][this.f];
        const airType = ['fighter', 'gunship', 'drone'][this.f];
        const harvesters  = uOf('harvester').length;
        const riflemen    = uOf('rifleman').length;
        const rocketeers  = uOf('rocketeer').length;
        const scouts      = uOf('scout').length;
        const aatracks    = uOf('aatrack').length;
        const tanks       = uOf('tank').length;
        const artCount    = uOf(artType).length;
        const airCount    = uOf(airType).length;
        if (fac && harvesters < 3 && cr >= 800) this._queue(fac, 'harvester');
        else if (bar && riflemen < 6 && cr >= 200) this._queue(bar, 'rifleman');
        else if (bar && rocketeers < 3 && cr >= 350) this._queue(bar, 'rocketeer');
        else if (fac && scouts < 4 && cr >= 480) this._queue(fac, 'scout');
        else if (fac && has('radar') && aatracks < 2 && cr >= 520) this._queue(fac, 'aatrack');
        else if (fac && tanks < 5 && cr >= 650) this._queue(fac, 'tank');
        else if (fac && has('radar') && artCount < 3 && cr >= UDEF[artType].cost) this._queue(fac, artType);
        if (airFac && airCount < 4 && cr >= UDEF[airType].cost) this._queue(airFac, airType);
      }

      for (const u of uOf('harvester'))
        if (u.state === 'idle') { const ref = nearestRefinery(this.f, u.x, u.y); if (ref) orderHarvest(u, ref); }

      // Repair damaged buildings
      if (this.btimer % 90 === 0) {
        for (const b of blist) {
          if (b.hp < b.maxHp * 0.5 && state.credits[this.f] > 300) b.repairing = true;
          else if (b.hp >= b.maxHp) b.repairing = false;
        }
      }

      // Defensive recall: if own building under attack redirect some units back
      if (this.btimer % 40 === 0) {
        const underAttack = blist.some(b => b.hitFlash > 0);
        if (underAttack) {
          const artType = ['artillery', 'v2rocket', 'tomahawk'][this.f];
          const airType = ['fighter', 'gunship', 'drone'][this.f];
          const fighters = [
            ...uOf('rifleman'), ...uOf('rocketeer'),
            ...uOf('scout'), ...uOf('tank'),
            ...uOf(artType), ...uOf(airType),
          ].filter(u => u.state === 'attack' || u.state === 'attack_move');
          const recall = fighters.slice(0, Math.ceil(fighters.length * 0.35));
          if (cmd && recall.length) recall.forEach(u => orderAttack(u, cmd));
        }
      }

      // Harvester harassment: small fast squad targets enemy harvesters
      this.htimer++;
      if (this.htimer > 600 + ((state.rng() * 200) | 0)) {
        this.htimer = 0;
        const enemyHarvesters = state.entities.filter(e => !e.dead && e.isUnit && e.faction !== this.f && e.type === 'harvester');
        if (enemyHarvesters.length) {
          const harassers = [...uOf('scout'), ...uOf('rifleman')].slice(0, 3);
          const tgt = enemyHarvesters[(state.rng() * enemyHarvesters.length) | 0];
          harassers.forEach(u => orderAttack(u, tgt));
        }
      }

      // Main attack wave
      this.wtimer++;
      const waveInterval = Math.max(300, 480 - Math.min(240, (state.tick / 10) | 0));
      if (this.wtimer > waveInterval + ((state.rng() * 240) | 0)) {
        this.wtimer = 0;
        const artType = ['artillery', 'v2rocket', 'tomahawk'][this.f];
        const airType = ['fighter', 'gunship', 'drone'][this.f];
        const fighters = [
          ...uOf('rifleman'), ...uOf('rocketeer'),
          ...uOf('scout'), ...uOf('aatrack'),
          ...uOf('tank'), ...uOf(artType), ...uOf(airType),
        ];
        if (fighters.length >= 4) {
          const tgt = this._pickTarget();
          if (tgt) fighters.forEach(u => orderAttack(u, tgt));
        }
      }
    },

    _pickTarget() {
      const enemies = state.entities.filter(e => !e.dead && e.faction !== this.f);
      const combatUnits = enemies.filter(e => e.isUnit && e.dmg > 0 && e.type !== 'harvester');
      if (combatUnits.length) return combatUnits[(state.rng() * combatUnits.length) | 0];
      const harvesters = enemies.filter(e => e.isUnit && e.type === 'harvester');
      if (harvesters.length) return harvesters[(state.rng() * harvesters.length) | 0];
      const buildings = enemies.filter(e => e.isBuilding);
      for (const type of ['refinery', 'command', 'factory', 'barracks']) {
        const b = buildings.find(b => b.type === type);
        if (b) return b;
      }
      return buildings.length ? buildings[(state.rng() * buildings.length) | 0] : null;
    },

    _tryBuild(type, bx, by) {
      const d = BDEF[type];
      if (state.credits[this.f] < d.cost) return;
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++)
          if (canPlace(type, bx + dx, by + dy)) {
            placeBuilding(this.f, type, bx + dx, by + dy, false);
            state.credits[this.f] -= d.cost;
            return;
          }
    },

    _queue(building, type) {
      const d = UDEF[type], b = FBONUSES[this.f];
      if (state.credits[this.f] < 1) return;
      building.trainQ.push({ type, t: 0, total: (d.ttime * b.trainMult * 60) | 0, paid: 0, creditAcc: 0 });
    },
  };
}
