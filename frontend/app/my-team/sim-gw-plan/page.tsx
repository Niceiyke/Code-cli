'use client';

import React, { useState } from 'react';
import { useSimGwPlan } from '../../hooks/useMyTeam';
import { SimGwPlayer, SimGwTransfer } from '../../components/api/teamStrategyApi';
import { PlayerAPI } from '../../model/models';

// ── helpers ──────────────────────────────────────────────────────────────────

const POS_LABEL: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const POS_COLOR: Record<number, string> = {
  1: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  2: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  3: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  4: 'text-rose-400 bg-rose-400/10 border-rose-400/30',
};
const POS_BG: Record<number, string> = {
  1: 'border-amber-400/40',
  2: 'border-blue-400/40',
  3: 'border-emerald-400/40',
  4: 'border-rose-400/40',
};
const CHIP_LABEL: Record<string, string> = {
  wildcard: 'Wildcard',
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
  freehit: 'Free Hit',
};

function formatCost(tenths: number) {
  return `£${(tenths / 10).toFixed(1)}m`;
}

// ── Mini player card ──────────────────────────────────────────────────────────

function SimPlayerCard({
  player,
  isBench = false,
}: {
  player: SimGwPlayer;
  isBench?: boolean;
}) {
  const posClass = POS_COLOR[player.element_type] ?? 'text-white/60 bg-white/5 border-white/10';
  const borderClass = POS_BG[player.element_type] ?? 'border-white/10';
  const dgwBadge =
    player.dgw_flag === 2 ? (
      <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-violet-500 text-white rounded-full px-1 leading-4">
        DGW
      </span>
    ) : player.dgw_flag === 0 ? (
      <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-red-500/80 text-white rounded-full px-1 leading-4">
        BGW
      </span>
    ) : null;

  return (
    <div
      className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border ${borderClass} bg-white/[0.03] w-[72px] sm:w-20 ${isBench ? 'opacity-70' : ''}`}
    >
      {dgwBadge}
      {player.is_captain && (
        <span className="absolute -top-1.5 -left-1.5 text-[8px] font-black bg-fpl-green text-black rounded-full w-4 h-4 flex items-center justify-center">
          C
        </span>
      )}
      {player.is_vice && (
        <span className="absolute -top-1.5 -left-1.5 text-[8px] font-black bg-fpl-green/60 text-black rounded-full w-4 h-4 flex items-center justify-center">
          V
        </span>
      )}
      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${posClass}`}>
        {POS_LABEL[player.element_type] ?? '?'}
      </span>
      <span className="text-[11px] font-bold text-white text-center leading-tight truncate w-full text-center">
        {player.name}
      </span>
      <span className="text-[10px] font-black text-fpl-green">{player.xp.toFixed(1)} xP</span>
      <span className="text-[9px] text-white/30">{formatCost(player.now_cost)}</span>
    </div>
  );
}

// ── Pitch row ─────────────────────────────────────────────────────────────────

function PitchRow({ players, label }: { players: SimGwPlayer[]; label: string }) {
  if (players.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[9px] uppercase tracking-widest text-white/20 font-bold">{label}</span>
      <div className="flex justify-center gap-3 flex-wrap">
        {players.map((p) => (
          <SimPlayerCard key={p.id} player={p} />
        ))}
      </div>
    </div>
  );
}

// ── Transfer row ──────────────────────────────────────────────────────────────

