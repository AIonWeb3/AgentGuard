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

use crate::errors::Error;
use soroban_sdk::{contracttype, Address, Env, String, Symbol, Vec};

/// Identifier for a protected resource (API route, vault, dataset, etc.).
pub type ResourceId = Symbol;

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/// Role hierarchy for agent access control.
///
/// Roles are ordered by privilege level (`Basic < Premium < Admin`).
/// `verify_agent` uses this ordering for "at least" checks: an agent with
/// `Admin` implicitly satisfies a `Premium` or `Basic` requirement.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Role {
    /// Default role — grants access to basic resources.
    Basic = 0,
    /// Elevated role — grants access to premium endpoints/resources.
    Premium = 1,
    /// Administrative role — full control, can manage other agents if needed.
    Admin = 2,
}

impl Role {
    /// Stable ABI discriminant for this role.
    #[must_use]
    pub const fn as_u32(self) -> u32 {
        self as u32
    }
}

// ---------------------------------------------------------------------------
// Agent Status
// ---------------------------------------------------------------------------

/// State machine for an agent's operational status.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AgentStatus {
    /// Agent is active and functioning normally.
    Active = 0,
    /// Agent is temporarily suspended (e.g., due to suspicious activity).
    Suspended = 1,
    /// Agent identity is permanently revoked.
    Revoked = 2,
}

impl AgentStatus {
    /// Whether this status is operational (`Active` only).
    #[must_use]
    pub const fn is_active(self) -> bool {
        matches!(self, Self::Active)
    }

    /// Whether this identity is permanently disabled.
    #[must_use]
    pub const fn is_revoked(self) -> bool {
        matches!(self, Self::Revoked)
    }

    /// Validate a requested lifecycle transition.
    ///
    /// Allowed: `Active → Suspended`, `Suspended → Active`,
    /// `Active → Revoked`, `Suspended → Revoked`.
    /// `Revoked` is terminal.
    ///
    /// # Errors
    /// - `Error::AgentRevoked` if the current status is already `Revoked`.
    /// - `Error::InvalidStateTransition` if the move is not allowed.
    pub fn can_transition_to(self, next: Self) -> Result<(), Error> {
        if self == Self::Revoked {
            return Err(Error::AgentRevoked);
        }
        if self == next {
            return Err(Error::InvalidStateTransition);
        }
        match (self, next) {
            (Self::Active, Self::Suspended | Self::Revoked)
            | (Self::Suspended, Self::Active | Self::Revoked) => Ok(()),
            _ => Err(Error::InvalidStateTransition),
        }
    }
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

impl AgentRecord {
    /// Create a new persistent record with no roles and the given status.
    #[must_use]
    pub fn new(env: &Env, owner: Address, status: AgentStatus) -> Self {
        Self { owner, roles: Vec::new(env), status, registered_at: env.ledger().timestamp() }
    }

    /// Fail unless `owner` matches the stored controller.
    ///
    /// # Errors
    /// - `Error::NotAgentOwner` if `owner` does not match the stored controller.
    pub fn require_owner(&self, owner: &Address) -> Result<(), Error> {
        if self.owner != *owner {
            return Err(Error::NotAgentOwner);
        }
        Ok(())
    }
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

impl AgentMetadata {
    /// Reject empty names. Description may be empty; version is unconstrained.
    ///
    /// # Errors
    /// - `Error::InvalidMetadata` if `name` is empty.
    pub fn validate(&self) -> Result<(), Error> {
        if self.name.is_empty() {
            return Err(Error::InvalidMetadata);
        }
        Ok(())
    }
}
