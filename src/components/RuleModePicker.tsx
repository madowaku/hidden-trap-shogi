'use client';

import type { TrapRule } from '@/game/types';
import { TRAP_RULE_MODES, TRAP_RULE_ORDER } from '@/game/ruleModes';

type Language = 'ja' | 'en';

type Props = {
  value: TrapRule;
  onChange: (rule: TrapRule) => void;
  language: Language;
  /** 対局中の設定パネル用の小さい表示 */
  compact?: boolean;
};

/** ルールごとの色。盤面・バッジ・振り返りで同じ色を使う */
export const RULE_TONE: Record<TrapRule, { chip: string; card: string; selected: string; accent: string }> = {
  standard: {
    chip: 'border-rose-200/60 bg-rose-500 text-white',
    card: 'border-rose-200/25 bg-rose-500/[0.07] text-rose-50 hover:bg-rose-500/15',
    selected: 'border-rose-200 bg-gradient-to-br from-rose-500 to-red-700 text-white shadow-lg shadow-rose-950/40',
    accent: 'text-rose-200',
  },
  checkRetry: {
    chip: 'border-cyan-100/60 bg-cyan-400 text-[#04161c]',
    card: 'border-cyan-200/25 bg-cyan-400/[0.07] text-cyan-50 hover:bg-cyan-400/15',
    selected: 'border-cyan-100 bg-gradient-to-br from-cyan-300 to-teal-500 text-[#04161c] shadow-lg shadow-cyan-950/40',
    accent: 'text-cyan-200',
  },
  checkVoidsTrap: {
    chip: 'border-indigo-100/60 bg-indigo-400 text-[#0b0b24]',
    card: 'border-indigo-200/25 bg-indigo-400/[0.07] text-indigo-50 hover:bg-indigo-400/15',
    selected: 'border-indigo-100 bg-gradient-to-br from-indigo-300 to-violet-500 text-[#0b0b24] shadow-lg shadow-indigo-950/40',
    accent: 'text-indigo-200',
  },
};

const COPY = {
  ja: {
    heading: '罠ルール（試遊用の比較版）',
    shortMatch: '短期決戦の比較',
    shortMatchNote: '盤面・演出・Botは同じ。違うのは王手の時の罠の扱いだけ',
    separate: '別のゲームとして',
    separateNote: '対局が長くなるので、A/C の比較には混ぜない',
  },
  en: {
    heading: 'Trap rules (playtest build)',
    shortMatch: 'Short-match comparison',
    shortMatchNote: 'Same board, effects and bot. Only traps during check differ',
    separate: 'A different game',
    separateNote: 'Games run long, so keep it out of the A/C comparison',
  },
} as const;

function RuleCard({ rule, selected, onClick, language, compact }: {
  rule: TrapRule;
  selected: boolean;
  onClick: () => void;
  language: Language;
  compact: boolean;
}) {
  const mode = TRAP_RULE_MODES[rule];
  const tone = RULE_TONE[rule];
  if (compact) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        title={mode.summary[language]}
        className={`h-5 rounded px-1.5 text-[11px] font-black transition ${selected ? tone.chip : 'text-stone-200 hover:bg-white/10'}`}
      >
        {mode.code} {mode.name[language]}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group flex min-h-[92px] items-stretch gap-3 rounded-md border px-3 py-2 text-left transition ${selected ? tone.selected : tone.card}`}
    >
      <span className={`rule-code flex w-10 shrink-0 items-center justify-center rounded font-serif text-3xl font-black ${
        selected ? 'bg-black/20' : 'bg-black/25'
      }`}>
        {mode.code}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-black leading-5">{mode.name[language]}</span>
        <span className={`text-[13px] font-black leading-5 ${selected ? '' : tone.accent}`}>{mode.tagline[language]}</span>
        <span className="mt-0.5 text-[11px] font-bold leading-4 opacity-80">{mode.summary[language]}</span>
      </span>
    </button>
  );
}

export default function RuleModePicker({ value, onChange, language, compact = false }: Props) {
  const copy = COPY[language];
  const short = TRAP_RULE_ORDER.filter(rule => TRAP_RULE_MODES[rule].shortMatch);
  const separate = TRAP_RULE_ORDER.filter(rule => !TRAP_RULE_MODES[rule].shortMatch);

  if (compact) {
    return (
      <div className="min-h-8 px-1.5 flex flex-wrap items-center gap-1 rounded-md border border-white/10 bg-black/15">
        <span className="text-[11px] font-black text-stone-300">{language === 'ja' ? 'ルール' : 'Rule'}</span>
        {TRAP_RULE_ORDER.map(rule => (
          <RuleCard key={rule} rule={rule} selected={value === rule} onClick={() => onChange(rule)} language={language} compact />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-200/20 bg-black/25 p-2">
      <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-200/75">{copy.heading}</div>
      <div className="mt-1.5 grid gap-2 md:grid-cols-[2fr_1fr]">
        <div>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1">
            <span className="text-sm font-black text-amber-50">{copy.shortMatch}</span>
            <span className="text-[11px] font-bold text-amber-50/60">{copy.shortMatchNote}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {short.map(rule => (
              <RuleCard key={rule} rule={rule} selected={value === rule} onClick={() => onChange(rule)} language={language} compact={false} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1">
            <span className="text-sm font-black text-amber-50">{copy.separate}</span>
            <span className="text-[11px] font-bold text-amber-50/60">{copy.separateNote}</span>
          </div>
          <div className="grid gap-2">
            {separate.map(rule => (
              <RuleCard key={rule} rule={rule} selected={value === rule} onClick={() => onChange(rule)} language={language} compact={false} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
