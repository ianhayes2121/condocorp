import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { condocorps } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface CondoCorpItem {
  id: string;
  name: string;
  address: string;
  status: string;
  created_at: string;
}

export function CondoCorpsPage() {
  const navigate = useNavigate();
  const { enterCondoCorpAsAdmin } = useAuthStore();
  const [corpList, setCorpList] = useState<CondoCorpItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    condocorps.listAll()
      .then(setCorpList)
      .finally(() => setLoading(false));
  }, []);

  const openCondoCorp = (corp: CondoCorpItem) => {
    enterCondoCorpAsAdmin({
      id: corp.id,
      name: corp.name,
      address: corp.address,
      status: corp.status,
    });
    navigate('/dashboard');
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
        title="CondoCorps"
        description="Select a CondoCorp to manage it as a Condo Admin"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {corpList.map(corp => (
          <button
            key={corp.id}
            type="button"
            onClick={() => openCondoCorp(corp)}
            className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-primary-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 size={20} className="text-primary-600 shrink-0" />
                <h3 className="font-semibold text-gray-900 truncate">{corp.name}</h3>
              </div>
              <StatusBadge status={corp.status} />
            </div>
            <p className="text-sm text-gray-500 mb-4 line-clamp-2">{corp.address}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Created {new Date(corp.created_at).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-primary-600 group-hover:gap-2 transition-all">
                Open <ChevronRight size={14} />
              </span>
            </div>
          </button>
        ))}
      </div>

      {corpList.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-12">No CondoCorps on the platform yet.</p>
      )}
    </div>
  );
}
