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
use crate::events::{
    AgentDeregistered, AgentRegistered, MetadataUpdated, OwnershipTransferred, RoleGranted,
    RoleRevoked, StatusChanged,
};
use crate::storage::{self, DataKey, TTL_EXTEND_TO, TTL_THRESHOLD};
use crate::types::{AgentMetadata, AgentRecord, AgentStatus, Role};
use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

// ---------------------------------------------------------------------------
// TTL Constants
// ---------------------------------------------------------------------------

// TTL constants live in `storage` and are used for instance + persistent rent.

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
        Self::authorize_owner(&env, &owner)?;
        metadata.validate()?;

        // Guard: prevent duplicate registration
        if storage::has_agent(&env, agent_id.clone()) {
            return Err(Error::AgentAlreadyRegistered);
        }

        let record = AgentRecord::new(&env, owner.clone(), AgentStatus::Active);
        storage::write_agent(&env, agent_id.clone(), &record);
        storage::write_metadata(&env, agent_id.clone(), &metadata);

        // Add agent to owner's agent list
        storage::add_owner_agent(&env, owner.clone(), agent_id.clone());

        AgentRegistered { agent_id, owner, name: metadata.name.clone() }.publish(&env);

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

        let record = storage::read_agent(&env, agent_id.clone())?;

        // Only the registered owner can deregister
        if record.owner != owner {
            return Err(Error::NotAgentOwner);
        }

        // Remove the agent record
        storage::remove_agent(&env, agent_id.clone());

        // Remove the metadata
        storage::remove_metadata(&env, agent_id.clone());

        // Remove from owner's agent list
        storage::remove_owner_agent(&env, owner.clone(), agent_id.clone());

        AgentDeregistered { agent_id, owner }.publish(&env);

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

        let mut record = storage::read_agent(&env, agent_id.clone())?;

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
        storage::write_agent(&env, agent_id.clone(), &record);

        RoleGranted { agent_id, owner, role }.publish(&env);

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

        let mut record = storage::read_agent(&env, agent_id.clone())?;

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
        storage::write_agent(&env, agent_id.clone(), &record);

        RoleRevoked { agent_id, owner, role }.publish(&env);

        Ok(())
    }

    // =======================================================================
    // Status Management
    // =======================================================================

    /// Temporarily disable an agent (`Active → Suspended`).
    pub fn suspend_agent(env: Env, owner: Address, agent_id: Address) -> Result<(), Error> {
        Self::authorize_owner(&env, &owner)?;
        let mut record = Self::load_owned_agent(&env, &owner, agent_id.clone())?;
        record.status = AgentStatus::Suspended;
        storage::write_agent(&env, agent_id.clone(), &record);
        StatusChanged { agent_id, owner, status: AgentStatus::Suspended }.publish(&env);
        Ok(())
    }

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

        let mut record = storage::read_agent(&env, agent_id.clone())?;

        // Ownership check
        if record.owner != owner {
            return Err(Error::NotAgentOwner);
        }

        record.status = status;
        storage::write_agent(&env, agent_id.clone(), &record);

        StatusChanged { agent_id, owner, status }.publish(&env);

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
    /// Returns `true` if the agent is registered, Active, and holds a role that
    /// is greater than or equal to `required_role` (`Admin` satisfies `Premium`
    /// and `Basic`; `Premium` satisfies `Basic`).
    /// Returns `false` for unregistered, suspended, or under-privileged agents
    /// (never panics).
    #[must_use]
    pub fn verify_agent(env: Env, agent_id: Address, required_role: Role) -> bool {
        match storage::read_agent(&env, agent_id) {
            Ok(record) => {
                if record.status != AgentStatus::Active {
                    return false;
                }
                for role in record.roles.iter() {
                    if role >= required_role {
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
        storage::read_agent(&env, agent_id)
    }

    /// Retrieve the metadata associated with an agent.
    ///
    /// # Errors
    /// - `Error::AgentNotFound` if no metadata exists.
    pub fn get_agent_metadata(env: Env, agent_id: Address) -> Result<AgentMetadata, Error> {
        storage::read_metadata(&env, agent_id)
    }

    /// Replace the metadata for a registered agent.
    ///
    /// # Errors
    /// - `Error::AgentNotFound` if no record exists for `agent_id`.
    /// - `Error::NotAgentOwner` if `owner` doesn't own this agent.
    pub fn update_agent_metadata(
        env: Env,
        owner: Address,
        agent_id: Address,
        metadata: AgentMetadata,
    ) -> Result<(), Error> {
        Self::require_initialized(&env)?;
        owner.require_auth();

        let record = storage::read_agent(&env, agent_id.clone())?;
        if record.owner != owner {
            return Err(Error::NotAgentOwner);
        }

        metadata.validate()?;
        storage::write_metadata(&env, agent_id.clone(), &metadata);
        MetadataUpdated { agent_id, owner }.publish(&env);

        Ok(())
    }

    /// Return the contract administrator address.
    ///
    /// # Errors
    /// - `Error::NotInitialized` if the contract hasn't been initialized.
    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
    }

    /// List all agent addresses registered under an owner.
    ///
    /// Returns an empty vector if the owner has no agents.
    #[must_use]
    pub fn get_owner_agents(env: Env, owner: Address) -> Vec<Address> {
        storage::read_owner_agents(&env, owner)
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

        let mut record = storage::read_agent(&env, agent_id.clone())?;

        if record.owner != current_owner {
            return Err(Error::NotAgentOwner);
        }

        // Update the record's owner
        record.owner = new_owner.clone();
        storage::write_agent(&env, agent_id.clone(), &record);

        // Remove agent from current owner's list
        storage::remove_owner_agent(&env, current_owner.clone(), agent_id.clone());
        storage::add_owner_agent(&env, new_owner.clone(), agent_id.clone());

        OwnershipTransferred { agent_id, from: current_owner, to: new_owner }.publish(&env);

        Ok(())
    }

    // =======================================================================
    // Internal Helpers
    // =======================================================================

    // =======================================================================
    // Internal Storage Helpers
    // =======================================================================

    /// Require initialization plus `owner.require_auth()`.
    fn authorize_owner(env: &Env, owner: &Address) -> Result<(), Error> {
        Self::require_initialized(env)?;
        owner.require_auth();
        Ok(())
    }

    fn load_owned_agent(
        env: &Env,
        owner: &Address,
        agent_id: Address,
    ) -> Result<AgentRecord, Error> {
        let record = storage::read_agent(env, agent_id)?;
        record.require_owner(owner)?;
        Ok(record)
    }

    /// Asserts the contract has been initialized.
    fn require_initialized(env: &Env) -> Result<(), Error> {
        if !env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::NotInitialized);
        }
        Ok(())
    }
}
