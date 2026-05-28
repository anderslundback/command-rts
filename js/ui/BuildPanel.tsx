import React from 'react';
import { useUIStore, uiStore, type QueueItemUI } from '../store';

// Import JS modules — all used as `any` to avoid strict-index type errors
// @ts-ignore
import * as _C from '../constants.js';
// @ts-ignore
import * as _S from '../state.js';
// @ts-ignore
import { scheduleInput } from '../net/netClient.js';

const BDEF: any = (_C as any).BDEF;
const UDEF: any = (_C as any).UDEF;
const FBONUSES: any = (_C as any).FBONUSES;
const BUILD_TYPES: string[] = (_C as any).BUILD_TYPES;
const DEFENSE_TYPES: string[] = (_C as any).DEFENSE_TYPES;
const TRAIN_FROM: Record<string, string[]> = (_C as any).TRAIN_FROM;
const state: any = (_S as any).state;

// ── Helpers ──────────────────────────────────────────────────────────────────

function mutate(fn: (s: any) => void): void {
  fn(state);
  const f = state.playerFaction;
  uiStore.setState({
    buildMode: state.buildMode,
    buildReady: state.buildReady,
    repairMode: state.repairMode,
    sellMode: state.sellMode,
    buildQueue: (state.hudBuildQueue[f] as any[]).map((it: any) => ({ ...it })),
    defQueue: (state.hudDefQueue[f] as any[]).map((it: any) => ({ ...it })),
    activeTab: state.activeTab,
  });
}

// ── Queue row (shared by build + defense queues) ─────────────────────────────

function QueueRow({
  item,
  index,
  accentColor,
  progressBg,
  isDefQueue,
}: {
  item: QueueItemUI;
  index: number;
  accentColor: string;
  progressBg: string;
  isDefQueue: boolean;
}): React.ReactElement {
  const pct = item.total > 0 ? Math.min(1, item.t / item.total) : 1;

  const handlePlace = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    mutate(s => {
      s.buildMode = item.type;
      s.buildReady = true;
    });
  };

  const handleCancel = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (state.net) {
      scheduleInput({ action: 'cancel_build', faction: state.playerFaction, queueType: isDefQueue ? 'def' : 'build', index });
      return;
    }
    mutate(s => {
      const f = s.playerFaction;
      const q = isDefQueue ? s.hudDefQueue[f] : s.hudBuildQueue[f];
      s.credits[f] += item.paid ?? 0;
      q.splice(index, 1);
      if (index === 0) {
        s.buildMode = null;
        s.buildReady = false;
      }
    });
  };

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 2px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${(pct * 100).toFixed(1)}%`,
          background: progressBg,
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 9,
          color: item.ready ? accentColor : '#9ab',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          position: 'relative',
        }}
      >
        {BDEF[item.type]?.name ?? item.type}
        {item.ready ? ' ✓' : ` ${(pct * 100).toFixed(0)}%`}
      </span>
      {item.ready && (
        <button
          onClick={handlePlace}
          style={{
            fontSize: 8,
            padding: '1px 4px',
            background: isDefQueue ? '#0a1828' : '#0a2a18',
            border: `1px solid ${accentColor}`,
            color: accentColor,
            cursor: 'pointer',
            fontFamily: "'Courier New', monospace",
            flexShrink: 0,
          }}
        >
          PLACE
        </button>
      )}
      <button
        onClick={handleCancel}
        style={{
          fontSize: 8,
          padding: '1px 4px',
          background: '#1a0808',
          border: '1px solid #633',
          color: '#966',
          cursor: 'pointer',
          fontFamily: "'Courier New', monospace",
          flexShrink: 0,
        }}
      >
        X
      </button>
    </div>
  );
}

// ── Build button ──────────────────────────────────────────────────────────────

function BuildBtn({
  name,
  sub,
  disabled,
  affordable,
  color,
  dataType,
  onClick,
  progressPct,
}: {
  name: string;
  sub: string;
  disabled: boolean;
  affordable: boolean;
  color?: string;
  dataType?: string;
  onClick?: (ev: React.MouseEvent) => void;
  progressPct?: number;
}): React.ReactElement {
  return (
    <button
      className={'build-btn' + (disabled ? ' disabled' : '')}
      data-btype={dataType}
      onClick={
        !disabled && onClick
          ? (ev: React.MouseEvent) => {
              ev.stopPropagation();
              onClick(ev);
            }
          : undefined
      }
      style={color ? { color, borderColor: color } : undefined}
    >
      <span className="btn-name">{name}</span>
      <span className={'btn-cost' + (!affordable ? ' no' : '')}>{sub}</span>
      {progressPct !== undefined && progressPct > 0 && (
        <div className="btn-progress" style={{ width: `${progressPct.toFixed(1)}%` }} />
      )}
    </button>
  );
}

// ── Section helpers ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }): React.ReactElement {
  return (
    <div style={{ width: '100%', padding: '4px 2px 2px', fontSize: 9, color: '#668', letterSpacing: 1 }}>
      {label}
    </div>
  );
}

function Divider(): React.ReactElement {
  return <div style={{ width: '100%', borderTop: '1px solid #1a2230', margin: '3px 0 2px' }} />;
}

// ── Train cancel row ─────────────────────────────────────────────────────────

function TrainRow({
  bldgId,
  item,
  itemIndex,
}: {
  bldgId: number;
  item: { type: string; t: number; total: number };
  itemIndex: number;
}): React.ReactElement {
  const isFirst = itemIndex === 0;
  const pct = isFirst && item.total > 0 ? Math.min(1, item.t / item.total) : 0;

  const handleCancel = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (state.net) {
      scheduleInput({ action: 'cancel_train', bldgId, index: itemIndex });
      return;
    }
    mutate(s => {
      const bldg = s.entities.find((e: any) => e.id === bldgId);
      if (bldg && bldg.trainQ) {
        s.credits[s.playerFaction] += (item as any).paid ?? 0;
        bldg.trainQ.splice(itemIndex, 1);
      }
    });
  };

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isFirst && pct > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${(pct * 100).toFixed(1)}%`,
            background: 'rgba(0,100,60,0.18)',
            pointerEvents: 'none',
          }}
        />
      )}
      <span
        style={{
          flex: 1,
          fontSize: 9,
          color: '#9ab',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          position: 'relative',
        }}
      >
        {UDEF[item.type]?.name ?? item.type}{' '}
        {isFirst && item.total > 0 ? `${(pct * 100).toFixed(0)}%` : 'queued'}
      </span>
      <button
        onClick={handleCancel}
        style={{
          fontSize: 8,
          padding: '1px 4px',
          background: '#1a0808',
          border: '1px solid #633',
          color: '#966',
          cursor: 'pointer',
          fontFamily: "'Courier New', monospace",
          flexShrink: 0,
        }}
      >
        X
      </button>
    </div>
  );
}

