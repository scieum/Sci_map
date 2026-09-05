import Link from "next/link";
import { EmptyState, Screen, ScreenTitle } from "@/components/ui";

export default function ItemsPage() {
  return (
    <Screen>
      <ScreenTitle>문제</ScreenTitle>
      <EmptyState
        art="empty-items"
        title="기출 문항은 로그인한 우리 반 학생에게만 열려요. 문항 데이터가 준비되면 여기서 풀 수 있어요."
        action={
          <Link
            href="/"
            className="rounded-full bg-primary-50 px-5 py-2.5 text-[14px] font-bold text-primary-600"
          >
            오늘의 학습으로
          </Link>
        }
      />
    </Screen>
  );
}
