import { create } from 'zustand';
import { ApiError, auth, clearAuthToken, condocorps, setAuthToken } from '../lib/api';
import type { Role } from '../types';

const AUTH_USER_KEY = 'authUser';

function cacheUser(profile: Profile): void {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile));
}

function readCachedUser(): Profile | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

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
  isPlatformAdmin: boolean;
  /** Platform admin is viewing a corp with condo-admin UI and API access */
  viewingAsCondoAdmin: boolean;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, first_name: string, last_name: string) => Promise<void>;
  signInWithGoogle: (credential: string, invite_email?: string) => Promise<void>;
  signOut: () => void;
  setActiveCondoCorp: (condocorp: ActiveCondoCorp, role: Role) => void;
  enterCondoCorpAsAdmin: (condocorp: ActiveCondoCorp) => void;
  clearCondoCorpView: () => void;
  loadMemberships: () => Promise<void>;
  /** Role used for sidebar navigation */
  navRole: () => Role | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  profile: null,
  memberships: [],
  activeCondoCorp: null,
  activeRole: null,
  isPlatformAdmin: false,
  viewingAsCondoAdmin: false,
  loading: true,
  initialized: false,

  navRole: () => {
    const { viewingAsCondoAdmin, activeRole } = get();
    if (viewingAsCondoAdmin) return 'condocorp_admin';
    return activeRole;
  },

  initialize: async () => {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') {
      if (token) clearAuthToken();
      set({ loading: false, initialized: true });
      return;
    }

    const cachedProfile = readCachedUser();
    if (cachedProfile) {
      set({ profile: cachedProfile });
    }

    try {
      const profile = await auth.me();
      set({ profile });
      cacheUser(profile);
      await get().loadMemberships();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuthToken();
        set({ profile: null, memberships: [], activeCondoCorp: null, activeRole: null, isPlatformAdmin: false, viewingAsCondoAdmin: false });
      }
    }
    set({ loading: false, initialized: true });
  },

  signIn: async (email, password) => {
    const { token, user } = await auth.login(email, password);
    setAuthToken(token);
    set({ profile: user });
    cacheUser(user);
    await get().loadMemberships();
  },

  signUp: async (email, password, first_name, last_name) => {
    const { token, user } = await auth.signup(email, password, first_name, last_name);
    setAuthToken(token);
    set({ profile: user });
    cacheUser(user);
    await get().loadMemberships();
  },

  signInWithGoogle: async (credential, invite_email) => {
    const { token, user } = await auth.google(credential, invite_email);
    setAuthToken(token);
    set({ profile: user });
    cacheUser(user);
    await get().loadMemberships();
  },

  signOut: () => {
    clearAuthToken();
    localStorage.removeItem('activeCondoCorpId');
    localStorage.removeItem('viewingAsCondoAdmin');
    set({
      profile: null,
      memberships: [],
      activeCondoCorp: null,
      activeRole: null,
      isPlatformAdmin: false,
      viewingAsCondoAdmin: false,
    });
  },

  setActiveCondoCorp: (condocorp, role) => {
    set({ activeCondoCorp: condocorp, activeRole: role, viewingAsCondoAdmin: false });
    localStorage.setItem('activeCondoCorpId', condocorp.id);
    localStorage.removeItem('viewingAsCondoAdmin');
  },

  enterCondoCorpAsAdmin: (condocorp) => {
    set({
      activeCondoCorp: condocorp,
      activeRole: 'condocorp_admin',
      viewingAsCondoAdmin: true,
    });
    localStorage.setItem('activeCondoCorpId', condocorp.id);
    localStorage.setItem('viewingAsCondoAdmin', 'true');
  },

  clearCondoCorpView: () => {
    set({ activeCondoCorp: null, activeRole: 'platform_admin', viewingAsCondoAdmin: false });
    localStorage.removeItem('activeCondoCorpId');
    localStorage.removeItem('viewingAsCondoAdmin');
  },

  loadMemberships: async () => {
    try {
      const data = await condocorps.list();
      const memberships = data as Membership[];
      const isPlatformAdmin = memberships.some(m => m.role === 'platform_admin');
      set({ memberships, isPlatformAdmin });

      const savedId = localStorage.getItem('activeCondoCorpId');
      const viewingAsCondoAdmin = localStorage.getItem('viewingAsCondoAdmin') === 'true';
      const current = get().activeCondoCorp;

      if (viewingAsCondoAdmin && isPlatformAdmin && savedId) {
        try {
          const all = await condocorps.listAll();
          const corp = all.find(c => c.id === savedId);
          if (corp) {
            set({
              activeCondoCorp: { id: corp.id, name: corp.name, address: corp.address, status: corp.status },
              activeRole: 'condocorp_admin',
              viewingAsCondoAdmin: true,
            });
            return;
          }
        } catch {
          // fall through
        }
        localStorage.removeItem('viewingAsCondoAdmin');
        localStorage.removeItem('activeCondoCorpId');
        set({ activeCondoCorp: null, activeRole: 'platform_admin', viewingAsCondoAdmin: false });
        return;
      }

      if (!current && data.length > 0 && !isPlatformAdmin) {
        const match = savedId ? data.find(m => m.id === savedId) : data[0];
        const m = match || data[0];
        set({
          activeCondoCorp: { id: m.id, name: m.name, address: m.address, status: m.status },
          activeRole: m.role as Role,
        });
      } else if (!current && isPlatformAdmin) {
        set({ activeRole: 'platform_admin' });
      }
    } catch {
      set({ memberships: [], isPlatformAdmin: false });
    }
  },
}));
