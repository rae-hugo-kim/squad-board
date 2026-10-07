import { redirect } from "next/navigation";
import { listMaps } from "@/server/queries/prefs";

export const dynamic = "force-dynamic";

/** /tactics 는 맵 풀의 첫 맵으로 보낸다 (멤버 선호와 같은 규칙). */
export default async function TacticsIndex() {
  const all = await listMaps();
  const first = all.find((m) => m.inPool) ?? all[0];
  if (!first) redirect("/prefs");
  redirect(`/tactics/${first.slug}`);
}
