//! # AgentGuard — Comprehensive Test Suite
//!
//! Tests cover every public function including success paths, error cases,
//! and authorization boundary checks.

#![cfg(test)]

use crate::contract::AgentGuardContractClient;
use crate::types::Role;
use soroban_sdk::{testutils::Address as _, Address, Env};

// ---------------------------------------------------------------------------
// Helper: set up a fresh environment with an initialized contract
// ---------------------------------------------------------------------------

fn setup() -> (Env, AgentGuardContractClient<'static>, Address) {
    let env = Env::default();
    // Allow all auth calls in test mode so we can focus on logic
    env.mock_all_auths();

    let contract_id = env.register(crate::contract::AgentGuardContract, ());
    let client = AgentGuardContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    (env, client, admin)
}

// ===========================================================================
// Initialization Tests
// ===========================================================================

#[test]
fn test_initialize_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(crate::contract::AgentGuardContract, ());
    let client = AgentGuardContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);
    // No panic = success
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_initialize_fails() {
    let (env, client, admin) = setup();
    let _ = &env; // suppress unused warning
    // Second initialization should fail with AlreadyInitialized (error code 1)
    client.initialize(&admin);
}

// ===========================================================================
// Agent Registration Tests
// ===========================================================================

#[test]
fn test_register_agent() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);

    // Verify the agent record exists
    let record = client.get_agent(&agent);
    assert_eq!(record.owner, owner);
    assert_eq!(record.roles.len(), 0);

    // Verify owner's agent list
    let agents = client.get_owner_agents(&owner);
    assert_eq!(agents.len(), 1);
    assert_eq!(agents.get(0).unwrap(), agent);
}

#[test]
fn test_register_multiple_agents() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent1 = Address::generate(&env);
    let agent2 = Address::generate(&env);

    client.register_agent(&owner, &agent1);
    client.register_agent(&owner, &agent2);

    let agents = client.get_owner_agents(&owner);
    assert_eq!(agents.len(), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_register_duplicate_agent_fails() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    // Registering the same agent again should fail
    client.register_agent(&owner, &agent);
}

// ===========================================================================
// Agent Deregistration Tests
// ===========================================================================

#[test]
fn test_deregister_agent() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    client.deregister_agent(&owner, &agent);

    // Agent should no longer exist
    let agents = client.get_owner_agents(&owner);
    assert_eq!(agents.len(), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_deregister_nonexistent_agent_fails() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.deregister_agent(&owner, &agent);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_deregister_agent_wrong_owner_fails() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    // A different address trying to deregister should fail
    client.deregister_agent(&attacker, &agent);
}

// ===========================================================================
// Role Management Tests
// ===========================================================================

#[test]
fn test_grant_role() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    client.grant_role(&owner, &agent, &Role::Basic);

    let record = client.get_agent(&agent);
    assert_eq!(record.roles.len(), 1);
    assert_eq!(record.roles.get(0).unwrap(), Role::Basic);
}

#[test]
fn test_grant_multiple_roles() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    client.grant_role(&owner, &agent, &Role::Basic);
    client.grant_role(&owner, &agent, &Role::Premium);
    client.grant_role(&owner, &agent, &Role::Admin);

    let record = client.get_agent(&agent);
    assert_eq!(record.roles.len(), 3);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_grant_duplicate_role_fails() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    client.grant_role(&owner, &agent, &Role::Basic);
    // Granting the same role again should fail
    client.grant_role(&owner, &agent, &Role::Basic);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_grant_role_wrong_owner_fails() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    // Attacker cannot grant roles on someone else's agent
    client.grant_role(&attacker, &agent, &Role::Admin);
}

#[test]
fn test_revoke_role() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    client.grant_role(&owner, &agent, &Role::Basic);
    client.grant_role(&owner, &agent, &Role::Premium);

    // Revoke Basic
    client.revoke_role(&owner, &agent, &Role::Basic);

    let record = client.get_agent(&agent);
    assert_eq!(record.roles.len(), 1);
    assert_eq!(record.roles.get(0).unwrap(), Role::Premium);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_revoke_role_not_found_fails() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    // Agent has no roles — revoke should fail
    client.revoke_role(&owner, &agent, &Role::Admin);
}

// ===========================================================================
// Verification Tests
// ===========================================================================

#[test]
fn test_verify_agent_with_role() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    client.grant_role(&owner, &agent, &Role::Premium);

    assert!(client.verify_agent(&agent, &Role::Premium));
}

#[test]
fn test_verify_agent_without_role() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    client.grant_role(&owner, &agent, &Role::Basic);

    // Agent has Basic, but we're checking for Admin — should return false
    assert!(!client.verify_agent(&agent, &Role::Admin));
}

#[test]
fn test_verify_unregistered_agent() {
    let (env, client, _admin) = setup();

    let unknown_agent = Address::generate(&env);

    // Unregistered agent should return false (never panic)
    assert!(!client.verify_agent(&unknown_agent, &Role::Basic));
}

// ===========================================================================
// Ownership Transfer Tests
// ===========================================================================

#[test]
fn test_transfer_ownership() {
    let (env, client, _admin) = setup();

    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner1, &agent);
    client.grant_role(&owner1, &agent, &Role::Basic);

    // Transfer from owner1 to owner2
    client.transfer_ownership(&owner1, &agent, &owner2);

    // Verify new ownership
    let record = client.get_agent(&agent);
    assert_eq!(record.owner, owner2);

    // Old owner should have no agents
    let old_agents = client.get_owner_agents(&owner1);
    assert_eq!(old_agents.len(), 0);

    // New owner should have the agent
    let new_agents = client.get_owner_agents(&owner2);
    assert_eq!(new_agents.len(), 1);

    // Roles should be preserved after transfer
    assert_eq!(record.roles.len(), 1);
    assert_eq!(record.roles.get(0).unwrap(), Role::Basic);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_transfer_ownership_wrong_owner_fails() {
    let (env, client, _admin) = setup();

    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let agent = Address::generate(&env);

    client.register_agent(&owner, &agent);
    // Attacker cannot transfer someone else's agent
    client.transfer_ownership(&attacker, &agent, &new_owner);
}

// ===========================================================================
// Edge Case: Operations on uninitialized contract
// ===========================================================================

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_register_before_init_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(crate::contract::AgentGuardContract, ());
    let client = AgentGuardContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    // Contract not initialized — should fail
    client.register_agent(&owner, &agent);
}
