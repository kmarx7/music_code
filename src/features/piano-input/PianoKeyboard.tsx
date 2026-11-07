"use client";

import { useEffect, useMemo } from "react";
import type { Pitch } from "@/domain/score/types";
import { buildPianoKeys, midiToPitch, pitchFromComputerKey } from "./keys";

const WHITE_WIDTH = 26;
const BLACK_WIDTH = 16;
const WHITE_HEIGHT = 120;
const BLACK_HEIGHT = 74;

export function PianoKeyboard({
  onPitch,
  computerOctave = 4,
}: {
  onPitch: (pitch: Pitch) => void;
  computerOctave?: number;
}) {
  const keys = useMemo(() => buildPianoKeys(), []);
  const whiteKeys = useMemo(() => keys.filter((key) => !key.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((key) => key.isBlack), [keys]);
  const width = whiteKeys.length * WHITE_WIDTH;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const pitch = pitchFromComputerKey(event.key, computerOctave);
      if (!pitch) return;
      event.preventDefault();
      onPitch(pitch);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPitch, computerOctave]);

  return (
    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <div style={{ position: "relative", width, height: WHITE_HEIGHT }}>
        {whiteKeys.map((key, index) => (
          <button
            key={key.midi}
            type="button"
            aria-label={`MIDI ${key.midi}`}
            onClick={() => onPitch(midiToPitch(key.midi))}
            style={{
              position: "absolute",
              left: index * WHITE_WIDTH,
              top: 0,
              width: WHITE_WIDTH - 2,
              height: WHITE_HEIGHT,
              background: "#ffffff",
              border: "1px solid #b8bfcc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          />
        ))}
        {blackKeys.map((key) => (
          <button
            key={key.midi}
            type="button"
            aria-label={`MIDI ${key.midi}`}
            onClick={() => onPitch(midiToPitch(key.midi))}
            style={{
              position: "absolute",
              left: (key.whiteIndex + 1) * WHITE_WIDTH - BLACK_WIDTH / 2,
              top: 0,
              width: BLACK_WIDTH,
              height: BLACK_HEIGHT,
              background: "#1c1f26",
              border: "1px solid #000000",
              borderRadius: 4,
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    </div>
  );
}
