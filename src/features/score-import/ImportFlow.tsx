"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildImportedScore, type ImportedScoreInput } from "@/application";
import { parseXmlText } from "@/adapters/musicxml";
import { readScoreFile } from "@/adapters/file-import";
import {
  analyzeInstrumentFit, extractMelody, getInstrumentProfile, recommendTranspositions, selectableInstruments, TICKS_PER_QUARTER,
} from "@/domain/score";
import type { ImportedScore, ImportRhythmRule, InstrumentId, KeySignature, PlaybackPosition, Score, TransposeSpec } from "@/domain/score";
import { KEY_SIGNATURE_OPTIONS, type TransposeDirection } from "@/domain/music-theory";
import { StaffView } from "@/features/score-editor";
import { highlightPlayback, PlaybackControls } from "@/features/playback";
import { takeCard, TakeStepList } from "@/features/audio-recording";
import { describeImportNotice } from "./notices";

export type ImportCreateInput = Omit<ImportedScoreInput, "id" | "createdAt" | "nextId">;

export interface ImportFlowProps {
  /** Called once with the chosen conversion; resolves to an error message, or null on success. */
  onCreate: (input: ImportCreateInput) => Promise<string | null>;
}

const STEPS = ["파일", "확인", "바꾸기", "만들기"] as const;
const RECOMMENDATIONS_SHOWN = 5;
type Step = "file" | "review" | "convert";
interface Loaded { imported: ImportedScore; fileTitle: string; format: "musicxml" | "midi" }
/** MusicXML keeps exact rhythms; a played MIDI take is evened out as a whole (MIDI spec §3.5). */
const rhythmFor = (format: Loaded["format"]): ImportRhythmRule => (format === "midi" ? "grid-all-if-any-off" : "exact-or-grid");

const keyLabel = (key: KeySignature) =>
  KEY_SIGNATURE_OPTIONS.find((option) => option.key.mode === key.mode && option.key.fifths === key.fifths)?.label ?? "지원하지 않는 조성";
const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;

function preview(input: ImportCreateInput): ReturnType<typeof buildImportedScore> {
  let next = 0;
  return buildImportedScore({ ...input, id: "preview", createdAt: new Date(0).toISOString(), nextId: () => `preview-measure-${next++}` });
}

/** Staff preview with playback highlighting; `testId` names the box for tests. */
function ScorePreview({ score, testId }: { score: Score; testId: string }) {
  const root = useRef<HTMLDivElement>(null);
  const show = useCallback((position: PlaybackPosition) => {
    if (root.current) highlightPlayback(root.current, position.activeNoteIds);
  }, []);
  return (
    <>
      <div ref={root} data-testid={testId} style={{ ...takeCard, overflowX: "auto" }}><StaffView score={score} /></div>
      <PlaybackControls score={score} onPosition={show} />
    </>
  );
}

/**
 * "악보 올리기" (Phase 8 step 2): ① file ② what was read ③ instrument, key and title ④ create. The file is read in
 * this browser and never sent anywhere; nothing is stored before "악보 만들기", and one press makes one score.
 */
