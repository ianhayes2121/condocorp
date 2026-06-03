import { useState, useEffect } from 'react';
import { Plus, Building2, X, Ban, CheckCircle } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { condocorps } from '../lib/api';

interface CondoCorpItem {
  id: string;
  name: string;
  address: string;
  status: string;
  created_at: string;
}

export function PlatformAdminPage() {
  const [corpList, setCorpList] = useState<CondoCorpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const loadCondoCorps = async () => {
    const data = await condocorps.listAll();
    setCorpList(data);
    setLoading(false);
  };

  useEffect(() => { loadCondoCorps(); }, []);

  const createCondoCorp = async (e: React.FormEvent) => {
    e.preventDefault();
    await condocorps.create(name, address);
    setShowCreate(false);
    setName('');
    setAddress('');
    loadCondoCorps();
  };

  const toggleStatus = async (corp: CondoCorpItem) => {
    const newStatus = corp.status === 'active' ? 'suspended' : 'active';
    await condocorps.updateStatus(corp.id, newStatus);
    loadCondoCorps();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Platform Administration"
        description="Manage all CondoCorps on the platform"
        action={
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} /> Create CondoCorp
          </button>
        }
      />

      {showCreate && (
        <form onSubmit={createCondoCorp} className="mb-6 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">New CondoCorp</h3>
            <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="e.g. Sunrise Towers Condominium Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="123 Main Street, Toronto, ON"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus size={16} /> Create
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {corpList.map(corp => (
          <div key={corp.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 size={20} className="text-primary-600" />
                <h3 className="font-semibold text-gray-900">{corp.name}</h3>
              </div>
              <StatusBadge status={corp.status} />
            </div>
            <p className="text-sm text-gray-500 mb-4">{corp.address}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Created {new Date(corp.created_at).toLocaleDateString()}
              </span>
              <button
                onClick={() => toggleStatus(corp)}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                  corp.status === 'active'
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-green-600 hover:bg-green-50'
                }`}
              >
                {corp.status === 'active' ? (
                  <><Ban size={14} /> Suspend</>
                ) : (
                  <><CheckCircle size={14} /> Activate</>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
