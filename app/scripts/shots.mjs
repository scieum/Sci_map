// UI 확인용 스크린샷 스크립트 — node scripts/shots.mjs [outDir]
// 모바일(390x844) + 태블릿(834x1194) 뷰포트로 주요 화면 캡처
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "shots";
const routes = [
  ["home", "/"],
  ["concepts", "/concepts"],
  ["card", "/concepts/chem-vapor-pressure"],
  ["recall", "/concepts/chem-vapor-pressure/recall"],
  ["run", "/today/run"],
];
const viewports = [
  ["m", { width: 390, height: 844 }],
  ["t", { width: 834, height: 1194 }],
];

const browser = await chromium.launch();
for (const [vp, viewport] of viewports) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  for (const [name, path] of routes) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${name}-${vp}.png` });
    console.log(`${name}-${vp}.png`);
  }
  await page.close();
}
await browser.close();
