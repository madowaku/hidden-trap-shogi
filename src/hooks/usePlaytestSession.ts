'use client';

// 終局ごとの「決着の振り返り」と試遊ログ（localStorage）の管理。
// ローカル対局（PvBot / PvP）だけを記録する。オンライン対戦は記録しない。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, Player, TrapRule } from '@/game/types';
import { explainEnding } from '@/game/ending';
import type { EndingExplanation } from '@/game/ending';
import type { Acceptance, NextChoice, PlaytestRecord } from '@/game/playtest';
import { PLAYTEST_STORAGE_KEY, parsePlaytestLog, upsertPlaytestRecord } from '@/game/playtest';
import type { MatchFacts } from '@/components/EndingReview';

const RADIX = 36;
/** Math.random().toString(36) の先頭 "0." */
const RANDOM_PREFIX = 2;

function loadRecords(): PlaytestRecord[] {
  try {
    return parsePlaytestLog(localStorage.getItem(PLAYTEST_STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveRecords(records: readonly PlaytestRecord[]) {
  try {
    localStorage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 保存できなくても対局は続けられる（プライベートウィンドウなど）
  }
}

export function buildMatchFacts(state: Pick<GameState, 'log'>): MatchFacts {
  const trapHits: Record<Player, number> = { sente: 0, gote: 0 };
  state.log
    .filter(entry => entry.pitfallTriggered)
    .forEach(entry => {
      // 罠にかかったのは entry.player。罠を置いたのは相手
      const trapper: Player = entry.player === 'sente' ? 'gote' : 'sente';
      trapHits[trapper] += 1;
    });
  return {
    trapHits,
    rescues: state.log.filter(entry => entry.rescued).length,
    voidedTraps: state.log.filter(entry => entry.voidedPitfall).length,
  };
}

type Options = {
  state: GameState;
  trapRule: TrapRule;
  /** ローカル対局を表示中か（スタート画面・オンラインでは false） */
  active: boolean;
};

export function usePlaytestSession({ state, trapRule, active }: Options) {
  const [records, setRecords] = useState<PlaytestRecord[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [acceptance, setAcceptanceState] = useState<Acceptance | null>(null);
  const [note, setNoteState] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const recordedLogRef = useRef<GameState['log'] | null>(null);

  useEffect(() => {
    queueMicrotask(() => setRecords(loadRecords()));
  }, []);

  const update = useCallback((id: string, patch: Partial<PlaytestRecord>, create?: PlaytestRecord) => {
    setRecords(current => {
      const next = upsertPlaytestRecord(current, id, patch, create);
      saveRecords(next);
      return next;
    });
  }, []);

  const gameOver = state.phase.type === 'GAME_OVER' && state.winner !== null;
  const ending = useMemo<EndingExplanation | null>(
    () => (gameOver && state.winner ? explainEnding(state.log, state.winner) : null),
    [gameOver, state.log, state.winner]
  );
  const facts = useMemo(() => buildMatchFacts(state), [state]);
  const botSide: Player = state.config.botPlayer ?? 'gote';
  const humanSide: Player = botSide === 'sente' ? 'gote' : 'sente';
  const human: Player | null = state.config.gameMode === 'pvbot' ? humanSide : null;

  // 終局したら 1 局分の記録を作る（納得感・次の選択は後から書き足す）
  useEffect(() => {
    if (!active || !ending || recordedLogRef.current === state.log) return;
    recordedLogRef.current = state.log;
    const id = `${Date.now().toString(RADIX)}-${Math.random().toString(RADIX).slice(RANDOM_PREFIX)}`;
    const perspective = human ?? 'sente';
    const record: PlaytestRecord = {
      id,
      finishedAt: new Date().toISOString(),
      trapRule,
      gameMode: state.config.gameMode,
      botLevel: state.config.gameMode === 'pvbot' ? state.config.botLevel : null,
      casualMode: state.config.casualMode,
      result: ending.winner === perspective ? 'win' : 'loss',
      ending: ending.kind,
      plies: ending.plies,
      defenses: ending.loserWasInCheck ? ending.defenseSquares.length : null,
      trapHits: facts.trapHits,
      rescues: facts.rescues,
      voidedTraps: facts.voidedTraps,
      acceptance: null,
      next: null,
      note: '',
    };
    queueMicrotask(() => {
      setRecordId(id);
      update(id, {}, record);
    });
  }, [active, ending, facts, human, state.config, state.log, trapRule, update]);

  // 新しい対局が始まったら振り返りの入力を空に戻す
  useEffect(() => {
    if (gameOver) return;
    queueMicrotask(() => {
      setRecordId(null);
      setAcceptanceState(null);
      setNoteState('');
      setCollapsed(false);
    });
  }, [gameOver]);

  const setAcceptance = useCallback((value: Acceptance) => {
    setAcceptanceState(value);
    if (recordId) update(recordId, { acceptance: value });
  }, [recordId, update]);

  const setNote = useCallback((value: string) => {
    setNoteState(value);
    if (recordId) update(recordId, { note: value });
  }, [recordId, update]);

  const recordNext = useCallback((choice: NextChoice) => {
    if (recordId) update(recordId, { next: choice });
  }, [recordId, update]);

  const clear = useCallback(() => {
    setRecords([]);
    saveRecords([]);
  }, []);

  return {
    records,
    ending,
    facts,
    human,
    acceptance,
    setAcceptance,
    note,
    setNote,
    collapsed,
    toggleCollapsed: () => setCollapsed(current => !current),
    recordNext,
    clear,
  };
}
