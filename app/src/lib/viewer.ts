"use client";

import { useEffect, useState } from "react";
import { ANONYMOUS, MEDIA_REQUIRES_LOGIN, type Viewer } from "@/lib/access";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * 지금 사용자의 자격 — 로그인 여부와 초대 코드 보유.
 *
 * 스위치가 내려가 있으면(지금) 아무것도 조회하지 않는다. 판정에 쓰이지 않는 값을
 * 위해 매 화면에서 세션과 프로필을 읽을 이유가 없다. 스위치를 켜는 순간부터
 * 조회가 시작된다.
 */
export function useViewer(): Viewer {
  const [viewer, setViewer] = useState<Viewer>(ANONYMOUS);

  useEffect(() => {
    if (!MEDIA_REQUIRES_LOGIN || !isSupabaseConfigured()) return;
    const sb = supabase();
    let alive = true;

    const read = async (userId: string | undefined) => {
      if (!userId) {
        if (alive) setViewer(ANONYMOUS);
        return;
      }
      const { data } = await sb
        .from("profiles")
        .select("invite_code")
        .eq("id", userId)
        .maybeSingle();
      if (alive) setViewer({ signedIn: true, hasInvite: Boolean(data?.invite_code) });
    };

    void sb.auth.getSession().then(({ data }) => read(data.session?.user.id));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) =>
      void read(session?.user.id),
    );
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return viewer;
}
