import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 리포가 OneDrive 폴더 안에 있고 홈 디렉터리(C:\Users\Owner)에 무관한
  // package-lock.json 이 놓여 있어, Turbopack 이 루트를 홈으로 추론하고
  // node_modules 를 거기서 찾다 실패한다(@tailwindcss/postcss 미해결 → 전 라우트 500).
  // 루트를 이 앱 디렉터리로 고정한다.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
