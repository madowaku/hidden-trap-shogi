// =============================================
// Pitfall Shogi — 試遊ログ（A / C / D の比較用）
// =============================================
//
// 1 局ごとに「どのルールで、どう決着し、負けに納得できたか、もう一局を選んだか」を残す。
// 保存先はこの端末の localStorage だけ（サーバーには送らない）。JSON で書き出して共有する。

import type { BotLevel, GameMode, Player, TrapRule } from './types';
import type { EndingKind } from './ending';

export const PLAYTEST_STORAGE_KEY = 'pitfall-shogi:playtest-log:v1';

/** 負けた（勝った）理由への納得感。1 = 理不尽 … 5 = 読み負け・読み勝ちとして納得 */
export type Acceptance = 1 | 2 | 3 | 4 | 5;

/** 終局後に押したボタン */
export type NextChoice = 'same' | 'switch' | 'stop';

export type PlaytestRecord = {
  readonly id: string;
  /** ISO 8601 */
  readonly finishedAt: string;
  readonly trapRule: TrapRule;
  readonly gameMode: GameMode;
  readonly botLevel: BotLevel | null;
  readonly casualMode: boolean;
  /** 人間から見た結果（PvP は先手から見た結果） */
  readonly result: 'win' | 'loss';
  readonly ending: EndingKind;
  readonly plies: number;
  /** 負けた側の最後の王手の受けの数 */
  readonly defenses: number | null;
  readonly trapHits: Record<Player, number>;
  /** C: 指し直しが起きた回数 */
  readonly rescues: number;
  /** D: 王手で罠が消えた回数 */
  readonly voidedTraps: number;
  readonly acceptance: Acceptance | null;
  readonly next: NextChoice | null;
  readonly note: string;
};

export type PlaytestSummary = {
  readonly trapRule: TrapRule;
  readonly games: number;
  readonly wins: number;
  readonly losses: number;
  readonly medianPlies: number | null;
  /** 負けた局の納得感の平均 */
  readonly lossAcceptance: number | null;
  readonly acceptance: number | null;
  /** 「同じルールでもう一局」を選んだ割合（終局後のボタンを押した局のうち） */
  readonly againRate: number | null;
  readonly endings: Partial<Record<EndingKind, number>>;
};

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

const HALF = 2;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / HALF);
  const isOdd = sorted.length % HALF === 1;
  return isOdd ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / HALF;
}

export function summarizePlaytest(records: readonly PlaytestRecord[], trapRule: TrapRule): PlaytestSummary {
  const games = records.filter(record => record.trapRule === trapRule);
  const rated = (list: readonly PlaytestRecord[]) => list
    .map(record => record.acceptance)
    .filter((value): value is Acceptance => value !== null);
  const answered = games.filter(record => record.next !== null);
  return {
    trapRule,
    games: games.length,
    wins: games.filter(record => record.result === 'win').length,
    losses: games.filter(record => record.result === 'loss').length,
    medianPlies: median(games.map(record => record.plies)),
    lossAcceptance: average(rated(games.filter(record => record.result === 'loss'))),
    acceptance: average(rated(games)),
    againRate: answered.length === 0
      ? null
      : answered.filter(record => record.next === 'same').length / answered.length,
    endings: games.reduce<Partial<Record<EndingKind, number>>>((counts, record) => ({
      ...counts,
      [record.ending]: (counts[record.ending] ?? 0) + 1,
    }), {}),
  };
}

function isRecord(value: unknown): value is PlaytestRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PlaytestRecord>;
  return typeof record.id === 'string' && typeof record.trapRule === 'string' && typeof record.plies === 'number';
}

export function parsePlaytestLog(raw: string | null): PlaytestRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

/** 同じ id の記録は後から来た内容で上書きする（納得感・次の選択は後から付く） */
export function upsertPlaytestRecord(
  records: readonly PlaytestRecord[],
  id: string,
  patch: Partial<PlaytestRecord>,
  create?: PlaytestRecord
): PlaytestRecord[] {
  const exists = records.some(record => record.id === id);
  if (!exists) return create ? [...records, { ...create, ...patch }] : [...records];
  return records.map(record => (record.id === id ? { ...record, ...patch } : record));
}
