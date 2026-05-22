'use client';

import type { LogEntry } from '@/game/types';
import { PIECE_KANJI } from '@/game/constants';
import { getTrapReactionKind } from '@/game/reaction';
import type { Viewer } from '@/game/types';

type Props = {
  log: LogEntry[];
  winner?: 'sente' | 'gote' | null;
  language?: 'ja' | 'en';
  viewer?: Viewer;
  highlightedTurn?: number | null;
};

export default function GameLog({ log, winner, language = 'ja', viewer = 'spectator', highlightedTurn = null }: Props) {
  if (log.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic text-center py-4">
        {language === 'ja' ? '対局ログがここに表示されます' : 'Game log appears here'}
      </div>
    );
  }

  return (
    <div className="custom-scrollbar flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1">
      {log.map((entry, i) => {
        const isVictory = Boolean(winner) && i === log.length - 1;
        const isLatest = i === log.length - 1;
        const trapReactionKind = getTrapReactionKind(entry, viewer);
        const style = getLogStyle(entry, isVictory, trapReactionKind);
        const isHighlighted = highlightedTurn === entry.turn;

        return (
        <div
          key={i}
          id={`log-entry-${entry.turn}`}
          className={`rounded px-3 py-2 text-sm leading-6 border-l-4 transition-all duration-300 ${
            isLatest ? 'log-entry-pop' : ''
          } ${trapReactionKind === 'player_trapped' ? 'log-trap-player' : ''} ${trapReactionKind === 'opponent_trapped' ? 'log-trap-opponent' : ''} ${entry.pitfallTriggered && !trapReactionKind ? 'log-trap-hit' : ''} ${
            isHighlighted
              ? 'border-yellow-400 bg-yellow-400/20 shadow-md ring-2 ring-yellow-400/50 scale-[1.01]'
              : style
          }`}
        >
          <span className={`font-bold ${entry.player === 'sente' ? 'text-amber-300' : 'text-blue-300'}`}>
            {entry.turn}.
          </span>
          {' '}
          {entry.action ? (
            <span className="text-gray-300">
              {entry.action.type === 'move'
                ? `${PIECE_KANJI[entry.action.piece.kind]} ${formatPos(entry.action.to)}`
                : `${PIECE_KANJI[entry.action.piece.kind]}打 ${formatPos(entry.action.to)}`
              }
              {entry.action.type === 'move' && entry.action.promote && ' 成'}
              {entry.action.type === 'move' && entry.action.captured && (
                <span className="text-red-400"> ×{PIECE_KANJI[entry.action.captured.kind]}</span>
              )}
            </span>
          ) : (
            <span className="font-bold text-fuchsia-100">
              {entry.failedAction
                ? formatFailedAction(entry.failedAction, language)
                : language === 'ja' ? '手が無効化された' : 'The move was cancelled'}
            </span>
          )}
          {entry.pitfallTriggered && (
            <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-black text-stone-950 ${
              trapReactionKind === 'opponent_trapped' ? 'bg-amber-200' : 'bg-fuchsia-300'
            }`}>
              {trapReactionKind === 'player_trapped'
                ? language === 'ja' ? '移動失敗' : 'Failed'
                : trapReactionKind === 'opponent_trapped'
                  ? language === 'ja' ? '読み勝ち' : 'Outread'
                  : language === 'ja' ? '陥穽発動！' : 'Trap!'}
            </span>
          )}
          {entry.triggeredPitfall && (
            <span className="ml-2 rounded bg-red-400 px-1.5 py-0.5 text-xs font-black text-stone-950">
              {language === 'ja' ? '命中' : 'Hit'}:{formatPos(entry.triggeredPitfall)}
            </span>
          )}
          {!entry.pitfallTriggered && entry.revealedPitfall && (
            <span className="ml-2 rounded bg-slate-500/35 px-1.5 py-0.5 text-xs font-bold text-slate-100">
              {language === 'ja' ? '不発' : 'Miss'}
            </span>
          )}
          {isVictory && (
            <span className="ml-2 rounded bg-yellow-300 px-1.5 py-0.5 text-xs font-black text-stone-950">
              {language === 'ja' ? '勝利' : 'Win'}
            </span>
          )}
          {entry.revealedPitfall && (
            <span className="ml-2 text-fuchsia-200/70">
              ({language === 'ja' ? '穴' : 'Trap'}:{formatPos(entry.revealedPitfall)})
            </span>
          )}
        </div>
      )})}
    </div>
  );
}

function getLogStyle(
  entry: LogEntry,
  isVictory: boolean,
  trapReactionKind: ReturnType<typeof getTrapReactionKind>
): string {
  if (isVictory) return 'border-yellow-300 bg-yellow-500/15 text-yellow-50';
  if (trapReactionKind === 'player_trapped') return 'border-fuchsia-300 bg-fuchsia-950/35 text-fuchsia-50';
  if (trapReactionKind === 'opponent_trapped') return 'border-amber-200 bg-amber-500/18 text-amber-50';
  if (entry.pitfallTriggered) return 'border-fuchsia-300 bg-fuchsia-700/25 text-fuchsia-50';
  if (entry.revealedPitfall) return 'border-slate-400 bg-slate-600/18 text-slate-100';
  return 'border-emerald-400/70 bg-emerald-900/16 text-stone-100';
}

function formatPos(pos: { row: number; col: number }): string {
  // 筋は右から1始まり, 段は上から一始まり
  const col = 9 - pos.col;
  const rowKanji = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  return `${col}${rowKanji[pos.row]}`;
}

function formatFailedAction(
  action: NonNullable<LogEntry['failedAction']>,
  language: 'ja' | 'en'
): string {
  if (action.type === 'move') {
    if (language === 'en') {
      return `${PIECE_KANJI[action.piece.kind]} move to ${formatPos(action.to)} failed by trap`;
    }
    return `${PIECE_KANJI[action.piece.kind]} ${formatPos(action.to)}への移動は罠で失敗`;
  }
  if (language === 'en') {
    return `${PIECE_KANJI[action.piece.kind]} drop to ${formatPos(action.to)} failed by trap`;
  }
  return `${PIECE_KANJI[action.piece.kind]}打 ${formatPos(action.to)}は罠で失敗`;
}
