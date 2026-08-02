'use client';

import { createContext, useContext, useState } from 'react';

interface UserContextValue {
  user: string | null;
  login: (name: string) => void;
  signOut: () => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  login: () => {},
  signOut: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('av_user');
  });

  function login(name: string) {
    const trimmed = name.trim() || 'JUGADOR';
    localStorage.setItem('av_user', trimmed);
    setUser(trimmed);
  }

  function signOut() {
    localStorage.removeItem('av_user');
    setUser(null);
  }

  return (
    <UserContext.Provider value={{ user, login, signOut }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
