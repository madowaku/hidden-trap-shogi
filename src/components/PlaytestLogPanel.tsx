'use client';

import { useState } from 'react';
import type { TrapRule } from '@/game/types';
import type { EndingKind } from '@/game/ending';
import type { PlaytestRecord, PlaytestSummary } from '@/game/playtest';
import { summarizePlaytest } from '@/game/playtest';
import { TRAP_RULE_ORDER, getTrapRuleMode } from '@/game/ruleModes';
import { RULE_TONE } from './RuleModePicker';

type Language = 'ja' | 'en';

type Props = {
  records: readonly PlaytestRecord[];
  language: Language;
  onClear: () => void;
};

const PERCENT = 100;
const JSON_INDENT = 2;
/** YYYY-MM-DD */
const DATE_LENGTH = 10;

const ENDING_SHORT: Record<Language, Record<EndingKind, string>> = {
  ja: {
    roulette: '受けに罠',
    trapMate: '罠詰み',
    rescueFailed: '指し直し失敗',
    mate: '詰み',
    missedDefense: '受け外し',
    selfExposure: '王が素抜け',
    resign: '投了',
  },
  en: {
    roulette: 'Trapped answer',
    trapMate: 'Trap mate',
    rescueFailed: 'Retry failed',
    mate: 'Mate',
    missedDefense: 'Missed defense',
    selfExposure: 'Hanging king',
    resign: 'Resign',
  },
};

function formatNumber(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toFixed(digits);
}

function formatRate(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * PERCENT)}%`;
}

function topEnding(summary: PlaytestSummary, language: Language): string {
  const [kind, count] = Object.entries(summary.endings)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0] ?? [];
  return kind ? `${ENDING_SHORT[language][kind as EndingKind]} ${count}` : '—';
}

function download(records: readonly PlaytestRecord[]) {
  const blob = new Blob([JSON.stringify(records, null, JSON_INDENT)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pitfall-shogi-playtest-${new Date().toISOString().slice(0, DATE_LENGTH)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** スタート画面の「試遊ログ」。この端末に残した記録をルールごとに並べる */
export default function PlaytestLogPanel({ records, language, onClear }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const ja = language === 'ja';
  const summaries = TRAP_RULE_ORDER.map(rule => summarizePlaytest(records, rule));
  const columns = ja
    ? ['ルール', '局', '勝-負', '手数', '負けの納得', 'もう一局', '多い決着']
    : ['Rule', 'Games', 'W-L', 'Plies', 'Loss fairness', 'Again', 'Top ending'];

  return (
    <details className="playtest-panel group rounded-md border border-emerald-200/20 bg-emerald-400/[0.05] p-2" open={records.length > 0}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span>
          <span className="block text-xs font-black uppercase tracking-[0.22em] text-emerald-200/75">
            {ja ? '試遊ログ' : 'Playtest log'}
          </span>
          <span className="block text-sm font-bold text-emerald-50">
            {ja
              ? `この端末に ${records.length} 局。終局ごとに「納得感」と「もう一局」を記録`
              : `${records.length} games on this device. Fairness and rematch choice are logged after each game`}
          </span>
        </span>
        <span className="text-xs font-black text-emerald-100/70 group-open:rotate-180">▾</span>
      </summary>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-y-1 text-left text-xs font-bold text-emerald-50">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-emerald-100/60">
              {columns.map(column => <th key={column} className="px-1.5 font-black">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {summaries.map(summary => {
              const mode = getTrapRuleMode(summary.trapRule as TrapRule);
              return (
                <tr key={summary.trapRule} className="bg-black/20">
                  <td className="rounded-l px-1.5 py-1">
                    <span className={`mr-1 rounded border px-1 font-serif font-black ${RULE_TONE[mode.rule].chip}`}>{mode.code}</span>
                    {mode.name[language]}
                  </td>
                  <td className="px-1.5">{summary.games}</td>
                  <td className="px-1.5">{summary.wins}-{summary.losses}</td>
                  <td className="px-1.5">{formatNumber(summary.medianPlies, 0)}</td>
                  <td className="px-1.5">{formatNumber(summary.lossAcceptance)}</td>
                  <td className="px-1.5">{formatRate(summary.againRate)}</td>
                  <td className="rounded-r px-1.5">{topEnding(summary, language)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] font-bold text-emerald-100/60">
        {ja
          ? '負けの納得: 負けた局の 1（理不尽）〜5（納得）の平均。もう一局: 終局後に「同じルールでもう一局」を選んだ割合。'
          : 'Loss fairness: average 1 (unfair) to 5 (fair) on lost games. Again: share of games followed by “one more” on the same rule.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => download(records)}
          disabled={records.length === 0}
          className="h-8 rounded-md bg-emerald-200 px-3 text-xs font-black text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ja ? 'JSON で書き出す' : 'Export JSON'}
        </button>
        {confirmClear ? (
          <>
            <button
              type="button"
              onClick={() => { onClear(); setConfirmClear(false); }}
              className="h-8 rounded-md bg-red-300 px-3 text-xs font-black text-stone-950 transition hover:bg-red-100"
            >
              {ja ? '本当に消す（元に戻せない）' : 'Delete for good'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="h-8 rounded-md border border-white/15 px-3 text-xs font-bold text-stone-100 hover:bg-white/10"
            >
              {ja ? 'やめる' : 'Cancel'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={records.length === 0}
            className="h-8 rounded-md border border-white/15 px-3 text-xs font-bold text-stone-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ja ? '記録を消す' : 'Clear log'}
          </button>
        )}
      </div>
    </details>
  );
}
