'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_FILES,
  SOUND_STORAGE_KEY,
  type SoundEvent,
  type SoundSettings,
} from '@/constants/sounds';

type SoundStorage = Pick<Storage, 'getItem' | 'setItem'>;
type AudioLike = {
  volume: number;
  currentTime: number;
  play: () => Promise<void>;
};

type SoundPlayerOptions = {
  getSettings: () => SoundSettings;
  isUnlocked: () => boolean;
  createAudio?: (src: string) => AudioLike;
  files?: Record<SoundEvent, string>;
};

export function readSoundSettings(storage: Pick<Storage, 'getItem'> | null | undefined): SoundSettings {
  if (!storage) return DEFAULT_SOUND_SETTINGS;

  try {
    const raw = storage.getItem(SOUND_STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return normalizeSoundSettings(parsed);
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

export function writeSoundSettings(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  settings: SoundSettings
): void {
  if (!storage) return;

  try {
    storage.setItem(SOUND_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures; sound controls should still work in memory.
  }
}

export function createSoundPlayer(options: SoundPlayerOptions) {
  const playedKeys = new Set<string>();
  const files = options.files ?? SOUND_FILES;

  return {
    playSound(event: SoundEvent, dedupeKey?: string): boolean {
      const settings = options.getSettings();
      if (!settings.enabled || !options.isUnlocked()) return false;
      if (dedupeKey && playedKeys.has(`${event}:${dedupeKey}`)) return false;

      const src = files[event];
      const audio = options.createAudio
        ? options.createAudio(src)
        : new Audio(src);
      audio.volume = clampVolume(settings.volume);
      audio.currentTime = 0;
      if (dedupeKey) playedKeys.add(`${event}:${dedupeKey}`);
      void audio.play().catch(() => undefined);
      return true;
    },
  };
}

export function useSound() {
  const [settings, setSettings] = useState<SoundSettings>(() => (
    typeof window === 'undefined'
      ? DEFAULT_SOUND_SETTINGS
      : readSoundSettings(window.localStorage)
  ));
  const [isUnlocked, setIsUnlocked] = useState(false);
  const settingsRef = useRef(settings);
  const unlockedRef = useRef(isUnlocked);
  const playedKeysRef = useRef(new Set<string>());

  useEffect(() => {
    settingsRef.current = settings;
    writeSoundSettings(getLocalStorage(), settings);
  }, [settings]);

  useEffect(() => {
    unlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  useEffect(() => {
    const unlock = () => setIsUnlocked(true);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setIsUnlocked(true);
    setSettings((current) => ({ ...current, enabled }));
  }, []);

  const setSoundVolume = useCallback((volume: number) => {
    setIsUnlocked(true);
    setSettings((current) => ({ ...current, volume: clampVolume(volume) }));
  }, []);

  const playSound = useCallback((event: SoundEvent, dedupeKey?: string) => {
    const settingsNow = settingsRef.current;
    if (!settingsNow.enabled || !unlockedRef.current) return false;
    const playedKey = dedupeKey ? `${event}:${dedupeKey}` : null;
    if (playedKey && playedKeysRef.current.has(playedKey)) return false;

    const audio = new Audio(SOUND_FILES[event]);
    audio.volume = clampVolume(settingsNow.volume);
    audio.currentTime = 0;
    if (playedKey) playedKeysRef.current.add(playedKey);
    void audio.play().catch(() => undefined);
    return true;
  }, []);

  return {
    settings,
    isUnlocked,
    setSoundEnabled,
    setSoundVolume,
    playSound,
  };
}

function getLocalStorage(): SoundStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function normalizeSoundSettings(value: Partial<SoundSettings>): SoundSettings {
  return {
    enabled: typeof value.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_SOUND_SETTINGS.enabled,
    volume: typeof value.volume === 'number'
      ? clampVolume(value.volume)
      : DEFAULT_SOUND_SETTINGS.volume,
  };
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_SOUND_SETTINGS.volume;
  return Math.min(1, Math.max(0, volume));
}
