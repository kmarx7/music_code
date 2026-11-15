"use client";

import { Suspense, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { NoteLabelMode } from "@/domain/music-theory";
import { getScoreRepository } from "@/adapters/indexeddb";
import { PrintView } from "@/features/export";

function labelModeOf(value: string | null): NoteLabelMode {
  return value === "letter" || value === "fixed-do" ? value : "none";
}

/** Read-only print view. It reads the stored score and never creates, saves or deletes one. */
export default function PrintPage() {
  return <Suspense fallback={<p>인쇄 화면 준비 중…</p>}><PrintRoute /></Suspense>;
}

function PrintRoute() {
  const params = useParams<{ scoreId: string }>();
  const search = useSearchParams();
  const scoreId = params?.scoreId ?? "";
  const repository = getScoreRepository();
  const load = useCallback(() => repository.load(scoreId), [repository, scoreId]);
  return <PrintView key={scoreId} load={load} labelMode={labelModeOf(search?.get("labels") ?? null)}
    tuningId={search?.get("tuning") ?? null} />;
}
