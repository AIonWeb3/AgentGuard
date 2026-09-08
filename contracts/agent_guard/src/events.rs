//! On-chain events emitted by AgentGuard for indexers and audit trails.

use crate::types::{AgentStatus, Role};
use soroban_sdk::{contractevent, Address};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentRegistered {
    #[topic]
    pub agent_id: Address,
    pub owner: Address,
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
