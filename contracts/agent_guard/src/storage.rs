//! Deterministic persistent and instance storage keys for AgentGuard.
//!
//! Keys are `#[contracttype]` enums so encodings stay stable across upgrades.
//! Agent identity data uses persistent storage; admin/init flags use instance storage.

use crate::errors::Error;
use crate::types::{AgentMetadata, AgentRecord};
use soroban_sdk::{contracttype, Address, Env, Vec};

/// Minimum TTL (in ledgers) before an extension is triggered.
pub(crate) const TTL_THRESHOLD: u32 = 120_960;

/// TTL to extend to (in ledgers) when threshold is reached.
pub(crate) const TTL_EXTEND_TO: u32 = 518_400;

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

pub(crate) fn write_metadata(env: &Env, agent_id: Address, metadata: &AgentMetadata) {
    let key = DataKey::AgentMetadata(agent_id);
    env.storage().persistent().set(&key, metadata);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub(crate) fn read_metadata(env: &Env, agent_id: Address) -> Result<AgentMetadata, Error> {
    let key = DataKey::AgentMetadata(agent_id);
    env.storage().persistent().get(&key).ok_or(Error::AgentNotFound)
}

pub(crate) fn remove_metadata(env: &Env, agent_id: Address) {
    let key = DataKey::AgentMetadata(agent_id);
    env.storage().persistent().remove(&key);
}

pub(crate) fn read_agent(env: &Env, agent_id: Address) -> Result<AgentRecord, Error> {
    let key = DataKey::Agent(agent_id);
    env.storage().persistent().get(&key).ok_or(Error::AgentNotFound)
}

pub(crate) fn write_agent(env: &Env, agent_id: Address, record: &AgentRecord) {
    let key = DataKey::Agent(agent_id);
    env.storage().persistent().set(&key, record);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub(crate) fn has_agent(env: &Env, agent_id: Address) -> bool {
    let key = DataKey::Agent(agent_id);
    env.storage().persistent().has(&key)
}

pub(crate) fn remove_agent(env: &Env, agent_id: Address) {
    let key = DataKey::Agent(agent_id);
    env.storage().persistent().remove(&key);
}

pub(crate) fn read_owner_agents(env: &Env, owner: Address) -> Vec<Address> {
    let key = DataKey::OwnerAgents(owner);
    env.storage().persistent().get(&key).unwrap_or(Vec::new(env))
}

pub(crate) fn write_owner_agents(env: &Env, owner: Address, agents: &Vec<Address>) {
    let key = DataKey::OwnerAgents(owner);
    if agents.is_empty() {
        env.storage().persistent().remove(&key);
    } else {
        env.storage().persistent().set(&key, agents);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}
