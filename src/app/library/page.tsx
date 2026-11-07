"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ScoreSummary } from "@/application";
import { createNewScore, listScores } from "@/application";
import { getScoreRepository } from "@/adapters/indexeddb";
import { formatDate } from "@/shared";

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
    await createNewScore(getScoreRepository(), {
      id,
      createdAt: new Date().toISOString(),
    });
    router.push(`/editor/${id}`);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 악보를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await getScoreRepository().delete(id);
      await refresh();
      setMessage("삭제했습니다.");
    } catch {
      setMessage("삭제하지 못했습니다.");
    }
  }

  return (
    <main style={page}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/" style={{ fontSize: 13, color: "#1b2a4a" }}>
          ← 홈
        </Link>
        <h1 style={{ fontSize: 20, margin: 0 }}>악보함</h1>
        <button type="button" style={primary} onClick={() => void handleCreate()}>
          새 악보
        </button>
      </div>

      {message ? (
        <p style={{ color: "#5f6773", fontSize: 13 }}>{message}</p>
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
                    style={{ fontSize: 14, color: "#1b2a4a", fontWeight: 600 }}
                  >
                    {score.title}
                  </Link>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#5f6773" }}>
                    {formatDate(score.updatedAt)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link
                    href={`/editor/${score.id}`}
                    style={{ ...button, textDecoration: "none", color: "#1c1f26" }}
                  >
                    열기
                  </Link>
                  <button
                    type="button"
                    style={button}
                    onClick={() => void handleDelete(score.id)}
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
    </main>
  );
}
