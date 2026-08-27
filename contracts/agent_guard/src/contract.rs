//! # `AgentGuard` — Core Contract Logic
//!
//! Implements the on-chain AI agent identity registry with role-based access
//! control (RBAC). This contract is designed to be called by:
//!
//! 1. **Agent owners** — to register/deregister agents and manage their roles.
//! 2. **Resource providers / `AgentPay`** — to verify an agent's identity and
//!    permissions before allowing access or executing financial settlements.
//!
//! ## Cross-Contract Interaction with `AgentPay`
//!
//! The `verify_agent` function is a **pure read** — it requires no authorization
//! and mutates no state. This makes it ideal for cross-contract invocation:
//!
//! ```text
//! // In AgentPay's settlement function:
//! let guard_client = AgentGuardClient::new(&env, &agent_guard_contract_id);
//! let is_authorized: bool = guard_client.verify_agent(&agent_id, &required_role);
//! if !is_authorized {
//!     panic!("Agent not authorized for this settlement tier");
//! }
//! // ... proceed with payment
//! ```
//!
//! Because `verify_agent` only reads persistent storage, the cross-contract call
//! adds minimal resource overhead (no write footprint, no auth entries).
//!
//! ## TTL Management
//!
//! Persistent entries are auto-extended on every write operation to ensure agent
//! records survive long periods of inactivity. The constants below control the
//! extension window.

use crate::errors::Error;
use crate::types::{AgentMetadata, AgentRecord, AgentStatus, DataKey, Role};
use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

// ---------------------------------------------------------------------------
// TTL Constants
// ---------------------------------------------------------------------------

/// Minimum TTL (in ledgers) before an extension is triggered.
/// ~7 days at ~5 seconds/ledger = 120,960 ledgers.
const TTL_THRESHOLD: u32 = 120_960;

/// TTL to extend to (in ledgers) when threshold is reached.
/// ~30 days at ~5 seconds/ledger = 518,400 ledgers.
const TTL_EXTEND_TO: u32 = 518_400;

// ---------------------------------------------------------------------------
// Contract Definition
// ---------------------------------------------------------------------------

#[contract]
pub struct AgentGuardContract;

#[contractimpl]
impl AgentGuardContract {
    // =======================================================================
    // Initialization
    // =======================================================================

