import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { agents, maps, members } from "./schema";
import { mapImagePath, SEED_AGENTS, SEED_MAPS } from "./seed-data";
import { createLogger, errorMeta } from "@/lib/logger";

/**
 * 시드 스크립트 — `npm run db:seed`
 *
 * - 맵·요원: slug 기준 upsert. 이미 있으면 이름·역할군·사이트·스킬을 갱신하고 inPool은
 *   건드리지 않는다(운영 중 관리자가 토글한 값을 시드가 덮어쓰면 안 되기 때문).
 *   맵 이미지 경로는 비어 있을 때만 채운다 — 사용자가 실제 탑뷰로 바꾼 경로를 덮어쓰지 않기 위해.
 * - 초기 관리자: 멤버가 한 명도 없을 때만 SEED_ADMIN_NICKNAME(기본 "admin")으로 생성.
 *   첫 로그인 후 관리 화면에서 닉네임을 바꾸면 된다.
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

async function main() {
  try {
    await seedMaps();
    await seedAgents();
    await seedAdmin();
    log.info("seed complete");
    process.exit(0);
  } catch (err) {
    log.error("seed failed", errorMeta(err));
    process.exit(1);
  }
}

main();
