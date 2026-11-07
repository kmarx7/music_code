import type { DiatonicStep, KeySignature, Mode } from "@/domain/score/types";

// -7..+7 fifths 순서. 기존 Pitch 모델을 바꾸지 않는 조표 선택 목록이다.
const MAJOR_TONICS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR_TONICS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];

export const KEY_SIGNATURE_OPTIONS: readonly { id: string; label: string; key: KeySignature }[] =
  (["major", "minor"] as const).flatMap((mode: Mode) =>
    (mode === "major" ? MAJOR_TONICS : MINOR_TONICS).map((tonic, index) => ({
      id: `${mode}:${index - 7}`,
      label: `${tonic} ${mode === "major" ? "장조" : "단조"}`,
      key: { tonic: tonic[0] as DiatonicStep, alter: tonic.endsWith("#") ? 1 : tonic.endsWith("b") ? -1 : 0,
        mode, fifths: index - 7 },
    })),
  );

export function isSupportedKeySignature(key: KeySignature): boolean {
  return KEY_SIGNATURE_OPTIONS.some((option) =>
    option.key.tonic === key.tonic && option.key.alter === key.alter &&
    option.key.mode === key.mode && option.key.fifths === key.fifths,
  );
}
