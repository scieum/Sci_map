import artData from "@/data/art.json";

/**
 * 이미지 자리(아트 슬롯).
 *
 * 이모지를 걷어낸 자리다. `src/data/art.json` 의 `file` 이 비어 있는 동안에는
 * **아무것도 그리지 않는다** — 깨진 이미지 아이콘이 뜨는 것보다 낫다.
 * 이미지를 만들어 `public/art/` 에 넣고 art.json 의 `file` 에 파일명을 적으면
 * 그 자리에 나타난다. 목록은 `docs/art_assets.md` (art.json 에서 생성).
 */

type Slot = {
  id: string;
  file: string | null;
  px: number;
  alt: string;
  emoji: string;
};

const SLOTS: Record<string, Slot> = Object.fromEntries(
  (artData.slots as Slot[]).map((s) => [s.id, s]),
);

export type ArtName = string;

export function Art({
  name,
  px,
  className = "",
}: {
  name: ArtName;
  /** 레지스트리의 기본 크기를 덮어쓴다 */
  px?: number;
  className?: string;
}) {
  const slot = SLOTS[name];
  if (!slot || !slot.file) return null;

  const size = px ?? slot.px;
  const decorative = slot.alt === "";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/art/${slot.file}`}
      alt={slot.alt}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** 채워진 슬롯이 하나라도 있는지 — 레이아웃 분기용 */
export function hasArt(name: ArtName): boolean {
  return Boolean(SLOTS[name]?.file);
}
