import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4b5be8",
    icons: [
      // TODO: 브랜드 확정 후 실제 아이콘으로 교체
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
