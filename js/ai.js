import { BDEF, UDEF, FBONUSES } from './constants.js';
import { state } from './state.js';
import { canPlace, placeBuilding, spawnNear } from './placement.js';
import { nearestRefinery } from './resources.js';
import { orderAttack, orderHarvest } from './orders.js';
import { getTile } from './map.js';
import { T } from './constants.js';

export function makeAI(f) {
  return {
    f,
    btimer: 0,
    wtimer: f * 100,
    htimer: 200 + f * 80,

    myBuildings(type) {
      const db = state.factionCache?.[this.f].doneBuildings
        ?? state.entities.filter(e => !e.dead && e.isBuilding && e.faction === this.f && e.done);
      return type ? db.filter(b => b.type === type) : db.slice();
    },
    myUnits(type) {
      const us = state.factionCache?.[this.f].units
        ?? state.entities.filter(e => !e.dead && e.isUnit && e.faction === this.f);
      return type ? us.filter(u => u.type === type) : us.slice();
    },

    update() {
      this.btimer++;
      const cr = state.credits[this.f];

      // Per-tick derived lists (built in gameLoop, state.entities order) — avoids 15+ filter() scans per update().
      const blist = state.factionCache?.[this.f].doneBuildings
        ?? state.entities.filter(e => !e.dead && e.isBuilding && e.faction === this.f && e.done);
      const ulist = state.factionCache?.[this.f].units
        ?? state.entities.filter(e => !e.dead && e.isUnit && e.faction === this.f);
      const has  = t => blist.some(b => b.type === t);
      const bOf  = t => blist.filter(b => b.type === t);
      const uOf  = t => ulist.filter(u => u.type === t);
      const cmd  = blist.find(b => b.type === 'command');
      if (!cmd) return;

      if (this.btimer % 120 === 0) {
        const tried = [
          !has('power')     && cr >= 300 && ['power',    cmd.x + 4, cmd.y],
          !has('refinery')  && has('power') && cr >= 1100 && ['refinery', cmd.x, cmd.y + 4],
          !has('barracks')  && has('refinery') && cr >= 500 && ['barracks', cmd.x + 4, cmd.y + 3],
          !has('factory')   && has('barracks') && cr >= 800 && ['factory',  cmd.x - 4, cmd.y],
          !has('depot')     && has('factory')  && cr >= 600 && ['depot',    cmd.x - 4, cmd.y + 3],
          !has('radar')     && has('refinery') && cr >= 500 && ['radar',    cmd.x + 3, cmd.y - 3],
          !has('airfield')  && has('radar')    && cr >= 1000 && ['airfield', cmd.x - 5, cmd.y],
          has('barracks')   && bOf('turret').length < 4 && cr >= 400 &&
            ['turret', cmd.x + ((state.rng() * 10 - 5) | 0), cmd.y + ((state.rng() * 10 - 5) | 0)],
          has('radar') && bOf('antiair').length < 2 && cr >= 450 &&
            ['antiair', cmd.x + ((state.rng() * 10 - 5) | 0), cmd.y + ((state.rng() * 10 - 5) | 0)],
        ].find(Boolean);
        if (tried) this._tryBuild(...tried);

        // Naval yard — scan nearby water tiles and place if found
        if (!has('navalyard') && has('radar') && cr >= BDEF.navalyard.cost) {
          const waterPos = this._findNearbyWater(cmd);
          if (waterPos) this._tryBuildNaval('navalyard', waterPos.x, waterPos.y);
        }
      }

      if (this.btimer % 150 === 0) {
        const bar    = bOf('barracks').find(b => b.trainQ.length < 3);
        const fac    = bOf('factory').find(b => b.trainQ.length < 3);
        const airFac = bOf('airfield').find(b => b.trainQ.length < 3);
        const navFac = bOf('navalyard').find(b => b.trainQ.length < 3);
        const artType = ['artillery', 'v2rocket', 'tomahawk'][this.f];
        const airType = ['fighter', 'gunship', 'drone'][this.f];

        // Analyse enemy composition (order-independent counts) so we can counter it
        let enemyAir = 0, enemyHeavy = 0, enemyNaval = 0;
        if (state.factionCache) {
          for (let ef = 0; ef < 3; ef++) {
            if (ef === this.f) continue;
            for (const e of state.factionCache[ef].units) {
              if (e.armorType === 'air') enemyAir++;
              else if (e.armorType === 'heavy') enemyHeavy++;
              else if (e.armorType === 'naval') enemyNaval++;
            }
          }
        } else {
          const enemies = state.entities.filter(e => !e.dead && e.isUnit && e.faction !== this.f);
          enemyAir   = enemies.filter(e => e.armorType === 'air').length;
          enemyHeavy = enemies.filter(e => e.armorType === 'heavy').length;
          enemyNaval = enemies.filter(e => e.armorType === 'naval').length;
        }

        // Harvesters: hard economic priority before military
        if (fac && uOf('harvester').length < 3 && cr >= UDEF.harvester.cost) {
          this._queue(fac, 'harvester');
        } else {
          // Weighted random pool — eliminates the rigid "fill riflemen first" behaviour
          const pool = [];
          const add = (b, type, w) => {
            if (!b || cr < (UDEF[type]?.cost ?? 0)) return;
            pool.push({ b, type, w });
          };
          add(bar, 'rifleman',  uOf('rifleman').length  < 4 ? 2 : 0);
          add(bar, 'rocketeer', uOf('rocketeer').length < 3 + (enemyHeavy > 3 ? 3 : 0) ? 2 + (enemyHeavy > 2 ? 3 : 0) : 0);
          add(bar, 'mechanic',  uOf('mechanic').length  < 1 && has('factory') ? 1 : 0);
          add(fac, 'scout',     uOf('scout').length     < 3 ? 3 : 0);
          add(fac, 'tank',      uOf('tank').length      < 7 ? 5 : 0);
          add(fac, 'aatrack',   uOf('aatrack').length   < 2 + (enemyAir > 2 ? 3 : 0) && has('radar') ? 1 + (enemyAir > 1 ? 4 : 0) : 0);
          add(fac, artType,     uOf(artType).length     < 3 && has('radar') ? 2 : 0);

          const eligible = pool.filter(c => c.w > 0);
          if (eligible.length) {
            const total = eligible.reduce((s, c) => s + c.w, 0);
            let rnd = state.rng() * total;
            for (const c of eligible) { rnd -= c.w; if (rnd <= 0) { this._queue(c.b, c.type); break; } }
          }
        }

        // Air and naval are independent queues — train whenever possible
        if (airFac && uOf(airType).length < 4 && cr >= UDEF[airType].cost)
          this._queue(airFac, airType);
        if (navFac) {
          const destroyers = uOf('destroyer').length, cruisers = uOf('cruiser').length;
          if ((enemyNaval > 0 || destroyers < 2) && destroyers < 3 && cr >= UDEF.destroyer.cost)
            this._queue(navFac, 'destroyer');
          else if (cruisers < 2 && cr >= UDEF.cruiser.cost)
            this._queue(navFac, 'cruiser');
        }
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

      // Defensive recall: find the nearest enemy attacker and dispatch idle units
      if (this.btimer % 40 === 0) {
        const threatened = blist.filter(b => b.hitFlash > 0);
        if (threatened.length) {
          const attackedB = threatened[(state.rng() * threatened.length) | 0];
          let nearestEnemy = null, nearestDist = Infinity;
          for (const e of state.entities) {
            if (e.dead || e.faction === this.f || !e.isUnit) continue;
            const d = Math.abs(e.x - attackedB.x) + Math.abs(e.y - attackedB.y);
            if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
          }
          if (nearestEnemy) {
            const defenders = [
              ...uOf('rifleman'), ...uOf('rocketeer'),
              ...uOf('scout'), ...uOf('tank'), ...uOf('aatrack'),
            ].filter(u => u.state === 'idle' || u.state === 'move').slice(0, 5);
            defenders.forEach(u => orderAttack(u, nearestEnemy));
          }
        }
      }

      // Harvester harassment: scouts only, less frequent, max 2 units
      this.htimer++;
      if (this.htimer > 1000 + ((state.rng() * 400) | 0)) {
        this.htimer = 0;
        const enemyHarvesters = state.entities.filter(e => !e.dead && e.isUnit && e.faction !== this.f && e.type === 'harvester');
        if (enemyHarvesters.length) {
          const harassers = uOf('scout').slice(0, 2);
          if (harassers.length) {
            const tgt = enemyHarvesters[(state.rng() * enemyHarvesters.length) | 0];
            harassers.forEach(u => orderAttack(u, tgt));
          }
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
          ...uOf('cruiser'), ...uOf('destroyer'),
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

    _tryBuildNaval(type, bx, by) {
      const d = BDEF[type];
      if (state.credits[this.f] < d.cost) return;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++)
          if (canPlace(type, bx + dx, by + dy, this.f, true)) {
            placeBuilding(this.f, type, bx + dx, by + dy, false, true);
            state.credits[this.f] -= d.cost;
            return;
          }
    },

    _findNearbyWater(cmd) {
      const d = BDEF.navalyard;
      for (let dy = -12; dy <= 12; dy++)
        for (let dx = -12; dx <= 12; dx++) {
          const tx = cmd.x + dx, ty = cmd.y + dy;
          // Quick scan: check top-left tile only before calling full canPlace
          if (getTile(tx, ty) !== T.WATER) continue;
          if (canPlace('navalyard', tx, ty, this.f, true)) return { x: tx, y: ty };
        }
      return null;
    },

    _queue(building, type) {
      const d = UDEF[type], b = FBONUSES[this.f];
      if (state.credits[this.f] < 1) return;
      building.trainQ.push({ type, t: 0, total: (d.ttime * b.trainMult * 60) | 0, paid: 0, creditAcc: 0 });
    },
  };
}
