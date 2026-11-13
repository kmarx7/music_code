"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ScoreSummary } from "@/application";
import { createNewScore, exportScoreBackup, importScoreBackup, listScores } from "@/application";
import { downloadScoreJson } from "@/adapters/file-export/json";
import { getScoreRepository } from "@/adapters/indexeddb";
import { formatDate } from "@/shared";
import { StoragePersistence } from "@/features/score-library";

const page: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: 24,
  fontFamily:
    "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif",
};

const button: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #c8cfdb",
  background: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
};

const primary: React.CSSProperties = {
  ...button,
  background: "#1b2a4a",
  border: "1px solid #1b2a4a",
  color: "#ffffff",
};

const panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d9dee8",
  borderRadius: 10,
  padding: 16,
};

export default function LibraryPage() {
  const router = useRouter();
  const [scores, setScores] = useState<ScoreSummary[] | null>(null);
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setScores(await listScores(getScoreRepository()));
    } catch {
      setMessage("악보 목록을 불러오지 못했습니다.");
      setScores([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listScores(getScoreRepository())
      .then((items) => {
        if (active) setScores(items);
      })
      .catch(() => {
        if (active) {
          setScores([]);
          setMessage("악보 목록을 불러오지 못했습니다.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleCreate() {
    const id = crypto.randomUUID();
    try {
      await createNewScore(getScoreRepository(), { id, createdAt: new Date().toISOString() });
      router.push(`/editor/${id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "새 악보를 저장하지 못했습니다. JSON 백업 후 다른 탭을 닫고 다시 시도해 주세요.");
    }
  }

  async function handleDelete(id: string, revision: number) {
    if (!window.confirm("이 악보를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await getScoreRepository().delete(id, revision);
      await refresh();
      setMessage("삭제했습니다.");
    } catch {
      setMessage("삭제하지 못했습니다. 다른 탭의 변경 여부를 확인하고 목록을 새로 열어 주세요.");
    }
  }

  async function handleBackup(id: string) {
    try {
      const score = await getScoreRepository().load(id);
      if (!score) throw new Error("악보를 불러오지 못했습니다.");
      downloadScoreJson(exportScoreBackup(score));
      setMessage("JSON 백업을 다운로드했습니다.");
    } catch {
      setMessage("JSON 백업을 만들지 못했습니다.");
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    setMessage("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("5MB 이하의 JSON 파일을 선택해 주세요.");
      const result = await importScoreBackup(getScoreRepository(), await file.text(), {
        id: crypto.randomUUID(), importedAt: new Date().toISOString(),
      });
      await refresh();
      setMessage(`${result.migrated ? "v1 악보를 v2로 변환하여 " : ""}새 악보로 가져왔습니다. 기존 악보는 유지됩니다.`);
    } catch (error) {
      setMessage(`가져오기 실패: ${error instanceof Error ? error.message : "파일을 읽거나 저장하지 못했습니다."}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <main style={page}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/" style={{ fontSize: 13, color: "#1b2a4a" }}>
          ← 홈
        </Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>악보함</h1>
        <button type="button" style={primary} onClick={() => void handleCreate()}>
          새 악보
        </button>
      </div>

      <div style={{ ...panel, marginBottom: 16 }}>
        <label htmlFor="score-import">JSON 가져오기 (새 악보로 저장, 최대 5MB)</label>
        <input id="score-import" type="file" accept=".json,application/json" disabled={importing}
          style={{ display: "block", maxWidth: "100%", marginTop: 8 }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void handleImport(file);
          }} />
        {importing ? <p role="status">가져오는 중…</p> : null}
      </div>

      {message ? (
        <p role="status" style={{ color: "#5f6773", fontSize: 13 }}>{message}</p>
      ) : null}

      <div style={panel}>
        {scores === null ? (
          <p style={{ fontSize: 13, color: "#5f6773" }}>불러오는 중…</p>
        ) : scores.length === 0 ? (
          <p style={{ fontSize: 13, color: "#5f6773" }}>
            저장된 악보가 없습니다. “새 악보”로 시작하세요.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {scores.map((score) => (
              <li
                key={score.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  border: "1px solid #d9dee8",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/editor/${score.id}`}
                    style={{ fontSize: 14, color: "#1b2a4a", fontWeight: 600, overflowWrap: "anywhere" }}
                  >
                    {score.title}
                  </Link>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#5f6773" }}>
                    {formatDate(score.updatedAt)}
                  </p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button type="button" style={button} onClick={() => void handleBackup(score.id)}>
                    JSON 백업
                  </button>
                  <Link
                    href={`/editor/${score.id}`}
                    style={{ ...button, textDecoration: "none", color: "#1c1f26" }}
                  >
                    열기
                  </Link>
                  <button
                    type="button"
                    style={button}
                    onClick={() => void handleDelete(score.id, score.revision)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: "#5f6773" }}>
        악보는 이 브라우저(IndexedDB)에만 저장됩니다. 브라우저 데이터를 삭제하면 악보도 사라집니다.
      </p>
      <StoragePersistence />
    </main>
  );
}
