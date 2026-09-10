//! On-chain events emitted by AgentGuard for indexers and audit trails.

use crate::types::{AgentStatus, ResourceId, Role};
use soroban_sdk::{contractevent, Address, String};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentRegistered {
    #[topic]
    pub agent_id: Address,
    #[topic]
    pub owner: Address,
    pub name: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentDeregistered {
    #[topic]
    pub agent_id: Address,
    pub owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentSuspended {
    #[topic]
    pub agent_id: Address,
    #[topic]
    pub owner: Address,
    pub previous_status: AgentStatus,
    pub new_status: AgentStatus,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentReactivated {
    #[topic]
    pub agent_id: Address,
    #[topic]
    pub owner: Address,
    pub previous_status: AgentStatus,
    pub new_status: AgentStatus,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentRevoked {
    #[topic]
    pub agent_id: Address,
    #[topic]
    pub owner: Address,
    pub previous_status: AgentStatus,
    pub new_status: AgentStatus,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleGranted {
    #[topic]
    pub agent_id: Address,
    pub owner: Address,
    pub role: Role,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleRevoked {
    #[topic]
    pub agent_id: Address,
    pub owner: Address,
    pub role: Role,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StatusChanged {
    #[topic]
    pub agent_id: Address,
    pub owner: Address,
    pub status: AgentStatus,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataUpdated {
    #[topic]
    pub agent_id: Address,
    pub owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferred {
    #[topic]
    pub agent_id: Address,
    pub from: Address,
    pub to: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResourceRoleGranted {
    #[topic]
    pub agent_id: Address,
    #[topic]
    pub resource_id: ResourceId,
    pub owner: Address,
    pub role: Role,
    pub expires_at: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResourceRoleRevoked {
    #[topic]
    pub agent_id: Address,
    #[topic]
    pub resource_id: ResourceId,
    pub owner: Address,
    pub role: Role,
}
