import { demoAddress } from "./format";
import {
  AgentStatus,
  Role,
  type Activity,
  type AgentProfile,
  type AgentMetadata,
  type VerifyResult,
} from "./types";

const STORAGE_KEY = "agentguard.demo.v1";

interface DemoState {
  owner: string;
  agents: Record<string, AgentProfile>;
  activity: Activity[];
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function activity(action: string, detail: string, agentId?: string): Activity {
  return {
    id: crypto.randomUUID(),
    at: Date.now(),
    agentId,
    action,
    detail,
  };
}

function seed(owner: string): DemoState {
  const invoice = demoAddress("INVOICEBOT");
  const treasury = demoAddress("TREASURYBOT");
  const ops = demoAddress("OPSADMINBOT");
  const scraper = demoAddress("LEGACYSCRAPER");
  const registeredAt = now() - 86_400 * 4;

  const agents: Record<string, AgentProfile> = {
    [invoice]: {
      agentId: invoice,
      owner,
      roles: [Role.Basic],
      status: AgentStatus.Active,
      registeredAt,
      metadata: {
        name: "Invoice Agent",
        description: "Creates vendor invoices and files them with AP.",
        version: 3,
      },
    },
    [treasury]: {
      agentId: treasury,
      owner,
      roles: [Role.Basic, Role.Premium],
      status: AgentStatus.Active,
      registeredAt: registeredAt + 3_600,
      metadata: {
        name: "Treasury Agent",
        description: "Moves funds within policy after AgentPay settlement checks.",
        version: 2,
      },
    },
    [ops]: {
      agentId: ops,
      owner,
      roles: [Role.Admin],
      status: AgentStatus.Active,
      registeredAt: registeredAt + 7_200,
      metadata: {
        name: "Ops Admin Agent",
        description: "Fleet operator. Satisfies Premium and Basic via role hierarchy.",
        version: 1,
      },
    },
    [scraper]: {
      agentId: scraper,
      owner,
      roles: [Role.Basic],
      status: AgentStatus.Suspended,
      registeredAt: registeredAt - 86_400,
      metadata: {
        name: "Legacy Scraper",
        description: "Paused after anomalous request volume.",
        version: 8,
      },
    },
  };

  return {
    owner,
    agents,
    activity: [
      activity("seed", "Demo fleet provisioned for pitch walkthrough"),
      activity("register", "Invoice Agent registered with Basic", invoice),
      activity("grant", "Treasury Agent granted Premium", treasury),
      activity("status", "Legacy Scraper suspended", scraper),
    ],
  };
}

function load(owner: string): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = seed(owner);
      save(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as DemoState;
    if (!parsed.agents || parsed.owner !== owner) {
      const fresh = seed(owner);
      save(fresh);
      return fresh;
    }
    return parsed;
  } catch {
    const fresh = seed(owner);
    save(fresh);
    return fresh;
  }
}

