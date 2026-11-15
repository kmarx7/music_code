"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createImportedScore } from "@/application";
import { getScoreRepository } from "@/adapters/indexeddb";
import { ImportFlow } from "@/features/score-import";

/** Score-file start (Phase 8 step 2, PRD `/import`). The score is first saved at "악보 만들기". */
export default function ImportPage() {
  const router = useRouter();
  return (
    <main className="hb-narrow" style={{ maxWidth: 720 }}>
      <Link href="/" className="hb-link">← 그만두기</Link>
      <div style={{ marginTop: 16 }}>
        <ImportFlow onCreate={async (input) => {
          const id = crypto.randomUUID();
          try {
            await createImportedScore(getScoreRepository(), { ...input, id, createdAt: new Date().toISOString(), nextId: () => crypto.randomUUID() });
          } catch {
            // The flow only enables "악보 만들기" for a score that already built, so a failure here is the storage.
            return "이 브라우저에 악보를 저장하지 못했습니다(사생활 보호 모드 또는 사이트 데이터 차단일 수 있습니다). 다시 시도해 주세요.";
          }
          router.push(`/editor/${id}`);
          return null;
        }} />
      </div>
    </main>
  );
}
