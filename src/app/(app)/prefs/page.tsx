import { redirect } from "next/navigation";
import { listMaps } from "@/server/queries/prefs";

export const dynamic = "force-dynamic";

/** /prefs 는 맵 풀의 첫 맵으로 보낸다. 맵 풀이 비어 있으면 전체 목록의 첫 맵. */
export default async function PrefsIndex() {
  const all = await listMaps();
  const first = all.find((m) => m.inPool) ?? all[0];
  if (!first) {
    return (
      <div className="card p-6 text-sm text-secondary">
        맵 데이터가 없습니다. 터미널에서 <code className="font-mono">npm run db:seed</code>를 실행하세요.
      </div>
    );
  }
  redirect(`/prefs/${first.slug}`);
}
