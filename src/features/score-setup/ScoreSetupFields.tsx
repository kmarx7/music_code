"use client";

import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";
import { SETUP_DEFAULTS, SETUP_INSTRUMENTS, SETUP_METERS, type ScoreSetup } from "./setup";

export interface ScoreSetupFieldsProps {
  /** Hide the key: the humming flow spells notes in C major and the key can change later (A-1 decision 4). */
  showKey?: boolean;
  /** Values to show instead of the defaults, e.g. when the user steps back. */
  initial?: ScoreSetup;
}

/**
 * The setup fields shared by `/new` and `/record` step 1. Uncontrolled inputs named title/meter/tempo/key,
 * read on submit with `parseScoreSetup`. The target instrument is shown but only the piano can be chosen yet.
 */
export function ScoreSetupFields({ showKey = true, initial }: ScoreSetupFieldsProps) {
  const meter = initial ? `${initial.timeSignature.numerator}/${initial.timeSignature.denominator}` : SETUP_DEFAULTS.meter;
  const keyId = initial ? `${initial.keySignature.mode}:${initial.keySignature.fifths}` : SETUP_DEFAULTS.keyId;
  return (
    <div className="hb-fields">
      <label className="hb-field hb-field-wide">제목
        <input name="title" defaultValue={initial?.title ?? SETUP_DEFAULTS.title} required maxLength={120} autoComplete="off" />
      </label>
      <label className="hb-field">박자
        <select name="meter" defaultValue={meter}>
          {SETUP_METERS.map((meter) => <option key={meter} value={meter}>{meter}</option>)}
        </select>
      </label>
      <label className="hb-field">템포 (BPM)
        <input name="tempo" type="number" inputMode="numeric" min={20} max={400} step={1} required defaultValue={initial?.tempoBpm ?? SETUP_DEFAULTS.tempoBpm} />
      </label>
      {showKey ? (
        <label className="hb-field">조성
          <select name="key" defaultValue={keyId}>
            {KEY_SIGNATURE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      ) : null}
      <label className="hb-field">목표 악기
        <select name="instrument" defaultValue={SETUP_DEFAULTS.instrument} aria-describedby="setup-instrument-help">
          {SETUP_INSTRUMENTS.map((instrument) => (
            <option key={instrument.id} value={instrument.id} disabled={!instrument.available}>{instrument.label}</option>
          ))}
        </select>
      </label>
      <p id="setup-instrument-help" className="hb-muted hb-field-wide" style={{ margin: 0 }}>
        향피리·25현 가야금 맞춤은 음역 기준을 확인한 뒤 열립니다.
      </p>
    </div>
  );
}
