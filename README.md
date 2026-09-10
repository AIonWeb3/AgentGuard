# AgentGuard

**On-chain identity and role-based access control for autonomous AI agents.**

AgentGuard is a Stellar Soroban registry that lets a human owner register an AI agent, grant it a role, and lets any API or settlement contract (including [AgentPay](https://github.com/AIonWeb3/AgentPay)) verify that agent before work or money moves.

This repo is a pitchable product, not just a contract:

| Surface | What a client sees |
|---|---|
| **Operator console** | Register agents, grant roles, suspend, transfer, audit trail |
| **Verifier** | Live `verify_agent` walkthrough (pass / fail) |
| **TypeScript SDK** | Drop-in middleware for provider backends |
| **Soroban contract** | Source of truth on Stellar, with a full test suite |

---

## Pitch the demo (60 seconds)

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173 and click **Launch 60-second demo**. No testnet account required.

Walkthrough:

1. Console opens on a seeded fleet (Invoice, Treasury, Ops Admin, a suspended scraper).
2. Open **Treasury Agent** → confirm it holds Premium.
3. Go to **Verify** → call `verify_agent` with Premium → **AUTHORIZED**.
4. Back on the agent, set status to **Suspended**.
5. Run the same check → **DENIED**. That is the kill switch.

Connect Freighter if you want the operator identity to be a real Stellar key. The demo registry still runs locally so the meeting cannot be blocked by RPC.

---

## Why this exists

Autonomous agents are already calling APIs and initiating payments. Today that usually means a shared secret in a prompt, or the company's hot wallet. There is no identity, no role, and no way to freeze one bot without rotating everything.

AgentGuard makes the agent a first-class on-chain principal:

- Distinct key per agent
- Roles: `Basic < Premium < Admin` (higher satisfies lower)
- Status: `Active | Suspended | Revoked`
- Read-only verification (simulation — no fee per API check)
- Owner-signed mutations only

---

## Architecture

```
 ┌──────────────┐   register / grant / suspend    ┌────────────────┐
 │  Agent owner │ ───────────────────────────────► │  AgentGuard    │
 │  (human)     │                                  │  contract      │
 └──────────────┘                                  └───────┬────────┘
                                                           │
                              verify_agent (read-only)     │
 ┌──────────────┐                                          │
 │  AgentPay    │ ◄────────────────────────────────────────┘
 │  settlement  │     cross-contract call
 └──────────────┘

 ┌──────────────┐     X-Agent-Public-Key           ┌────────────────┐
 │  Provider    │ ── requireAgent(Premium) ──────► │  @agentguard/  │
 │  API         │                                  │  sdk           │
 └──────────────┘                                  └────────────────┘
```

---

## Contract

### Build and test

```bash
rustup target add wasm32v1-none
cargo test
stellar contract build
```

### API

| Function | Auth | Description |
|---|---|---|
| `initialize(admin)` | admin | One-time setup |
| `register_agent(owner, agent_id, metadata)` | owner | Register an agent with name / purpose / version (`Active`) |
| `update_agent_metadata(...)` | owner | Update name, purpose, version |
| `deregister_agent(owner, agent_id)` | owner | Remove the agent |
| `grant_role` / `revoke_role` | owner | Agent-wide `Basic`, `Premium`, `Admin` |
| `grant_permission` / `revoke_permission` | owner | Time-bounded role on a `ResourceId` (`Symbol`) |
| `suspend_agent` / `reactivate_agent` / `revoke_agent` | owner | Kill switch (`Active` ⇄ `Suspended` → `Revoked`) |
| `set_agent_status` | owner | Same state machine as the dedicated kill switches |
| `verify_agent(agent_id, required_role) → bool` | none | Active + role ≥ required |
| `check_access(agent_id, resource_id, role) → bool` | none | Active + unexpired resource permission |
| `get_agent` / `get_agent_metadata` / `get_owner_agents` / `get_admin` | none | Reads |
| `transfer_ownership` | current owner | Move the agent to another wallet |

`verify_agent` never panics: unknown, suspended, or under-privileged agents return `false`.

Resource providers should call `check_access` (pure read / simulation — no fee) before serving a protected API:

```bash
stellar contract invoke \
  --id "$AGENTGUARD_CONTRACT_ID" \
  --source-account "$STELLAR_IDENTITY" \
  --network testnet \
  -- \
  check_access \
  --agent-id "$AGENT" \
  --resource-id premium_api \
  --role Premium
```

```rust
let allowed: bool = guard_client.check_access(&agent_id, &resource_id, &Role::Premium);
if !allowed {
    panic!("agent is not authorized for this resource");
}
```

`check_access` returns `false` when the permission is missing, expired, or the agent is `Suspended` / `Revoked`. Owners grant with `grant_permission(..., expires_at)` where `expires_at` is a ledger timestamp strictly in the future.

Indexed events fire on register, deregister, grant, revoke, status, metadata, and transfer.

### Deploy (testnet)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Use a named CLI identity, never a committed secret:

```bash
./scripts/build-wasm.sh
./scripts/deploy-testnet.sh
```

Then `initialize` once with the admin address. `./scripts/invoke-demo.sh` walks register → query → suspend → reactivate → revoke.

A Testnet **contract ID is not recorded here** until a deploy with real credentials succeeds.

---

## SDK

```bash
cd sdk
npm install
npm run build
```

```ts
import { AgentGuardClient, Role, requireRole } from "@agentguard/sdk";
import { Networks } from "@stellar/stellar-sdk";

const guard = new AgentGuardClient({
  contractId: process.env.AGENTGUARD_ID!,
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
});

app.post("/v1/premium", requireRole(guard, Role.Premium), handler);
```

Reads use simulation (no fees). Writes assemble a Soroban transaction, accept any `TransactionSigner` (Freighter, backend keypair), submit, and wait for confirmation.

A copy-paste HTTP gateway lives in `examples/provider-gateway`.

---

## Project layout

```
contracts/agent_guard/   Soroban contract + tests
sdk/                     TypeScript client + Express-style middleware
dashboard/               Pitch console (Vite + React)
examples/provider-gateway
```

---

## License

MIT — see [LICENSE](./LICENSE).
