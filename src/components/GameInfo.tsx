'use client';

import type { GameState } from '@/game/types';

type Props = {
  state: Pick<GameState, 'currentPlayer' | 'turn' | 'phase'>;
  botPhase: string | null;
  language?: 'ja' | 'en';
};

export default function GameInfo({ state, botPhase, language = 'ja' }: Props) {
  const { currentPlayer, turn, phase } = state;
  const playerLabel = currentPlayer === 'sente'
    ? language === 'ja' ? '☗ 先手' : '☗ Sente'
    : language === 'ja' ? '☖ 後手' : '☖ Gote';
  const simplePlayerLabel = currentPlayer === 'sente'
    ? language === 'ja' ? '先手' : 'Sente'
    : language === 'ja' ? '後手' : 'Gote';

  const phaseLabel = (() => {
    switch (phase.type) {
      case 'PITFALL_PLACEMENT':
        return language === 'ja'
          ? '現在操作: 盤面から罠を仕掛けるマスを選択'
          : 'Current action: choose a trap square';
      case 'MOVE_SELECTION':
        return language === 'ja' ? '駒を動かしてください' : 'Move a piece';
      case 'PROMOTION_DECISION':
        return language === 'ja' ? '成りますか？' : 'Promote?';
      case 'PASS_DEVICE':
        return language === 'ja'
          ? `${simplePlayerLabel}に端末を渡してください`
          : `Pass the device to ${simplePlayerLabel}`;
      case 'GAME_OVER':
        if (language === 'ja') {
          return `${phase.winner === 'sente' ? '☗ 先手' : '☖ 後手'}の勝ち！`;
        }
        return `${phase.winner === 'sente' ? '☗ Sente' : '☖ Gote'} wins!`;
      default:
        return '';
    }
  })();

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <div className="flex items-center gap-3">
        <div className={`
          px-3 py-1 rounded-full text-sm font-bold
          ${currentPlayer === 'sente'
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
          }
        `}>
          {playerLabel}
        </div>
        <div className="text-gray-400 text-sm">
          {language === 'ja' ? `第${turn}手` : `Turn ${turn}`}
        </div>
      </div>

      <div className={`
        px-4 py-2 text-center text-sm font-bold leading-relaxed rounded-lg
        ${phase.type === 'PITFALL_PLACEMENT'
          ? 'bg-fuchsia-500/15 text-fuchsia-100 ring-1 ring-fuchsia-300/35'
          : phase.type === 'GAME_OVER'
          ? 'bg-gradient-to-r from-yellow-600/30 to-orange-600/30 text-yellow-200 font-bold text-base'
          : 'bg-white/5 text-gray-300'
        }
      `}>
        {botPhase || phaseLabel}
      </div>
    </div>
  );
}
