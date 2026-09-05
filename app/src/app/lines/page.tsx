import Link from "next/link";
import { EmptyState, Screen, ScreenTitle } from "@/components/ui";

export default function LinesPage() {
  return (
    <Screen>
      <ScreenTitle>노선</ScreenTitle>
      <EmptyState
        art="empty-lines"
        title="타이핑 노선(SciMetro)이 이곳에 연결돼요. 코스를 완주하면 개념 카드 복습으로 기록돼요."
        action={
          <Link
            href="/concepts"
            className="rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
          >
            개념부터 학습하기
          </Link>
        }
      />
    </Screen>
  );
}
