import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { useAuthStore } from '../stores/authStore';
import { condocorps } from '../lib/api';
import { QuestionPresetsEditor } from '../components/settings/QuestionPresetsEditor';

export function SettingsPage() {
  const { activeCondoCorp } = useAuthStore();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (activeCondoCorp) {
      setName(activeCondoCorp.name);
      setAddress(activeCondoCorp.address);
    }
  }, [activeCondoCorp]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCondoCorp) return;
    setSaving(true);
    await condocorps.update(activeCondoCorp.id, name, address);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <PageHeader title="Settings" description="Manage your CondoCorp settings" />

      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CondoCorp Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && <span className="text-sm text-green-600">Settings saved</span>}
        </div>
      </form>

      {activeCondoCorp && (
        <div className="mt-8">
          <QuestionPresetsEditor
            mode="condocorp"
            condocorpId={activeCondoCorp.id}
            description="Customize the preset questions residents see on Ask a Question. Defaults come from platform settings until you save your own."
          />
        </div>
      )}
    </div>
  );
}
