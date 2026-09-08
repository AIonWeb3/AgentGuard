import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Field, Modal, RolePill, StatusBadge, inputClass } from "../components/ui";
import { formatTime, shortAddress } from "../lib/format";
import { useSession } from "../lib/session";
import { ALL_ROLES, AgentStatus, STATUS_LABELS } from "../lib/types";

export function AgentDetail() {
  const { agentId = "" } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const agent = session.agents.find((a) => a.agentId === agentId);
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session.owner) {
    return (
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
        <p className="text-muted">Start a session to inspect agents.</p>
        <Button className="mt-4" onClick={session.enterDemo}>
          Launch demo
        </Button>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
        <h1 className="font-display text-3xl">Agent not found</h1>
        <Link to="/app" className="mt-4 inline-block text-mint">
          Back to fleet
        </Link>
      </main>
    );
  }

  const run = (fn: () => void) => {
    try {
      setError(null);
      fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/app" className="text-sm text-muted hover:text-ink">
        ← Fleet
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-4xl">{agent.metadata.name}</h1>
            <StatusBadge status={agent.status} />
          </div>
          <p className="mt-2 text-muted">{agent.metadata.description}</p>
          <p className="mt-3 font-mono text-xs text-muted break-all">{agent.agentId}</p>
        </div>
        <Button variant="ghost" onClick={() => setEditOpen(true)}>
          Edit metadata
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">Identity</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Owner" v={shortAddress(agent.owner, 8, 8)} />
            <Row k="Registered" v={formatTime(agent.registeredAt)} />
            <Row k="Version" v={`v${agent.metadata.version}`} />
          </dl>
        </div>
        <div className="rounded-2xl border border-line p-5">
          <h2 className="text-xs uppercase tracking-wider text-muted">Status</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {([0, 1, 2] as const).map((status) => (
              <Button
                key={status}
                variant={agent.status === status ? "primary" : "ghost"}
                onClick={() => run(() => session.setStatus(agent.agentId, status as AgentStatus))}
              >
                {STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Only Active agents pass verify_agent. Suspend is the incident response switch.
          </p>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line p-5">
        <h2 className="text-xs uppercase tracking-wider text-muted">Roles</h2>
        <p className="mt-2 text-sm text-muted">
          Admin satisfies Premium and Basic. Premium satisfies Basic. Exact grants are still stored.
        </p>
        <div className="mt-4 space-y-3">
          {ALL_ROLES.map((role) => {
            const held = agent.roles.includes(role);
            return (
              <div key={role} className="flex items-center justify-between rounded-xl border border-line px-3 py-3">
                <div className="flex items-center gap-3">
                  <RolePill role={role} />
                  <span className="text-sm text-muted">{held ? "Granted" : "Not granted"}</span>
                </div>
                <Button
                  variant={held ? "danger" : "ghost"}
                  onClick={() =>
                    run(() =>
                      held
                        ? session.revokeRole(agent.agentId, role)
                        : session.grantRole(agent.agentId, role)
                    )
                  }
                >
                  {held ? "Revoke" : "Grant"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-4 flex flex-wrap gap-2">
        <Link
          to={`/verify?agent=${agent.agentId}`}
          className="rounded-full bg-mint px-4 py-2 text-sm font-medium text-void"
        >
          Verify this agent
        </Link>
        <Button variant="ghost" onClick={() => setTransferOpen(true)}>
          Transfer ownership
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm(`Deregister ${agent.metadata.name}?`)) {
              session.deregister(agent.agentId);
              navigate("/app");
            }
          }}
        >
          Deregister
        </Button>
      </section>

      {editOpen ? (
        <EditModal
          name={agent.metadata.name}
          description={agent.metadata.description}
          version={agent.metadata.version}
          onClose={() => setEditOpen(false)}
          onSave={(meta) => {
            session.updateMetadata(agent.agentId, meta);
            setEditOpen(false);
          }}
        />
      ) : null}

      {transferOpen ? (
        <TransferModal
          onClose={() => setTransferOpen(false)}
          onSubmit={(next) => {
            session.transferOwnership(agent.agentId, next);
            setTransferOpen(false);
            navigate("/app");
          }}
        />
      ) : null}
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono text-xs">{v}</dd>
    </div>
  );
}

function EditModal({
  name,
  description,
  version,
  onClose,
  onSave,
}: {
  name: string;
  description: string;
  version: number;
  onClose: () => void;
  onSave: (meta: { name: string; description: string; version: number }) => void;
}) {
  const [n, setN] = useState(name);
  const [d, setD] = useState(description);
  const [v, setV] = useState(String(version));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ name: n.trim(), description: d.trim(), version: Number(v) || 1 });
  };
  return (
    <Modal title="Update metadata" onClose={onClose} onSubmit={submit}>
      <Field label="Name">
        <input className={inputClass} value={n} onChange={(e) => setN(e.target.value)} />
      </Field>
      <Field label="Description">
        <input className={inputClass} value={d} onChange={(e) => setD(e.target.value)} />
      </Field>
      <Field label="Version">
        <input className={inputClass} type="number" min={1} value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
    </Modal>
  );
}

function TransferModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (owner: string) => void;
}) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };
  return (
    <Modal title="Transfer ownership" onClose={onClose} onSubmit={submit} submitLabel="Transfer">
      <Field label="New owner address">
        <input
          className={inputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="G..."
          required
        />
      </Field>
    </Modal>
  );
}
