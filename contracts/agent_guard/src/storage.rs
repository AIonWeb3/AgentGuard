//! Deterministic persistent and instance storage keys for AgentGuard.
//!
//! Keys are `#[contracttype]` enums so encodings stay stable across upgrades.
//! Agent identity data uses persistent storage; admin/init flags use instance storage.

use crate::errors::Error;
use crate::types::{AgentMetadata, AgentRecord, Permission, PermissionKey, ResourceId, Role};
use soroban_sdk::{contracttype, Address, Env, Vec};

/// Minimum TTL (in ledgers) before an extension is triggered.
pub const TTL_THRESHOLD: u32 = 120_960;

/// TTL to extend to (in ledgers) when threshold is reached.
pub const TTL_EXTEND_TO: u32 = 518_400;

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

    /// Resource permission keyed by agent, resource, and role. **Persistent.**
    Permission(PermissionKey),
}

pub fn write_metadata(env: &Env, agent_id: Address, metadata: &AgentMetadata) {
    let key = DataKey::AgentMetadata(agent_id);
    env.storage().persistent().set(&key, metadata);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn read_permission(
    env: &Env,
    agent_id: Address,
    resource_id: ResourceId,
    role: Role,
) -> Result<Permission, Error> {
    let key = permission_storage_key(agent_id, resource_id, role);
    env.storage().persistent().get(&key).ok_or(Error::RoleNotFound)
}

pub fn delete_permission(env: &Env, agent_id: Address, resource_id: ResourceId, role: Role) {
    let key = permission_storage_key(agent_id, resource_id, role);
    env.storage().persistent().remove(&key);
}

pub fn has_permission(env: &Env, agent_id: Address, resource_id: ResourceId, role: Role) -> bool {
    let key = permission_storage_key(agent_id, resource_id, role);
    env.storage().persistent().has(&key)
}

pub fn read_metadata(env: &Env, agent_id: Address) -> Result<AgentMetadata, Error> {
    let key = DataKey::AgentMetadata(agent_id);
    env.storage().persistent().get(&key).ok_or(Error::AgentNotFound)
}

pub fn remove_metadata(env: &Env, agent_id: Address) {
    let key = DataKey::AgentMetadata(agent_id);
    env.storage().persistent().remove(&key);
}

pub fn read_agent(env: &Env, agent_id: Address) -> Result<AgentRecord, Error> {
    let key = DataKey::Agent(agent_id);
    env.storage().persistent().get(&key).ok_or(Error::AgentNotFound)
}

pub fn write_agent(env: &Env, agent_id: Address, record: &AgentRecord) {
    let key = DataKey::Agent(agent_id);
    env.storage().persistent().set(&key, record);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn has_agent(env: &Env, agent_id: Address) -> bool {
    let key = DataKey::Agent(agent_id);
    env.storage().persistent().has(&key)
}

pub fn touch_agent(env: &Env, agent_id: Address) {
    let key = DataKey::Agent(agent_id);
    if env.storage().persistent().has(&key) {
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

pub fn remove_agent(env: &Env, agent_id: Address) {
    let key = DataKey::Agent(agent_id);
    env.storage().persistent().remove(&key);
}

pub fn read_owner_agents(env: &Env, owner: Address) -> Vec<Address> {
    let key = DataKey::OwnerAgents(owner);
    env.storage().persistent().get(&key).unwrap_or(Vec::new(env))
}

pub fn write_owner_agents(env: &Env, owner: Address, agents: &Vec<Address>) {
    let key = DataKey::OwnerAgents(owner);
    if agents.is_empty() {
        env.storage().persistent().remove(&key);
    } else {
        env.storage().persistent().set(&key, agents);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

pub fn touch_owner_agents(env: &Env, owner: Address) {
    let key = DataKey::OwnerAgents(owner);
    if env.storage().persistent().has(&key) {
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

/// Append `agent_id` if it is not already present. Preserves insertion order.
pub fn add_owner_agent(env: &Env, owner: Address, agent_id: Address) {
    let mut agents = read_owner_agents(env, owner.clone());
    for existing in agents.iter() {
        if existing == agent_id {
            return;
        }
    }
    agents.push_back(agent_id);
    write_owner_agents(env, owner, &agents);
}

/// Remove `agent_id` from the owner's index if present.
pub fn remove_owner_agent(env: &Env, owner: Address, agent_id: Address) {
    let agents = read_owner_agents(env, owner.clone());
    let mut next = Vec::new(env);
    for existing in agents.iter() {
        if existing != agent_id {
            next.push_back(existing);
        }
    }
    write_owner_agents(env, owner, &next);
}

const fn permission_storage_key(agent_id: Address, resource_id: ResourceId, role: Role) -> DataKey {
    DataKey::Permission(PermissionKey::new(agent_id, resource_id, role))
}

pub fn write_permission(env: &Env, agent_id: Address, permission: &Permission) {
    let key = permission_storage_key(agent_id, permission.resource_id.clone(), permission.role);
    env.storage().persistent().set(&key, permission);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}
