"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { accentOfSubject, subjectAccent } from "@/lib/brand";

/**
 * 과목 고르기 — 알약 칩 줄을 대신하는 드롭다운.
 *
 * 칩 줄은 과목이 늘수록 옆으로 흘러 화면 밖으로 나갔다. 스크롤바가 있어도
 * 지금 몇 개 중 어디에 있는지 보이지 않는다. 고른 과목만 담기는 목록이라
 * 대개 두셋이지만, 접어 두면 개수와 무관하게 자리가 한 줄로 고정된다.
 *
 * 과목이 하나뿐이면 펼칠 것이 없으므로 이름표만 남긴다 — 눌러도 아무 일이
 * 없는 단추는 두지 않는다.
 */
export default function SubjectSelect({
  subjects,
  value,
  onChange,
}: {
  subjects: string[];
  value: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  // 바깥을 누르거나 Esc 를 누르면 닫는다. 펼친 동안에만 듣는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = (
    <span className="truncate text-[15px] font-bold text-white">{value}</span>
  );

  if (subjects.length <= 1) {
    return (
      <div className="mb-5">
        <span
          className={`inline-flex h-12 max-w-full items-center rounded-full px-5 ${subjectAccent(value)}`}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    // 폭은 과목 이름만큼만. 한 줄을 가로지르는 단추는 "여기서 무엇이든 고른다" 는
    // 신호가 너무 커서, 정작 아래 목차보다 눈에 먼저 든다
    <div ref={box} className="relative mb-5 w-fit max-w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-12 max-w-full items-center gap-2 rounded-full pl-5 pr-4 ${subjectAccent(value)}`}
      >
        {label}
        <span
          aria-hidden
          className={`shrink-0 text-white/80 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ⌄
        </span>
      </button>

      {/* 목록은 단추보다 넓어도 된다 — 가장 긴 과목 이름에 맞춘다. 다만 화면
          밖으로는 나가지 않게 좌우 여백만큼 뺀 폭을 상한으로 둔다 */}
      {open && (
        <ul
          role="listbox"
          aria-label="과목"
          className="absolute left-0 top-[calc(100%+8px)] z-30 w-max min-w-full max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-[20px] bg-surface p-1.5 shadow-[0_10px_30px_rgba(23,58,94,0.18)]"
        >
          {subjects.map((s) => {
            const on = s === value;
            const accent = accentOfSubject(s);
            return (
              <li key={s}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className={`flex min-h-[46px] w-full items-center justify-between rounded-2xl px-4 text-left text-[15px] active:bg-bg-subtle ${
                    on ? `${accent.tint} ${accent.text} font-bold` : "font-medium text-ink"
                  }`}
                >
                  {s}
                  {on && <span aria-hidden>✓</span>}
                </button>
              </li>
            );
          })}
          {/* 목록에 없는 과목을 보려면 수강 과목을 고쳐야 한다. 그 길을 여기서 가리킨다 */}
          <li className="border-t border-bg-subtle">
            <Link
              href="/me"
              className="flex min-h-[44px] items-center justify-between px-4 text-[13px] font-semibold text-ink-faint"
            >
              수강 과목 고치기
              <span aria-hidden>›</span>
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
