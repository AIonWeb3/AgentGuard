# AgentGuard Contract Architecture

This document describes the current Soroban contract, the gaps relative to a
production kill-switch registry, and the implementation plan used to close them.

Soroban SDK: **27.0.0** (`contracts/agent_guard/Cargo.toml`).

## Current layout

| Module | Role |
|--------|------|
| `lib.rs` | Crate root, re-exports |
| `contract.rs` | Public API, TTL, storage helpers |
| `types.rs` | `Role`, `AgentStatus`, `AgentRecord`, `AgentMetadata`, `DataKey` |
| `errors.rs` | `#[contracterror]` codes |
| `events.rs` | `#[contractevent]` structs |
| `test.rs` | Unit tests with `testutils` |

## Storage

| Key | Tier | Value |
|-----|------|-------|
| `DataKey::Admin` | Instance | Contract admin `Address` |
| `DataKey::Initialized` | Instance | Init guard |
| `DataKey::Agent(Address)` | Persistent | `AgentRecord` |
| `DataKey::AgentMetadata(Address)` | Persistent | `AgentMetadata` |
| `DataKey::OwnerAgents(Address)` | Persistent | `Vec<Address>` |

TTL on writes: threshold `120_960` ledgers, extend-to `518_400` (~30 days).

## Existing public API

Already implemented and preserved:

- `initialize(admin)`
- `register_agent(owner, agent_id, metadata)` with `owner.require_auth()`
- `deregister_agent`, `grant_role`, `revoke_role`
- `set_agent_status` (unrestricted status write)
- `verify_agent` (read-only, never panics)
- `get_agent`, `get_agent_metadata`, `get_owner_agents`, `get_admin`
- `update_agent_metadata`, `transfer_ownership`

Metadata schema (kept): `name`, `description`, `version`.

Status enum (kept): `Active`, `Suspended`, `Revoked`.

## Gaps this work closes

1. **Structured lifecycle errors** — no `InvalidStateTransition`, `AgentRevoked`, or `InvalidMetadata`.
2. **State machine** — `set_agent_status` can move `Revoked → Active`.
3. **Dedicated kill switches** — no `suspend_agent` / `reactivate_agent` / `revoke_agent`.
4. **Indexable lifecycle events** — only generic `StatusChanged`; missing `AgentSuspended`, `AgentReactivated`, `AgentRevoked` with previous/new status.
5. **Owner registry hygiene** — append does not explicitly skip duplicates.
6. **Storage helpers** live inline in `contract.rs` rather than a dedicated module.
7. **Metadata validation** — empty names are accepted.
8. **Testnet tooling** — README deploy snippet only; no scripts or env-based docs.

RBAC (`Role`, `verify_agent`) remains; kill switches compose with it (`verify_agent` still requires `Active`).

## Lifecycle target

```text
register → Active ⇄ Suspended → Revoked
                ↘____________↗
Revoked is terminal.
```

Authorization: every mutation authenticates the caller and checks the stored owner.

## Implementation stages

Thirty focused PRs: errors → types → storage module → registration hardening →
lifecycle ops + events → queries → tests → testnet tooling.
