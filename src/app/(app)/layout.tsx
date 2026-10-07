import { requireMember } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { RiotNotice } from "@/components/riot-notice";

/**
 * 로그인 이후 화면의 공통 레이아웃. proxy가 쿠키를 1차로 거르고,
 * 여기서 requireMember()가 멤버 존재·활성 여부를 확정한다.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav me={{ nickname: me.nickname, color: me.color, role: me.role }} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <RiotNotice />
    </div>
  );
}
