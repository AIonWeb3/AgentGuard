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
use crate::types::{AgentRecord, DataKey, Role};
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
    pub fn register_agent(env: Env, owner: Address, agent_id: Address) -> Result<(), Error> {
        Self::require_initialized(&env)?;

        // Only the owner can register agents under their account
        owner.require_auth();

        // Guard: prevent duplicate registration
        let agent_key = DataKey::Agent(agent_id.clone());
        if env.storage().persistent().has(&agent_key) {
            return Err(Error::AgentAlreadyRegistered);
        }

        // Create the agent record with an empty role set
        let record = AgentRecord {
            owner: owner.clone(),
            roles: Vec::new(&env),
            registered_at: env.ledger().timestamp(),
        };

        // Store the agent record
        env.storage().persistent().set(&agent_key, &record);
        env.storage().persistent().extend_ttl(&agent_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        // Add agent to owner's agent list
        let owner_key = DataKey::OwnerAgents(owner);
        let mut agents: Vec<Address> =
            env.storage().persistent().get(&owner_key).unwrap_or(Vec::new(&env));
        agents.push_back(agent_id);
        env.storage().persistent().set(&owner_key, &agents);
        env.storage().persistent().extend_ttl(&owner_key, TTL_THRESHOLD, TTL_EXTEND_TO);

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

        let agent_key = DataKey::Agent(agent_id.clone());
        let record: AgentRecord =
            env.storage().persistent().get(&agent_key).ok_or(Error::AgentNotFound)?;

        // Only the registered owner can deregister
        if record.owner != owner {
            return Err(Error::NotAgentOwner);
        }

        // Remove the agent record
        env.storage().persistent().remove(&agent_key);

        // Remove from owner's agent list
        let owner_key = DataKey::OwnerAgents(owner);
        if let Some(agents) = env.storage().persistent().get::<_, Vec<Address>>(&owner_key) {
            let mut new_agents = Vec::new(&env);
            for a in agents.iter() {
                if a != agent_id {
                    new_agents.push_back(a);
                }
            }
            if new_agents.is_empty() {
                env.storage().persistent().remove(&owner_key);
            } else {
                env.storage().persistent().set(&owner_key, &new_agents);
                env.storage().persistent().extend_ttl(&owner_key, TTL_THRESHOLD, TTL_EXTEND_TO);
            }
        }

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

        let agent_key = DataKey::Agent(agent_id);
        let mut record: AgentRecord =
            env.storage().persistent().get(&agent_key).ok_or(Error::AgentNotFound)?;

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
        env.storage().persistent().set(&agent_key, &record);
        env.storage().persistent().extend_ttl(&agent_key, TTL_THRESHOLD, TTL_EXTEND_TO);

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

        let agent_key = DataKey::Agent(agent_id);
        let mut record: AgentRecord =
            env.storage().persistent().get(&agent_key).ok_or(Error::AgentNotFound)?;

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
        env.storage().persistent().set(&agent_key, &record);
        env.storage().persistent().extend_ttl(&agent_key, TTL_THRESHOLD, TTL_EXTEND_TO);

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
        let agent_key = DataKey::Agent(agent_id);

        match env.storage().persistent().get::<_, AgentRecord>(&agent_key) {
            Some(record) => {
                for role in record.roles.iter() {
                    if role == required_role {
                        return true;
                    }
                }
                false
            }
            None => false,
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
        let agent_key = DataKey::Agent(agent_id);
        env.storage().persistent().get(&agent_key).ok_or(Error::AgentNotFound)
    }

    /// List all agent addresses registered under an owner.
    ///
    /// Returns an empty vector if the owner has no agents.
    #[must_use] 
    pub fn get_owner_agents(env: Env, owner: Address) -> Vec<Address> {
        let owner_key = DataKey::OwnerAgents(owner);
        env.storage().persistent().get(&owner_key).unwrap_or(Vec::new(&env))
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

        let agent_key = DataKey::Agent(agent_id.clone());
        let mut record: AgentRecord =
            env.storage().persistent().get(&agent_key).ok_or(Error::AgentNotFound)?;

        if record.owner != current_owner {
            return Err(Error::NotAgentOwner);
        }

        // Update the record's owner
        record.owner = new_owner.clone();
        env.storage().persistent().set(&agent_key, &record);
        env.storage().persistent().extend_ttl(&agent_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        // Remove agent from current owner's list
        let current_key = DataKey::OwnerAgents(current_owner);
        if let Some(agents) = env.storage().persistent().get::<_, Vec<Address>>(&current_key) {
            let mut new_list = Vec::new(&env);
            for a in agents.iter() {
                if a != agent_id {
                    new_list.push_back(a);
                }
            }
            if new_list.is_empty() {
                env.storage().persistent().remove(&current_key);
            } else {
                env.storage().persistent().set(&current_key, &new_list);
                env.storage().persistent().extend_ttl(&current_key, TTL_THRESHOLD, TTL_EXTEND_TO);
            }
        }

        // Add agent to new owner's list
        let new_key = DataKey::OwnerAgents(new_owner);
        let mut new_agents: Vec<Address> =
            env.storage().persistent().get(&new_key).unwrap_or(Vec::new(&env));
        new_agents.push_back(agent_id);
        env.storage().persistent().set(&new_key, &new_agents);
        env.storage().persistent().extend_ttl(&new_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        Ok(())
    }

    // =======================================================================
    // Internal Helpers
    // =======================================================================

    /// Asserts the contract has been initialized.
    fn require_initialized(env: &Env) -> Result<(), Error> {
        if !env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }
        Ok(())
    }
}
