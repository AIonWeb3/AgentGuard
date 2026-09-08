import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";

const terminalFrames = [
  {
    cmd: "verify_agent  InvoiceAgent   Premium",
    out: "DENIED     holds Basic · Active",
    ok: false,
  },
  {
    cmd: "verify_agent  TreasuryAgent  Premium",
    out: "AUTHORIZED  Active · Premium",
    ok: true,
  },
  {
    cmd: "verify_agent  OpsAdminAgent  Basic",
    out: "AUTHORIZED  Admin satisfies Basic",
    ok: true,
  },
  {
    cmd: "verify_agent  LegacyScraper  Basic",
    out: "DENIED     Suspended — identity frozen",
    ok: false,
  },
];

export function Landing() {
  const { enterDemo, connectWallet, busy, owner } = useSession();
  const navigate = useNavigate();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((n) => (n + 1) % terminalFrames.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, []);

  const openDemo = () => {
    enterDemo();
    navigate("/app");
  };

  const openWallet = async () => {
    if (!owner) await connectWallet();
    navigate("/app");
  };

  const step = terminalFrames[frame];

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-mint">
              Stellar Soroban · AI identity
            </p>
            <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
              Give every AI agent
              <span className="block text-mint">an on-chain identity.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              AgentGuard is the authentication layer for autonomous agents. Register them under
              a human owner, assign roles, and let APIs or settlement contracts verify access
              before a single dollar or secret moves.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openDemo}
                className="rounded-full bg-mint px-5 py-2.5 text-sm font-semibold text-void glow-mint"
              >
                Launch 60-second demo
              </button>
              <button
                type="button"
                onClick={() => void openWallet()}
                disabled={busy}
                className="rounded-full border border-line px-5 py-2.5 text-sm text-ink hover:border-mint/40"
              >
                {busy ? "Connecting…" : owner ? "Open console" : "Connect Freighter"}
              </button>
            </div>
            <p className="mt-4 text-xs text-muted">
              Demo runs in the browser — no testnet account required for a client walkthrough.
            </p>
          </div>

          <div className="glow-mint rounded-2xl border border-line bg-forest/80 p-4 terminal-scan">
            <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-widest text-muted">
              <span>verify_agent · live check</span>
              <span className="text-mint">read-only · 0 fee</span>
            </div>
            <pre className="overflow-x-auto font-mono text-[13px] leading-7">
              <span className="text-muted">$ </span>
              <span className="text-ink">{step.cmd}</span>
              {"\n"}
              <span className={step.ok ? "text-mint" : "text-danger"}>{step.out}</span>
            </pre>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
              {["Basic", "Premium", "Admin"].map((role, i) => (
                <div key={role} className="rounded-lg border border-line bg-void/60 px-2 py-2">
                  <div className="text-muted">tier {i}</div>
                  <div className="font-medium text-ink">{role}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-forest/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-3">
          {[
            {
              k: "01",
              t: "The agent is not the owner",
              d: "Autonomous systems should not share a company's hot wallet. Register a distinct key, then grant only the role the job needs.",
            },
            {
              k: "02",
              t: "Verify before you settle",
              d: "AgentPay and any resource API can call verify_agent as a pure read. Suspended or under-privileged agents fail closed.",
            },
            {
              k: "03",
              t: "Revoke in one transaction",
              d: "Compromise, offboarding, or a runaway loop: freeze or deregister the agent. Downstream checks pick it up on the next call.",
            },
          ].map((item) => (
            <article key={item.k} className="rounded-2xl border border-line bg-void/40 p-6">
              <div className="font-mono text-xs text-mint">{item.k}</div>
              <h2 className="mt-3 font-display text-2xl">{item.t}</h2>
              <p className="mt-3 text-sm leading-6 text-muted">{item.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-3xl">How a client ships this</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            ["Register", "Owner wallet signs register_agent with a name, purpose, and agent public key."],
            ["Grant", "Assign Basic, Premium, or Admin. Higher roles satisfy lower checks."],
            ["Gate", "Provider backends or AgentPay call verify_agent before work or payment."],
            ["Govern", "Suspend, revoke, transfer, or delete. The registry is the source of truth."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-line p-5">
              <div className="text-xs text-muted">Step {i + 1}</div>
              <h3 className="mt-2 font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl">Built for the teams buying agent infrastructure</h2>
            <ul className="mt-6 space-y-4 text-sm text-muted">
              <li>
                <span className="text-ink">Fintech / AgentPay.</span> Do not settle a payment until the
                calling agent is Active and Premium.
              </li>
              <li>
                <span className="text-ink">API platforms.</span> Drop-in middleware. One header, one
                on-chain check, no shared API keys in agent prompts.
              </li>
              <li>
                <span className="text-ink">Enterprises.</span> A fleet registry: who owns this bot, what
                can it touch, can we kill it at 2am.
              </li>
            </ul>
          </div>
          <pre className="overflow-x-auto rounded-2xl border border-line bg-void p-5 font-mono text-[12px] leading-6 text-mint/90">{`import { AgentGuardClient, Role } from "@agentguard/sdk";

const guard = new AgentGuardClient({
  contractId,
  rpcUrl,
  networkPassphrase,
});

app.post("/v1/premium", async (req, res) => {
  await guard.requireAgent(
    req.header("x-agent-public-key"),
    Role.Premium
  );
  // proceed — identity is on Stellar, not in your database
});`}</pre>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 text-center">
        <h2 className="font-display text-4xl">Ready to walk a client through it</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Open the console, register an agent, grant Premium, then fail a check by suspending it.
          That is the whole product, in under a minute.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={openDemo}
            className="rounded-full bg-mint px-5 py-2.5 text-sm font-semibold text-void"
          >
            Open the console
          </button>
          <Link to="/integrate" className="rounded-full border border-line px-5 py-2.5 text-sm">
            Read the integration
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        AgentGuard · MIT · Stellar Soroban identity registry for autonomous agents
      </footer>
    </div>
  );
}
