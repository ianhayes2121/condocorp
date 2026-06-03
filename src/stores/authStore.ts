import { create } from 'zustand';
import { auth, condocorps } from '../lib/api';
import type { Role } from '../types';

interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface Membership {
  membership_id: string;
  role: Role;
  membership_status: string;
  id: string;
  name: string;
  address: string;
  status: string;
  created_at: string;
}

interface ActiveCondoCorp {
  id: string;
  name: string;
  address: string;
  status: string;
}

interface AuthState {
  profile: Profile | null;
  memberships: Membership[];
  activeCondoCorp: ActiveCondoCorp | null;
  activeRole: Role | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  setActiveCondoCorp: (condocorp: ActiveCondoCorp, role: Role) => void;
  loadMemberships: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  profile: null,
  memberships: [],
  activeCondoCorp: null,
  activeRole: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false, initialized: true });
      return;
    }

    try {
      const profile = await auth.me();
      set({ profile });
      await get().loadMemberships();
    } catch {
      localStorage.removeItem('token');
    }
    set({ loading: false, initialized: true });
  },

  signIn: async (email, password) => {
    const { token, user } = await auth.login(email, password);
    localStorage.setItem('token', token);
    set({ profile: user });
    await get().loadMemberships();
  },

  signOut: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('activeCondoCorpId');
    set({ profile: null, memberships: [], activeCondoCorp: null, activeRole: null });
  },

  setActiveCondoCorp: (condocorp, role) => {
    set({ activeCondoCorp: condocorp, activeRole: role });
    localStorage.setItem('activeCondoCorpId', condocorp.id);
  },

  loadMemberships: async () => {
    try {
      const data = await condocorps.list();
      set({ memberships: data });

      const savedId = localStorage.getItem('activeCondoCorpId');
      const current = get().activeCondoCorp;
      if (!current && data.length > 0) {
        const match = savedId ? data.find(m => m.id === savedId) : data[0];
        const m = match || data[0];
        set({
          activeCondoCorp: { id: m.id, name: m.name, address: m.address, status: m.status },
          activeRole: m.role as Role,
        });
      }
    } catch {
      set({ memberships: [] });
    }
  },
}));