// ── Build tab ────────────────────────────────────────────────────────────────

function BuildTab(): React.ReactElement {
  const repairMode = useUIStore(s => s.repairMode);
  const sellMode = useUIStore(s => s.sellMode);
  const buildMode = useUIStore(s => s.buildMode);
  const buildReady = useUIStore(s => s.buildReady);
  const buildQueue = useUIStore(s => s.buildQueue);
  const defQueue = useUIStore(s => s.defQueue);
  const doneTypes = useUIStore(s => s.doneTypes);
  const credits = useUIStore(s => s.credits);

  // Ghost placement mode — just show cancel
  if (buildMode && buildReady) {
    const d = BDEF[buildMode];
    return (
      <div style={{ padding: 4 }}>
        <BuildBtn
          name="CANCEL PLACE"
          sub={d?.name ?? buildMode}
          disabled={false}
          affordable={true}
          color="#f64"
          onClick={() =>
            mutate(s => {
              s.buildMode = null;
              s.buildReady = false;
              s.canvas.style.cursor = 'default';
            })
          }
        />
      </div>
    );
  }

  const handleRepair = () =>
    mutate(s => {
      s.repairMode = !s.repairMode;
      s.sellMode = false;
      s.buildMode = null;
      s.buildReady = false;
      s.canvas.style.cursor = s.repairMode ? 'crosshair' : 'default';
      if (!s.repairMode) {
        for (const e of s.entities) {
          if (e.isBuilding && e.faction === s.playerFaction) e.repairing = false;
        }
      }
    });

  const handleSell = () =>
    mutate(s => {
      s.sellMode = !s.sellMode;
      s.repairMode = false;
      s.buildMode = null;
      s.buildReady = false;
      s.canvas.style.cursor = s.sellMode ? 'crosshair' : 'default';
      if (!s.sellMode) {
        for (const e of s.entities) {
          if (e.isBuilding && e.faction === s.playerFaction) e.repairing = false;
        }
      }
    });

  const handleBuild = (type: string) => {
    if (state.net) { scheduleInput({ action: 'queue_build', faction: state.playerFaction, btype: type, queueType: 'build' }); return; }
    const f = state.playerFaction;
    state.hudBuildQueue[f].push({ type, t: 0, total: Math.round(BDEF[type].btime * 60 * (FBONUSES[f]?.buildMult ?? 1)), paid: 0, creditAcc: 0, ready: false });
    mutate(() => {});
  };

  const handleDefBuild = (type: string) => {
    if (state.net) { scheduleInput({ action: 'queue_build', faction: state.playerFaction, btype: type, queueType: 'def' }); return; }
    const f = state.playerFaction;
    state.hudDefQueue[f].push({ type, t: 0, total: Math.round(BDEF[type].btime * 60 * (FBONUSES[f]?.buildMult ?? 1)), paid: 0, creditAcc: 0, ready: false });
    mutate(() => {});
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: 4, alignContent: 'flex-start' }}>
      {/* Repair / Sell buttons */}
      <BuildBtn
        name={repairMode ? 'REPAIRING' : 'REPAIR'}
        sub="click bldg"
        disabled={false}
        affordable={true}
        color={repairMode ? '#4d8' : undefined}
        onClick={handleRepair}
      />
      <BuildBtn
        name={sellMode ? 'SELLING' : 'SELL'}
        sub="50% refund"
        disabled={false}
        affordable={true}
        color={sellMode ? '#fa4' : undefined}
        onClick={handleSell}
      />

      {/* Build queue */}
      {buildQueue.length > 0 && (
        <div style={{ width: '100%' }}>
          <SectionHeader label="CONSTRUCTING:" />
          {buildQueue.map((item, i) => (
            <QueueRow
              key={i}
              item={item}
              index={i}
              accentColor="#4d8"
              progressBg="rgba(0,100,60,0.18)"
              isDefQueue={false}
            />
          ))}
          <Divider />
        </div>
      )}

      {/* BUILD_TYPES buttons */}
      {BUILD_TYPES.map((type: string) => {
        const d = BDEF[type];
        const prereqOk = !d.prereq || doneTypes.includes(d.prereq);
        const canAfford = credits >= d.cost;
        const beingBuilt = state.entities.find(
          (e: any) =>
            !e.dead &&
            e.isBuilding &&
            e.faction === state.playerFaction &&
            e.type === type &&
            !e.done
        );
        return (
          <BuildBtn
            key={type}
            name={d.name}
            sub={`$${d.cost}`}
            disabled={!prereqOk}
            affordable={canAfford}
            dataType={type}
            onClick={() => handleBuild(type)}
            progressPct={beingBuilt ? beingBuilt.bprog * 100 : undefined}
          />
        );
      })}

      {/* Defense section */}
      <div style={{ width: '100%' }}>
        <div style={{ width: '100%', borderTop: '1px solid #1a2230', margin: '4px 0 2px' }} />
        <SectionHeader label="DEFENSE:" />
        {defQueue.length > 0 &&
          defQueue.map((item, i) => (
            <QueueRow
              key={i}
              item={item}
              index={i}
              accentColor="#4af"
              progressBg="rgba(0,60,100,0.22)"
              isDefQueue={true}
            />
          ))}
      </div>

      {DEFENSE_TYPES.map((type: string) => {
        const d = BDEF[type];
        const prereqOk = !d.prereq || doneTypes.includes(d.prereq);
        const canAfford = credits >= d.cost;
        return (
          <BuildBtn
            key={type}
            name={d.name}
            sub={`$${d.cost}`}
            disabled={!prereqOk}
            affordable={canAfford}
            dataType={type}
            onClick={() => handleDefBuild(type)}
          />
        );
      })}
    </div>
  );
}

