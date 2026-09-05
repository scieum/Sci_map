#!/usr/bin/env node
/**
 * src/data/art.json → docs/art_assets.md 생성.
 *
 * 목록을 손으로 관리하면 코드와 어긋난다. 레지스트리 하나를 원본으로 두고
 * 문서를 파생시킨다. 슬롯을 늘리거나 이미지를 채웠으면 다시 돌려라:
 *   node app/scripts/gen-art-doc.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const data = JSON.parse(
  readFileSync(resolve(here, "..", "src", "data", "art.json"), "utf-8"),
);

const slots = data.slots;
const done = slots.filter((s) => s.file).length;
const P = { 1: "높음", 2: "보통", 3: "낮음" };

/** 화면 등장 순서대로 묶는다 — 그리는 사람이 화면 단위로 훑을 수 있게 */
const ORDER = ["홈", "개념 카드", "인출 모드", "데일리 퀴즈", "퀴즈 결과", "지도 탭", "문제 탭", "노선 탭", "공통"];
const groups = new Map();
for (const s of slots) {
  const key = ORDER.find((o) => s.screen.startsWith(o)) ?? s.screen;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(s);
}
const ordered = [...groups.entries()].sort(
  (a, b) => (ORDER.indexOf(a[0]) + 1 || 99) - (ORDER.indexOf(b[0]) + 1 || 99),
);

const esc = (v) => String(v ?? "").replace(/\|/g, "\\|");

const out = [];
out.push("# 이미지 자산 목록 — 이모지 대체분");
out.push("");
out.push("> **이 파일은 생성물이다.** 손으로 고치지 말고 `app/src/data/art.json` 을 고친 뒤");
out.push("> `node app/scripts/gen-art-doc.mjs` 를 다시 돌려라.");
out.push("");
out.push(`앱에서 이모지를 전부 걷어냈다. 아래 **${slots.length}개 자리**가 비어 있고, 이미지를 넣으면 그 자리에 나타난다.`);
out.push(`현재 채워진 것 **${done} / ${slots.length}**.`);
out.push("");
out.push("## 넣는 법");
out.push("");
out.push("1. 이미지를 만들어 `app/public/art/` 에 넣는다 (파일명은 슬롯 id 를 쓰는 편이 헷갈리지 않는다: `streak-flame.png`).");
out.push("2. `app/src/data/art.json` 에서 그 슬롯의 `file` 을 `null` → `\"streak-flame.png\"` 로 바꾼다.");
out.push("3. 끝. 새로고침하면 보인다. `file` 이 `null` 인 동안에는 **아무것도 그리지 않는다** — 깨진 이미지 아이콘이 뜨지 않는다.");
out.push("");
out.push("## 만들 때 참고");
out.push("");
out.push("- **크기**는 표시되는 실제 픽셀이다. 2배(레티나)로 만들어 넣으면 선명하다.");
out.push("- **정사각 캔버스 + 투명 배경(PNG)** 을 기본으로 한다. `object-contain` 으로 들어가므로 여백이 있으면 그만큼 작아 보인다.");
out.push("- 히어로 장식(`daily-*`, `result-*`)은 **파란 배경(`--primary-500`, #189fe6) 위에 얹힌다.** 파란 계열 단색은 묻힌다.");
out.push("- `alt` 가 비어 있는 것은 **장식**이라 스크린 리더가 읽지 않는다. `alt` 가 있는 것은 뜻을 전달하므로 그림도 그 뜻이 읽혀야 한다.");
out.push("- `짝` 이 표시된 것들은 **같은 자리에서 교체되거나 나란히 놓인다.** 굵기·시점·채도를 맞춰야 한 세트로 보인다.");
out.push("");

for (const [screen, list] of ordered) {
  out.push(`## ${screen}`);
  out.push("");
  out.push("| 상태 | 슬롯 id | 원래 이모지 | 크기 | 자리 | 뜻 | 짝 | 우선순위 |");
  out.push("|---|---|---|---|---|---|---|---|");
  for (const s of list) {
    out.push(
      `| ${s.file ? "완료" : "**필요**"} | \`${s.id}\` | ${s.emoji} | ${s.px}px | ${esc(s.where)} | ${esc(s.meaning)} | ${s.set ? `\`${s.set}\`` : "—"} | ${P[s.priority] ?? s.priority} |`,
    );
  }
  out.push("");
}

/** 세트 요약 — 톤을 맞춰야 하는 묶음 */
const sets = new Map();
for (const s of slots) if (s.set) {
  if (!sets.has(s.set)) sets.set(s.set, []);
  sets.get(s.set).push(s.id);
}
if (sets.size) {
  out.push("## 한 세트로 맞춰야 하는 묶음");
  out.push("");
  out.push("나란히 놓이거나 같은 자리에서 교체되므로, 따로 그리면 티가 난다.");
  out.push("");
  out.push("| 묶음 | 슬롯 |");
  out.push("|---|---|");
  for (const [k, v] of sets) out.push(`| \`${k}\` | ${v.map((x) => `\`${x}\``).join(" · ")} |`);
  out.push("");
}

out.push("## 우선순위");
out.push("");
for (const [p, label] of Object.entries(P)) {
  const ids = slots.filter((s) => String(s.priority) === p && !s.file).map((s) => `\`${s.id}\``);
  if (ids.length) out.push(`- **${label}** (${ids.length}개) — ${ids.join(" · ")}`);
}
out.push("");
out.push("높음은 학생이 매일 보는 자리다. 낮음은 없어도 화면이 허전하지 않다.");
out.push("");

const target = resolve(repo, "docs", "art_assets.md");
writeFileSync(target, out.join("\n"), "utf-8");
console.log(`생성: docs/art_assets.md (${slots.length}개 슬롯, 완료 ${done})`);
