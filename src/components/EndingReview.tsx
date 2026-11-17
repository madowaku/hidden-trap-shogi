'use client';

import type { Player, Position, TrapRule } from '@/game/types';
import type { EndingExplanation, EndingKind } from '@/game/ending';
import { formatSquare } from '@/game/ending';
import type { Acceptance, NextChoice } from '@/game/playtest';
import { getComparisonRule, getTrapRuleMode } from '@/game/ruleModes';
import { RULE_TONE } from './RuleModePicker';

type Language = 'ja' | 'en';

export type MatchFacts = {
  readonly trapHits: Record<Player, number>;
  readonly rescues: number;
  readonly voidedTraps: number;
};

type Props = {
  ending: EndingExplanation;
  rule: TrapRule;
  language: Language;
  /** PvBot の人間側。PvP は null（先手・後手で表示） */
  viewer: Player | null;
  facts: MatchFacts;
  acceptance: Acceptance | null;
  onAcceptance: (value: Acceptance) => void;
  note: string;
  onNote: (value: string) => void;
  onNext: (choice: NextChoice) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/** 納得感の 5 段階。値は 1 始まりの順番 */
const ACCEPTANCE_LABELS: Record<Language, readonly string[]> = {
  ja: ['理不尽', 'やや理不尽', 'どちらとも', 'まあ納得', '納得'],
  en: ['Unfair', 'Bit unfair', 'Neutral', 'Fair-ish', 'Fair'],
};

const ENDING_TITLE: Record<Language, Record<EndingKind, string>> = {
  ja: {
    roulette: '王手の受けに罠',
    trapMate: '一本道の受けを罠で封鎖',
    rescueFailed: '指し直しても受からず',
    mate: '受けのない王手',
    missedDefense: '受けを外した',
    selfExposure: '王が取られる形に',
    resign: '投了',
  },
  en: {
    roulette: 'The answer to check was trapped',
    trapMate: 'The only answer was sealed',
    rescueFailed: 'The retry did not hold',
    mate: 'Check with no answer',
    missedDefense: 'Missed the defense',
    selfExposure: 'King left hanging',
    resign: 'Resignation',
  },
};

function list(squares: readonly Position[]): string {
  return squares.map(formatSquare).join('・');
}

function sideLabel(player: Player, viewer: Player | null, language: Language): string {
  if (viewer) {
    if (language === 'ja') return player === viewer ? 'あなた' : '相手';
    return player === viewer ? 'You' : 'The opponent';
  }
  if (language === 'ja') return player === 'sente' ? '☗先手' : '☖後手';
  return player === 'sente' ? 'Sente' : 'Gote';
}

function explain(ending: EndingExplanation, viewer: Player | null, language: Language): string {
  const who = sideLabel(ending.loser, viewer, language);
  const k = ending.defenseSquares.length;
  const defenses = list(ending.defenseSquares);
  const attempted = ending.attemptedSquare ? formatSquare(ending.attemptedSquare) : '—';
  const retry = ending.retrySquare ? formatSquare(ending.retrySquare) : '—';
  // C: 罠のマスは指し直しでは使えないので、残りの受けだけを挙げる
  const remaining = list(ending.defenseSquares.filter(square => !ending.trapSquare || formatSquare(square) !== formatSquare(ending.trapSquare)));
  if (language === 'en') {
    const text: Record<EndingKind, string> = {
      roulette: `${who} had ${k} answers to check (${defenses}). The chosen one, ${attempted}, was trapped.`,
      trapMate: `${who} had a single answer to check, ${defenses}, and it was trapped. Effectively mate.`,
      rescueFailed: `${who} retried after the trap on ${attempted}, but ${retry} did not stop the check. Remaining answers: ${remaining}.`,
      mate: `${who} faced a check with no answer.`,
      missedDefense: `${who} played ${attempted}, which did not answer the check. Answers were: ${defenses}.`,
      selfExposure: `${who} was not in check, but ${attempted} left the king capturable.`,
      resign: `${who} resigned.`,
    };
    return text[ending.kind];
  }
  const text: Record<EndingKind, string> = {
    roulette: `${who}の王手の受けは ${k} か所（${defenses}）。選んだ ${attempted} に罠があり、受けが失敗した。`,
    trapMate: `${who}の王手の受けは ${defenses} の1か所だけ。そこを罠で塞がれた（実質の詰み）。`,
    rescueFailed: `${who}は ${attempted} の罠を見て指し直したが、${retry} は受けにならなかった。残りの受けは ${remaining} にあった。`,
    mate: `${who}は受けのない王手をかけられた（詰み）。`,
    missedDefense: `${who}は王手に ${attempted} と指したが、受けになっていなかった。受けは ${defenses} にあった。`,
    selfExposure: `${who}は王手されていなかったが、${attempted} で王が取られる形になった。`,
    resign: `${who}が投了した。`,
  };
  return text[ending.kind];
}

function headline(ending: EndingExplanation, viewer: Player | null, language: Language): string {
  if (viewer) {
    const won = ending.winner === viewer;
    if (language === 'ja') return won ? '勝ち' : '負け';
    return won ? 'Victory' : 'Defeat';
  }
  return language === 'ja'
    ? `${sideLabel(ending.winner, null, language)}の勝ち`
    : `${sideLabel(ending.winner, null, language)} wins`;
}

export default function EndingReview({
  ending, rule, language, viewer, facts, acceptance, onAcceptance, note, onNote, onNext, collapsed, onToggleCollapsed,
}: Props) {
  const ja = language === 'ja';
  const mode = getTrapRuleMode(rule);
  const tone = RULE_TONE[rule];
  const comparison = getComparisonRule(rule);
  const comparisonMode = comparison ? getTrapRuleMode(comparison) : null;
  const lost = viewer ? ending.loser === viewer : false;
  const me = viewer ?? 'sente';
  const them = me === 'sente' ? 'gote' : 'sente';
  const hitsLabel = viewer
    ? (ja ? '罠命中 自分/相手' : 'Traps hit me/them')
    : (ja ? '罠命中 先/後' : 'Traps hit S/G');
  const showsVoided = rule === 'checkVoidsTrap';
  const ruleEventLabel = showsVoided
    ? (ja ? '王手で消えた罠' : 'Voided traps')
    : (ja ? '指し直し' : 'Retries');
  const ruleEventCount = showsVoided ? facts.voidedTraps : facts.rescues;
  const outcomeWord: Record<Language, string> = viewer
    ? { ja: lost ? '負け' : '勝ち', en: lost ? 'loss' : 'win' }
    : { ja: '決着', en: 'ending' };
  const fairnessQuestion = ja
    ? `この${outcomeWord.ja}、納得できた？`
    : `Did this ${outcomeWord.en} feel fair?`;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="ending-reopen absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber-100/60 bg-amber-200 px-5 py-2 text-sm font-black text-stone-950 shadow-xl shadow-black/50 transition hover:bg-white"
      >
        {headline(ending, viewer, language)} — {ja ? '結果を開く' : 'Open result'}
      </button>
    );
  }

  return (
    <div className="ending-backdrop absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-[#07040a]/70 p-3 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-labelledby="ending-title"
        className={`ending-card w-full max-w-[460px] rounded-xl border p-4 text-stone-50 shadow-2xl shadow-black/70 ${
          lost ? 'border-fuchsia-200/30 bg-[#1b0b1d]' : 'border-amber-200/40 bg-[#1f1508]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded border px-1.5 py-0.5 font-serif text-sm font-black leading-none ${tone.chip}`}>{mode.code}</span>
              <span className="text-xs font-black text-stone-300">{mode.name[language]}</span>
            </div>
            <h2 id="ending-title" className={`ending-headline mt-1 font-serif text-4xl font-black ${lost ? 'text-fuchsia-100' : 'text-amber-100'}`}>
              {headline(ending, viewer, language)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="h-8 shrink-0 rounded-md border border-white/15 px-2.5 text-xs font-bold text-stone-100 transition hover:bg-white/10"
          >
            {ja ? '盤面を見る' : 'View board'}
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
          <div className={`text-sm font-black ${tone.accent}`}>{ENDING_TITLE[language][ending.kind]}</div>
          <p className="mt-1 text-sm font-bold leading-6 text-stone-100">{explain(ending, viewer, language)}</p>
          {ending.defenseSquares.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {ending.defenseSquares.map(square => {
                const trapped = ending.trapSquare && square.row === ending.trapSquare.row && square.col === ending.trapSquare.col;
                return (
                  <span
                    key={`${square.row}-${square.col}`}
                    className={`rounded px-1.5 py-0.5 text-xs font-black ${trapped ? 'bg-fuchsia-500 text-white' : 'bg-white/10 text-stone-100'}`}
                  >
                    {formatSquare(square)}{trapped ? (ja ? ' 罠' : ' trap') : ''}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-md bg-white/[0.05] px-1 py-1.5">
            <dt className="text-[10px] font-bold text-stone-400">{ja ? '手数' : 'Plies'}</dt>
            <dd className="text-lg font-black">{ending.plies}</dd>
          </div>
          <div className="rounded-md bg-white/[0.05] px-1 py-1.5">
            <dt className="text-[10px] font-bold text-stone-400">{hitsLabel}</dt>
            <dd className="text-lg font-black">{facts.trapHits[me]} / {facts.trapHits[them]}</dd>
          </div>
          <div className="rounded-md bg-white/[0.05] px-1 py-1.5">
            <dt className="text-[10px] font-bold text-stone-400">{ruleEventLabel}</dt>
            <dd className="text-lg font-black">{ruleEventCount}</dd>
          </div>
        </dl>

        <fieldset className="mt-3">
          <legend className="text-sm font-black text-stone-100">
            {fairnessQuestion}
          </legend>
          <div className="mt-1.5 grid grid-cols-5 gap-1">
            {ACCEPTANCE_LABELS[language].map((label, index) => {
              const value = (index + 1) as Acceptance;
              return (
              <button
                key={value}
                type="button"
                aria-pressed={acceptance === value}
                onClick={() => onAcceptance(value)}
                className={`flex min-h-12 flex-col items-center justify-center rounded-md border px-0.5 text-center transition ${
                  acceptance === value
                    ? 'border-amber-100 bg-amber-200 text-stone-950'
                    : 'border-white/15 bg-white/[0.04] text-stone-100 hover:bg-white/10'
                }`}
              >
                <span className="text-base font-black leading-none">{value}</span>
                <span className="mt-0.5 text-[10px] font-bold leading-tight">{label}</span>
              </button>
              );
            })}
          </div>
          <input
            type="text"
            value={note}
            maxLength={140}
            onChange={event => onNote(event.target.value)}
            placeholder={ja ? 'ひとことメモ（任意）' : 'Quick note (optional)'}
            className="mt-1.5 h-9 w-full rounded-md border border-white/15 bg-black/30 px-2 text-sm font-bold text-stone-100 placeholder:text-stone-500"
          />
        </fieldset>

        <div className="mt-3 grid gap-1.5">
          <button
            type="button"
            onClick={() => onNext('same')}
            className="ending-again h-12 rounded-md bg-amber-200 text-base font-black text-stone-950 transition hover:bg-white"
          >
            {ja ? `もう一局（${mode.code} ${mode.name.ja}）` : `One more (${mode.code} ${mode.name.en})`}
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            {comparisonMode ? (
              <button
                type="button"
                onClick={() => onNext('switch')}
                className={`h-10 rounded-md border text-sm font-black transition ${RULE_TONE[comparisonMode.rule].card}`}
              >
                {ja ? `${comparisonMode.code}（${comparisonMode.name.ja}）で比べる` : `Compare with ${comparisonMode.code}`}
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={() => onNext('stop')}
              className="h-10 rounded-md border border-white/15 text-sm font-bold text-stone-100 transition hover:bg-white/10"
            >
              {ja ? 'メニューへ' : 'Menu'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