export function ImportFlow({ onCreate }: ImportFlowProps) {
  const [step, setStep] = useState<Step>("file");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [partIndex, setPartIndex] = useState<number | undefined>(undefined);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [instrument, setInstrument] = useState<InstrumentId>("piano");
  const [keyId, setKeyId] = useState("");
  const [direction, setDirection] = useState<TransposeDirection>("nearest");
  const [recommended, setRecommended] = useState<TransposeSpec | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const index = { file: 0, review: 1, convert: 2 }[step];
  const shownStep = useRef(index);
  useEffect(() => {
    if (shownStep.current === index) return;
    shownStep.current = index;
    heading.current?.focus({ preventScroll: false });
  }, [index]);

  const extraction = useMemo(() => loaded ? extractMelody(loaded.imported, { partIndex, fallbackTitle: loaded.fileTitle, rhythm: rhythmFor(loaded.format) }) : null, [loaded, partIndex]);
  const melody = extraction?.ok ? extraction : null;
  // From the file itself, so the picker stays when the chosen part cannot be used.
  const partChoices = useMemo(() => loaded ? loaded.imported.parts.map((part, index) => ({
    index, name: part.name, noteCount: part.notes.filter((note) => note.pitch !== null && !note.grace && !note.cue).length,
  })) : [], [loaded]);

  const original = useMemo(() => melody
    ? preview({ settings: melody.settings, clipboard: melody.clipboard, instrument: "piano", transpose: null }) : null, [melody]);

  const keyOptions = useMemo(() => melody
    ? KEY_SIGNATURE_OPTIONS.filter((option) => option.key.mode === melody.settings.keySignature.mode) : [], [melody]);
  const transpose = useMemo<TransposeSpec | null>(() => {
    if (recommended) return recommended;
    const option = keyOptions.find((item) => item.id === keyId);
    return option ? { kind: "targetKey", targetKey: option.key, direction } : null;
  }, [recommended, keyOptions, keyId, direction]);

  const base = useMemo(() => melody
    ? preview({ settings: melody.settings, clipboard: melody.clipboard, instrument, transpose: null }) : null, [melody, instrument]);
  const result = useMemo(() => melody
    ? preview({ settings: melody.settings, clipboard: melody.clipboard, instrument, transpose }) : null, [melody, instrument, transpose]);
  const fit = useMemo(() => result?.ok ? analyzeInstrumentFit(result.score, instrument) : null, [result, instrument]);
  const range = fit?.range ?? null;
  const candidates = useMemo(() => {
    if (!base?.ok || !range) return [];
    const found = recommendTranspositions(base.score, range);
    if (!found.ok) return [];
    const fits = found.candidates.filter((candidate) => candidate.fits);
    return (fits.length ? fits : found.candidates).slice(0, RECOMMENDATIONS_SHOWN);
  }, [base, range]);

  async function readFile(file: File | undefined) {
    if (!file || reading) return;
    setReading(true); setFileError("");
    try {
      const read = await readScoreFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, parseXmlText);
      if (!read.ok) { setFileError(read.message); return; }
      const first = extractMelody(read.imported, { fallbackTitle: read.fileTitle, rhythm: rhythmFor(read.format) });
      if (!first.ok) { setFileError(first.message); return; }
      setLoaded(read); setPartIndex(undefined);
      setTitle(first.settings.title); setInstrument("piano"); setKeyId(""); setDirection("nearest"); setRecommended(null);
      setCreateError(""); setStep("review");
    } catch {
      setFileError("파일을 읽지 못했습니다. 다시 골라 주세요.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function create() {
    if (!melody || !result?.ok || pending.current) return;
    const trimmed = title.trim();
    if (!trimmed) { setCreateError("제목을 입력해 주세요."); return; }
    pending.current = true; setCreating(true); setCreateError("");
    const error = await onCreate({ settings: { ...melody.settings, title: trimmed.slice(0, 120) }, clipboard: melody.clipboard, instrument, transpose });
    if (error) { pending.current = false; setCreating(false); setCreateError(error); }
  }

  const profile = getInstrumentProfile(instrument);

  return (
    <section data-testid="import-flow" data-step={step} aria-label="악보 올리기">
      <TakeStepList index={index} steps={STEPS} />

      {step === "file" && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">어떤 악보를 올릴까요?</h1>
          <label
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void readFile(event.dataTransfer.files[0]); }}
            style={{ ...takeCard, display: "block", padding: 24, textAlign: "center", cursor: "pointer",
              borderStyle: "dashed", borderColor: dragging ? "var(--hb-accent)" : "var(--hb-border-strong)" }}>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>MusicXML·MIDI 파일을 끌어다 놓거나 눌러서 고르세요</span>
            <span className="hb-muted">.musicxml · .xml · .mxl · .mid, 최대 5MB</span>
            <input ref={fileInput} type="file" aria-label="악보 파일" accept=".musicxml,.xml,.mxl,.mid,.midi" disabled={reading}
              onChange={(event) => void readFile(event.target.files?.[0])}
              style={{ display: "block", margin: "12px auto 0", maxWidth: "100%" }} />
          </label>
          {reading ? <p role="status">파일을 읽는 중…</p> : null}
          {fileError ? <p role="alert" className="hb-alert">{fileError}</p> : null}
          <p className="hb-muted">파일은 이 브라우저 안에서만 읽고 어디에도 보내지 않습니다. 권리를 가진 악보만 올려 주세요.</p>
          <p className="hb-muted">PDF·사진 인식은 준비 중입니다.</p>
        </div>
      )}

      {step === "review" && extraction && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">읽은 악보 확인</h1>
          {partChoices.length > 1 ? (
            <label className="hb-field" style={{ marginBottom: 12 }}>가져올 파트
              <select aria-label="가져올 파트" value={melody?.partIndex ?? partIndex ?? 0}
                onChange={(event) => { setPartIndex(Number(event.target.value)); setKeyId(""); setRecommended(null); }}>
                {partChoices.map((part) => (
                  <option key={part.index} value={part.index} disabled={part.noteCount === 0}>{`${part.name} · 음 ${part.noteCount}개`}</option>
                ))}
              </select>
            </label>
          ) : null}
          {!extraction.ok ? <p role="alert" className="hb-alert">{extraction.message}</p> : null}
          {melody ? (
            <>
              <p data-testid="import-summary" style={{ margin: "0 0 12px" }}>
                <strong>{melody.settings.title}</strong>
                {` · ${melody.settings.tempoBpm} BPM · ${melody.settings.timeSignature.numerator}/${melody.settings.timeSignature.denominator}박자`}
                {` · ${keyLabel(melody.settings.keySignature)} · ${melody.clipboard.lengthTicks / ((melody.settings.timeSignature.numerator * 4 * TICKS_PER_QUARTER) / melody.settings.timeSignature.denominator)}마디`}
                {` · 음 ${melody.noteCount}개`}
              </p>
              {original?.ok ? <ScorePreview score={original.score} testId="import-preview" /> : null}
              {original && !original.ok ? <p role="alert" className="hb-alert">{original.message}</p> : null}
              <div data-testid="import-notices" style={{ margin: "12px 0" }}>
                <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>가져오면서 바뀐 점</h2>
                {melody.notices.length === 0 ? <p style={{ margin: 0 }}>원본 선율을 그대로 가져왔습니다.</p> : (
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {melody.notices.map((notice) => <li key={notice.code}>{describeImportNotice(notice)}</li>)}
                  </ul>
                )}
              </div>
            </>
          ) : null}
          <div className="hb-actions" style={{ marginTop: 12 }}>
            <button type="button" className="hb-btn" onClick={() => { setStep("file"); setFileError(""); }}>다른 파일 고르기</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={!original?.ok} onClick={() => setStep("convert")}>다음</button>
          </div>
        </div>
      )}

      {step === "convert" && melody && (
        <div>
          <h1 ref={heading} tabIndex={-1} className="hb-title">어떤 악보로 만들까요?</h1>
          <div className="hb-fields">
            <label className="hb-field hb-field-wide">제목
              <input aria-label="제목" value={title} maxLength={120} onChange={(event) => { setTitle(event.target.value); setCreateError(""); }} />
            </label>
            <label className="hb-field">목표 악기
              <select aria-label="목표 악기" value={instrument} onChange={(event) => { setInstrument(event.target.value as InstrumentId); setRecommended(null); }}>
                {selectableInstruments().map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="hb-field">목표 조
              <select aria-label="목표 조" value={keyId} onChange={(event) => { setKeyId(event.target.value); setRecommended(null); }}>
                <option value="">원래 조 그대로 ({keyLabel(melody.settings.keySignature)})</option>
                {keyOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="hb-field">이동 방향
              <select aria-label="이동 방향" value={direction} disabled={!keyId} onChange={(event) => { setDirection(event.target.value as TransposeDirection); setRecommended(null); }}>
                <option value="nearest">가까운 방향</option><option value="up">위로</option><option value="down">아래로</option>
              </select>
            </label>
          </div>

          {fit?.range && profile.range ? (
            <div style={takeCard}>
              <p data-testid="import-instrument-fit" style={{ margin: 0 }}>{fit.outside.total === 0
                ? `${profile.name} 음역 ${profile.range.label} · 모든 음이 음역 안에 있습니다.`
                : `${profile.name} 음역 ${profile.range.label} · 범위 밖 음 ${fit.outside.total}개 (낮음 ${fit.outside.below} · 높음 ${fit.outside.above})`}</p>
              {candidates.length > 0 ? (
                <>
                  <p className="hb-muted" style={{ margin: "8px 0 4px" }}>음역에 맞는 조 추천</p>
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    {candidates.map((candidate, position) => {
                      const label = `${keyLabel(candidate.targetKey)} · ${signed(candidate.interval.deltaSemitones)}반음 · ${candidate.fits ? "모두 들어감" : `범위 밖 ${candidate.violations.length}개`}`;
                      const active = recommended === candidate.spec;
                      return (
                        <li key={candidate.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "4px 0" }}>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{label}</span>
                          <button type="button" className="hb-btn" aria-pressed={active}
                            aria-label={`${position + 1}순위 ${signed(candidate.interval.deltaSemitones)}반음 후보 적용`}
                            onClick={() => {
                              setRecommended(candidate.spec);
                              const option = keyOptions.find((item) => item.key.fifths === candidate.targetKey.fifths);
                              setKeyId(option?.id ?? "");
                              if (candidate.spec.kind === "targetKey") setDirection(candidate.spec.direction ?? "nearest");
                            }}>{active ? "적용됨" : "적용"}</button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : null}
            </div>
          ) : null}

          {result?.ok ? <ScorePreview score={result.score} testId="import-result" /> : null}
          {result && !result.ok ? <p role="alert" className="hb-alert">{result.message}</p> : null}
          {createError ? <p role="alert" className="hb-alert">{createError}</p> : null}
          <div className="hb-actions" style={{ marginTop: 12 }}>
            <button type="button" className="hb-btn" disabled={creating} onClick={() => setStep("review")}>이전</button>
            <button type="button" className="hb-btn hb-btn-primary" disabled={!result?.ok || creating} onClick={() => void create()}>악보 만들기</button>
          </div>
        </div>
      )}
    </section>
  );
}
