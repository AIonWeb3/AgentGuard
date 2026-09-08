/**
 * Framework-agnostic helpers for gating HTTP routes on AgentGuard roles.
 *
 * Works with Express, Fastify, Hono, Next.js route handlers — anything that
 * can read a request header and return a 401/403.
 */

import { AgentGuardClient, AgentUnauthorizedError } from "./agent-guard-client.js";
import { Role } from "./types.js";

export const AGENT_HEADER = "x-agent-public-key";

export interface GuardRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface GuardFailure {
  status: 401 | 403 | 500;
  error: string;
  code: "missing_agent_key" | "unauthorized" | "verification_unavailable";
}

export type GuardResult = { ok: true; agentPublicKey: string } | { ok: false; failure: GuardFailure };

function readHeader(req: GuardRequest, name: string): string | undefined {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/**
 * Verify that the request presents an agent key that holds `role`.
 */
export async function enforceAgentRole(
  guard: AgentGuardClient,
  req: GuardRequest,
  role: Role,
  headerName: string = AGENT_HEADER
): Promise<GuardResult> {
  const agentPublicKey = readHeader(req, headerName)?.trim();
  if (!agentPublicKey) {
    return {
      ok: false,
      failure: {
        status: 401,
        error: `Missing ${headerName} header`,
        code: "missing_agent_key",
      },
    };
  }

  try {
    await guard.requireAgent(agentPublicKey, role);
    return { ok: true, agentPublicKey };
  } catch (error) {
    if (error instanceof AgentUnauthorizedError) {
      return {
        ok: false,
        failure: {
          status: 403,
          error: error.message,
          code: "unauthorized",
        },
      };
    }
    return {
      ok: false,
      failure: {
        status: 500,
        error: "Verification service unavailable",
        code: "verification_unavailable",
      },
    };
  }
}

/**
 * Express-style middleware factory.
 *
 * ```ts
 * app.post("/v1/settle", requireRole(guard, Role.Premium), handler);
 * ```
 */
export function requireRole(guard: AgentGuardClient, role: Role) {
  return async (
    req: GuardRequest & { agentPublicKey?: string },
    res: { status: (code: number) => { json: (body: unknown) => unknown } },
    next: (err?: unknown) => void
  ) => {
    const result = await enforceAgentRole(guard, req, role);
    if (!result.ok) {
      return res.status(result.failure.status).json({ error: result.failure.error });
    }
    req.agentPublicKey = result.agentPublicKey;
    next();
  };
}
