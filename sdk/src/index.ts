/**
 * @agentguard/sdk
 *
 * Lightweight SDK for verifying AI agent identity and roles against the
 * AgentGuard Soroban smart contract on the Stellar network.
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

export { AgentGuardClient, AgentUnauthorizedError, SimulationError } from "./agent-guard-client.js";
export { Role, type AgentRecord, type AgentGuardConfig } from "./types.js";
