# AgentGuard 🛡️

**On-Chain AI Identity & Role-Based Access Control Registry**

AgentGuard is a [Stellar Soroban](https://soroban.stellar.org) smart contract that serves as the authentication layer for autonomous LLM agents. It enables human owners to register AI agents, assign granular roles, and provides a verification endpoint that resource providers and the [AgentPay](https://github.com/AIonWeb3/AgentPay) settlement contract call before granting access or executing financial operations.

---

## Architecture

```
 ┌──────────────┐      register / grant_role      ┌────────────────┐
 │  Agent Owner  │ ──────────────────────────────► │  AgentGuard    │
 │  (Human)      │                                 │  Contract      │
 └──────────────┘                                 └───────┬────────┘
                                                          │
                             verify_agent (read-only)     │
 ┌──────────────┐                                         │
 │  AgentPay    │ ◄───────────────────────────────────────┘
 │  Contract    │     cross-contract call
 └──────────────┘

 ┌──────────────┐    verifyAgent (simulation)     ┌────────────────┐
 │  Resource    │ ──────────────────────────────► │  AgentGuard    │
 │  Provider    │    via @agentguard/sdk          │  Contract      │
 │  Backend     │                                 └────────────────┘
 └──────────────┘
```

### Storage Strategy

| Data               | Storage Type | Rationale                                          |
|--------------------|--------------|-----------------------------------------------------|
| Contract admin     | Instance     | Tiny, loaded every invocation, never expires         |
| Initialized flag   | Instance     | Guards double-init cheaply                           |
| Agent records      | Persistent   | Must survive indefinitely; identity data is critical |
| Owner → agent list | Persistent   | Supports enumeration, same longevity as records      |

> **Temporary storage is intentionally avoided.** Agent identities are long-lived credentials, not ephemeral data.

---

## Part 1: Soroban Smart Contract (Rust)

### Prerequisites

- **Rust** 1.84.0+ — `rustup update stable`
- **Wasm target** — `rustup target add wasm32v1-none`
- **Stellar CLI** — `cargo install --locked stellar-cli`

### Build

```bash
stellar contract build
```

The optimized `.wasm` artifact is emitted to `target/wasm32v1-none/release/agent_guard.wasm`.

### Test

```bash
cargo test
```

### Deploy

```bash
# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/agent_guard.wasm \
  --network testnet \
  --source <YOUR_SECRET_KEY>
```

### Contract API

| Function | Auth | Description |
|---|---|---|
| `initialize(admin)` | admin | One-time setup — stores the contract administrator |
| `register_agent(owner, agent_id)` | owner | Register a new AI agent under the owner's wallet |
| `deregister_agent(owner, agent_id)` | owner | Remove an agent and its records |
| `grant_role(owner, agent_id, role)` | owner | Assign a role (`Basic`, `Premium`, `Admin`) to an agent |
| `revoke_role(owner, agent_id, role)` | owner | Remove a role from an agent |
| `verify_agent(agent_id, required_role) → bool` | none | Check if an agent holds a specific role (read-only) |
| `get_agent(agent_id) → AgentRecord` | none | Retrieve full agent record |
| `get_owner_agents(owner) → Vec<Address>` | none | List all agents registered under an owner |
| `transfer_ownership(current_owner, agent_id, new_owner)` | current_owner | Transfer agent to a new owner |

### Roles

```rust
enum Role {
    Basic   = 0,  // Default — access to basic resources
    Premium = 1,  // Elevated — premium endpoints/resources
    Admin   = 2,  // Full control
}
```

### Cross-Contract Calls from AgentPay

`verify_agent` is a **pure read** — no authorization or state mutation. This makes it ideal for cross-contract invocation with minimal gas overhead:

```rust
// In AgentPay's settlement function:
let guard_client = AgentGuardClient::new(&env, &agent_guard_contract_id);
let is_authorized: bool = guard_client.verify_agent(&agent_id, &required_role);
if !is_authorized {
    panic!("Agent not authorized for this settlement tier");
}
// ... proceed with payment
```

---

## Part 2: Provider SDK (TypeScript)

### Install

```bash
cd sdk
npm install
```

### Usage

```typescript
import { AgentGuardClient, Role } from "@agentguard/sdk";
import { Networks } from "@stellar/stellar-sdk";

const guard = new AgentGuardClient({
  contractId: "CABC...XYZ",            // Your deployed AgentGuard contract
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
});

// Simple boolean check (read-only simulation — no fees)
const isAuthorized = await guard.verifyAgent(agentPublicKey, Role.Premium);
console.log(`Agent authorized: ${isAuthorized}`);

// Middleware-style enforcement (throws on failure)
try {
  await guard.requireAgent(agentPublicKey, Role.Premium);
  // Agent is verified — proceed with request
} catch (error) {
  if (error instanceof AgentUnauthorizedError) {
    res.status(403).json({ error: error.message });
  }
}

// Fetch full agent record
const record = await guard.getAgent(agentPublicKey);
if (record) {
  console.log(`Owner: ${record.owner}`);
  console.log(`Roles: ${record.roles}`);
  console.log(`Registered at: ${record.registeredAt}`);
}
```

### Express Middleware Example

```typescript
import { AgentGuardClient, Role, AgentUnauthorizedError } from "@agentguard/sdk";

const guard = new AgentGuardClient({ /* config */ });

function requireRole(role: Role) {
  return async (req, res, next) => {
    const agentKey = req.headers["x-agent-public-key"];
    if (!agentKey) {
      return res.status(401).json({ error: "Missing X-Agent-Public-Key header" });
    }
    try {
      await guard.requireAgent(agentKey, role);
      next();
    } catch (error) {
      if (error instanceof AgentUnauthorizedError) {
        return res.status(403).json({ error: error.message });
      }
      return res.status(500).json({ error: "Verification service unavailable" });
    }
  };
}

// Usage:
app.post("/api/premium-endpoint", requireRole(Role.Premium), handler);
```

---

## Project Structure

```
AgentGuard/
├── Cargo.toml                          # Workspace root
├── contracts/
│   └── agent_guard/
│       ├── Cargo.toml                  # Contract crate manifest
│       └── src/
│           ├── lib.rs                  # Module root
│           ├── types.rs                # Data types & storage keys
│           ├── errors.rs               # Error definitions
│           ├── contract.rs             # Core contract logic
│           └── test.rs                 # Test suite
├── sdk/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                    # Barrel exports
│       ├── types.ts                    # TypeScript type definitions
│       └── agent-guard-client.ts       # Verification client
├── README.md
└── LICENSE
```

---

## License

MIT — see [LICENSE](./LICENSE).
