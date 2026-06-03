import { useEffect, useState } from 'react';
import { FileText, Users, MessageSquare, HelpCircle, TrendingUp, Clock } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { useAuthStore } from '../stores/authStore';
import { condocorps } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface DashboardStats {
  totalDocuments: number;
  totalChunks: number;
  totalUsers: number;
  totalConversations: number;
  totalFaqs: number;
}

interface ActivityItem {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export function DashboardPage() {
  const { activeCondoCorp } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    totalDocuments: 0, totalChunks: 0, totalUsers: 0, totalConversations: 0, totalFaqs: 0,
  });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCondoCorp) return;

    async function load() {
      const [statsData, activityData] = await Promise.all([
        condocorps.stats(activeCondoCorp!.id),
        condocorps.activity(activeCondoCorp!.id),
      ]);
      setStats(statsData);
      setRecentActivity(activityData);
      setLoading(false);
    }

    load();
  }, [activeCondoCorp]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const statCards = [
    { label: 'Documents', value: stats.totalDocuments, icon: FileText, color: 'text-blue-600 bg-blue-50' },
    { label: 'Knowledge Chunks', value: stats.totalChunks, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
    { label: 'Members', value: stats.totalUsers, icon: Users, color: 'text-green-600 bg-green-50' },
    { label: 'Conversations', value: stats.totalConversations, icon: MessageSquare, color: 'text-orange-600 bg-orange-50' },
    { label: 'FAQs', value: stats.totalFaqs, icon: HelpCircle, color: 'text-pink-600 bg-pink-50' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Dashboard"
        description={`Overview for ${activeCondoCorp?.name ?? ''}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon size={20} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
            <div className="text-sm text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Clock size={18} />
            Recent Activity
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No recent activity</div>
          ) : (
            recentActivity.map(log => (
              <div key={log.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-900">{log.action}</span>
                  {log.details && 'description' in log.details && (
                    <span className="text-sm text-gray-500 ml-2">
                      {String(log.details.description)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
