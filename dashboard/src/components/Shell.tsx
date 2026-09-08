import { NavLink, Outlet, useLocation } from "react-router-dom";
import { shortAddress } from "../lib/format";
import { useSession } from "../lib/session";
import { Button, cx } from "./ui";

const links = [
  { to: "/", label: "Product", end: true },
  { to: "/app", label: "Console" },
  { to: "/verify", label: "Verify" },
  { to: "/integrate", label: "Integrate" },
];

export function Shell() {
  const { owner, mode, disconnect } = useSession();
  const location = useLocation();
  const marketing = location.pathname === "/";

  return (
    <div className="min-h-screen">
      <header className={cx("sticky top-0 z-40 border-b border-line/80 backdrop-blur-md", marketing ? "bg-void/70" : "bg-forest/80")}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <NavLink to="/" className="flex items-center gap-2 text-mint">
            <BrandMark />
            <span className="font-display text-lg tracking-tight text-ink">AgentGuard</span>
          </NavLink>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cx(
                    "rounded-full px-3 py-1.5 text-sm transition",
                    isActive ? "bg-panel text-ink" : "text-muted hover:text-ink"
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {owner ? (
              <>
                <span className="hidden rounded-full border border-line px-3 py-1 font-mono text-xs text-muted sm:inline">
                  {mode === "demo" ? "Demo" : "Wallet"} · {shortAddress(owner)}
                </span>
                <Button variant="quiet" onClick={disconnect}>
                  Sign out
                </Button>
              </>
            ) : (
              <NavLink
                to="/app"
                className="rounded-full bg-mint px-4 py-2 text-sm font-medium text-void"
              >
                Open console
              </NavLink>
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-5 pb-3 md:hidden">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cx(
                  "rounded-full px-3 py-1 text-sm whitespace-nowrap",
                  isActive ? "bg-panel text-ink" : "text-muted"
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <path
        d="M16 4.5 26 9v8c0 6.2-4.2 10-10 12C10.2 27 6 23.2 6 17V9L16 4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 16.4 14.8 19.2 20.4 13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
