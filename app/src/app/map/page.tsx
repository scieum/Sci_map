import Link from "next/link";
import { EmptyState, Screen, ScreenTitle } from "@/components/ui";

export default function MapPage() {
  return (
    <Screen>
      <ScreenTitle>지도</ScreenTitle>
      <EmptyState
        art="empty-map"
        title="개념 그래프가 준비 중이에요. 카드가 쌓이면 개념 사이의 길이 여기에 그려져요."
        action={
          <Link
            href="/concepts"
            className="rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
          >
            개념 트리 둘러보기
          </Link>
        }
      />
    </Screen>
  );
}
