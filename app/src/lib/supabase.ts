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
        // 리디렉트로 돌아오는 로그인이 없다 — 아이디·비밀번호뿐이다
        // (2026-09-07 교사 결정, docs/login_design.md). URL 에서 주울 코드가
        // 없으므로 꺼 둔다
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** 프로필 행 (= 설계서 students). 실명은 받지 않는다 — 학번 별칭만 (R13) */
export interface Profile {
  id: string;
  /** 로그인 아이디. auth 의 메일 자리에는 이것으로 만든 합성 주소가 들어간다 */
  username: string | null;
  /** 비밀번호를 잊었을 때만 쓰는 진짜 메일 주소 (account.ts) */
  recovery_email: string | null;
  sido_code: string | null;
  sido: string | null;
  sigungu: string | null;
  school_kind: string | null;
  school_code: string | null;
  school_name: string | null;
  nickname: string | null;
  grade: 1 | 2 | 3 | null;
  semester: 1 | 2 | null;
  subjects: string[];
  invite_code: string | null;
  consent_version: string | null;
  consent_at: string | null;
}
