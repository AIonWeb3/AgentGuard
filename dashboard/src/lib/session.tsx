import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEMO_OWNER, demoRegistry, resetDemo } from "./demo";
import { randomAgentId } from "./format";
import type { Activity, AgentMetadata, AgentProfile, AgentStatus, Role, VerifyResult } from "./types";
import { connectFreighter } from "./wallet";

export type SessionMode = "demo" | "wallet";

interface SessionValue {
  ready: boolean;
  mode: SessionMode;
  owner: string | null;
  busy: boolean;
  error: string | null;
  agents: AgentProfile[];
  activity: Activity[];
  enterDemo: () => void;
  connectWallet: () => Promise<void>;
  disconnect: () => void;
  resetFleet: () => void;
  refresh: () => void;
  registerAgent: (metadata: AgentMetadata, agentId?: string) => string;
  grantRole: (agentId: string, role: Role) => void;
  revokeRole: (agentId: string, role: Role) => void;
  setStatus: (agentId: string, status: AgentStatus) => void;
  updateMetadata: (agentId: string, metadata: AgentMetadata) => void;
  transferOwnership: (agentId: string, newOwner: string) => void;
  deregister: (agentId: string) => void;
  verify: (agentId: string, role: Role) => VerifyResult;
  mintAgentKey: () => string;
}

const SessionContext = createContext<SessionValue | null>(null);
const OWNER_KEY = "agentguard.session.owner";
const MODE_KEY = "agentguard.session.mode";

function readPersisted(): { owner: string | null; mode: SessionMode } {
  try {
    const owner = localStorage.getItem(OWNER_KEY);
    const mode = localStorage.getItem(MODE_KEY) as SessionMode | null;
    return { owner, mode: mode === "wallet" ? "wallet" : "demo" };
  } catch {
    return { owner: null, mode: "demo" };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const persisted = readPersisted();
  const [owner, setOwner] = useState<string | null>(persisted.owner);
  const [mode, setMode] = useState<SessionMode>(persisted.owner ? persisted.mode : "demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const persist = useCallback((nextOwner: string, nextMode: SessionMode) => {
    localStorage.setItem(OWNER_KEY, nextOwner);
    localStorage.setItem(MODE_KEY, nextMode);
    setOwner(nextOwner);
    setMode(nextMode);
    setError(null);
    setTick((n) => n + 1);
  }, []);

  const snapshot = useMemo(() => {
    if (!owner) return { agents: [] as AgentProfile[], activity: [] as Activity[] };
    return demoRegistry.list(owner);
  }, [owner, tick]);

  const enterDemo = useCallback(() => {
    persist(DEMO_OWNER, "demo");
  }, [persist]);

  const connectWallet = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const address = await connectFreighter();
      persist(address, "wallet");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed");
    } finally {
      setBusy(false);
    }
  }, [persist]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(OWNER_KEY);
    localStorage.removeItem(MODE_KEY);
    setOwner(null);
    setError(null);
  }, []);

  const requireOwner = useCallback((): string => {
    if (!owner) throw new Error("Connect a wallet or start the demo first");
    return owner;
  }, [owner]);

  const value: SessionValue = {
    ready: true,
    mode,
    owner,
    busy,
    error,
    agents: snapshot.agents,
    activity: snapshot.activity,
    enterDemo,
    connectWallet,
    disconnect,
    resetFleet: () => {
      resetDemo(requireOwner());
      refresh();
    },
    refresh,
    registerAgent: (metadata, agentId) => {
      const id = agentId?.trim() || randomAgentId();
      demoRegistry.register(requireOwner(), id, metadata);
      refresh();
      return id;
    },
    grantRole: (agentId, role) => {
      demoRegistry.grant(requireOwner(), agentId, role);
      refresh();
    },
    revokeRole: (agentId, role) => {
      demoRegistry.revoke(requireOwner(), agentId, role);
      refresh();
    },
    setStatus: (agentId, status) => {
      demoRegistry.setStatus(requireOwner(), agentId, status);
      refresh();
    },
    updateMetadata: (agentId, metadata) => {
      demoRegistry.updateMetadata(requireOwner(), agentId, metadata);
      refresh();
    },
    transferOwnership: (agentId, newOwner) => {
      demoRegistry.transfer(requireOwner(), agentId, newOwner.trim());
      refresh();
    },
    deregister: (agentId) => {
      demoRegistry.deregister(requireOwner(), agentId);
      refresh();
    },
    verify: (agentId, role) => demoRegistry.verify(requireOwner(), agentId, role),
    mintAgentKey: randomAgentId,
  };

  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
