export type RuleProfileId = 'casual' | 'strict';

export type RuleProfile = {
  readonly id: RuleProfileId;
  readonly revealMissedPitfalls: boolean;
  readonly victoryCondition: 'kingCapture';
  readonly enforceSelfCheck: boolean;
  readonly forbidPawnDropMate: boolean;
  readonly resolveCheckmate: boolean;
};

export const RULE_PROFILES: Record<RuleProfileId, RuleProfile> = {
  casual: {
    id: 'casual',
    revealMissedPitfalls: true,
    victoryCondition: 'kingCapture',
    enforceSelfCheck: false,
    forbidPawnDropMate: false,
    resolveCheckmate: false,
  },
  strict: {
    id: 'strict',
    revealMissedPitfalls: false,
    victoryCondition: 'kingCapture',
    enforceSelfCheck: false,
    forbidPawnDropMate: false,
    resolveCheckmate: false,
  },
};

export function getRuleProfile(casualMode: boolean): RuleProfile {
  return casualMode ? RULE_PROFILES.casual : RULE_PROFILES.strict;
}
