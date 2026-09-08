/**
 * @agentguard/sdk — TypeScript Types
 *
 * Mirrors the on-chain data types from the AgentGuard Soroban contract.
 */

/**
 * Role hierarchy matching the on-chain `Role` enum.
 *
 * Values correspond to the `#[repr(u32)]` discriminants in the Rust contract.
 * Higher roles satisfy lower ones during verification (`Admin` implies `Premium`
 * and `Basic`).
 */
export enum Role {
  Basic = 0,
  Premium = 1,
  Admin = 2,
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.Basic]: "Basic",
  [Role.Premium]: "Premium",
  [Role.Admin]: "Admin",
};

/**
 * Operational status matching the on-chain `AgentStatus` enum.
 */
export enum AgentStatus {
  Active = 0,
  Suspended = 1,
  Revoked = 2,
}

export const STATUS_LABELS: Record<AgentStatus, string> = {
  [AgentStatus.Active]: "Active",
  [AgentStatus.Suspended]: "Suspended",
  [AgentStatus.Revoked]: "Revoked",
};

/**
 * Decoded agent record from the on-chain `AgentRecord` struct.
 */
export interface AgentRecord {
  /** The Stellar address of the human owner who registered this agent. */
  owner: string;
  /** Set of roles currently granted to this agent. */
  roles: Role[];
  /** Current operational status. */
  status: AgentStatus;
  /** Ledger timestamp (unix epoch) at which the agent was first registered. */
  registeredAt: number;
}

/**
 * Human-readable metadata stored alongside the agent record.
 */
export interface AgentMetadata {
  name: string;
  description: string;
  version: number;
}

/**
 * Combined view used by dashboards and provider backends.
 */
export interface AgentProfile extends AgentRecord {
  agentId: string;
  metadata: AgentMetadata | null;
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

/**
 * Signs a Soroban transaction XDR. Freighter, a backend keypair, or any wallet
 * adapter can implement this.
 */
export interface TransactionSigner {
  signTransaction(
    txXdr: string,
    opts: { networkPassphrase: string; address?: string }
  ): Promise<string>;
}

export interface SubmittedTransaction {
  hash: string;
  status: string;
}
