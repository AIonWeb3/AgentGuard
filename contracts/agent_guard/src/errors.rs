//! # `AgentGuard` — Error Definitions
//!
//! All error codes returned by the `AgentGuard` contract. Using `#[contracterror]`
//! ensures these are properly encoded in the Wasm ABI and surfaced to callers
//! (including cross-contract calls from `AgentPay`) as structured error values.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,

    /// The contract has not been initialized yet.
    NotInitialized = 2,

    /// An agent with this ID is already registered.
    AgentAlreadyRegistered = 3,

    /// No agent record found for the given ID.
    AgentNotFound = 4,

    /// The caller is not the registered owner of this agent.
    NotAgentOwner = 5,

    /// The agent already holds the specified role.
    RoleAlreadyGranted = 6,

    /// The agent does not hold the specified role (cannot revoke).
    RoleNotFound = 7,

    /// General authorization failure.
    Unauthorized = 8,
}
