"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AvUser = { name: string };

export type ScoreEntry = {
  game: string;
  name: string;
  score: number;
  at: number;
};

const USER_KEY = "av_user";
const SCORES_KEY = "av_scores";

type SessionContextValue = {
  user: AvUser | null;
  signIn: (user: AvUser | null) => void;
  signOut: () => void;
  saveScore: (entry: Omit<ScoreEntry, "at">) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AvUser | null>(null);

  useEffect(() => {
    // Lectura de localStorage tras el montaje: el estado inicial es siempre
    // null para que coincida con el render del servidor y no haya
    // desajuste de hidratación (ver spec, sección Riesgos).
    try {
      const raw = localStorage.getItem(USER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setUser(JSON.parse(raw));
    } catch {
      setUser(null);
    }
  }, []);

  const signIn = (nextUser: AvUser | null) => {
    setUser(nextUser);
    try {
      if (nextUser) localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      else localStorage.removeItem(USER_KEY);
    } catch {}
  };

  const signOut = () => {
    setUser(null);
    try {
      localStorage.removeItem(USER_KEY);
    } catch {}
  };

  const saveScore = (entry: Omit<ScoreEntry, "at">) => {
    try {
      const raw = localStorage.getItem(SCORES_KEY);
      const all: ScoreEntry[] = raw ? JSON.parse(raw) : [];
      all.push({ ...entry, at: Date.now() });
      localStorage.setItem(SCORES_KEY, JSON.stringify(all));
    } catch {}
  };

  return (
    <SessionContext.Provider value={{ user, signIn, signOut, saveScore }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}
