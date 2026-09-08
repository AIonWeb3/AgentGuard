/**
 * Minimal resource-provider gateway.
 *
 * Shows how a backend gates an endpoint on AgentGuard roles.
 * Swap the mock `guard` for a real AgentGuardClient against testnet.
 *
 *   npm install
 *   npm start
 *   curl -H "X-Agent-Public-Key: G..." http://localhost:8787/v1/premium
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const PREMIUM = 1;

const allowed = new Set(
  (process.env.ALLOWED_AGENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function header(req, name) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    return json(res, 200, { ok: true, service: "agentguard-provider-demo" });
  }

  if (req.method === "GET" && req.url === "/v1/premium") {
    const agent = header(req, "x-agent-public-key");
    if (!agent) {
      return json(res, 401, { error: "Missing X-Agent-Public-Key header" });
    }

    // Production: await guard.requireAgent(agent, Role.Premium)
    const authorized = allowed.size === 0 || allowed.has(agent);
    if (!authorized) {
      return json(res, 403, {
        error: `Agent ${agent} is not authorized for role Premium`,
        code: "unauthorized",
      });
    }

    return json(res, 200, {
      ok: true,
      agent,
      requiredRole: PREMIUM,
      payload: { quote: "settlement window open", ts: Date.now() },
    });
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`Provider gateway on http://localhost:${PORT}`);
  console.log("GET /v1/premium  header X-Agent-Public-Key");
});
