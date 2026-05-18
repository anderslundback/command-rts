import { BDEF, UDEF, FBONUSES } from './constants.js';
import { state } from './state.js';
import { canPlace, placeBuilding, spawnNear } from './placement.js';
import { nearestRefinery } from './resources.js';
import { orderAttack, orderHarvest } from './orders.js';

export function makeAI(f) {
  return {
    f,
    btimer: 0,
    wtimer: 300 + f * 120,

    myBuildings(type) {
      return state.entities.filter(e => !e.dead && e.isBuilding && e.faction === this.f && e.done && (!type || e.type === type));
    },
    myUnits(type) {
      return state.entities.filter(e => !e.dead && e.isUnit && e.faction === this.f && (!type || e.type === type));
    },

    update() {
      this.btimer++;
      this.wtimer++;
      const cr = state.credits[this.f];
      const blist = this.myBuildings();
      if (!blist.some(b => b.type === 'command')) return;
      const has = t => blist.some(b => b.type === t);
      const cmd = blist.find(b => b.type === 'command');

      if (this.btimer % 120 === 0) {
        const tried = [
          !has('power')    && cr >= 300 && ['power',    cmd.x + 4, cmd.y],
          !has('refinery') && has('power') && cr >= 500 && ['refinery', cmd.x, cmd.y + 4],
          !has('barracks') && has('refinery') && cr >= 400 && ['barracks', cmd.x + 4, cmd.y + 3],
          !has('factory')  && has('barracks') && cr >= 700 && ['factory',  cmd.x - 4, cmd.y],
          !has('depot')    && has('factory')  && cr >= 600 && ['depot',    cmd.x - 4, cmd.y + 3],
          has('barracks')  && this.myBuildings('turret').length < 5 && cr >= 350 &&
            ['turret', cmd.x + ((Math.random() * 10 - 5) | 0), cmd.y + ((Math.random() * 10 - 5) | 0)],
        ].find(Boolean);
        if (tried) this._tryBuild(...tried);
      }

      if (this.btimer % 150 === 0) {
        const bar = this.myBuildings('barracks').find(b => b.trainQ.length < 3);
        const fac = this.myBuildings('factory').find(b => b.trainQ.length < 3);
        const harvesters  = this.myUnits('harvester').length;
        const riflemen    = this.myUnits('rifleman').length;
        const rocketeers  = this.myUnits('rocketeer').length;
        const tanks       = this.myUnits('tank').length;
        if (fac && harvesters < 3 && cr >= 800) this._queue(fac, 'harvester');
        else if (bar && riflemen < 8 && cr >= 200) this._queue(bar, 'rifleman');
        else if (bar && rocketeers < 4 && cr >= 350) this._queue(bar, 'rocketeer');
        else if (fac && tanks < 6 && cr >= 650) this._queue(fac, 'tank');
      }

      for (const u of this.myUnits('harvester'))
        if (u.state === 'idle') { const ref = nearestRefinery(this.f, u.x, u.y); if (ref) orderHarvest(u, ref); }

      if (this.wtimer > 720 + ((Math.random() * 360) | 0)) {
        this.wtimer = 0;
        const fighters = [...this.myUnits('rifleman'), ...this.myUnits('rocketeer'), ...this.myUnits('tank')];
        if (fighters.length >= 4) {
          const enemyUnits = state.entities.filter(e => !e.dead && e.isUnit && e.faction !== this.f &&
            (e.type === 'rifleman' || e.type === 'rocketeer' || e.type === 'tank'));
          let tgt = null;
          if (enemyUnits.length > 0) {
            tgt = enemyUnits[(Math.random() * enemyUnits.length) | 0];
          } else {
            const enemyBuildings = state.entities.filter(e => !e.dead && e.isBuilding && e.faction !== this.f);
            for (const type of ['command', 'refinery', 'factory', 'barracks']) {
              tgt = enemyBuildings.find(b => b.type === type);
              if (tgt) break;
            }
            if (!tgt) tgt = enemyBuildings[(Math.random() * enemyBuildings.length) | 0];
          }
          if (tgt) fighters.forEach(u => orderAttack(u, tgt));
        }
      }
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
      if (state.credits[this.f] < d.cost) return;
      state.credits[this.f] -= d.cost;
      building.trainQ.push({ type, t: 0, total: (d.ttime * b.trainMult * 60) | 0 });
    },
  };
}
