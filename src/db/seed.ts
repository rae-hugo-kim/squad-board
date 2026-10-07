import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { agents, maps, members } from "./schema";
import { mapImagePath, SEED_AGENTS, SEED_MAPS, SEED_TACTICIAN_NICKNAMES } from "./seed-data";
import { createLogger, errorMeta } from "@/lib/logger";

/**
 * 시드 스크립트 — `npm run db:seed`
 *
 * - 맵·요원: slug 기준 upsert. 이미 있으면 이름·역할군·사이트·스킬을 갱신하고 inPool은
 *   건드리지 않는다(운영 중 관리자가 토글한 값을 시드가 덮어쓰면 안 되기 때문).
 *   맵 이미지 경로는 비어 있을 때만 채운다 — 사용자가 실제 탑뷰로 바꾼 경로를 덮어쓰지 않기 위해.
 * - 초기 관리자: 멤버가 한 명도 없을 때만 SEED_ADMIN_NICKNAME(기본 "admin")으로 생성.
 *   첫 로그인 후 관리 화면에서 닉네임을 바꾸면 된다.
 * - 전술가: SEED_TACTICIAN_NICKNAMES 의 멤버를 만들거나(없을 때) 일반 → 전술가로 올린다. 관리자는 그대로.
 */
const log = createLogger("seed");

async function seedMaps() {
  for (const [i, m] of SEED_MAPS.entries()) {
    const existing = await db.select({ id: maps.id }).from(maps).where(eq(maps.slug, m.slug)).get();
    if (existing) {
      await db
        .update(maps)
        .set({ nameKo: m.nameKo, nameEn: m.nameEn, sites: m.sites, sortOrder: i })
        .where(eq(maps.id, existing.id));
      await db
        .update(maps)
        .set({ imagePath: mapImagePath(m.slug) })
        .where(and(eq(maps.id, existing.id), isNull(maps.imagePath)));
    } else {
      await db.insert(maps).values({
        id: randomUUID(),
        slug: m.slug,
        nameKo: m.nameKo,
        nameEn: m.nameEn,
        sites: m.sites,
        inPool: m.inPool,
        imagePath: mapImagePath(m.slug),
        sortOrder: i,
      });
    }
  }
  log.info("maps seeded", { count: SEED_MAPS.length });
}

async function seedAgents() {
  for (const [i, a] of SEED_AGENTS.entries()) {
    const existing = await db.select({ id: agents.id }).from(agents).where(eq(agents.slug, a.slug)).get();
    if (existing) {
      await db
        .update(agents)
        .set({ nameKo: a.nameKo, nameEn: a.nameEn, roleGroup: a.roleGroup, abilities: a.abilities ?? [], sortOrder: i })
        .where(eq(agents.id, existing.id));
    } else {
      await db.insert(agents).values({
        id: randomUUID(),
        slug: a.slug,
        nameKo: a.nameKo,
        nameEn: a.nameEn,
        roleGroup: a.roleGroup,
        abilities: a.abilities ?? [],
        sortOrder: i,
      });
    }
  }
  log.info("agents seeded", { count: SEED_AGENTS.length });
}

async function seedAdmin() {
  const any = await db.select({ id: members.id }).from(members).limit(1).get();
  if (any) {
    log.info("members exist, skip admin seed");
    return;
  }
  const nickname = process.env.SEED_ADMIN_NICKNAME?.trim() || "admin";
  await db.insert(members).values({
    id: randomUUID(),
    nickname,
    role: "admin",
    color: "#7b8cff",
  });
  log.info("admin member created", { nickname });
}

const TACTICIAN_COLORS = ["#c77dff", "#ffb454", "#2ee6d6"];

async function seedTacticians() {
  let created = 0;
  let promoted = 0;
  for (const [i, nickname] of SEED_TACTICIAN_NICKNAMES.entries()) {
    const existing = await db.select({ id: members.id, role: members.role }).from(members).where(eq(members.nickname, nickname)).get();
    if (!existing) {
      await db.insert(members).values({ id: randomUUID(), nickname, role: "tactician", color: TACTIC_COLOR(i) });
      created += 1;
    } else if (existing.role === "member") {
      await db.update(members).set({ role: "tactician", updatedAt: new Date().toISOString() }).where(eq(members.id, existing.id));
      promoted += 1;
    }
  }
  log.info("tacticians seeded", { created, promoted, total: SEED_TACTICIAN_NICKNAMES.length });
}
const TACTIC_COLOR = (i: number) => TACTICIAN_COLORS[i % TACTICIAN_COLORS.length];

/** 시드 본체. CLI(`npm run db:seed`)와 배포 빌드 단계(src/db/deploy.ts)가 같이 쓴다. */
export async function runSeed(): Promise<void> {
  await seedMaps();
  await seedAgents();
  await seedAdmin();
  await seedTacticians();
}

async function main() {
  try {
    await runSeed();
    log.info("seed complete");
    process.exit(0);
  } catch (err) {
    log.error("seed failed", errorMeta(err));
    process.exit(1);
  }
}

// `node --import tsx src/db/seed.ts`로 직접 실행했을 때만 main을 돌린다 (deploy.ts가 import할 때는 실행하지 않음)
if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) main();
