"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const LEARNING_SOUND_KEY = "question-game-turn-sound";
const LEARNING_SOUND_EVENT = "question-learning-sound-change";

export type LearningSoundCue =
  | "turn"
  | "start"
  | "success"
  | "retry"
  | "complete"
  | "point"
  | "flip"
  | "reveal";

interface Tone {
  frequency: number;
  start: number;
  duration: number;
  volume: number;
}

const CUES: Record<LearningSoundCue, Tone[]> = {
  turn: [{ frequency: 660, start: 0, duration: 0.24, volume: 0.08 }],
  start: [
    { frequency: 440, start: 0, duration: 0.1, volume: 0.06 },
    { frequency: 660, start: 0.12, duration: 0.16, volume: 0.07 },
  ],
  success: [
    { frequency: 523, start: 0, duration: 0.1, volume: 0.06 },
    { frequency: 659, start: 0.1, duration: 0.16, volume: 0.07 },
  ],
  retry: [{ frequency: 330, start: 0, duration: 0.2, volume: 0.045 }],
  complete: [
    { frequency: 523, start: 0, duration: 0.11, volume: 0.06 },
    { frequency: 659, start: 0.1, duration: 0.12, volume: 0.065 },
    { frequency: 784, start: 0.21, duration: 0.22, volume: 0.07 },
  ],
  point: [
    { frequency: 659, start: 0, duration: 0.1, volume: 0.06 },
    { frequency: 880, start: 0.1, duration: 0.18, volume: 0.07 },
  ],
  flip: [{ frequency: 430, start: 0, duration: 0.07, volume: 0.035 }],
  reveal: [
    { frequency: 392, start: 0, duration: 0.08, volume: 0.045 },
    { frequency: 587, start: 0.08, duration: 0.15, volume: 0.055 },
  ],
};

function audioContextClass() {
  if (typeof window === "undefined") return null;
  return (
    window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }
  ).AudioContext ?? (
    window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }
  ).webkitAudioContext ?? null;
}

export function playLearningSound(cue: LearningSoundCue) {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const tones = CUES[cue];
    tones.forEach((tone, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + tone.start;
      const endAt = startAt + tone.duration;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(tone.volume, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt);

      if (index === tones.length - 1) {
        oscillator.addEventListener("ended", () => {
          void context.close();
        });
      }
    });
  } catch {
    // 소리를 재생할 수 없어도 화면 피드백은 그대로 제공한다.
  }
}

function storedSoundEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LEARNING_SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

export function useLearningSounds() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const syncPreference = () => {
      setEnabled(storedSoundEnabled());
      setReady(true);
    };
    syncPreference();
    window.addEventListener(LEARNING_SOUND_EVENT, syncPreference);
    window.addEventListener("storage", syncPreference);
    return () => {
      window.removeEventListener(LEARNING_SOUND_EVENT, syncPreference);
      window.removeEventListener("storage", syncPreference);
    };
  }, []);

  const setSoundEnabled = useCallback((next: boolean) => {
    setEnabled(next);
    setReady(true);
    try {
      window.localStorage.setItem(LEARNING_SOUND_KEY, next ? "on" : "off");
    } catch {
      // 저장할 수 없는 환경에서는 현재 화면에서만 설정을 유지한다.
    }
    window.dispatchEvent(new Event(LEARNING_SOUND_EVENT));
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setSoundEnabled(next);
    if (next) playLearningSound("start");
  }, [enabled, setSoundEnabled]);

  const play = useCallback((cue: LearningSoundCue) => {
    if (enabled) playLearningSound(cue);
  }, [enabled]);

  return {
    enabled,
    ready,
    play,
    setSoundEnabled,
    toggle,
  };
}

export function useLearningSoundEvent(
  cue: LearningSoundCue,
  eventKey: string | null | undefined,
  active = true,
) {
  const { play, ready } = useLearningSounds();
  const playedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !active || !eventKey || playedKeyRef.current === eventKey) return;
    playedKeyRef.current = eventKey;
    play(cue);
  }, [active, cue, eventKey, play, ready]);
}
