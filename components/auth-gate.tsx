"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

interface AuthStatus {
  authenticated: boolean;
  username?: string;
  email?: string;
}

async function fetchAuthStatus(): Promise<AuthStatus> {
  const r = await fetch("/api/auth/status");
  return r.json();
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  const { data, isLoading } = useQuery({
    queryKey: ["auth-status"],
    queryFn: fetchAuthStatus,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (isLoading || isLoginPage) return;
    if (data && !data.authenticated) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [data, isLoading, isLoginPage, pathname, router]);

  if (isLoginPage) return <>{children}</>;
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--fg-mute)] text-xs font-mono animate-pulse">
        checking session…
      </div>
    );
  }
  if (!data?.authenticated) return null; // about to redirect
  return <>{children}</>;
}
