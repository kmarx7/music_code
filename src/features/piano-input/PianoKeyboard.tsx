"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPianoPreview, type PianoPreview } from "@/adapters/tone/pianoPreview";
import type { Pitch } from "@/domain/score/types";
import { buildPianoKeys, midiToPitch, pitchFromComputerKey } from "./keys";

const WHITE_WIDTH = 34; // P6-04: black keys reach the WCAG 2.5.8 24×24 px target size
const BLACK_WIDTH = 24;
const WHITE_HEIGHT = 120;
const BLACK_HEIGHT = 74;

export function PianoKeyboard({
  onPitch,
  computerOctave = 4,
}: {
  onPitch: (pitch: Pitch) => void;
  computerOctave?: number;
}) {
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const previewRef = useRef<PianoPreview | null>(null);
  const enabledRef = useRef(true);
  const requestRef = useRef(0);
  const pointerRef = useRef<number | null>(null);
  const pointerMidiRef = useRef<number | null>(null);
  const previewReadyRef = useRef(true);
  const previewPitch = useCallback((pitch: Pitch, pointerId: number | null = null) => {
    if (!enabledRef.current) return;
    pointerRef.current = pointerId;
    pointerMidiRef.current = pointerId === null ? null : pitch.midi;
    previewReadyRef.current = false;
    const request = ++requestRef.current;
    const preview = previewRef.current ??= createPianoPreview();
    void preview.play(pitch.midi).then((played) => {
      if (played && request === requestRef.current) { previewReadyRef.current = true; setPreviewError(""); }
    }).catch(() => {
      if (request === requestRef.current) setPreviewError("소리 미리듣기를 시작하지 못했습니다. 음표 입력과 저장은 계속됩니다. 다시 건반을 눌러 주세요.");
    });
  }, []);

  useEffect(() => {
    const preview = previewRef.current ??= createPianoPreview();
    void preview.prepare().catch(() => {});
    const stop = () => { requestRef.current += 1; pointerRef.current = null; pointerMidiRef.current = null; preview.stop(); };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      requestRef.current += 1; previewRef.current = null;
      preview.dispose();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  function pointerDown(midi: number, event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button === 0) previewPitch(midiToPitch(midi), event.pointerId);
  }
  function pointerCancel(event: React.PointerEvent<HTMLButtonElement>) {
    if (pointerRef.current !== event.pointerId) return;
    requestRef.current += 1; pointerRef.current = null; pointerMidiRef.current = null; previewRef.current?.stop();
  }
  function click(midi: number, event: React.MouseEvent<HTMLButtonElement>) {
    const pitch = midiToPitch(midi);
    onPitch(pitch);
    // Retry pending/blocked press activation in the native click gesture (notably touch/Safari).
    // A successful pointer audition is not retriggered by its compatibility click.
    if (event.detail === 0 || (!previewReadyRef.current && pointerMidiRef.current === midi)) {
      previewPitch(pitch, event.detail === 0 ? null : pointerRef.current);
    }
  }

  const keys = useMemo(() => buildPianoKeys(), []);
  const whiteKeys = useMemo(() => keys.filter((key) => !key.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((key) => key.isBlack), [keys]);
  const width = whiteKeys.length * WHITE_WIDTH;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const pitch = pitchFromComputerKey(event.key, computerOctave);
      if (!pitch) return;
      event.preventDefault();
      onPitch(pitch);
      previewPitch(pitch);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPitch, computerOctave, previewPitch]);

  return (
    <div>
      <label><input type="checkbox" aria-label="입력 소리 미리듣기" checked={previewEnabled} onChange={(event) => {
        const enabled = event.target.checked;
        enabledRef.current = enabled; setPreviewEnabled(enabled); setPreviewError("");
        if (!enabled) { requestRef.current += 1; pointerRef.current = null; pointerMidiRef.current = null; previewRef.current?.stop(); }
      }} /> 입력 소리 미리듣기</label>
      <p data-testid="piano-preview-message" aria-live="polite" style={{ fontSize: 12, margin: "8px 0" }}>
        {previewError || "입력음을 짧게 한 음씩 미리듣습니다. 소리를 꺼도 음표는 입력됩니다."}
      </p>
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <div style={{ position: "relative", width, height: WHITE_HEIGHT }}>
        {whiteKeys.map((key, index) => (
          <button
            key={key.midi}
            type="button"
            aria-label={`MIDI ${key.midi}`}
            onPointerDown={(event) => pointerDown(key.midi, event)}
            onPointerCancel={pointerCancel}
            onClick={(event) => click(key.midi, event)}
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
            onPointerDown={(event) => pointerDown(key.midi, event)}
            onPointerCancel={pointerCancel}
            onClick={(event) => click(key.midi, event)}
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
    </div>
  );
}