function save(state: DemoState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function push(state: DemoState, item: Activity): void {
  state.activity = [item, ...state.activity].slice(0, 40);
}

export function resetDemo(owner: string): DemoState {
  const fresh = seed(owner);
  save(fresh);
  return fresh;
}

export const demoRegistry = {
  list(owner: string): { agents: AgentProfile[]; activity: Activity[] } {
    const state = load(owner);
    return {
      agents: Object.values(state.agents).sort((a, b) => b.registeredAt - a.registeredAt),
      activity: state.activity,
    };
  },

  get(owner: string, agentId: string): AgentProfile | null {
    return load(owner).agents[agentId] ?? null;
  },

  register(owner: string, agentId: string, metadata: AgentMetadata): AgentProfile {
    const state = load(owner);
    if (state.agents[agentId]) {
      throw new Error("Agent already registered");
    }
    const profile: AgentProfile = {
      agentId,
      owner,
      roles: [],
      status: AgentStatus.Active,
      registeredAt: now(),
      metadata,
    };
    state.agents[agentId] = profile;
    push(state, activity("register", `${metadata.name} registered`, agentId));
    save(state);
    return profile;
  },

  grant(owner: string, agentId: string, role: Role): void {
    const state = load(owner);
    const agent = state.agents[agentId];
    if (!agent) throw new Error("Agent not found");
    if (agent.owner !== owner) throw new Error("Not the agent owner");
    if (agent.roles.includes(role)) throw new Error("Role already granted");
    agent.roles = [...agent.roles, role];
    push(state, activity("grant", `Granted ${roleLabel(role)}`, agentId));
    save(state);
  },

  revoke(owner: string, agentId: string, role: Role): void {
    const state = load(owner);
    const agent = state.agents[agentId];
    if (!agent) throw new Error("Agent not found");
    if (agent.owner !== owner) throw new Error("Not the agent owner");
    if (!agent.roles.includes(role)) throw new Error("Role not found");
    agent.roles = agent.roles.filter((r) => r !== role);
    push(state, activity("revoke", `Revoked ${roleLabel(role)}`, agentId));
    save(state);
  },

  setStatus(owner: string, agentId: string, status: AgentStatus): void {
    const state = load(owner);
    const agent = state.agents[agentId];
    if (!agent) throw new Error("Agent not found");
    if (agent.owner !== owner) throw new Error("Not the agent owner");
    agent.status = status;
    push(state, activity("status", `Status set to ${statusLabel(status)}`, agentId));
    save(state);
  },

  updateMetadata(owner: string, agentId: string, metadata: AgentMetadata): void {
    const state = load(owner);
    const agent = state.agents[agentId];
    if (!agent) throw new Error("Agent not found");
    if (agent.owner !== owner) throw new Error("Not the agent owner");
    agent.metadata = metadata;
    push(state, activity("meta", `Updated metadata to v${metadata.version}`, agentId));
    save(state);
  },

  transfer(owner: string, agentId: string, newOwner: string): void {
    const state = load(owner);
    const agent = state.agents[agentId];
    if (!agent) throw new Error("Agent not found");
    if (agent.owner !== owner) throw new Error("Not the agent owner");
    agent.owner = newOwner;
    delete state.agents[agentId];
    push(state, activity("transfer", `Transferred to ${newOwner.slice(0, 8)}…`, agentId));
    save(state);
  },

  deregister(owner: string, agentId: string): void {
    const state = load(owner);
    const agent = state.agents[agentId];
    if (!agent) throw new Error("Agent not found");
    if (agent.owner !== owner) throw new Error("Not the agent owner");
    const name = agent.metadata.name;
    delete state.agents[agentId];
    push(state, activity("deregister", `${name} removed`, agentId));
    save(state);
  },

  verify(owner: string, agentId: string, required: Role): VerifyResult {
    const state = load(owner);
    const profile = state.agents[agentId] ?? null;
    if (!profile) {
      return {
        authorized: false,
        reason: "Agent is not registered in the registry.",
        profile: null,
      };
    }
    if (profile.status !== AgentStatus.Active) {
      return {
        authorized: false,
        reason: `Agent is ${statusLabel(profile.status)} — verification fails until it is Active.`,
        profile,
      };
    }
    const ok = profile.roles.some((role) => role >= required);
    if (!ok) {
      return {
        authorized: false,
        reason: `Agent does not hold ${roleLabel(required)} or higher.`,
        profile,
      };
    }
    return {
      authorized: true,
      reason: `Active agent holds a role ≥ ${roleLabel(required)}.`,
      profile,
    };
  },
};

function roleLabel(role: Role): string {
  return role === Role.Admin ? "Admin" : role === Role.Premium ? "Premium" : "Basic";
}

function statusLabel(status: AgentStatus): string {
  return status === AgentStatus.Suspended
    ? "Suspended"
    : status === AgentStatus.Revoked
      ? "Revoked"
      : "Active";
}

export const DEMO_OWNER = demoAddress("DEMOOWNER");
