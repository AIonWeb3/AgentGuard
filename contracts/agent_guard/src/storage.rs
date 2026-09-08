//! Deterministic persistent and instance storage keys for AgentGuard.
//!
//! Keys are `#[contracttype]` enums so encodings stay stable across upgrades.
//! Agent identity data uses persistent storage; admin/init flags use instance storage.

use soroban_sdk::{contracttype, Address};

/// Discriminated storage keys for the `AgentGuard` contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Contract-level administrator address. **Instance.**
    Admin,

    /// Initialization guard. **Instance.**
    Initialized,

    /// `Address` → `AgentRecord`. **Persistent.**
    Agent(Address),

    /// `Address` → `AgentMetadata`. **Persistent.**
    AgentMetadata(Address),

    /// Owner `Address` → `Vec<Address>` of registered agents. **Persistent.**
    OwnerAgents(Address),
}
