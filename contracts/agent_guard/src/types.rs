//! # `AgentGuard` — Data Types & Storage Keys
//!
//! Defines the on-chain data model for the AI agent identity and RBAC registry.
//!
//! ## Storage Strategy
//!
//! | Data               | Storage Type | Rationale                                         |
//! |--------------------|--------------|---------------------------------------------------|
//! | Contract admin     | Instance     | Tiny, loaded every invocation, never expires       |
//! | Initialized flag   | Instance     | Same — guards double-init cheaply                  |
//! | Agent records      | Persistent   | Must survive indefinitely; identity data critical  |
//! | Owner → agent list | Persistent   | Supports enumeration, same longevity as records    |
//!
//! **Temporary storage is intentionally avoided.** Agent identities are long-lived
//! credentials — not ephemeral data like price feeds or session tokens.

use soroban_sdk::{contracttype, Address, String, Vec};

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/// Role hierarchy for agent access control.
///
/// Roles are ordered by privilege level (`Basic < Premium < Admin`).
/// The `verify_agent` function can leverage this ordering for "at least" checks
/// (e.g., an agent with `Admin` implicitly satisfies a `Basic` requirement).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Role {
    /// Default role — grants access to basic resources.
    Basic = 0,
    /// Elevated role — grants access to premium endpoints/resources.
    Premium = 1,
    /// Administrative role — full control, can manage other agents if needed.
    Admin = 2,
}

// ---------------------------------------------------------------------------
// Agent Status
// ---------------------------------------------------------------------------

/// State machine for an agent's operational status.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AgentStatus {
    /// Agent is active and functioning normally.
    Active = 0,
    /// Agent is temporarily suspended (e.g., due to suspicious activity).
    Suspended = 1,
    /// Agent identity is permanently revoked.
    Revoked = 2,
}

// ---------------------------------------------------------------------------
// Agent Record
// ---------------------------------------------------------------------------

/// On-chain record for a registered AI agent.
///
/// Stored in **persistent** ledger storage keyed by `DataKey::Agent(agent_id)`.
/// Persistent storage ensures the record is never garbage-collected as long as
/// rent is kept alive (the contract auto-extends TTL on writes).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentRecord {
    /// The human owner who registered this agent and controls its roles.
    pub owner: Address,
    /// Set of roles currently granted to this agent.
    pub roles: Vec<Role>,
    /// The current operational status of the agent.
    pub status: AgentStatus,
    /// Ledger timestamp at which the agent was first registered.
    pub registered_at: u64,
}

// ---------------------------------------------------------------------------
// Agent Metadata
// ---------------------------------------------------------------------------

/// Metadata associated with an agent.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentMetadata {
    /// Name of the agent.
    pub name: String,
    /// Description of the agent's purpose.
    pub description: String,
    /// Version of the agent.
    pub version: u32,
}

// ---------------------------------------------------------------------------
// Storage Keys
// ---------------------------------------------------------------------------

/// Discriminated storage keys for the `AgentGuard` contract.
///
/// Each variant maps to a specific piece of on-chain state and determines
/// which storage tier (instance vs. persistent) the data lives in.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Contract-level administrator address.
    /// **Storage: Instance** — loaded on every invocation, negligible size.
    Admin,

    /// Initialization guard — prevents double-initialization.
    /// **Storage: Instance.**
    Initialized,

    /// Maps an agent's `Address` → `AgentRecord`.
    /// **Storage: Persistent** — long-lived identity data.
    Agent(Address),

    /// Maps an agent's `Address` → `AgentMetadata`.
    /// **Storage: Persistent** — descriptive information about the agent.
    AgentMetadata(Address),

    /// Maps an owner's `Address` → `Vec<Address>` of their registered agents.
    /// **Storage: Persistent** — enables enumeration of all agents per owner.
    OwnerAgents(Address),
}