    /// Initialize the `AgentGuard` contract with an administrator.
    ///
    /// Must be called exactly once. The admin address is stored in instance
    /// storage and is authorized on this call to prove ownership.
    ///
    /// # Errors
    /// - `Error::AlreadyInitialized` if called more than once.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        // Guard: only initialize once
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }

        // Require the admin to authorize this initialization
        admin.require_auth();

        // Store admin and mark as initialized
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Initialized, &true);

        // Extend instance TTL to keep contract metadata alive
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        Ok(())
    }

    // =======================================================================
    // Agent Registration
    // =======================================================================

    /// Register a new AI agent under the given owner.
    ///
    /// The owner must authorize this call. The agent is created with an empty
    /// role set — use `grant_role` to assign permissions after registration.
    ///
    /// # Arguments
    /// - `owner` — The human wallet address that controls this agent.
    /// - `agent_id` — The agent's on-chain address (its Stellar keypair).
    ///
    /// # Errors
    /// - `Error::NotInitialized` if the contract hasn't been initialized.
    /// - `Error::AgentAlreadyRegistered` if `agent_id` is already registered.
    pub fn register_agent(
        env: Env,
        owner: Address,
        agent_id: Address,
        metadata: AgentMetadata,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;

        // Only the owner can register agents under their account
        owner.require_auth();

        // Guard: prevent duplicate registration
        if Self::has_agent(&env, agent_id.clone()) {
            return Err(Error::AgentAlreadyRegistered);
        }

        // Create the agent record with an empty role set
        let record = AgentRecord {
            owner: owner.clone(),
            roles: Vec::new(&env),
            status: AgentStatus::Active,
            registered_at: env.ledger().timestamp(),
        };

        // Store the agent record
        Self::write_agent(&env, agent_id.clone(), &record);

        // Store the metadata
        Self::write_metadata(&env, agent_id.clone(), &metadata);

        // Add agent to owner's agent list
        let mut agents = Self::read_owner_agents(&env, owner.clone());
        agents.push_back(agent_id);
        Self::write_owner_agents(&env, owner, &agents);

        Ok(())
    }

    /// Deregister an agent, removing its record and owner index entry.
    ///
    /// # Errors
    /// - `Error::NotInitialized` if the contract hasn't been initialized.
    /// - `Error::AgentNotFound` if no record exists for `agent_id`.
    /// - `Error::NotAgentOwner` if `owner` doesn't own this agent.
    pub fn deregister_agent(env: Env, owner: Address, agent_id: Address) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        owner.require_auth();

        let record = Self::read_agent(&env, agent_id.clone())?;

        // Only the registered owner can deregister
        if record.owner != owner {
            return Err(Error::NotAgentOwner);
        }

        // Remove the agent record
        Self::remove_agent(&env, agent_id.clone());

        // Remove the metadata
        Self::remove_metadata(&env, agent_id.clone());

        // Remove from owner's agent list
        let agents = Self::read_owner_agents(&env, owner.clone());
        let mut new_agents = Vec::new(&env);
        for a in agents.iter() {
            if a != agent_id {
                new_agents.push_back(a);
            }
        }
        Self::write_owner_agents(&env, owner, &new_agents);

        Ok(())
    }

    // =======================================================================
    // Role Management
    // =======================================================================

    /// Grant a role to a registered agent.
    ///
    /// Only the agent's registered owner may call this. Roles are stored as a
    /// vector — we enforce uniqueness to prevent duplicates.
    ///
    /// # Errors
    /// - `Error::AgentNotFound` if no record exists for `agent_id`.
    /// - `Error::NotAgentOwner` if `owner` doesn't own this agent.
    /// - `Error::RoleAlreadyGranted` if the agent already holds `role`.
    pub fn grant_role(
        env: Env,
        owner: Address,
        agent_id: Address,
        role: Role,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        owner.require_auth();

        let mut record = Self::read_agent(&env, agent_id.clone())?;

        // Ownership check
        if record.owner != owner {
            return Err(Error::NotAgentOwner);
        }

        // Check for duplicate role
        for existing_role in record.roles.iter() {
            if existing_role == role {
                return Err(Error::RoleAlreadyGranted);
            }
        }

        // Add the role and persist
        record.roles.push_back(role);
        Self::write_agent(&env, agent_id, &record);

        Ok(())
    }

    /// Revoke a role from a registered agent.
    ///
    /// # Errors
    /// - `Error::AgentNotFound` if no record exists for `agent_id`.
    /// - `Error::NotAgentOwner` if `owner` doesn't own this agent.
    /// - `Error::RoleNotFound` if the agent does not hold `role`.
    pub fn revoke_role(
        env: Env,
        owner: Address,
        agent_id: Address,
        role: Role,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        owner.require_auth();

        let mut record = Self::read_agent(&env, agent_id.clone())?;

        // Ownership check
        if record.owner != owner {
            return Err(Error::NotAgentOwner);
        }

        // Find and remove the role
        let mut found = false;
        let mut new_roles = Vec::new(&env);
        for existing_role in record.roles.iter() {
            if existing_role == role && !found {
                found = true; // Skip this one (remove it)
            } else {
                new_roles.push_back(existing_role);
            }
        }

        if !found {
            return Err(Error::RoleNotFound);
        }

        record.roles = new_roles;
        Self::write_agent(&env, agent_id, &record);

        Ok(())
    }

    // =======================================================================
    // Status Management
    // =======================================================================

    /// Update the operational status of a registered agent.
    ///
    /// Only the agent's registered owner may call this.
    ///
    /// # Errors
    /// - `Error::AgentNotFound` if no record exists for `agent_id`.
    /// - `Error::NotAgentOwner` if `owner` doesn't own this agent.
    pub fn set_agent_status(
        env: Env,
        owner: Address,
        agent_id: Address,
        status: AgentStatus,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        owner.require_auth();

        let mut record = Self::read_agent(&env, agent_id.clone())?;

        // Ownership check
        if record.owner != owner {
            return Err(Error::NotAgentOwner);
        }

        record.status = status;
        Self::write_agent(&env, agent_id, &record);

        Ok(())
    }

    // =======================================================================
    // Verification (Read-Only)
    // =======================================================================

    /// Verify that an agent holds a specific role.
    ///
    /// This is a **pure read function** — no authorization required, no state
    /// mutation. Designed to be called by:
    /// - Resource provider backends (via the TypeScript SDK)
    /// - The `AgentPay` contract (via cross-contract invocation)
    ///
    /// Returns `true` if the agent is registered AND holds the `required_role`.
    /// Returns `false` for unregistered agents or missing roles (never panics).
    #[must_use]
    pub fn verify_agent(env: Env, agent_id: Address, required_role: Role) -> bool {
        match Self::read_agent(&env, agent_id) {
            Ok(record) => {
                if record.status != AgentStatus::Active {
                    return false;
                }
                for role in record.roles.iter() {
                    if role == required_role {
                        return true;
                    }
                }
                false
            }
            Err(_) => false,
        }
    }

    // =======================================================================
    // Query Functions (Read-Only)
    // =======================================================================

    /// Retrieve the full on-chain record for an agent.
    ///
    /// # Errors
    /// - `Error::AgentNotFound` if no record exists.
    pub fn get_agent(env: Env, agent_id: Address) -> Result<AgentRecord, Error> {
        Self::read_agent(&env, agent_id)
    }

    /// List all agent addresses registered under an owner.
    ///
    /// Returns an empty vector if the owner has no agents.
    #[must_use]
    pub fn get_owner_agents(env: Env, owner: Address) -> Vec<Address> {
        Self::read_owner_agents(&env, owner)
    }

    // =======================================================================
    // Ownership Transfer
    // =======================================================================

    /// Transfer ownership of an agent from one owner to another.
    ///
    /// The current owner must authorize this call. The agent's record is updated
    /// to reflect the new owner, and the owner-agent indices are adjusted.
    ///
    /// # Errors
    /// - `Error::AgentNotFound` if no record exists.
    /// - `Error::NotAgentOwner` if `current_owner` doesn't own this agent.
    pub fn transfer_ownership(
        env: Env,
        current_owner: Address,
        agent_id: Address,
        new_owner: Address,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        current_owner.require_auth();

        let mut record = Self::read_agent(&env, agent_id.clone())?;

        if record.owner != current_owner {
            return Err(Error::NotAgentOwner);
        }

        // Update the record's owner
        record.owner = new_owner.clone();
        Self::write_agent(&env, agent_id.clone(), &record);

        // Remove agent from current owner's list
        let agents = Self::read_owner_agents(&env, current_owner.clone());
        let mut new_list = Vec::new(&env);
        for a in agents.iter() {
            if a != agent_id {
                new_list.push_back(a);
            }
        }
        Self::write_owner_agents(&env, current_owner, &new_list);

        // Add agent to new owner's list
        let mut new_agents = Self::read_owner_agents(&env, new_owner.clone());
        new_agents.push_back(agent_id);
        Self::write_owner_agents(&env, new_owner, &new_agents);

        Ok(())
    }

    // =======================================================================
    // Internal Helpers
    // =======================================================================

    // =======================================================================
    // Internal Storage Helpers
    // =======================================================================

    fn write_metadata(env: &Env, agent_id: Address, metadata: &AgentMetadata) {
        let key = DataKey::AgentMetadata(agent_id);
        env.storage().persistent().set(&key, metadata);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn remove_metadata(env: &Env, agent_id: Address) {
        let key = DataKey::AgentMetadata(agent_id);
        env.storage().persistent().remove(&key);
    }

    fn read_agent(env: &Env, agent_id: Address) -> Result<AgentRecord, Error> {
        let key = DataKey::Agent(agent_id);
        env.storage().persistent().get(&key).ok_or(Error::AgentNotFound)
    }

    fn write_agent(env: &Env, agent_id: Address, record: &AgentRecord) {
        let key = DataKey::Agent(agent_id);
        env.storage().persistent().set(&key, record);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn has_agent(env: &Env, agent_id: Address) -> bool {
        let key = DataKey::Agent(agent_id);
        env.storage().persistent().has(&key)
    }

    fn remove_agent(env: &Env, agent_id: Address) {
        let key = DataKey::Agent(agent_id);
        env.storage().persistent().remove(&key);
    }

    fn read_owner_agents(env: &Env, owner: Address) -> Vec<Address> {
        let key = DataKey::OwnerAgents(owner);
        env.storage().persistent().get(&key).unwrap_or(Vec::new(env))
    }

    fn write_owner_agents(env: &Env, owner: Address, agents: &Vec<Address>) {
        let key = DataKey::OwnerAgents(owner);
        if agents.is_empty() {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, agents);
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
    }

    /// Asserts the contract has been initialized.
    fn require_initialized(env: &Env) -> Result<(), Error> {
        if !env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }
        Ok(())
    }
}
