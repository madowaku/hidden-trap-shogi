// =============================================
// Pitfall Shogi — 罠ルール（試遊用の比較版）の表示情報
// =============================================

import type { TrapRule } from './types';

type Localized = { readonly ja: string; readonly en: string };

export type TrapRuleMode = {
  readonly rule: TrapRule;
  readonly code: 'A' | 'C' | 'D';
  readonly name: Localized;
  /** プレイヤーが目指すもの（一言） */
  readonly tagline: Localized;
  /** ルールの差分 */
  readonly summary: Localized;
  /** 王手された側へのヒント */
  readonly defenderHint: Localized;
  /** 王手をかけた側へのヒント */
  readonly attackerHint: Localized;
  /** A/C の短期決戦比較に入れるか（D は長さが違うので別枠） */
  readonly shortMatch: boolean;
};

export const TRAP_RULE_MODES: Record<TrapRule, TrapRuleMode> = {
  standard: {
    rule: 'standard',
    code: 'A',
    name: { ja: '現行ルール', en: 'Standard' },
    tagline: { ja: '危険な選択肢から生き残る心理戦', en: 'Survive the dangerous choices' },
    summary: {
      ja: '罠を踏んだ手は無効。王手の受けを罠で潰されたら、そのまま王を取られる。',
      en: 'A move onto the trap fails. If your answer to check is trapped, your king falls.',
    },
    defenderHint: {
      ja: '王手！ 受けのどれかに罠があるかもしれない。罠を外せば生き残る。',
      en: 'Check! One of your answers may be trapped. Dodge it to survive.',
    },
    attackerHint: {
      ja: '王手をかけた。相手の受けを読んで、そこに罠を置け。',
      en: 'Check! Read their answer and trap it.',
    },
    shortMatch: true,
  },
  checkRetry: {
    rule: 'checkRetry',
    code: 'C',
    name: { ja: '王手救済', en: 'Check rescue' },
    tagline: { ja: '相手の選択肢を一つに絞る戦略ゲーム', en: 'Narrow their answers down to one' },
    summary: {
      ja: '王手の受けが罠にかかったら、罠を見てから1回だけ指し直せる。受けが1つしかない王手なら罠で決まる。',
      en: 'If your answer to check hits the trap, you see it and retry once. A check with only one answer can still be sealed.',
    },
    defenderHint: {
      ja: '王手！ 受けが罠にかかっても、1回だけ指し直せる。',
      en: 'Check! If your answer is trapped, you get one retry.',
    },
    attackerHint: {
      ja: '王手をかけた。相手は1回指し直せる。受けを1つに絞ってから罠で塞げ。',
      en: 'Check! They can retry once. Narrow them to a single answer, then seal it.',
    },
    shortMatch: true,
  },
  checkVoidsTrap: {
    rule: 'checkVoidsTrap',
    code: 'D',
    name: { ja: '王手で罠消滅', en: 'Check voids trap' },
    tagline: { ja: '罠は中盤の駆け引き、終盤は寄せ合い（長期戦）', en: 'Traps for the middlegame, mating race at the end' },
    summary: {
      ja: '王手をかけた手番に置いた罠は消える。王手された側は罠を気にせず受けられる。対局は長くなる。',
      en: 'A trap placed on a turn that gives check disappears. Answers to check are always safe. Games run long.',
    },
    defenderHint: {
      ja: '王手。この手番に罠はない。落ち着いて受けよう。',
      en: 'Check. There is no trap this turn. Answer calmly.',
    },
    attackerHint: {
      ja: '王手をかけたので、この手番の罠は消えた。',
      en: 'You gave check, so this turn\'s trap is gone.',
    },
    shortMatch: false,
  },
};

export const TRAP_RULE_ORDER: readonly TrapRule[] = ['standard', 'checkRetry', 'checkVoidsTrap'];

export function getTrapRuleMode(rule: TrapRule | undefined): TrapRuleMode {
  return TRAP_RULE_MODES[rule ?? 'standard'];
}

/** A ⇄ C の比較相手。D は比較に混ぜない */
export function getComparisonRule(rule: TrapRule): TrapRule | null {
  if (rule === 'standard') return 'checkRetry';
  if (rule === 'checkRetry') return 'standard';
  return null;
}
