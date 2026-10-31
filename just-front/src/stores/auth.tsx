import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, sessionStorageKey } from "@/lib/api/client";
import { isDemoMode } from "@/lib/config";
import type { Role, Session } from "@/domain/types";
import { authentication } from "@/services/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { SellerSignupInput, SignupEmailProof } from "@/domain/management";

interface AuthCtx {
  session: Session | null;
  ready: boolean;
  signInDemo: (role: Role) => void;
  signIn: (phone: string, otp: string) => Promise<Session>;
  loginPassword: (phone: string, password: string) => Promise<Session>;
  loginGoogle: (idToken: string, phone?: string, password?: string) => Promise<Session>;
  registerBuyer: (
    name: string,
    phone: string,
    password: string,
    proof?: SignupEmailProof,
  ) => Promise<Session>;
  registerSeller: (input: SellerSignupInput) => Promise<Session>;
  signOut: () => Promise<boolean>;
  clearSession: () => void;
  refreshProfile: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
const publicQueries = new Set(["areas", "categories", "shops", "shop", "products", "product"]);

const DEMO_NAMES: Record<Role, string> = {
  buyer: "Ananya R.",
  seller: "Rakesh Sharma",
  delivery: "Imran K.",
  admin: "Ops Admin",
};

export const roleHome: Record<Role, string> = {
  buyer: "/account",
  seller: "/seller",
  delivery: "/delivery",
  admin: "/admin",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let invalidated = false;
    const expired = () => {
      invalidated = true;
      setSession(null);
      queryClient.removeQueries({
        predicate: (query) => !publicQueries.has(String(query.queryKey[0])),
      });
      try {
        localStorage.removeItem(sessionStorageKey);
      } catch {
        /* Storage optional. */
      }
    };
    window.addEventListener("jpi:session-expired", expired);
    const storageChanged = (event: StorageEvent) => {
      if (event.key === sessionStorageKey && event.newValue && event.oldValue) {
        try {
          const before = JSON.parse(event.oldValue) as Session,
            after = JSON.parse(event.newValue) as Session;
          if (before.token === after.token && before.userId === after.userId) {
            setSession((current) =>
              current?.token === after.token ? { ...current, name: after.name } : current,
            );
            return;
          }
        } catch {
          /* changed identity handled below */
        }
      }
      if (event.key === sessionStorageKey || event.key === null) {
        invalidated = true;
        setSession(null);
        queryClient.removeQueries({
          predicate: (query) => !publicQueries.has(String(query.queryKey[0])),
        });
      }
    };
    window.addEventListener("storage", storageChanged);
    void (async () => {
      try {
        const stored = JSON.parse(
          localStorage.getItem(sessionStorageKey) ?? "null",
        ) as Session | null;
        if (stored && stored.isDemo === isDemoMode) {
          if (isDemoMode) {
            if (mounted && !invalidated) setSession(stored);
          } else {
            const profile = await authentication.me();
            if (mounted && !invalidated) setSession({ ...profile, token: stored.token });
          }
        }
      } catch {
        if (mounted) setSession(null);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
      window.removeEventListener("jpi:session-expired", expired);
      window.removeEventListener("storage", storageChanged);
    };
  }, [queryClient]);

  const persist = (s: Session | null) => {
    setSession(s);
    queryClient.removeQueries({
      predicate: (query) => !publicQueries.has(String(query.queryKey[0])),
    });
    try {
      if (s) localStorage.setItem(sessionStorageKey, JSON.stringify(s));
      else localStorage.removeItem(sessionStorageKey);
    } catch {
      toast.warning("Browser storage is unavailable. Sign-in will not survive a refresh.");
    }
  };

  return (
    <Ctx.Provider
      value={{
        session,
        ready,
        clearSession: () => persist(null),
        refreshProfile: async () => {
          const stored = localStorage.getItem(sessionStorageKey);
          if (!stored || isDemoMode) return;
          const previous = JSON.parse(stored) as Session;
          const profile = await authentication.me();
          if (localStorage.getItem(sessionStorageKey) !== stored) return;
          const next = { ...profile, token: previous.token };
          setSession(next);
          localStorage.setItem(sessionStorageKey, JSON.stringify(next));
        },
        // Demo sign-in exists only while no backend is configured.
        signInDemo: (role) => {
          if (!isDemoMode) return;
          persist({
            userId: `demo-${role}`,
            name: DEMO_NAMES[role],
            role,
            token: "demo",
            isDemo: true,
          });
        },
        // Expected: POST /auth/verify-otp -> Session. Role comes from the server, never the client.
        signIn: async (phone, otp) => {
          const s = await api<Session>("/auth/verify-otp", {
            method: "POST",
            body: JSON.stringify({ phone, otp }),
          });
          persist(s);
          return s;
        },
        loginPassword: async (phone, password) => {
          const s = await authentication.login(phone, password);
          persist(s);
          return s;
        },
        loginGoogle: async (idToken, phone, password) => {
          const s = await authentication.google(idToken, phone, password);
          persist(s);
          return s;
        },
        registerBuyer: async (name, phone, password, proof) => {
          const s = await authentication.register(name, phone, password, proof);
          persist(s);
          return s;
        },
        registerSeller: async (input) => {
          const s = await authentication.registerSeller(input);
          persist(s);
          return s;
        },
        signOut: async () => {
          try {
            if (!isDemoMode && session) await authentication.logout();
            persist(null);
            void navigate({ to: "/login", replace: true });
            return true;
          } catch {
            toast.error("Couldn't end the server session. Check your connection and retry.");
            return false;
          }
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
