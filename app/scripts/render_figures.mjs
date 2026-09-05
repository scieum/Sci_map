// 자체 제작 SVG 그림을 PNG 로 렌더한다 — 눈으로 확인하기 위한 용도.
//
// SVG 는 텍스트라서 파싱만으로는 "잘 그려졌는지"를 알 수 없다. 글자가 겹치거나
// 도형 밖으로 삐져나가는 것은 그려 봐야 보인다.
//
//   node app/scripts/render_figures.mjs [outDir]
//
// 기본 출력: app/public/media/own/_preview/<id>.png + _sheet.png (세로 이어 붙임)
import { chromium } from "playwright";
import { readdirSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "..", "public", "media", "own");
const outDir = process.argv[2] ?? join(srcDir, "_preview");
mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith(".svg")).sort();
if (!files.length) {
  console.error("SVG 가 없다:", srcDir);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
const shots = [];

for (const f of files) {
  const svg = readFileSync(join(srcDir, f), "utf-8");
  // 카드와 같은 흰 바탕 위에 얹어야 실제로 보이는 대로 확인된다
  await page.setContent(
    `<body style="margin:0;background:#fff">
       <div style="width:800px">${svg}</div>
     </body>`,
    { waitUntil: "load" },
  );
  const el = await page.$("div");
  const png = join(outDir, f.replace(/\.svg$/, ".png"));
  await el.screenshot({ path: png });
  shots.push([f, png]);
  console.log("렌더:", f);
}

// 한 장으로 이어 붙여 한눈에 본다
const items = shots.map(([name, p]) => ({
  name,
  data: `data:image/png;base64,${readFileSync(p).toString("base64")}`,
}));
await page.setContent(
  `<body style="margin:0;background:#fff;font:14px system-ui">
     ${items
       .map(
         (i) =>
           `<div style="padding:6px 0 14px">
              <div style="color:#b00;font-weight:700;padding:2px 4px">${i.name}</div>
              <img src="${i.data}" style="display:block;width:800px">
            </div>`,
       )
       .join("")}
   </body>`,
  { waitUntil: "load" },
);
const sheet = join(outDir, "_sheet.png");
await page.screenshot({ path: sheet, fullPage: true });
await browser.close();

console.log(`\n=> ${files.length}장 · 컨택트 시트: ${sheet}`);
