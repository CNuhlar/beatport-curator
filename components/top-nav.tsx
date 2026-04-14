"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/library", label: "LIBRARY" },
  { href: "/build", label: "BUILD" },
  { href: "/edit", label: "EDIT" },
  { href: "/settings", label: "SETTINGS" },
];

interface AuthStatus {
  authenticated: boolean;
  username?: string;
  email?: string;
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const isLoginPage = pathname === "/login";

  const { data: auth } = useQuery<AuthStatus>({
    queryKey: ["auth-status"],
    queryFn: async () => {
      const r = await fetch("/api/auth/status");
      return r.json();
    },
    staleTime: 60_000,
    retry: false,
  });

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    qc.invalidateQueries({ queryKey: ["auth-status"] });
    router.push("/login");
  };

  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-elev)] shrink-0">
      <div className="flex items-center h-12 px-4 gap-6">
        <Link
          href="/library"
          className="font-mono text-sm font-bold text-[var(--accent-2)] tracking-tight"
        >
          CURATOR
          <span className="text-[var(--fg-mute)] font-normal"> / beatport</span>
        </Link>
        {!isLoginPage && (
          <nav className="flex items-center gap-1">
            {TABS.map((t) => {
              const active = pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "px-3 py-1.5 text-xs font-mono tracking-wider rounded-sm transition-colors",
                    active
                      ? "bg-[var(--bg-elev-2)] text-[var(--accent)]"
                      : "text-[var(--fg-dim)] hover:text-[var(--fg)]"
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="flex-1" />
        {auth?.authenticated && !isLoginPage && (
          <div className="flex items-center gap-3">
            <div className="text-[11px] font-mono text-[var(--fg-mute)]">
              <span className="text-[var(--fg-dim)]">{auth.username}</span>
            </div>
            <button
              onClick={logout}
              className="text-[11px] font-mono tracking-wider text-[var(--fg-mute)] hover:text-[var(--danger)] uppercase cursor-pointer"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
