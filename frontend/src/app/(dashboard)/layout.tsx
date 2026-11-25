"use client";

import { Menu, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Spinner } from "@/components/ui/primitives";
import { authStorage, subscribeToStorage } from "@/lib/auth-storage";
import { useMe } from "@/lib/queries";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Tokens live in localStorage, so the check only resolves on the client (null during SSR).
  const hasToken = useSyncExternalStore(subscribeToStorage, () => !!authStorage.getAccessToken(), () => null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  const me = useMe(hasToken === true);

  useEffect(() => {
    if (me.isError) {
      authStorage.clear();
      router.replace("/login");
    }
  }, [me.isError, router]);

  if (!hasToken || !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar user={me.data} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="relative h-full w-64">
            <Sidebar user={me.data} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="cursor-pointer rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Mở menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            WorkBrief AI
          </span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
