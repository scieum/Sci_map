"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 브라우저 클라이언트.
 *
 * 키가 없으면(`isSupabaseConfigured() === false`) 앱은 **로그인 없이 그대로 돈다** —
 * 카드 열람·문항 풀이·localStorage 기록 전부. 연결은 기록을 서버에 남기고
 * 기기를 바꿔도 이어지게 하는 층일 뿐, 없다고 학습이 막히면 안 된다 (D5).
 *
 * 키는 `.env.local`(로컬)과 Vercel 환경 변수에 둔다. anon key 는 공개해도 되는
 * 키다 — 권한은 RLS 가 정한다 (supabase/schema.sql).
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = (): boolean => Boolean(URL && KEY);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    if (!URL || !KEY) throw new Error("Supabase 가 설정되지 않았다 (.env.local)");
    client = createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // ★ URL 의 코드는 /me 가 직접 교환한다 (auth-callback.ts).
        //   supabase-js 에 맡기면(detectSessionInUrl: true) 교환이 실패해도
        //   콘솔에만 남고 화면에는 아무 말이 없다 — 학생은 링크를 눌렀는데
        //   로그아웃 상태인 이유를 알 수 없다. 실제로 그 상태였다.
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return client;
}

/** 프로필 행 (= 설계서 students). 실명은 받지 않는다 — 학번 별칭만 (R13) */
export interface Profile {
  id: string;
  nickname: string | null;
  grade: 1 | 2 | 3 | null;
  semester: 1 | 2 | null;
  subjects: string[];
  invite_code: string | null;
  consent_version: string | null;
  consent_at: string | null;
}
