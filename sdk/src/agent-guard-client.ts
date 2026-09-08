/**
 * @agentguard/sdk — AgentGuard Client
 *
 * Read operations use transaction simulation (no fees, no signing).
 * Write operations assemble a Soroban transaction, ask a `TransactionSigner`
 * (Freighter, a backend keypair, …) to sign it, then submit and wait.
 */

import {
  Account,
  Contract,
  TransactionBuilder,
  Keypair,
  nativeToScVal,
  scValToNative,
  Address,
  xdr,
} from "@stellar/stellar-sdk";
import { rpc as StellarRpc } from "@stellar/stellar-sdk";
import {
  AgentGuardConfig,
  AgentMetadata,
  AgentProfile,
  AgentRecord,
  AgentStatus,
  Role,
  SubmittedTransaction,
  TransactionSigner,
} from "./types.js";

export class AgentUnauthorizedError extends Error {
  public readonly agentPublicKey: string;
  public readonly requiredRole: Role;

  constructor(agentPublicKey: string, requiredRole: Role) {
    const roleName = Role[requiredRole] ?? `Unknown(${requiredRole})`;
    super(
      `Agent ${agentPublicKey} is not authorized for role "${roleName}". ` +
        `The agent either does not exist on-chain, is not Active, or lacks the required permission.`
    );
    this.name = "AgentUnauthorizedError";
    this.agentPublicKey = agentPublicKey;
    this.requiredRole = requiredRole;
  }
}

export class SimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationError";
  }
}

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionError";
  }
}

function roleToScVal(role: Role): xdr.ScVal {
  return nativeToScVal(role, { type: "u32" });
}

function statusToScVal(status: AgentStatus): xdr.ScVal {
  return nativeToScVal(status, { type: "u32" });
}

function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

function metadataToScVal(metadata: AgentMetadata): xdr.ScVal {
  return nativeToScVal(
    {
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
    },
    {
      type: {
        name: ["symbol", "string"],
        description: ["symbol", "string"],
        version: ["symbol", "u32"],
      } as never,
    }
  );
}

function decodeRecord(native: Record<string, unknown>): AgentRecord {
  const statusRaw = native["status"];
  let status = AgentStatus.Active;
  if (typeof statusRaw === "number") {
    status = statusRaw as AgentStatus;
  } else if (statusRaw && typeof statusRaw === "object") {
    const name = Object.keys(statusRaw as object)[0];
    status =
      name === "Suspended"
        ? AgentStatus.Suspended
        : name === "Revoked"
          ? AgentStatus.Revoked
          : AgentStatus.Active;
  }

  const rolesRaw = (native["roles"] as unknown[]) ?? [];
  const roles = rolesRaw.map((r) => {
    if (typeof r === "number") return r as Role;
    if (r && typeof r === "object") {
      const name = Object.keys(r as object)[0];
      if (name === "Premium") return Role.Premium;
      if (name === "Admin") return Role.Admin;
      return Role.Basic;
    }
    return Role.Basic;
  });

  return {
    owner: String(native["owner"]),
    roles,
    status,
    registeredAt: Number(native["registered_at"]),
  };
}

function decodeMetadata(native: Record<string, unknown>): AgentMetadata {
  return {
    name: String(native["name"] ?? ""),
    description: String(native["description"] ?? ""),
    version: Number(native["version"] ?? 0),
  };
}

export class AgentGuardClient {
  readonly contractId: string;
  private readonly contract: Contract;
  private readonly server: StellarRpc.Server;
  private readonly networkPassphrase: string;
  private readonly simulationKeypair: Keypair;

  constructor(config: AgentGuardConfig) {
    this.contractId = config.contractId;
    this.contract = new Contract(config.contractId);
    this.server = new StellarRpc.Server(config.rpcUrl);
    this.networkPassphrase = config.networkPassphrase;
    this.simulationKeypair = Keypair.random();
  }

