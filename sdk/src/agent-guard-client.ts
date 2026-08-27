/**
 * @agentguard/sdk — AgentGuard Verification Client
 *
 * A lightweight, modular SDK for Web3 resource providers to verify AI agent
 * identity and roles against the deployed AgentGuard Soroban contract.
 *
 * ## Usage
 *
 * ```typescript
 * import { AgentGuardClient, Role } from "@agentguard/sdk";
 *
 * const guard = new AgentGuardClient({
 *   contractId: "CABC...XYZ",
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 *   networkPassphrase: Networks.TESTNET,
 * });
 *
 * // Simple boolean check
 * const isAuthorized = await guard.verifyAgent(agentPublicKey, Role.Premium);
 *
 * // Or enforce — throws AgentUnauthorizedError if unauthorized
 * await guard.requireAgent(agentPublicKey, Role.Premium);
 * ```
 *
 * ## Design Notes
 *
 * - `verifyAgent` and `getAgent` use **transaction simulation** (read-only),
 *   meaning no signing is required and no fees are charged. This makes the
 *   SDK suitable for high-frequency middleware checks.
 * - The client is stateless and can be instantiated once per service.
 */

import {
  Account,
  Contract,
  TransactionBuilder,
  Keypair,
  Networks,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
} from "@stellar/stellar-sdk";
import { rpc as StellarRpc } from "@stellar/stellar-sdk";
import { AgentGuardConfig, AgentRecord, Role } from "./types.js";

// ---------------------------------------------------------------------------
// Custom Error
// ---------------------------------------------------------------------------

/**
 * Thrown when an agent fails a verification check.
 *
 * Contains structured information about the failure for logging and debugging.
 */
export class AgentUnauthorizedError extends Error {
  public readonly agentPublicKey: string;
  public readonly requiredRole: Role;

  constructor(agentPublicKey: string, requiredRole: Role) {
    const roleName = Role[requiredRole] ?? `Unknown(${requiredRole})`;
    super(
      `Agent ${agentPublicKey} is not authorized for role "${roleName}". ` +
        `The agent either does not exist on-chain or lacks the required permission.`
    );
    this.name = "AgentUnauthorizedError";
    this.agentPublicKey = agentPublicKey;
    this.requiredRole = requiredRole;
  }
}

/**
 * Thrown when the Soroban RPC simulation fails unexpectedly.
 */
export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationError";
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Lightweight client for verifying AI agent identity and roles against the
 * on-chain AgentGuard contract.
 *
 * All read operations use transaction simulation — no signing keys or
 * transaction fees are required.
 */
export class AgentGuardClient {
  private readonly contract: Contract;
  private readonly server: StellarRpc.Server;
  private readonly networkPassphrase: string;

  /**
   * A disposable keypair used solely as the "source account" for read-only
   * simulations. No real funds or signing authority are attached to it.
   */
  private readonly simulationKeypair: Keypair;

  constructor(config: AgentGuardConfig) {
    this.contract = new Contract(config.contractId);
    this.server = new StellarRpc.Server(config.rpcUrl);
    this.networkPassphrase = config.networkPassphrase;
    this.simulationKeypair = Keypair.random();
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Verify that an agent holds a specific role.
   *
   * This is a **read-only** operation — it simulates the `verify_agent`
   * contract function without submitting a real transaction. No fees, no
   * signing required.
   *
   * @param agentPublicKey - The Stellar public key (G...) of the AI agent.
   * @param requiredRole   - The minimum role the agent must hold.
   * @returns `true` if the agent is registered and holds the required role,
   *          `false` otherwise.
   * @throws {SimulationError} If the RPC simulation fails unexpectedly.
   */
  async verifyAgent(agentPublicKey: string, requiredRole: Role): Promise<boolean> {
    const result = await this.simulateCall("verify_agent", [
      new Address(agentPublicKey).toScVal(),
      nativeToScVal(requiredRole, { type: "u32" }),
    ]);

    return scValToNative(result) as boolean;
  }

  /**
   * Verify an agent and throw if unauthorized.
   *
   * Convenience wrapper around `verifyAgent` for middleware-style usage
   * where an exception is the desired failure mode.
   *
   * @throws {AgentUnauthorizedError} If the agent is not authorized.
   * @throws {SimulationError} If the RPC simulation fails.
   */
  async requireAgent(agentPublicKey: string, requiredRole: Role): Promise<void> {
    const authorized = await this.verifyAgent(agentPublicKey, requiredRole);
    if (!authorized) {
      throw new AgentUnauthorizedError(agentPublicKey, requiredRole);
    }
  }

  /**
   * Retrieve the full on-chain record for an agent.
   *
   * @param agentPublicKey - The Stellar public key (G...) of the AI agent.
   * @returns The decoded `AgentRecord`, or `null` if the agent is not registered.
   * @throws {SimulationError} If the RPC simulation fails.
   */
  async getAgent(agentPublicKey: string): Promise<AgentRecord | null> {
    try {
      const result = await this.simulateCall("get_agent", [
        new Address(agentPublicKey).toScVal(),
      ]);

      const native = scValToNative(result) as Record<string, unknown>;

      return {
        owner: native["owner"] as string,
        roles: (native["roles"] as number[]).map((r: number) => r as Role),
        registeredAt: Number(native["registered_at"]),
      };
    } catch {
      // get_agent returns Error::AgentNotFound if not registered — treat as null
      return null;
    }
  }

  // =========================================================================
  // Internal: Transaction Simulation
  // =========================================================================

  /**
   * Simulate a read-only contract call and extract the return value.
   *
   * Builds a minimal transaction with a throwaway source account, sends it
   * to the Soroban RPC for simulation (no submission to the network), and
   * decodes the result.
   */
  private async simulateCall(
    method: string,
    args: xdr.ScVal[]
  ): Promise<xdr.ScVal> {
    // Build the invocation operation
    const operation = this.contract.call(method, ...args);

    // We need a valid account to build the transaction envelope.
    // For read-only simulation, any account works — it won't be charged.
    const sourcePublicKey = this.simulationKeypair.publicKey();
    let account: Account;

    try {
      account = await this.server.getAccount(sourcePublicKey);
    } catch {
      // Account may not exist on-chain — use a synthetic account for simulation
      account = new Account(sourcePublicKey, "0");
    }

    const transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simulation = await this.server.simulateTransaction(transaction);

    // Check for simulation failure
    if (StellarRpc.Api.isSimulationError(simulation)) {
      throw new SimulationError(
        `Contract simulation failed: ${simulation.error}`
      );
    }

    if (!StellarRpc.Api.isSimulationSuccess(simulation)) {
      throw new SimulationError(
        "Contract simulation returned an unexpected state (not success, not error)."
      );
    }

    // Extract the return value from the simulation result
    const returnValue = simulation.result?.retval;
    if (!returnValue) {
      throw new SimulationError(
        `Simulation succeeded but returned no value for method "${method}".`
      );
    }

    return returnValue;
  }
}
