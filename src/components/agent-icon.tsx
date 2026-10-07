import type { RoleGroup } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";

export type AgentIconData = { nameKo: string; roleGroup: RoleGroup; iconUrl?: string | null };

/**
 * 요원 아이콘. 공식 아이콘 URL이 있으면 이미지(원형), 없으면(에셋 동기화 전) 역할군 색 원에 이니셜.
 * next/image 대신 <img>를 쓰는 이유: 외부 CDN의 작은 아이콘 수십 장이라 최적화 서버를 거칠 이점이 없고,
 * 원격 도메인 설정 없이 바로 동작한다.
 */
export function AgentIcon({ agent, size = 24, className = "" }: { agent: AgentIconData; size?: number; className?: string }) {
  const ring = ROLE_LABELS[agent.roleGroup].cssVar;
  if (agent.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={agent.iconUrl}
        alt={agent.nameKo}
        title={agent.nameKo}
        width={size}
        height={size}
        loading="lazy"
        className={`inline-block shrink-0 rounded-full bg-raised object-cover ${className}`}
        style={{ width: size, height: size, boxShadow: `0 0 0 1.5px ${ring}` }}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-base ${className}`}
      style={{ width: size, height: size, background: ring, fontSize: Math.max(9, size * 0.42) }}
      title={agent.nameKo}
      aria-label={agent.nameKo}
    >
      {agent.nameKo.slice(0, 1)}
    </span>
  );
}

/** 스킬 아이콘 (공식). 없으면 키 글자(C/Q/E/X) 배지. */
export function AbilityIcon({ ability, size = 22, className = "" }: { ability: { key: string; nameKo: string; iconUrl?: string | null }; size?: number; className?: string }) {
  if (ability.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={ability.iconUrl} alt={ability.nameKo} title={ability.nameKo} width={size} height={size} loading="lazy" className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-sm border border-line font-mono text-[10px] text-secondary ${className}`} style={{ width: size, height: size }} title={ability.nameKo}>
      {ability.key.toUpperCase()}
    </span>
  );
}
