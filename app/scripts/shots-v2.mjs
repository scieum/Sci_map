// 시안 v2 확인용 스크린샷 — node scripts/shots-v2.mjs [outDir]
// shots.mjs 와 같은 요령이지만 이번에 바뀐 화면만, 모바일(390x844) 한 벌로 찍는다.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "shots";
mkdirSync(out, { recursive: true });
const routes = [
  ["home", "/"],
  ["concepts", "/concepts"],
  ["card", "/concepts/bio-characteristic-of-organism"],
  ["recall", "/concepts/bio-characteristic-of-organism/recall"],
  ["run", "/today/run?kind=ox"],
  ["items", "/items"],
  ["unit", "/items/mate/mate-1"],
  ["me", "/me"],
  ["map", "/map"],
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
for (const [name, path] of routes) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${name}.png`);
}
await browser.close();
