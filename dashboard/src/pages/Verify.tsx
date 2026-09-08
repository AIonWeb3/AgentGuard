import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Field, RolePill, StatusBadge, inputClass } from "../components/ui";
import { DEMO_OWNER, demoRegistry } from "../lib/demo";
import { shortAddress } from "../lib/format";
import { useSession } from "../lib/session";
import { ALL_ROLES, ROLE_LABELS, Role, type VerifyResult } from "../lib/types";

export function Verify() {
  const session = useSession();
  const [params] = useSearchParams();
  const [agentId, setAgentId] = useState(params.get("agent") ?? "");
  const [role, setRole] = useState<Role>(Role.Premium);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const suggestions = useMemo(() => session.agents, [session.agents]);

  const run = () => {
    const owner = session.owner ?? DEMO_OWNER;
    if (!session.owner) session.enterDemo();
    setResult(demoRegistry.verify(owner, agentId.trim(), role));
  };

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-mint">Resource provider simulation</p>
      <h1 className="mt-2 font-display text-4xl">Verify before you serve</h1>
      <p className="mt-3 max-w-2xl text-muted">
        This is what an API gateway or AgentPay settlement call does: a fee-less read of
        <span className="text-ink"> verify_agent</span>. Try Treasury Agent with Premium (pass),
        then suspend it on the detail page and run the same check (fail).
      </p>

      {!session.owner ? (
        <div className="mt-6 rounded-2xl border border-line p-4">
          <p className="text-sm text-muted">Load the demo fleet to use seeded keys, or paste any agent id.</p>
          <Button className="mt-3" onClick={session.enterDemo}>
            Load demo fleet
          </Button>
        </div>
      ) : null}

      <div className="mt-8 space-y-4 rounded-2xl border border-line bg-panel/40 p-5">
        <Field label="Agent public key">
          <input
            className={inputClass}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="G..."
          />
        </Field>
        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                onClick={() => setAgentId(agent.agentId)}
                className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-mint/40 hover:text-ink"
              >
                {agent.metadata.name}
              </button>
            ))}
          </div>
        ) : null}
        <Field label="Required role">
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((item) => (
              <Button key={item} variant={role === item ? "primary" : "ghost"} onClick={() => setRole(item)}>
                {ROLE_LABELS[item]}
              </Button>
            ))}
          </div>
        </Field>
        <Button onClick={run} disabled={!agentId.trim()}>
          Call verify_agent
        </Button>
      </div>

      {result ? (
        <div
          className={`mt-6 rounded-2xl border p-5 ${
            result.authorized ? "border-mint/40 bg-mint/10" : "border-danger/40 bg-danger/10"
          }`}
        >
          <div className="font-display text-2xl">{result.authorized ? "AUTHORIZED" : "DENIED"}</div>
          <p className="mt-2 text-sm">{result.reason}</p>
          {result.profile ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{result.profile.metadata.name}</span>
              <StatusBadge status={result.profile.status} />
              {result.profile.roles.map((r) => (
                <RolePill key={r} role={r} />
              ))}
              <span className="font-mono text-xs text-muted">{shortAddress(result.profile.agentId)}</span>
              <Link className="text-mint" to={`/app/agents/${result.profile.agentId}`}>
                Manage →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="mt-10 rounded-2xl border border-line p-5">
        <h2 className="font-display text-xl">Provider header contract</h2>
        <p className="mt-2 text-sm text-muted">
          Agents present <code className="text-ink">X-Agent-Public-Key</code>. Your backend simulates
          the Soroban call. No signature, no fee, fail closed.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-void p-4 font-mono text-[12px] text-mint/90">{`POST /v1/premium-data
X-Agent-Public-Key: ${agentId || "G..."}

→ AgentGuard.verify_agent(key, Premium)
→ 200 or 403`}</pre>
      </section>
    </main>
  );
}
