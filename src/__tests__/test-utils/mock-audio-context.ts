import { vi } from "vitest";

export function installMockAudioContext() {
  const starts = vi.fn();
  const contexts = vi.fn();

  class MockAudioContext {
    currentTime = 0;
    destination = {};

    constructor() {
      contexts();
    }

    createOscillator() {
      return {
        type: "sine",
        frequency: {
          setValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: starts,
        stop: vi.fn(),
        addEventListener: vi.fn(),
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
    }

    close() {
      return Promise.resolve();
    }
  }

  vi.stubGlobal("AudioContext", MockAudioContext);
  return { contexts, starts };
}
