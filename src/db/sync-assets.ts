import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { agents, maps, type AbilityKind } from "./schema";
import { SEED_AGENTS } from "./seed-data";
import { API_BASE, mapAgent, mapMap, type ApiAgent, type ApiMap } from "@/lib/assets/valorant-api";
import { createLogger, errorMeta } from "@/lib/logger";

/**
 * 공식 에셋 동기화 — `npm run assets:sync` (배포 빌드의 deploy.ts도 호출)
 *
 * 하는 일: 맵(미니맵·스플래시·콜아웃)과 요원(한국어 이름·아이콘·초상·스킬 아이콘)을 공식 데이터에서 받아
 * maps/agents 행을 slug 기준으로 upsert 한다. 새 요원·맵이 나오면 자동으로 추가된다.
 * 하지 않는 일: 이미지를 저장소에 내려받지 않는다 — URL만 저장하고 브라우저가 Riot 원본 CDN에서 읽는다.
 * 실패해도 앱은 자리표시자(public/maps/*.svg, 이니셜 토큰)로 동작하므로, 호출 측은 경고로 처리한다.
 */
const log = createLogger("assets");

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const body = (await res.json()) as { status: number; data: T };
  return body.data;
}

/** 수기 표(seed-data)의 스킬 유형을 slug·키로 찾는다. 모르면 "other". */
function kindLookup(slug: string): (key: string) => AbilityKind {
  const seed = SEED_AGENTS.find((a) => a.slug === slug);
  return (key) => seed?.abilities?.find((ab) => ab.key === key)?.kind ?? (key === "x" ? "ult" : "other");
}

export async function syncMaps(): Promise<number> {
  const [en, ko] = await Promise.all([getJson<ApiMap[]>("/maps?language=en-US"), getJson<ApiMap[]>("/maps?language=ko-KR")]);
  const koById = new Map(ko.map((m) => [m.uuid, m]));
  let count = 0;
  for (const m of en) {
    const row = mapMap(m, koById.get(m.uuid));
    if (!row) continue;
    const existing = await db.select({ id: maps.id, sortOrder: maps.sortOrder }).from(maps).where(eq(maps.slug, row.slug)).get();
    const patch = { nameKo: row.nameKo, nameEn: row.nameEn, imagePath: row.imagePath, splashUrl: row.splashUrl, listIconUrl: row.listIconUrl, callouts: row.callouts };
    if (existing) await db.update(maps).set(patch).where(eq(maps.id, existing.id));
    else {
      const maxOrder = (await db.select({ sortOrder: maps.sortOrder }).from(maps)).reduce((mx, r) => Math.max(mx, r.sortOrder), -1);
      // 새 맵은 맵 풀 밖으로 시작한다 — 포함 여부는 관리자가 정한다
      await db.insert(maps).values({ id: randomUUID(), slug: row.slug, sites: ["A", "B"], inPool: false, sortOrder: maxOrder + 1, ...patch });
    }
    count += 1;
  }
  return count;
}

export async function syncAgents(): Promise<number> {
  const q = "/agents?isPlayableCharacter=true";
  const [en, ko] = await Promise.all([getJson<ApiAgent[]>(`${q}&language=en-US`), getJson<ApiAgent[]>(`${q}&language=ko-KR`)]);
  const koById = new Map(ko.map((a) => [a.uuid, a]));
  let count = 0;
  for (const a of en) {
    if (a.isPlayableCharacter === false) continue;
    const slug = mapAgent(a, undefined, () => "other").slug;
    const row = mapAgent(a, koById.get(a.uuid), kindLookup(slug));
    if (!row.roleGroup) {
      log.warn("agent skipped: unknown role", { slug: row.slug, role: a.role?.displayName });
      continue;
    }
    const existing = await db.select({ id: agents.id }).from(agents).where(eq(agents.slug, row.slug)).get();
    const patch = { nameKo: row.nameKo, nameEn: row.nameEn, roleGroup: row.roleGroup, iconUrl: row.iconUrl, portraitUrl: row.portraitUrl, abilities: row.abilities };
    if (existing) await db.update(agents).set(patch).where(eq(agents.id, existing.id));
    else {
      const maxOrder = (await db.select({ sortOrder: agents.sortOrder }).from(agents)).reduce((mx, r) => Math.max(mx, r.sortOrder), -1);
      await db.insert(agents).values({ id: randomUUID(), slug: row.slug, sortOrder: maxOrder + 1, ...patch });
      log.info("new agent added from official data", { slug: row.slug });
    }
    count += 1;
  }
  return count;
}

/** 둘 다 시도하고 결과를 돌려준다. 예외는 호출 측이 처리(CLI는 exit 1, 배포는 경고). */
export async function syncAssets(): Promise<{ maps: number; agents: number }> {
  const m = await syncMaps();
  const a = await syncAgents();
  log.info("official assets synced", { maps: m, agents: a });
  return { maps: m, agents: a };
}

if (process.argv[1] && /sync-assets\.ts$/.test(process.argv[1])) {
  syncAssets()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error("assets sync failed", errorMeta(err));
      process.exit(1);
    });
}
