export type SoundEvent =
  | 'move'
  | 'trapPlace'
  | 'trapHit'
  | 'trapMissReveal'
  | 'check'
  | 'gameOver';

export type SoundSettings = {
  readonly enabled: boolean;
  readonly volume: number;
};

export const SOUND_STORAGE_KEY = 'pitfall-shogi:sound-settings';

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.8,
};

export const SOUND_FILES: Record<SoundEvent, string> = {
  move: './sounds/move.wav',
  trapPlace: './sounds/trap-place.wav',
  trapHit: './sounds/trap-hit.wav',
  trapMissReveal: './sounds/trap-miss-reveal.wav',
  check: './sounds/check.wav',
  gameOver: './sounds/game-over.wav',
};
