import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, EmptyState, Field, Modal, RolePill, StatusBadge, cx, inputClass } from "../components/ui";
import { formatRelative, shortAddress } from "../lib/format";
import { useSession } from "../lib/session";
import { AgentStatus, type AgentProfile } from "../lib/types";

export function Console() {
  const session = useSession();
  const navigate = useNavigate();
  const [registerOpen, setRegisterOpen] = useState(false);
  const stats = useMemo(() => {
    const total = session.agents.length;
    const active = session.agents.filter((a) => a.status === AgentStatus.Active).length;
    const gated = session.agents.filter((a) => a.roles.some((r) => r >= 1)).length;
    return { total, active, gated, frozen: total - active };
  }, [session.agents]);

  if (!session.owner) {
    return (
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
        <h1 className="font-display text-4xl">Operator console</h1>
        <p className="mt-3 text-muted">
          Start a local demo fleet or attach Freighter. Either way you get a full register /
          grant / verify walkthrough.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={() => session.enterDemo()}>Launch demo fleet</Button>
          <Button variant="ghost" onClick={() => void session.connectWallet()} disabled={session.busy}>
            Connect Freighter
          </Button>
        </div>
        {session.error ? <p className="mt-4 text-sm text-danger">{session.error}</p> : null}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-mint">
            {session.mode === "demo" ? "Demo registry" : "Wallet session"}
          </p>
          <h1 className="mt-1 font-display text-4xl">Agent fleet</h1>
          <p className="mt-2 font-mono text-xs text-muted">{session.owner}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={session.resetFleet}>
            Reset demo data
          </Button>
          <Button onClick={() => setRegisterOpen(true)}>Register agent</Button>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        {[
          ["Registered", stats.total],
          ["Active", stats.active],
          ["Premium+", stats.gated],
          ["Frozen", stats.frozen],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-line bg-panel/50 px-4 py-4">
            <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
            <div className="mt-1 font-display text-3xl">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl">Agents</h2>
            <Link to="/verify" className="text-sm text-mint hover:underline">
              Open verifier →
            </Link>
          </div>
          {session.agents.length === 0 ? (
            <EmptyState
              title="No agents yet"
              body="Register an agent key under this owner, then grant a role before any provider will accept it."
              action={<Button onClick={() => setRegisterOpen(true)}>Register agent</Button>}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line">
              {session.agents.map((agent, i) => (
                <button
                  key={agent.agentId}
                  type="button"
                  onClick={() => navigate(`/app/agents/${agent.agentId}`)}
                  className={cx(
                    "flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-mint/5",
                    i !== 0 && "border-t border-line"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{agent.metadata.name}</span>
                      <StatusBadge status={agent.status} />
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-muted">
                      {shortAddress(agent.agentId, 8, 8)} · v{agent.metadata.version}
                    </div>
                  </div>
                  <div className="hidden gap-1 sm:flex">
                    {agent.roles.length === 0 ? (
                      <span className="text-xs text-muted">No roles</span>
                    ) : (
                      agent.roles.map((role) => <RolePill key={role} role={role} />)
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside>
          <h2 className="font-display text-2xl">Audit trail</h2>
          <ol className="mt-4 space-y-3">
            {session.activity.slice(0, 10).map((item) => (
              <li key={item.id} className="rounded-xl border border-line bg-void/40 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase text-mint">{item.action}</span>
                  <span className="text-[11px] text-muted">{formatRelative(item.at)}</span>
                </div>
                <p className="mt-1 text-sm text-ink/90">{item.detail}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {registerOpen ? (
        <RegisterModal
          mint={session.mintAgentKey}
          onClose={() => setRegisterOpen(false)}
          onCreate={(meta, agentId) => {
            const id = session.registerAgent(meta, agentId);
            setRegisterOpen(false);
            navigate(`/app/agents/${id}`);
          }}
        />
      ) : null}
    </main>
  );
}

function RegisterModal({
  mint,
  onClose,
  onCreate,
}: {
  mint: () => string;
  onClose: () => void;
  onCreate: (meta: AgentProfile["metadata"], agentId: string) => void;
}) {
  const [name, setName] = useState("Support Agent");
  const [description, setDescription] = useState("Handles tier-1 customer tickets.");
  const [version, setVersion] = useState("1");
  const [agentId, setAgentId] = useState(mint);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCreate(
      { name: name.trim(), description: description.trim(), version: Number(version) || 1 },
      agentId.trim()
    );
  };

  return (
    <Modal title="Register agent" onClose={onClose} onSubmit={submit} submitLabel="Register">
      <Field label="Display name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Purpose">
        <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Version">
        <input className={inputClass} type="number" min={1} value={version} onChange={(e) => setVersion(e.target.value)} />
      </Field>
      <Field label="Agent public key">
        <div className="flex gap-2">
          <input className={inputClass} value={agentId} onChange={(e) => setAgentId(e.target.value)} required />
          <Button variant="ghost" onClick={() => setAgentId(mint())}>
            New
          </Button>
        </div>
      </Field>
    </Modal>
  );
}