// ── Train tab ────────────────────────────────────────────────────────────────

function TrainTab(): React.ReactElement {
  const trainQueues = useUIStore(s => s.trainQueues);
  const doneTypes = useUIStore(s => s.doneTypes);
  const credits = useUIStore(s => s.credits);
  const playerFaction = useUIStore(s => s.playerFaction);

  const fb = FBONUSES[playerFaction];

  const trainEntries: Array<{ bldgType: string; utype: string }> = [];
  for (const [btype, utypes] of Object.entries(TRAIN_FROM)) {
    if (!doneTypes.includes(btype)) continue;
    for (const utype of utypes) {
      const d = UDEF[utype];
      if (d?.factionOnly !== undefined && d.factionOnly !== playerFaction) continue;
      trainEntries.push({ bldgType: btype, utype });
    }
  }

  const handleTrain = (bldgType: string, utype: string, count: number) => {
    const f = state.playerFaction;
    const done = state.entities.filter(
      (e: any) => !e.dead && e.isBuilding && e.faction === f && e.done
    );
    const pid = state.primaryBuilding[bldgType];
    const primaryEnt = pid ? state.entities.find((e: any) => e.id === pid) : null;
    const building =
      primaryEnt && !primaryEnt.dead && primaryEnt.type === bldgType
        ? primaryEnt
        : done.find((b: any) => b.type === bldgType);
    if (!building) return;
    if (state.net) {
      for (let i = 0; i < count; i++) scheduleInput({ action: 'queue_train', bldgId: building.id, utype });
      return;
    }
    const d = UDEF[utype];
    for (let i = 0; i < count && building.trainQ.length < 99; i++) {
      building.trainQ.push({
        type: utype,
        t: 0,
        total: Math.round(d.ttime * fb.trainMult * 60),
        paid: 0,
        creditAcc: 0,
      });
    }
    mutate(() => {});
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, padding: 4, alignContent: 'flex-start' }}>
      {/* Active training queues */}
      {trainQueues.length > 0 && (
        <div style={{ width: '100%' }}>
          <SectionHeader label="TRAINING:" />
          {trainQueues.map(tq =>
            tq.items.map((item, i) => (
              <TrainRow key={`${tq.bldgId}-${i}`} bldgId={tq.bldgId} item={item} itemIndex={i} />
            ))
          )}
          <Divider />
        </div>
      )}

      {/* Unit buttons */}
      {trainEntries.map(({ bldgType, utype }) => {
        const d = UDEF[utype];
        const canAfford = credits >= d.cost;
        const prereqOk = !UDEF[utype]?.prereq || doneTypes.includes(UDEF[utype].prereq);
        const f = state.playerFaction;
        const done = state.entities.filter(
          (e: any) => !e.dead && e.isBuilding && e.faction === f && e.done
        );
        const pid = state.primaryBuilding[bldgType];
        const primaryEnt = pid ? state.entities.find((e: any) => e.id === pid) : null;
        const building =
          primaryEnt && !primaryEnt.dead && primaryEnt.type === bldgType
            ? primaryEnt
            : done.find((b: any) => b.type === bldgType);
        const qFull = !building || building.trainQ.length >= 99 || !prereqOk;

        const activeItem =
          building?.trainQ?.length > 0 && building.trainQ[0].type === utype
            ? building.trainQ[0]
            : null;
        const progressPct =
          activeItem && activeItem.total > 0
            ? (activeItem.t / activeItem.total) * 100
            : undefined;

        return (
          <BuildBtn
            key={`${bldgType}-${utype}`}
            name={d.name}
            sub={!prereqOk ? `needs ${UDEF[utype]?.prereq ?? '?'}` : `$${d.cost}`}
            disabled={qFull}
            affordable={canAfford}
            dataType={utype}
            onClick={ev => handleTrain(bldgType, utype, (ev as React.MouseEvent & { ctrlKey: boolean }).ctrlKey ? 5 : 1)}
            progressPct={progressPct}
          />
        );
      })}

      {trainEntries.length === 0 && (
        <div style={{ color: '#789', fontSize: 10, padding: '8px 4px', lineHeight: 1.6 }}>
          Build Barracks or War Factory to train units.
        </div>
      )}
    </div>
  );
}

// ── Root panel ────────────────────────────────────────────────────────────────

export function BuildPanel(): React.ReactElement {
  const activeTab = useUIStore(s => s.activeTab);

  return (
    <div id="build-buttons" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
      {activeTab === 'build' ? <BuildTab /> : <TrainTab />}
    </div>
  );
}
