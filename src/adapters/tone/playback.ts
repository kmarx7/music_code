import type { Score } from "@/domain/score/types";

export interface PlaybackHandle {
  stop(): void;
}

/**
 * Tone.js 어댑터. canonical Score를 읽어 스케줄만 수행하며 Score를 변경하지 않는다.
 * 오디오는 사용자 제스처에서 시작한다. 동적 import로 SSR 번들에서 제외한다.
 */
export async function playScore(
  score: Score,
  options?: { onEnd?: () => void },
): Promise<PlaybackHandle> {
  const Tone = await import("tone");
  await Tone.start();

  const synth = new Tone.Synth().toDestination();
  const part = score.parts[0];
  const quarterSeconds = 60 / score.tempoBpm;
  const tickSeconds = quarterSeconds / 960;
  const startAt = Tone.now() + 0.1;

  let endTick = 0;
  if (part) {
    for (const measure of part.measures) {
      for (const event of measure.events) {
        endTick = Math.max(endTick, event.startTick + event.durationTicks);
        if (event.kind !== "note") continue;
        synth.triggerAttackRelease(
          Tone.Frequency(event.pitch.midi, "midi").toFrequency(),
          Math.max(0.05, event.durationTicks * tickSeconds * 0.9),
          startAt + event.startTick * tickSeconds,
        );
      }
    }
  }

  let stopped = false;
  const timeout = setTimeout(
    () => {
      if (stopped) return;
      stopped = true;
      synth.dispose();
      options?.onEnd?.();
    },
    (endTick * tickSeconds + 0.3) * 1000,
  );

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timeout);
      synth.dispose();
    },
  };
}
