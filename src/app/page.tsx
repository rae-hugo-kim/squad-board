import { redirect } from "next/navigation";

/** 루트는 1단계의 메인 화면인 멤버 선호로 보낸다. 로그인 가드는 proxy가 처리. */
export default function Home() {
  redirect("/prefs");
}
