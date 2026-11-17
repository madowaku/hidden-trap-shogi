'use client';

import type { Position, TrapRule } from '@/game/types';
import { getTrapRuleMode } from '@/game/ruleModes';
import { formatSquare } from '@/game/ending';
import { RULE_TONE } from './RuleModePicker';

type Language = 'ja' | 'en';

type Props = {
  rule: TrapRule;
  language: Language;
  /** 手番側が王手されている */
  inCheck: boolean;
  /** 手番側が画面の前のプレイヤー（PvBot の人間、PvP の手番側） */
  currentIsViewer: boolean;
  /** C: 指し直し中の罠マス */
  retryTrap: Position | null;
  gameOver: boolean;
};

type StripState = 'idle' | 'check' | 'retry';

const STRIP_CLASS: Record<StripState, string> = {
  retry: 'rule-strip-alert border-cyan-100/70 bg-cyan-500/25 text-cyan-50',
  check: 'rule-strip-alert border-red-200/60 bg-red-600/25 text-red-50',
  idle: 'border-white/10 bg-black/25 text-stone-100',
};

/**
 * 盤の上に常に同じ高さで出す「今のルールで何が起きているか」の帯。
 * 王手・指し直し・罠の消滅を、盤面を動かさずに知らせる。
 */
export default function RuleStatusStrip({
  rule, language, inCheck, currentIsViewer, retryTrap, gameOver,
}: Props) {
  const mode = getTrapRuleMode(rule);
  const tone = RULE_TONE[rule];
  const ja = language === 'ja';

  let state: StripState = 'idle';
  let title = mode.tagline[language];
  let body = mode.summary[language];

  if (!gameOver && retryTrap) {
    state = 'retry';
    title = ja ? `罠発動 — ${formatSquare(retryTrap)}` : `Trap sprung — ${formatSquare(retryTrap)}`;
    body = currentIsViewer
      ? (ja ? '王手中なので、1回だけ指し直せる。罠のマスには指せない。' : 'You are in check, so you may retry once. The trap square is closed.')
      : (ja ? '相手の受けは罠にかかった。相手は1回だけ指し直す。' : 'Their answer hit your trap. They get one retry.');
  } else if (!gameOver && inCheck) {
    state = 'check';
    title = ja ? '王手' : 'Check';
    body = currentIsViewer ? mode.defenderHint[language] : mode.attackerHint[language];
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rule-strip flex min-h-11 w-full items-center gap-2 rounded-md border px-2 py-1 ${STRIP_CLASS[state]}`}
    >
      <span className={`shrink-0 rounded border px-1.5 py-0.5 font-serif text-sm font-black leading-none ${tone.chip}`}>
        {mode.code}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`text-sm font-black ${state === 'idle' ? tone.accent : ''}`}>{title}</span>
        <span className="truncate text-[11px] font-bold opacity-80" title={body}>{body}</span>
      </span>
    </div>
  );
}
