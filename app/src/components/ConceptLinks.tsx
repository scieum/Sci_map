import Link from "next/link";
import { conceptById } from "@/data/concepts";
import type { ConceptLink, LinkType } from "@/lib/types";

/**
 * 연결된 개념 — 링크 4종을 한 카드 안에 한 줄씩 쌓는다.
 *
 * 칩을 한 줄에 몰아 흘리면(옛 구현) 6개까지 줄바꿈돼 어디가 선수이고 어디가
 * 다음인지 형태로 구분되지 않았고, `related` 의 `note`("PV = nRT의 T 자리에
 * 들어가는 온도다")는 렌더되지도 않았다. 그 note 가 링크의 존재 이유이므로
 * 버리지 않고 표제어 아래에 붙인다.
 *
 * 배지를 왼쪽 고정 폭 열로 세우면 같은 종류가 세로로 정렬돼, 그룹 머리글 없이도
 * 묶여 보인다. 머리글 행을 넣지 않는 편이 카드가 조용하다.
 */

const ROLE: Record<
  LinkType,
  { badge: string; before?: string; after?: string; cls: string }
> = {
  // 셋이 서로 다른 색이어야 한다. 먼저와 관련이 둘 다 회색이던 때에는
  // 배지가 붙어 있어도 어느 쪽이 선수인지 형태로 구분되지 않았다.
  // 색(회색·인디고·민트, Design.md §2.2)에 더해 화살표가 방향을 말한다 (D4) —
  // 먼저는 테두리만 있는 칩 + ←, 다음은 틴트 칩 + →, 곁가지는 민트 칩.
  prereq: { badge: "먼저", before: "←", cls: "bg-surface text-ink-sub ring-1 ring-inset ring-line" },
  next: { badge: "다음", after: "→", cls: "bg-primary-50 text-primary-700" },
  same: { badge: "연계", before: "↔", cls: "bg-info-bg text-info" },
  related: { badge: "관련", cls: "bg-info-bg text-info" },
};

/** 화면에 쌓는 순서 — 배우는 순서(선수 → 다음)를 먼저 두고 곁가지를 뒤에 둔다. */
const ORDER: LinkType[] = ["prereq", "next", "same", "related"];

export function ConceptLinks({ links }: { links: ConceptLink[] }) {
  const rows = links
    .map((l) => ({ link: l, target: conceptById(l.target) }))
    .filter((r) => r.target)
    .sort((a, b) => ORDER.indexOf(a.link.type) - ORDER.indexOf(b.link.type));

  if (rows.length === 0) return null;

  return (
    <div className="divide-y divide-line overflow-hidden rounded-[24px] bg-surface shadow-card">
      {rows.map(({ link, target }) => {
        const role = ROLE[link.type];
        return (
          <Link
            key={`${link.type}-${link.target}`}
            href={`/concepts/${target!.id}`}
            className="flex items-start gap-3 px-4 py-3.5 active:bg-bg-subtle"
          >
            <span
              className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${role.cls}`}
            >
              {role.before && <span aria-hidden>{role.before}</span>}
              {role.badge}
              {role.after && <span aria-hidden>{role.after}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug">
                {target!.term}
              </span>
              {link.note && (
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-sub">
                  {link.note}
                </span>
              )}
            </span>
            <span
              aria-hidden
              className="mt-0.5 shrink-0 text-[15px] text-ink-faint"
            >
              ›
            </span>
          </Link>
        );
      })}
    </div>
  );
}
