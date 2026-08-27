/**
 * @agentguard/sdk — TypeScript Types
 *
 * Mirrors the on-chain data types from the AgentGuard Soroban contract.
 * These enums and interfaces ensure type-safe interaction from JavaScript.
 */

/**
 * Role hierarchy matching the on-chain `Role` enum.
 *
 * Values correspond to the `#[repr(u32)]` discriminants in the Rust contract:
 * - Basic   = 0
 * - Premium = 1
 * - Admin   = 2
 */
export enum Role {
  Basic = 0,
  Premium = 1,
  Admin = 2,
}

/**
 * Decoded agent record from the on-chain `AgentRecord` struct.
 */
export interface AgentRecord {
  /** The Stellar address of the human owner who registered this agent. */
  owner: string;
  /** Set of roles currently granted to this agent. */
  roles: Role[];
  /** Ledger timestamp (unix epoch) at which the agent was first registered. */
  registeredAt: number;
}

/**
 * Configuration options for the AgentGuard client.
 */
export interface AgentGuardConfig {
  /** The deployed AgentGuard contract ID (e.g., "CA..."). */
  contractId: string;
  /** Soroban RPC endpoint URL. */
  rpcUrl: string;
  /** Network passphrase (e.g., Networks.TESTNET or Networks.PUBLIC). */
  networkPassphrase: string;
}
