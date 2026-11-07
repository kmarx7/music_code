import type { Score } from "@/domain/score/types";
import { mergeTiedNotes } from "@/domain/score/tie";

export interface PlaybackHandle {
  stop(): void;
}

/**
 * Tone.js 어댑터. canonical Score를 읽어 스케줄만 수행하며 Score를 변경하지 않는다.
 * 타이 체인은 `mergeTiedNotes`로 병합해 **하나의 어택 + 지속음**으로 재생한다(중복 어택 금지).
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
    for (const note of mergeTiedNotes(part)) {
      endTick = Math.max(endTick, note.startTick + note.durationTicks);
      synth.triggerAttackRelease(
        Tone.Frequency(note.pitch.midi, "midi").toFrequency(),
        Math.max(0.05, note.durationTicks * tickSeconds * 0.9),
        startAt + note.startTick * tickSeconds,
      );
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
