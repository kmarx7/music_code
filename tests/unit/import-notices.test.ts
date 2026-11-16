import { describe, expect, it } from "vitest";
import { IMPORT_NOTICE_CODES } from "@/domain/score";
import { describeImportNotice } from "@/features/score-import";

describe("describeImportNotice", () => {
  it("names the lower staff and its measures", () => {
    expect(describeImportNotice({ code: "LOWER_STAFF_DROPPED", count: 2, measures: ["1", "2"] }))
      .toBe("아래 단(왼손) 음 2개를 가져오지 않았습니다 (1, 2마디)");
  });

  it("lists five measures, then the rest as a count", () => {
    const measures = ["1", "2", "3", "4", "5", "6", "7"];
    expect(describeImportNotice({ code: "GRACE_DROPPED", count: 7, measures })).toBe("꾸밈음 7개를 뺐습니다 (1, 2, 3, 4, 5마디 외 2곳)");
  });

  it("shows the mode name", () => {
    expect(describeImportNotice({ code: "MODE_AS_MAJOR", count: 1, measures: [], detail: "dorian" }))
      .toBe("선법(dorian)은 같은 조표의 장조로 표시했습니다");
  });

  it("explains the MIDI notices", () => {
    expect(describeImportNotice({ code: "PERFORMANCE_QUANTIZED", count: 12, measures: ["1", "2"] }))
      .toBe("연주 기록으로 보여 음 12개를 16분음표 단위로 맞췄습니다 (1, 2마디)");
    expect(describeImportNotice({ code: "DRUMS_IGNORED", count: 30, measures: [] })).toBe("드럼 채널 음 30개는 가져오지 않았습니다");
    expect(describeImportNotice({ code: "KEY_ASSUMED", count: 1, measures: [] }))
      .toBe("파일에 조표 정보가 없어 C장조로 적었습니다. 다음 단계에서 목표 조를 고를 수 있습니다");
  });

  it("has a sentence for every code", () => {
    for (const code of IMPORT_NOTICE_CODES) {
      const text = describeImportNotice({ code, count: 1, measures: ["3"], detail: "x" });
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toContain("undefined");
    }
  });
});
