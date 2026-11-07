"use client";

import type { Score } from "@/domain/score";
import type { EditCommand } from "@/domain/commands";
import { KEY_SIGNATURE_OPTIONS } from "@/domain/music-theory";

const METERS = ["2/4", "3/4", "4/4", "6/8"];
const formStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 } as const;

/** 설정을 UI에서 직접 변경하지 않고 기존 Command 진입점으로 전달한다. */
export function ScoreSettings({ score, onCommand }: { score: Score; onCommand: (command: EditCommand) => void }) {
  const part = score.parts[0];
  const meter = `${part.timeSignature.numerator}/${part.timeSignature.denominator}`;
  const keyId = `${part.keySignature.mode}:${part.keySignature.fifths}`;
  const hasContent = score.parts.some((candidate) => candidate.ties.length > 0 || candidate.measures.some((measure) => measure.events.length > 0));

  return (
    <fieldset style={{ border: "1px solid #d9dee8", borderRadius: 10, padding: 16, margin: "0 0 16px", minWidth: 0 }}>
      <legend>악보 설정</legend>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <form style={formStyle} onSubmit={(event) => {
          event.preventDefault();
          const tempoBpm = Number(new FormData(event.currentTarget).get("tempo"));
          if (tempoBpm !== score.tempoBpm) onCommand({ type: "SetTempo", tempoBpm, updatedAt: new Date().toISOString() });
        }}>
          <label htmlFor="score-tempo">기본 템포 (BPM)</label>
          <input id="score-tempo" name="tempo" type="number" required min={20} max={400} step={1}
            key={`${score.id}:${score.tempoBpm}`} defaultValue={score.tempoBpm} style={{ width: 80 }} />
          <button type="submit">템포 적용</button>
          <span style={{ fontSize: 12 }}>20–400 BPM, 정수</span>
        </form>
        <form style={formStyle} onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("key");
          const chosen = KEY_SIGNATURE_OPTIONS.find((option) => option.id === value);
          if (chosen && chosen.id !== keyId) onCommand({ type: "SetKeySignature", partId: part.id,
            keySignature: chosen.key, updatedAt: new Date().toISOString() });
        }}>
          <label htmlFor="score-key">조표</label>
          <select id="score-key" name="key" key={`${score.id}:${keyId}`} defaultValue={keyId}>
            {KEY_SIGNATURE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button type="submit">조표 적용</button>
          <span style={{ fontSize: 12 }}>기존 소리와 음이름을 유지하며 조표·임시표 표시를 바꿉니다.</span>
        </form>
        <form style={formStyle} onSubmit={(event) => {
          event.preventDefault();
          if (hasContent) return;
          const value = String(new FormData(event.currentTarget).get("meter"));
          if (!METERS.includes(value) || value === meter) return;
          const [numerator, denominator] = value.split("/").map(Number);
          onCommand({ type: "SetTimeSignature", partId: part.id,
            timeSignature: { numerator, denominator }, updatedAt: new Date().toISOString() });
        }}>
          <label htmlFor="score-meter">박자</label>
          <select id="score-meter" name="meter" key={`${score.id}:${meter}`} defaultValue={meter} disabled={hasContent} aria-describedby="meter-help">
            {!METERS.includes(meter) ? <option value={meter}>{meter} (현재 박자)</option> : null}
            {METERS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button type="submit" disabled={hasContent}>박자 적용</button>
          <span id="meter-help" style={{ fontSize: 12 }}>음표·쉼표가 없는 빈 악보에서만 변경할 수 있습니다.</span>
        </form>
        <p style={{ margin: 0, fontSize: 12 }}>설정 변경 시 재생이 정지됩니다. 다시 재생하면 새 설정이 적용됩니다.</p>
      </div>
    </fieldset>
  );
}
