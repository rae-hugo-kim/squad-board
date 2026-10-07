import type { Metadata } from "next";
import { AgentIcon } from "@/components/agent-icon";
import { ROLE_GROUPS } from "@/db/schema";
import { ROLE_LABELS } from "@/db/seed-data";
import { listActiveAgents } from "@/server/queries/prefs";

export const metadata: Metadata = { title: "요원표" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await listActiveAgents();

  return (
    <div className="flex flex-col gap-6">
      <header className="page-intro">
        <p className="eyebrow">AGENTS</p>
        <h1>요원표</h1>
        <p className="page-description">역할별 요원을 확인하고 맵과 전술에 맞는 조합을 살펴보세요.</p>
      </header>

      <section className="agent-roster" aria-label="역할별 요원 목록">
        {agents.length === 0 ? <p className="agent-status">등록된 활성 요원이 없습니다. 요원 마스터 데이터를 동기화하세요.</p> : null}
        {ROLE_GROUPS.map((role) => {
          const roleAgents = agents.filter((agent) => agent.roleGroup === role);
          const label = ROLE_LABELS[role].ko;

          return (
            <section
              className={`agent-role-group agent-role-group--${role}`}
              key={role}
              aria-labelledby={`${role}-title`}
            >
              <div className="agent-role-group__heading">
                <div>
                  <p>{role}</p>
                  <h2 id={`${role}-title`}>{label}</h2>
                </div>
                <span>{roleAgents.length} AGENTS</span>
              </div>
              {roleAgents.length ? (
                <div className="agent-card-grid">
                  {roleAgents.map((agent) => (
                    <article className="agent-card" key={agent.id}>
                      <div className="agent-card__portrait">
                        {agent.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={agent.iconUrl} alt={`${agent.nameKo} 요원 아이콘`} loading="lazy" />
                        ) : (
                          <AgentIcon agent={agent} size={96} />
                        )}
                      </div>
                      <div className="agent-card__content">
                        <span className="agent-card__role">{label}</span>
                        <h3>{agent.nameKo}</h3>
                        <p>{agent.nameEn}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="agent-status">등록된 {label} 요원이 없습니다.</p>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}
