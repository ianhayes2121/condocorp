import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, ArrowLeft } from 'lucide-react';
import { auth } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export function RequestAccessPage() {
  const [form, setForm] = useState({
    condocorp_name: '',
    condocorp_address: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    confirm_board_member: false,
    confirm_terms: false,
  });
  const [error, setError] = useState('');
  const [corpExists, setCorpExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { initialize } = useAuthStore();

  const update = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
    setCorpExists(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCorpExists(false);
    setLoading(true);

    try {
      const { token } = await auth.requestAccess(form);
      localStorage.setItem('token', token);
      await initialize();
      navigate('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      if (message.includes('already registered on our platform')) {
        setCorpExists(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
            <Building2 className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Register Your Condo Corporation</h1>
          <p className="mt-2 text-sm text-gray-500">
            Set up your condo corporation on the platform and become its administrator.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {corpExists && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <p className="font-medium">This condo corporation is already registered.</p>
              <p className="mt-1">
                Please contact your existing board members to request access to the platform. They can send you an invitation from the Users page.
              </p>
            </div>
          )}

          <div className="border-b border-gray-100 pb-2">
            <h2 className="text-sm font-semibold text-gray-700">Condo Corporation Details</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Corporation Name *</label>
            <input
              type="text"
              value={form.condocorp_name}
              onChange={e => update('condocorp_name', e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="e.g. Maple Heights Condo Corp #1234"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Corporation Address</label>
            <input
              type="text"
              value={form.condocorp_address}
              onChange={e => update('condocorp_address', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="123 Main St, Toronto, ON"
            />
          </div>

          <div className="border-b border-gray-100 pb-2 pt-2">
            <h2 className="text-sm font-semibold text-gray-700">Your Information</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => update('first_name', e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => update('last_name', e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input
              type="password"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="Minimum 6 characters"
            />
          </div>

          <div className="border-b border-gray-100 pb-2 pt-2">
            <h2 className="text-sm font-semibold text-gray-700">Confirmations</h2>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.confirm_board_member}
              onChange={e => update('confirm_board_member', e.target.checked)}
              required
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">
              I confirm that I am an active board member of this condo corporation and am authorized to act on its behalf.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.confirm_terms}
              onChange={e => update('confirm_terms', e.target.checked)}
              required
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">
              I confirm that I have the authority to bind this condo corporation to the{' '}
              <a href="/terms" className="text-primary-600 hover:underline">Terms of Service</a> and{' '}
              <a href="/privacy" className="text-primary-600 hover:underline">Privacy Policy</a>.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !form.confirm_board_member || !form.confirm_terms}
            className="w-full py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Please wait...' : 'Register Corporation & Create Account'}
          </button>

          <div className="text-center pt-2">
            <Link to="/login" className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
              <ArrowLeft size={14} />
              Back to Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
