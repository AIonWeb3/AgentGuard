//! # `AgentGuard` — On-Chain AI Identity & RBAC Registry
//!
//! A Soroban smart contract that serves as the authentication layer for
//! autonomous LLM agents on the Stellar network. It enables:
//!
//! - **Agent Registration**: Human owners register AI agents under their wallet.
//! - **Role-Based Access Control**: Owners assign granular roles (Basic, Premium,
//!   Admin) to their agents.
//! - **Verification**: Resource providers and the `AgentPay` settlement contract
//!   call `verify_agent` to check an agent's identity and permissions before
//!   granting access or executing financial operations.
//!
//! ## Architecture
//!
//! ```text
//!  ┌──────────────┐      register / grant_role      ┌────────────────┐
//!  │  Agent Owner  │ ──────────────────────────────► │  AgentGuard    │
//!  │  (Human)      │                                 │  Contract      │
//!  └──────────────┘                                 └───────┬────────┘
//!                                                           │
//!                              verify_agent (read-only)     │
//!  ┌──────────────┐                                         │
//!  │  AgentPay    │ ◄───────────────────────────────────────┘
//!  │  Contract    │     cross-contract call
//!  └──────────────┘
//! ```

#![no_std]

mod contract;
mod errors;
mod types;

#[cfg(test)]
mod test;

pub use contract::*;
pub use errors::*;
pub use types::*;
