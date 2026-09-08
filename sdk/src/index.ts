/**
 * @agentguard/sdk
 *
 * Identity and RBAC client for the AgentGuard Soroban contract.
 *
 * @example
 * ```typescript
 * import { AgentGuardClient, Role } from "@agentguard/sdk";
 * import { Networks } from "@stellar/stellar-sdk";
 *
 * const guard = new AgentGuardClient({
 *   contractId: "CABC...XYZ",
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 *   networkPassphrase: Networks.TESTNET,
 * });
 *
 * const authorized = await guard.verifyAgent(agentPublicKey, Role.Premium);
 * ```
 */

export {
  AgentGuardClient,
  AgentUnauthorizedError,
  SimulationError,
  TransactionError,
} from "./agent-guard-client.js";
export {
  Role,
  AgentStatus,
  ROLE_LABELS,
  STATUS_LABELS,
  type AgentRecord,
  type AgentMetadata,
  type AgentProfile,
  type AgentGuardConfig,
  type TransactionSigner,
  type SubmittedTransaction,
} from "./types.js";
export {
  AGENT_HEADER,
  enforceAgentRole,
  requireRole,
  type GuardRequest,
  type GuardFailure,
  type GuardResult,
} from "./middleware.js";
