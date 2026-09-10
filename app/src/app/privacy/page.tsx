import { Card, Screen, ScreenTitle } from "@/components/ui";

/** 개인정보 처리방침 — 원본은 docs/privacy_notice.md. ★ 표시는 교사가 확정한다 */
export default function PrivacyPage() {
  return (
    <Screen>
      <ScreenTitle>개인정보 처리방침</ScreenTitle>
      <Card className="text-[14px] leading-relaxed">
        <p className="text-[12px] text-ink-faint">버전 2026-09-06.v1</p>
        <H>1. 수집하는 개인정보와 목적</H>
        <ul className="list-disc pl-5">
          <li>이메일 주소 — 로그인 링크 발송, 계정 식별</li>
          <li>학번 별칭 — 수업 안에서의 식별 (실명·전화번호·주소는 받지 않아요)</li>
          <li>학년·학기·수강 과목 — 학습 범위 설정과 오늘의 문항 출제</li>
          <li>학습 기록(문항 응답, 개념별 기억 상태, 출석일) — 복습 간격 계산</li>
        </ul>
        <H>2. 보유·이용 기간</H>
        <p>회원 탈퇴 시까지, 또는 해당 학년도 종료 후 1년까지. 이후 지체 없이 파기해요.</p>
        <H>3. 처리 위탁</H>
        <p>데이터베이스·인증은 Supabase Inc. 의 클라우드에 저장돼요. 구글 로그인을 쓰면 구글이 이메일 주소를 전달해요.</p>
        <H>4. 정보주체의 권리</H>
        <p>내 정보 화면에서 직접 수정·탈퇴할 수 있고, 열람·정정·삭제·처리정지는 담당 교사에게 요청할 수 있어요.</p>
        <H>5. 안전성 확보 조치</H>
        <p>행 단위 접근 제어(본인 기록만 접근), 전송 구간 암호화, 최소 수집. 광고·분석 도구는 쓰지 않아요.</p>
        <H>6. 만 14세 미만</H>
        <p>보호자(법정대리인)의 동의가 필요해요.</p>
        <H>7. 개인정보 보호책임자</H>
        <p>★ 담당 교사 (연락처는 수업에서 안내)</p>
      </Card>
    </Screen>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-4 text-[13px] font-bold text-ink-faint first:mt-0">{children}</p>;
}
