import type { Score } from "@/domain/score/types";
import { SCORE_SCHEMA_VERSION } from "@/domain/score/constants";
import { validateScore } from "@/domain/score/validate";

export type DeserializeErrorCode =
  | "INVALID_JSON"
  | "INVALID_SHAPE"
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_SCORE";

export type DeserializeResult =
  | { ok: true; score: Score }
  | { ok: false; code: DeserializeErrorCode; message: string };

export function serializeScore(score: Score): string {
  return JSON.stringify(score);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasScoreShape(value: unknown): value is Score {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.schemaVersion === "number" &&
    typeof value.title === "string" &&
    typeof value.tempoBpm === "number" &&
    Array.isArray(value.parts) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

/**
 * 저장/불러오기·import 경계의 검증 진입점.
 * 미지원 버전이나 손상 데이터는 거부하고 원본 문자열을 보존한다(덮어쓰기 금지).
 */
export function deserializeScore(raw: string): DeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      code: "INVALID_JSON",
      message: "JSON 파싱에 실패했습니다.",
    };
  }

  if (!hasScoreShape(parsed)) {
    return {
      ok: false,
      code: "INVALID_SHAPE",
      message: "Score 구조가 아닙니다.",
    };
  }

  if (parsed.schemaVersion !== SCORE_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA",
      message: `지원하지 않는 schemaVersion 입니다 (${parsed.schemaVersion}, 지원 ${SCORE_SCHEMA_VERSION}).`,
    };
  }

  const issues = validateScore(parsed);
  if (issues.length > 0) {
    return {
      ok: false,
      code: "INVALID_SCORE",
      message: issues.map((issue) => issue.code).join(","),
    };
  }

  return { ok: true, score: parsed };
}