function TransferRow({ t, idx }: { t: SimGwTransfer; idx: number }) {
  const isHit = t.hit < 0;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
      <span className="text-[10px] text-white/30 font-mono w-4 shrink-0">#{idx + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white/50 text-xs line-through truncate max-w-[100px]">{t.out_name}</span>
          <svg className="w-3 h-3 text-fpl-green shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-white font-bold text-xs truncate max-w-[100px]">{t.in_name}</span>
        </div>
        <div className="flex gap-3 mt-1">
          <span className="text-[10px] text-white/30">
            out: <span className="text-white/50">{t.out_xp.toFixed(1)} xP</span>
          </span>
          <span className="text-[10px] text-white/30">
            in: <span className="text-fpl-green">{t.in_xp.toFixed(1)} xP</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0 gap-1">
        <span className={`text-xs font-black ${t.gain >= 0 ? 'text-fpl-green' : 'text-red-400'}`}>
          {t.gain >= 0 ? '+' : ''}{t.gain.toFixed(1)}
        </span>
        {isHit ? (
          <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 font-bold">
            −4 hit
          </span>
        ) : (
          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 font-bold">
            FT
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SEASONS = ['2025-26', '2024-25'];

export default function SimGwPlanPage() {
  const [season, setSeason] = useState('2025-26');
  const [nextGwInput, setNextGwInput] = useState('');

  const nextGw = nextGwInput ? parseInt(nextGwInput, 10) : undefined;
  const { data, isLoading, isError, error, refetch } = useSimGwPlan(season, nextGw);

  const lineup = data?.lineup ?? [];
  const bench = data?.bench ?? [];

  const gkp = lineup.filter((p) => p.element_type === 1);
  const def = lineup.filter((p) => p.element_type === 2);
  const mid = lineup.filter((p) => p.element_type === 3);
  const fwd = lineup.filter((p) => p.element_type === 4);

  const hasTransfers = (data?.transfers ?? []).length > 0;
  const hitTransfers = (data?.transfers ?? []).filter((t) => t.hit < 0);
  const totalHitCost = hitTransfers.reduce((sum, t) => sum + t.hit, 0);

  return (
    <div className="min-h-screen bg-fpl-dark text-white p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-black text-white tracking-tight">Simulator GW Plan</h1>
        <p className="text-white/40 text-xs mt-1">
          Replay GW1→ last played GW, then plan the next gameweek using live player data.
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fpl-green/50"
        >
          {SEASONS.map((s) => (
            <option key={s} value={s} className="bg-fpl-dark">
              {s}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={2}
          max={38}
          placeholder="Next GW (auto)"
          value={nextGwInput}
          onChange={(e) => setNextGwInput(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-40 focus:outline-none focus:border-fpl-green/50 placeholder:text-white/20"
        />
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="px-4 py-2 bg-fpl-green text-black font-bold rounded-lg text-sm disabled:opacity-40 hover:bg-fpl-green/90 transition-colors"
        >
          {isLoading ? 'Running…' : 'Run Plan'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center gap-4 py-20">
          <div className="w-10 h-10 border-2 border-fpl-green/20 border-t-fpl-green rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Replaying GW1–{nextGw ? nextGw - 1 : '?'}… this takes ~30s</p>
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {(error as Error)?.message ?? 'Failed to load plan'}
        </div>
      )}

      {/* Results */}
      {data && !isLoading && (
        <div className="flex flex-col gap-5">
          {/* Meta bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'GW', value: `GW${data.next_gw}` },
              { label: 'Sim Pts (GW1–' + data.sim_gws_played + ')', value: data.sim_total_points.toString() },
              { label: 'Bank', value: `£${data.squad_bank.toFixed(1)}m` },
              { label: 'Free Transfers', value: data.free_transfers.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
                <p className="text-lg font-black text-white mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Chip + chips remaining */}
          <div className="flex gap-3 flex-wrap">
            {data.chip_decision ? (
              <div className="px-3 py-1.5 bg-violet-500/20 border border-violet-500/30 rounded-lg text-violet-300 text-xs font-bold uppercase tracking-wide">
                Chip: {CHIP_LABEL[data.chip_decision] ?? data.chip_decision}
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/30 text-xs font-bold uppercase tracking-wide">
                No Chip
              </div>
            )}
            {data.chips_remaining.map((c) => (
              <div key={c} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs font-bold uppercase tracking-wide">
                {CHIP_LABEL[c] ?? c} available
              </div>
            ))}
          </div>

          {/* Transfers */}
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider">Transfers</h2>
              {totalHitCost < 0 && (
                <span className="text-xs font-black text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">
                  Total hit: {totalHitCost} pts
                </span>
              )}
            </div>
            {hasTransfers ? (
              data.transfers.map((t, i) => <TransferRow key={i} t={t} idx={i} />)
            ) : (
              <p className="text-white/20 text-sm text-center py-4">Hold — no transfers this GW</p>
            )}
          </div>

          {/* Formation label */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider">
              Lineup — {data.formation}
            </h2>
            <div className="flex gap-4 text-xs text-white/40">
              <span>xP: <span className="text-fpl-green font-bold">{data.lineup_xp.toFixed(1)}</span></span>
              <span>Cap xP: <span className="text-fpl-green font-bold">{data.captain_xp.toFixed(1)}</span></span>
            </div>
          </div>

          {/* Football pitch */}
          <div
            className="relative rounded-2xl overflow-hidden border border-white/5"
            style={{ background: 'linear-gradient(180deg, #1a3a2a 0%, #0f2418 100%)' }}
          >
            {/* Pitch markings */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-white rounded-full" />
            </div>

            <div className="relative z-10 py-6 px-4 flex flex-col gap-6">
              <PitchRow players={fwd} label="Forwards" />
              <PitchRow players={mid} label="Midfielders" />
              <PitchRow players={def} label="Defenders" />
              <PitchRow players={gkp} label="Goalkeeper" />
            </div>
          </div>

          {/* Bench */}
          <div>
            <h2 className="text-sm font-bold text-white/30 uppercase tracking-wider mb-3 px-1">
              Bench — {data.bench_xp.toFixed(1)} xP
            </h2>
            <div className="flex gap-3 flex-wrap">
              {bench.map((p, i) => (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <span className="text-[9px] text-white/20 font-bold">{i + 1}</span>
                  <SimPlayerCard player={p} isBench />
                </div>
              ))}
            </div>
          </div>

          {/* Captain / Vice */}
          {(data.captain || data.vice_captain) && (
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
              <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3">Armband</h2>
              <div className="flex gap-6 flex-wrap">
                {data.captain && (
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 bg-fpl-green rounded-full flex items-center justify-center text-black font-black text-xs shrink-0">
                      C
                    </span>
                    <div>
                      <p className="font-bold text-white text-sm">{data.captain.name}</p>
                      <p className="text-xs text-white/40">
                        {POS_LABEL[data.captain.element_type]} · {data.captain_xp.toFixed(1)} xP · mg {data.captain.mg_score.toFixed(1)}
                      </p>
                    </div>
                  </div>
                )}
                {data.vice_captain && (
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 bg-fpl-green/50 rounded-full flex items-center justify-center text-black font-black text-xs shrink-0">
                      V
                    </span>
                    <div>
                      <p className="font-bold text-white text-sm">{data.vice_captain.name}</p>
                      <p className="text-xs text-white/40">
                        {POS_LABEL[data.vice_captain.element_type]} · {data.vice_captain.xp.toFixed(1)} xP · mg {data.vice_captain.mg_score.toFixed(1)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!data && !isLoading && !isError && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-fpl-green/10 border border-fpl-green/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-fpl-green/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0120 9.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-white/60 font-bold text-sm">Select season and click Run Plan</p>
            <p className="text-white/20 text-xs mt-1">Takes ~30s — replays all historical GWs then plans ahead</p>
          </div>
        </div>
      )}
    </div>
  );
}
