import { describe, expect, it } from "vitest";
import { deserializeScore, serializeScore } from "@/domain/score/serialize";
import {
  fourNoteScore,
  scoreWithZeroDuration,
  tiedScore,
} from "../../tests/fixtures/scores";

describe("score serialization", () => {
  it("round-trips a valid score", () => {
    const score = fourNoteScore();
    const result = deserializeScore(serializeScore(score));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toEqual(score);
      expect(result.migrated).toBe(false);
    }
  });

  it("round-trips tie links", () => {
    const score = tiedScore();
    const result = deserializeScore(serializeScore(score));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(false);
      expect(result.score.parts[0].ties).toEqual([{ from: "t1", to: "t1:tie1" }]);
    }
  });

  it("migrates a v1 document by adding empty ties", () => {
    const current = fourNoteScore();
    const parts = current.parts.map((part) => {
      const copy: Record<string, unknown> = { ...part };
      delete copy.ties;
      return copy;
    });

    const result = deserializeScore(
      JSON.stringify({ ...current, schemaVersion: 1, parts }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(true);
      expect(result.score.schemaVersion).toBe(2);
      expect(result.score.parts[0].ties).toEqual([]);
    }
  });

  it("rejects invalid JSON", () => {
    const result = deserializeScore("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_JSON");
  });

  it("rejects a non-score shape", () => {
    const result = deserializeScore(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_SHAPE");
  });

  it("rejects an unsupported schema version", () => {
    const score = fourNoteScore();
    const result = deserializeScore(
      JSON.stringify({ ...score, schemaVersion: 999 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNSUPPORTED_SCHEMA");
  });

  it("rejects a corrupt score and reports validation codes", () => {
    const result = deserializeScore(serializeScore(scoreWithZeroDuration()));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_SCORE");
      expect(result.message).toContain("INVALID_DURATION");
    }
  });
});
