import type { Score } from "@/domain/score/types";
import {
  MIGRATABLE_SCHEMA_VERSIONS,
  SCORE_SCHEMA_VERSION,
} from "@/domain/score/constants";
import { validateScore } from "@/domain/score/validate";

export type DeserializeErrorCode =
  | "INVALID_JSON"
  | "INVALID_SHAPE"
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_SCORE";

export type DeserializeResult =
  | { ok: true; score: Score; migrated: boolean }
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
 * v1 → v2: 각 part에 `ties: []`를 추가한다.
 * v1에는 연결 정보가 존재하지 않으므로 빈 배열이 정보 손실 없는 정확한 변환이다(ADR-009).
 */
function migrateToCurrentVersion(
  score: Record<string, unknown>,
): Record<string, unknown> {
  const parts = Array.isArray(score.parts)
    ? score.parts.map((part) => {
        if (!isRecord(part)) return part;
        return { ...part, ties: Array.isArray(part.ties) ? part.ties : [] };
      })
    : score.parts;

  return { ...score, schemaVersion: SCORE_SCHEMA_VERSION, parts };
}

/**
 * 저장/불러오기·import 경계의 검증 진입점.
 * 구버전은 마이그레이션하고, 손상 데이터나 미지원 버전은 거부한다(원본 문자열 보존).
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

  const persistedVersion = parsed.schemaVersion;
  const migrated = (
    MIGRATABLE_SCHEMA_VERSIONS as readonly number[]
  ).includes(persistedVersion);
  const candidate = migrated
    ? migrateToCurrentVersion(parsed as unknown as Record<string, unknown>)
    : parsed;

  if (candidate.schemaVersion !== SCORE_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA",
      message: `지원하지 않는 schemaVersion 입니다 (${persistedVersion}, 지원 ${SCORE_SCHEMA_VERSION}).`,
    };
  }

  const score = candidate as Score;
  const issues = validateScore(score);
  if (issues.length > 0) {
    return {
      ok: false,
      code: "INVALID_SCORE",
      message: issues.map((issue) => issue.code).join(","),
    };
  }

  return { ok: true, score, migrated };
}
