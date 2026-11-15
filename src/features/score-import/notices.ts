import type { ImportNotice, ImportNoticeCode } from "@/domain/score";

const MEASURES_SHOWN = 5;

function where(measures: readonly string[]): string {
  if (measures.length === 0) return "";
  const shown = measures.slice(0, MEASURES_SHOWN).join(", ");
  const rest = measures.length - MEASURES_SHOWN;
  return ` (${shown}마디${rest > 0 ? ` 외 ${rest}곳` : ""})`;
}

const SENTENCES: Readonly<Record<ImportNoticeCode, (notice: ImportNotice) => string>> = {
  LOWER_STAFF_DROPPED: (n) => `아래 단(왼손) 음 ${n.count}개를 가져오지 않았습니다${where(n.measures)}`,
  CHORD_NOTES_DROPPED: (n) => `같이 울리는 음 가운데 가장 높은 음만 남기고 ${n.count}개를 뺐습니다${where(n.measures)}`,
  OVERLAP_TRUNCATED: (n) => `겹쳐 울리는 음 ${n.count}개를 높은 음 기준으로 줄였습니다${where(n.measures)}`,
  ROUNDED_TO_GRID: (n) => `음 ${n.count}개의 박자를 16분음표 단위로 다듬었습니다${where(n.measures)}`,
  DROPPED_ZERO_LENGTH: (n) => `16분음표보다 짧은 음 ${n.count}개를 뺐습니다${where(n.measures)}`,
  GRACE_DROPPED: (n) => `꾸밈음 ${n.count}개를 뺐습니다${where(n.measures)}`,
  CUE_DROPPED: (n) => `작은 음표(큐) ${n.count}개를 뺐습니다${where(n.measures)}`,
  PITCH_UNSUPPORTED: (n) => `표기할 수 없는 음 ${n.count}개를 뺐습니다${where(n.measures)}`,
  TIME_SIGNATURE_CHANGED: (n) => `중간에 바뀌는 박자${where(n.measures)}는 첫 박자로 마디를 다시 나눴습니다`,
  KEY_CHANGED: (n) => `중간에 바뀌는 조표${where(n.measures)}는 첫 조표로 표시했습니다. 음높이는 그대로입니다`,
  MODE_AS_MAJOR: (n) => `선법(${n.detail ?? "알 수 없음"})은 같은 조표의 장조로 표시했습니다`,
  TEMPO_CLAMPED: (n) => `템포 ${n.detail ?? ""}은 20–400 BPM 범위로 맞췄습니다`,
  TEMPO_CHANGED: (n) => `중간에 바뀌는 템포${where(n.measures)}는 첫 템포로 통일했습니다`,
  PICKUP_PADDED: () => "못갖춘마디는 앞을 쉼표로 채워 온마디로 만들었습니다",
  REPEATS_IGNORED: (n) => `도돌이표·반복 괄호 ${n.count}개는 가져오지 않았습니다(반복을 펼치지 않음)`,
  LYRICS_IGNORED: (n) => `가사 ${n.count}개는 가져오지 않았습니다`,
  DIRECTIONS_IGNORED: (n) => `셈여림·아티큘레이션 같은 표시 ${n.count}개는 가져오지 않았습니다`,
};

/** One Korean line per notice (Phase 8 step 2): what the import changed or left out, and where. */
export function describeImportNotice(notice: ImportNotice): string {
  return SENTENCES[notice.code](notice);
}
