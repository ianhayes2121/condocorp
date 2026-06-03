import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  HelpCircle,
  MessageSquare,
  Users,
  Settings,
  Shield,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Building2,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import type { Role } from '../../types';

const navItems: { to: string; label: string; icon: React.ReactNode; roles: Role[] }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, roles: ['condocorp_admin', 'board_member', 'homeowner', 'property_manager', 'platform_admin'] },
  { to: '/chat', label: 'Ask a Question', icon: <MessageSquare size={20} />, roles: ['condocorp_admin', 'board_member', 'homeowner', 'property_manager', 'platform_admin'] },
  { to: '/documents', label: 'Documents', icon: <FileText size={20} />, roles: ['condocorp_admin', 'board_member', 'property_manager', 'platform_admin'] },
  { to: '/faqs', label: 'FAQs', icon: <HelpCircle size={20} />, roles: ['condocorp_admin', 'board_member', 'property_manager', 'platform_admin'] },
  { to: '/users', label: 'Users', icon: <Users size={20} />, roles: ['condocorp_admin', 'platform_admin'] },
  { to: '/settings', label: 'Settings', icon: <Settings size={20} />, roles: ['condocorp_admin', 'platform_admin'] },
  { to: '/platform', label: 'Platform Admin', icon: <Shield size={20} />, roles: ['platform_admin'] },
];

export function Sidebar() {
  const { activeCondoCorp, activeRole, memberships, setActiveCondoCorp, profile, signOut } = useAuthStore();
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredItems = navItems.filter(item => activeRole && item.roles.includes(activeRole));

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`;

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="text-primary-600" size={24} />
          <span className="font-bold text-lg text-gray-900">CondoCorp</span>
        </div>
        <button
          onClick={() => setShowSwitcher(!showSwitcher)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm hover:bg-gray-100 transition-colors"
        >
          <span className="truncate font-medium text-gray-700">
            {activeCondoCorp?.name ?? 'Select CondoCorp'}
          </span>
          <ChevronDown size={16} className="text-gray-400 shrink-0" />
        </button>
        {showSwitcher && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {memberships.map(m => (
              <button
                key={m.membership_id}
                onClick={() => {
                  setActiveCondoCorp(
                    { id: m.id, name: m.name, address: m.address, status: m.status },
                    m.role as Role
                  );
                  setShowSwitcher(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition-colors ${
                  m.id === activeCondoCorp?.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
                }`}
              >
                <div>{m.name}</div>
                <div className="text-xs text-gray-400 capitalize">{m.role.replace('_', ' ')}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {filteredItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={linkClass}
            onClick={() => setMobileOpen(false)}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-sm font-medium">
            {profile?.first_name?.[0]}{profile?.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {profile?.first_name} {profile?.last_name}
            </div>
            <div className="text-xs text-gray-500 truncate capitalize">
              {activeRole?.replace('_', ' ')}
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        <Menu size={20} />
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)}>
          <aside
            className="w-64 h-full bg-white flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <aside className="hidden lg:flex w-64 border-r border-gray-200 bg-white flex-col shrink-0">
        {sidebarContent}
      </aside>
    </>
  );
}
