export const Role = {
  Basic: 0,
  Premium: 1,
  Admin: 2,
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const AgentStatus = {
  Active: 0,
  Suspended: 1,
  Revoked: 2,
} as const;

export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export const ROLE_LABELS: Record<Role, string> = {
  [Role.Basic]: "Basic",
  [Role.Premium]: "Premium",
  [Role.Admin]: "Admin",
};

export const STATUS_LABELS: Record<AgentStatus, string> = {
  [AgentStatus.Active]: "Active",
  [AgentStatus.Suspended]: "Suspended",
  [AgentStatus.Revoked]: "Revoked",
};

export interface AgentMetadata {
  name: string;
  description: string;
  version: number;
}

export interface AgentRecord {
  owner: string;
  roles: Role[];
  status: AgentStatus;
  registeredAt: number;
}

export interface AgentProfile extends AgentRecord {
  agentId: string;
  metadata: AgentMetadata;
}

export interface Activity {
  id: string;
  at: number;
  agentId?: string;
  action: string;
  detail: string;
}

export interface VerifyResult {
  authorized: boolean;
  reason: string;
  profile: AgentProfile | null;
}

export const ALL_ROLES: Role[] = [Role.Basic, Role.Premium, Role.Admin];
