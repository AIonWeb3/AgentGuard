export function Integrate() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-mint">For engineering buyers</p>
      <h1 className="mt-2 font-display text-4xl">Drop it in before the first agent ships</h1>
      <p className="mt-3 text-muted">
        Three surfaces: the Soroban registry, a TypeScript SDK for providers, and this console
        for operators. AgentPay (or any settlement contract) calls verify_agent as a cross-contract
        read.
      </p>

      <section className="mt-10 space-y-8">
        <Block
          title="1. Resource provider middleware"
          body="The SDK simulates verify_agent. Attach it to any HTTP stack."
          code={`import { AgentGuardClient, Role, requireRole } from "@agentguard/sdk";
import { Networks } from "@stellar/stellar-sdk";

const guard = new AgentGuardClient({
  contractId: process.env.AGENTGUARD_ID,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
});

app.post("/v1/settle", requireRole(guard, Role.Premium), handler);`}
        />
        <Block
          title="2. Cross-contract check from AgentPay"
          body="No auth, no writes — cheap enough to run on every settlement."
          code={`let guard = AgentGuardClient::new(&env, &agent_guard_id);
if !guard.verify_agent(&agent_id, &Role::Premium) {
    panic!("agent not authorized for this tier");
}
// continue settlement`}
        />
        <Block
          title="3. Operator transactions"
          body="Owners sign with Freighter. The console in this repo mirrors every mutating entrypoint."
          code={`register_agent(owner, agent_id, metadata)
grant_role / revoke_role
set_agent_status(Active | Suspended | Revoked)
update_agent_metadata
transfer_ownership
deregister_agent`}
        />
      </section>

      <section className="mt-10 rounded-2xl border border-line p-5">
        <h2 className="font-display text-2xl">What to say on a sales call</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            Identity lives on Stellar, not in a vendor database — clients keep the keys, we keep
            the policy primitive.
          </li>
          <li>
            Verification is a simulation. High-frequency API gateways do not pay gas per check.
          </li>
          <li>
            Role hierarchy means an Admin agent does not need a duplicate Basic grant to pass a
            Basic gate.
          </li>
          <li>
            Suspend is the kill switch. Revoke is permanent. Transfer moves a fleet member to a
            new business unit without rotating the agent key.
          </li>
        </ul>
      </section>
    </main>
  );
}

function Block({ title, body, code }: { title: string; body: string; code: string }) {
  return (
    <article>
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <pre className="mt-4 overflow-x-auto rounded-2xl border border-line bg-void p-4 font-mono text-[12px] leading-6 text-mint/90">
        {code}
      </pre>
    </article>
  );
}
