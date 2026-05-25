// =============================================
// Pitfall Shogi — useGame Hook
// =============================================

'use client';

import { useReducer, useCallback, useEffect, useRef } from 'react';
import type { Position, GameAction, UISelection, PieceKind, BotLevel } from '@/game/types';
import { createInitialGameState } from '@/game/constants';
import { gameReducer } from '@/game/reducer';
import { getLegalMoves, getLegalDrops } from '@/game/board';
import { simpleBot } from '@/game/bot';
import { createShallowSearchEngine } from '@/game/search-engine';
import { getPlayerView } from '@/game/view';

const BOT_DELAY = 500; // ms

export function useGame(
  gameMode: 'pvp' | 'pvbot' = 'pvbot',
  casualMode: boolean = true,
  botLevel: BotLevel = 'normal'
) {
  const [state, dispatch] = useReducer(
    gameReducer,
    { gameMode, casualMode, botLevel },
    (args) => createInitialGameState(args.gameMode, args.casualMode, 'gote', args.botLevel)
  );

  const [selection, setSelection] = useReducer(
    (_: UISelection, action: UISelection) => action,
    { type: 'none' } as UISelection
  );

  const [botPhase, setBotPhase] = useReducer(
    (_: string | null, action: string | null) => action,
    null as string | null
  );

  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBotTimeout = useCallback(() => {
    if (botTimeoutRef.current) {
      clearTimeout(botTimeoutRef.current);
      botTimeoutRef.current = null;
    }
  }, []);

  // 選択をリセット
  const clearSelection = useCallback(() => {
    setSelection({ type: 'none' });
  }, []);

  // 落とし穴を設置
  const placePitfall = useCallback((position: Position) => {
    dispatch({ type: 'PLACE_PITFALL', position });
    clearSelection();
  }, [clearSelection]);

  // 駒を選択
  const selectPiece = useCallback((position: Position) => {
    const piece = state.board[position.row][position.col];
    if (!piece || piece.owner !== state.currentPlayer) return;
    if (state.phase.type !== 'MOVE_SELECTION') return;

    const legalMoves = getLegalMoves(state.board, position);
    setSelection({ type: 'piece', position, legalMoves });
  }, [state.board, state.currentPlayer, state.phase.type]);

  // 持ち駒を選択
  const selectHandPiece = useCallback((pieceKind: PieceKind) => {
    if (state.phase.type !== 'MOVE_SELECTION') return;

    const legalDrops = getLegalDrops(state.board, state.currentPlayer, pieceKind);
    setSelection({ type: 'hand_piece', pieceKind, legalDrops });
  }, [state.board, state.currentPlayer, state.phase.type]);

  // 手を実行
  const executeMove = useCallback((action: GameAction) => {
    dispatch({ type: 'EXECUTE_MOVE', action });
    clearSelection();
  }, [clearSelection]);

  // 成り判定
  const decidePromotion = useCallback((promote: boolean) => {
    dispatch({ type: 'DECIDE_PROMOTION', promote });
  }, []);

  const resign = useCallback(() => {
    clearBotTimeout();
    dispatch({ type: 'RESIGN' });
    clearSelection();
    setBotPhase(null);
  }, [clearBotTimeout, clearSelection]);

  // 端末渡し確認
  const acknowledgePassDevice = useCallback(() => {
    dispatch({ type: 'ACKNOWLEDGE_PASS_DEVICE' });
  }, []);

  // ゲームリセット
  const resetGame = useCallback((newMode?: 'pvp' | 'pvbot', newCasual?: boolean, newBotLevel?: BotLevel) => {
    clearBotTimeout();
    dispatch({ type: 'RESET_GAME', gameMode: newMode, casualMode: newCasual, botLevel: newBotLevel });
    clearSelection();
    setBotPhase(null);
  }, [clearBotTimeout, clearSelection]);

  // --- Bot自動実行 ---
  useEffect(() => {
    if (state.config.gameMode !== 'pvbot') return;
    if (state.phase.type === 'GAME_OVER') return;

    const botPlayer = state.config.botPlayer ?? 'gote';
    if (state.currentPlayer !== botPlayer) return;

    // PASS_DEVICE は自動スキップ
    if (state.phase.type === 'PASS_DEVICE') {
      dispatch({ type: 'ACKNOWLEDGE_PASS_DEVICE' });
      return;
    }

    // 落とし穴設置フェーズ
    if (state.phase.type === 'PITFALL_PLACEMENT') {
      setBotPhase('思考中...');
      clearBotTimeout();
      botTimeoutRef.current = setTimeout(() => {
        const pitfallPos = simpleBot.decidePitfall(state, botPlayer, state.config.botLevel);
        dispatch({ type: 'PLACE_PITFALL', position: pitfallPos });
        botTimeoutRef.current = null;
        setBotPhase(null);
      }, BOT_DELAY);
      return () => {
        clearBotTimeout();
      };
    }

    // 着手フェーズ
    if (state.phase.type === 'MOVE_SELECTION') {
      setBotPhase('着手中...');
      clearBotTimeout();
      botTimeoutRef.current = setTimeout(() => {
        const action = state.config.botLevel === 'hard'
          ? simpleBot.decideMoveWithSearchEngine(
            getPlayerView(state, botPlayer),
            createShallowSearchEngine(),
            { depth: 2, maxCandidates: 1 }
          )
          : simpleBot.decideMove(state, botPlayer, state.config.botLevel);
        dispatch({ type: 'EXECUTE_MOVE', action });
        botTimeoutRef.current = null;
        setBotPhase(null);
      }, BOT_DELAY);
      return () => {
        clearBotTimeout();
      };
    }

    // 成り判定（Botは常に成る）
    if (state.phase.type === 'PROMOTION_DECISION') {
      dispatch({ type: 'DECIDE_PROMOTION', promote: true });
      return;
    }

    return () => {
      clearBotTimeout();
    };
  }, [state, clearBotTimeout]);

  return {
    state,
    selection,
    botPhase,
    placePitfall,
    selectPiece,
    selectHandPiece,
    executeMove,
    decidePromotion,
    resign,
    acknowledgePassDevice,
    resetGame,
    clearSelection,
  };
}
