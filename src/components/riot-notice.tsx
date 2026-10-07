/**
 * Riot Games 팬 콘텐츠 고지 — 공식 에셋(맵·요원·스킬 이미지)을 쓰는 비상업 팬 프로젝트에 요구되는 문구.
 * 로그인 화면과 앱 레이아웃 하단에 둔다.
 */
export function RiotNotice() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 py-4 text-[11px] leading-relaxed text-muted sm:px-6">
      Squad Board는 Riot Games의 승인을 받지 않았으며 Riot Games 또는 VALORANT 제작·관리에 공식적으로 관여한 어떤 개인·단체의 견해나 의견을
      반영하지 않습니다. VALORANT와 Riot Games는 Riot Games, Inc.의 상표 또는 등록 상표입니다. 맵·요원·스킬 이미지는 Riot Games의 자산이며
      소모임 내부 비상업 용도로만 표시합니다.
    </footer>
  );
}
