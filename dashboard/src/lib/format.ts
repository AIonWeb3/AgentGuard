export function shortAddress(value: string, left = 6, right = 6): string {
  if (value.length <= left + right + 1) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

export function formatTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatRelative(epochMs: number): string {
  const delta = Date.now() - epochMs;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function demoAddress(label: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let body = label.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let i = 0;
  while (body.length < 55) {
    body += alphabet[i % alphabet.length];
    i += 1;
  }
  return `G${body}`.slice(0, 56);
}

export function randomAgentId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  const tag = Array.from(rand, (b) => (b % 36).toString(36)).join("");
  return demoAddress(`AGENT${tag}`);
}
