import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, X, Mail, Clock } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuthStore } from '../stores/authStore';
import { members, invitations } from '../lib/api';
import type { Role } from '../types';

const ROLES: { value: Role; label: string }[] = [
  { value: 'condocorp_admin', label: 'Admin' },
  { value: 'board_member', label: 'Board Member' },
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'property_manager', label: 'Property Manager' },
];

interface Member {
  id: string;
  role: string;
  status: string;
  created_at: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  invited_by_first: string;
  invited_by_last: string;
}

export function UsersPage() {
  const { activeCondoCorp } = useAuthStore();
  const [memberList, setMemberList] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('homeowner');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const loadData = useCallback(async () => {
    if (!activeCondoCorp) return;
    try {
      const [memberData, inviteData] = await Promise.all([
        members.list(activeCondoCorp.id),
        invitations.list(activeCondoCorp.id).catch(() => []),
      ]);
      setMemberList(memberData);
      setPendingInvites(inviteData.filter((i: Invitation) => i.status === 'pending'));
    } catch {
      // silently handle
    }
    setLoading(false);
  }, [activeCondoCorp]);

  useEffect(() => { loadData(); }, [loadData]);

  const inviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCondoCorp) return;
    setInviteError('');
    setInviteSuccess('');

    try {
      const result = await members.invite(activeCondoCorp.id, email, role);
      setShowInvite(false);
      setEmail('');
      setRole('homeowner');
      setInviteSuccess(
        (result as { invited?: boolean }).invited
          ? 'Invitation email sent! The user will receive an email to set up their account.'
          : 'User added to this CondoCorp.'
      );
      loadData();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite user');
    }
  };

  const removeMember = async (membershipId: string) => {
    if (!activeCondoCorp) return;
    try {
      await members.remove(activeCondoCorp.id, membershipId);
      loadData();
    } catch {
      // silently handle
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="Users"
        description="Manage members of your CondoCorp"
        action={
          <button
            onClick={() => { setShowInvite(!showInvite); setInviteSuccess(''); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <UserPlus size={16} /> Invite User
          </button>
        }
      />

      {inviteSuccess && (
        <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <Mail size={16} />
          {inviteSuccess}
        </div>
      )}

      {showInvite && (
        <form onSubmit={inviteUser} className="mb-6 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Invite User</h3>
            <button type="button" onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Enter the email address of the person you'd like to invite. If they don't have an account yet, they'll receive an email to set one up.
          </p>
          {inviteError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {inviteError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as Role)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Mail size={16} /> Send Invite
            </button>
          </div>
        </form>
      )}

      {pendingInvites.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Clock size={16} /> Pending Invitations
          </h3>
          <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200 bg-amber-100/50">
                  <th className="text-left px-4 py-2 font-medium text-amber-700">Email</th>
                  <th className="text-left px-4 py-2 font-medium text-amber-700">Role</th>
                  <th className="text-left px-4 py-2 font-medium text-amber-700">Invited By</th>
                  <th className="text-left px-4 py-2 font-medium text-amber-700">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {pendingInvites.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-4 py-2 text-gray-900">{inv.email}</td>
                    <td className="px-4 py-2 text-gray-600 capitalize">{inv.role.replace('_', ' ')}</td>
                    <td className="px-4 py-2 text-gray-600">{inv.invited_by_first} {inv.invited_by_last}</td>
                    <td className="px-4 py-2 text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {memberList.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No members yet. Invite someone to get started.
                </td>
              </tr>
            ) : (
              memberList.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {m.first_name} {m.last_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.email}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{m.role.replace('_', ' ')}</td>
                  <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {m.status === 'active' && (
                      <button
                        onClick={() => removeMember(m.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Remove access"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
