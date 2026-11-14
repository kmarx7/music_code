"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createTranscribedScore } from "@/application";
import { getScoreRepository } from "@/adapters/indexeddb";
import { HummingFlow } from "@/features/audio-recording";

/** Humming start (Phase 7 decision 2, PRD §4 `/record`). The score is first saved at step ④ "악보 만들기". */
export default function RecordPage() {
  const router = useRouter();
  return (
    <main className="hb-narrow" style={{ maxWidth: 720 }}>
      <Link href="/" className="hb-link">← 그만두기</Link>
      <div style={{ marginTop: 16 }}>
        <HummingFlow onCreate={async (setup, clipboard) => {
          const id = crypto.randomUUID();
          try {
            await createTranscribedScore(getScoreRepository(), { id, createdAt: new Date().toISOString(), setup, clipboard,
              nextId: () => crypto.randomUUID() });
          } catch {
            return "이 브라우저에 악보를 저장하지 못했습니다(사생활 보호 모드 또는 사이트 데이터 차단일 수 있습니다). 다시 시도해 주세요.";
          }
          router.push(`/editor/${id}`);
          return null;
        }} />
      </div>
    </main>
  );
}
