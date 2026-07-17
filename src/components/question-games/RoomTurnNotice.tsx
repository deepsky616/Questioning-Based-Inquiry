"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const TURN_SOUND_KEY = "question-game-turn-sound";

function playTurnTone() {
  const AudioContextClass = (
    window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }
  ).AudioContext ?? (
    window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }
  ).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
    oscillator.addEventListener("ended", () => {
      void context.close();
    });
  } catch {
    // 소리를 재생할 수 없어도 화면 알림은 그대로 제공한다.
  }
}

interface RoomTurnNoticeProps {
  active: boolean;
  turnKey: string;
}

export function RoomTurnNotice({ active, turnKey }: RoomTurnNoticeProps) {
  const t = useTranslations("gamePlay");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const notifiedKeyRef = useRef<string | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      setSoundEnabled(window.localStorage.getItem(TURN_SOUND_KEY) === "on");
    } catch {
      setSoundEnabled(false);
    } finally {
      setPreferenceLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      notifiedKeyRef.current = null;
      return;
    }
    if (!preferenceLoaded || notifiedKeyRef.current === turnKey) return;
    notifiedKeyRef.current = turnKey;
    if (soundEnabled) playTurnTone();
  }, [active, preferenceLoaded, soundEnabled, turnKey]);

  useEffect(() => {
    if (!active) return;
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }
    document.title = `${t("myTurnTitle")} | ${originalTitleRef.current}`;
    return () => {
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
    };
  }, [active, t]);

  if (!active) return null;

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(TURN_SOUND_KEY, next ? "on" : "off");
    } catch {
      // 저장할 수 없는 환경에서는 현재 화면에서만 설정을 유지한다.
    }
    if (next) playTurnTone();
  };

  return (
    <div
      aria-live="assertive"
      className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
      role="status"
    >
      <BellRing className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-semibold">{t("myTurnNotice")}</p>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        aria-label={soundEnabled ? t("turnSoundOff") : t("turnSoundOn")}
        title={soundEnabled ? t("turnSoundOff") : t("turnSoundOn")}
        onClick={toggleSound}
      >
        {soundEnabled ? (
          <Volume2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <VolumeX className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