  // =========================================================================
  // Reads (simulation)
  // =========================================================================

  async verifyAgent(agentPublicKey: string, requiredRole: Role): Promise<boolean> {
    const result = await this.simulateCall("verify_agent", [
      addressToScVal(agentPublicKey),
      roleToScVal(requiredRole),
    ]);
    return scValToNative(result) as boolean;
  }

  async requireAgent(agentPublicKey: string, requiredRole: Role): Promise<void> {
    const authorized = await this.verifyAgent(agentPublicKey, requiredRole);
    if (!authorized) {
      throw new AgentUnauthorizedError(agentPublicKey, requiredRole);
    }
  }

  async getAgent(agentPublicKey: string): Promise<AgentRecord | null> {
    try {
      const result = await this.simulateCall("get_agent", [addressToScVal(agentPublicKey)]);
      return decodeRecord(scValToNative(result) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async getAgentMetadata(agentPublicKey: string): Promise<AgentMetadata | null> {
    try {
      const result = await this.simulateCall("get_agent_metadata", [
        addressToScVal(agentPublicKey),
      ]);
      return decodeMetadata(scValToNative(result) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async getOwnerAgents(ownerPublicKey: string): Promise<string[]> {
    const result = await this.simulateCall("get_owner_agents", [
      addressToScVal(ownerPublicKey),
    ]);
    const native = scValToNative(result) as unknown[];
    return (native ?? []).map((addr) => String(addr));
  }

  async getAdmin(): Promise<string | null> {
    try {
      const result = await this.simulateCall("get_admin", []);
      return String(scValToNative(result));
    } catch {
      return null;
    }
  }

  async getAgentProfile(agentPublicKey: string): Promise<AgentProfile | null> {
    const record = await this.getAgent(agentPublicKey);
    if (!record) return null;
    const metadata = await this.getAgentMetadata(agentPublicKey);
    return { agentId: agentPublicKey, ...record, metadata };
  }

  async listOwnerProfiles(ownerPublicKey: string): Promise<AgentProfile[]> {
    const ids = await this.getOwnerAgents(ownerPublicKey);
    const profiles = await Promise.all(ids.map((id) => this.getAgentProfile(id)));
    return profiles.filter((p): p is AgentProfile => p !== null);
  }

  // =========================================================================
  // Writes (sign + submit)
  // =========================================================================

  async registerAgent(
    owner: string,
    agentId: string,
    metadata: AgentMetadata,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(
      owner,
      "register_agent",
      [addressToScVal(owner), addressToScVal(agentId), this.encodeMetadata(metadata)],
      signer
    );
  }

  async deregisterAgent(
    owner: string,
    agentId: string,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(
      owner,
      "deregister_agent",
      [addressToScVal(owner), addressToScVal(agentId)],
      signer
    );
  }

  async grantRole(
    owner: string,
    agentId: string,
    role: Role,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(
      owner,
      "grant_role",
      [addressToScVal(owner), addressToScVal(agentId), roleToScVal(role)],
      signer
    );
  }

  async revokeRole(
    owner: string,
    agentId: string,
    role: Role,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(
      owner,
      "revoke_role",
      [addressToScVal(owner), addressToScVal(agentId), roleToScVal(role)],
      signer
    );
  }

  async setAgentStatus(
    owner: string,
    agentId: string,
    status: AgentStatus,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(
      owner,
      "set_agent_status",
      [addressToScVal(owner), addressToScVal(agentId), statusToScVal(status)],
      signer
    );
  }

  async suspendAgent(
    owner: string,
    agentId: string,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(owner, "suspend_agent", [addressToScVal(owner), addressToScVal(agentId)], signer);
  }

  async reactivateAgent(
    owner: string,
    agentId: string,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(
      owner,
      "reactivate_agent",
      [addressToScVal(owner), addressToScVal(agentId)],
      signer
    );
  }

  async revokeAgent(
    owner: string,
    agentId: string,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(owner, "revoke_agent", [addressToScVal(owner), addressToScVal(agentId)], signer);
  }

  async updateAgentMetadata(
    owner: string,
    agentId: string,
    metadata: AgentMetadata,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(
      owner,
      "update_agent_metadata",
      [addressToScVal(owner), addressToScVal(agentId), this.encodeMetadata(metadata)],
      signer
    );
  }

  async transferOwnership(
    currentOwner: string,
    agentId: string,
    newOwner: string,
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    return this.submit(
      currentOwner,
      "transfer_ownership",
      [addressToScVal(currentOwner), addressToScVal(agentId), addressToScVal(newOwner)],
      signer
    );
  }

  async initialize(admin: string, signer: TransactionSigner): Promise<SubmittedTransaction> {
    return this.submit(admin, "initialize", [addressToScVal(admin)], signer);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private encodeMetadata(metadata: AgentMetadata): xdr.ScVal {
    try {
      return nativeToScVal({
        name: metadata.name,
        description: metadata.description,
        version: metadata.version,
      });
    } catch {
      return metadataToScVal(metadata);
    }
  }

  private async submit(
    source: string,
    method: string,
    args: xdr.ScVal[],
    signer: TransactionSigner
  ): Promise<SubmittedTransaction> {
    const account = await this.loadAccount(source);
    const tx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(60)
      .build();

    const simulation = await this.server.simulateTransaction(tx);
    if (StellarRpc.Api.isSimulationError(simulation)) {
      throw new SimulationError(`Contract simulation failed: ${simulation.error}`);
    }
    if (!StellarRpc.Api.isSimulationSuccess(simulation)) {
      throw new SimulationError("Contract simulation returned an unexpected state.");
    }

    const assembled = StellarRpc.assembleTransaction(tx, simulation).build();
    const signedXdr = await signer.signTransaction(assembled.toXDR(), {
      networkPassphrase: this.networkPassphrase,
      address: source,
    });

    const signed = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    const sent = await this.server.sendTransaction(signed);

    if (sent.status === "ERROR" || sent.status === "DUPLICATE") {
      throw new TransactionError(
        `Transaction ${sent.status}: ${JSON.stringify(sent.errorResult ?? sent)}`
      );
    }

    const hash = sent.hash;
    const result = await this.waitForTransaction(hash);
    return { hash, status: result.status };
  }

  private async waitForTransaction(
    hash: string,
    attempts = 30
  ): Promise<StellarRpc.Api.GetSuccessfulTransactionResponse> {
    for (let i = 0; i < attempts; i += 1) {
      const tx = await this.server.getTransaction(hash);
      if (tx.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
        return tx;
      }
      if (tx.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
        throw new TransactionError(`Transaction ${hash} failed on-chain.`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new TransactionError(`Timed out waiting for transaction ${hash}.`);
  }

  private async loadAccount(publicKey: string): Promise<Account> {
    try {
      return await this.server.getAccount(publicKey);
    } catch {
      return new Account(publicKey, "0");
    }
  }

  private async simulateCall(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal> {
    const operation = this.contract.call(method, ...args);
    const sourcePublicKey = this.simulationKeypair.publicKey();
    let account: Account;

    try {
      account = await this.server.getAccount(sourcePublicKey);
    } catch {
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

    if (StellarRpc.Api.isSimulationError(simulation)) {
      throw new SimulationError(`Contract simulation failed: ${simulation.error}`);
    }
    if (!StellarRpc.Api.isSimulationSuccess(simulation)) {
      throw new SimulationError(
        "Contract simulation returned an unexpected state (not success, not error)."
      );
    }

    const returnValue = simulation.result?.retval;
    if (!returnValue) {
      throw new SimulationError(
        `Simulation succeeded but returned no value for method "${method}".`
      );
    }

    return returnValue;
  }
}
