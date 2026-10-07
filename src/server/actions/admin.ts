"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { maps, members, MEMBER_ROLES } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { createLogger, errorMeta } from "@/lib/logger";
import type { ActionResult } from "./auth";

/**
 * 관리자 액션. 모든 함수가 첫 줄에서 requireAdmin()을 호출한다 —
 * 서버 액션은 URL만 알면 누구나 호출할 수 있으므로 화면에서 버튼을 숨기는 것으로는 부족하다.
 */
const log = createLogger("admin");

const MEMBER_COLORS = ["#7b8cff", "#ff5c5c", "#ffb454", "#4fd98a", "#2ee6d6", "#c77dff", "#ff8a3d", "#5ac8fa"];

const nicknameSchema = z
  .string()
  .trim()
  .min(1, "닉네임을 입력하세요")
  .max(20, "20자 이내로 입력하세요")
  .regex(/^[\p{L}\p{N} _.-]+$/u, "닉네임에는 글자·숫자·공백·_ . - 만 쓸 수 있습니다");

function revalidateAll() {
  revalidatePath("/admin");
  revalidatePath("/prefs");
  revalidatePath("/login");
}

export async function addMemberAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = nicknameSchema.safeParse(formData.get("nickname"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요" };
  const nickname = parsed.data;

  try {
    const dup = await db.select({ id: members.id }).from(members).where(eq(members.nickname, nickname)).get();
    if (dup) return { ok: false, error: "이미 있는 닉네임입니다" };

    const count = (await db.select({ id: members.id }).from(members)).length;
    await db.insert(members).values({
      id: randomUUID(),
      nickname,
      color: MEMBER_COLORS[count % MEMBER_COLORS.length],
      role: "member",
    });
    log.info("member added", { nickname });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    log.error("add member failed", errorMeta(err));
    return { ok: false, error: "추가 중 오류가 났습니다" };
  }
}

const memberIdSchema = z.string().uuid();

export async function toggleMemberActiveAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = memberIdSchema.parse(formData.get("memberId"));
  if (id === me.id) return; // 자기 자신은 비활성화 못 함 (관리자 잠금 방지)
  const m = await db.select({ isActive: members.isActive }).from(members).where(eq(members.id, id)).get();
  if (!m) return;
  await db
    .update(members)
    .set({ isActive: !m.isActive, updatedAt: new Date().toISOString() })
    .where(eq(members.id, id));
  log.info("member active toggled", { memberId: id, isActive: !m.isActive });
  revalidateAll();
}

export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = memberIdSchema.parse(formData.get("memberId"));
  const role = z.enum(MEMBER_ROLES).parse(formData.get("role"));
  if (id === me.id && role !== "admin") {
    // 마지막 관리자가 스스로 강등되면 아무도 관리할 수 없다
    const others = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.role, "admin"), eq(members.isActive, true), ne(members.id, me.id)));
    if (others.length === 0) return;
  }
  await db.update(members).set({ role, updatedAt: new Date().toISOString() }).where(eq(members.id, id));
  log.info("member role set", { memberId: id, role });
  revalidateAll();
}

export async function renameMemberAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = memberIdSchema.safeParse(formData.get("memberId"));
  const parsed = nicknameSchema.safeParse(formData.get("nickname"));
  if (!id.success) return { ok: false, error: "멤버를 찾을 수 없습니다" };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요" };
  try {
    const dup = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.nickname, parsed.data), ne(members.id, id.data)))
      .get();
    if (dup) return { ok: false, error: "이미 있는 닉네임입니다" };
    await db
      .update(members)
      .set({ nickname: parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(members.id, id.data));
    revalidateAll();
    return { ok: true };
  } catch (err) {
    log.error("rename failed", errorMeta(err));
    return { ok: false, error: "변경 중 오류가 났습니다" };
  }
}

export async function toggleMapPoolAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("mapId"));
  const m = await db.select({ inPool: maps.inPool }).from(maps).where(eq(maps.id, id)).get();
  if (!m) return;
  await db.update(maps).set({ inPool: !m.inPool }).where(eq(maps.id, id));
  log.info("map pool toggled", { mapId: id, inPool: !m.inPool });
  revalidateAll();
}
