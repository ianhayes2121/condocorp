import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export function CondoCorpRequired({ children }: { children: React.ReactNode }) {
  const { activeCondoCorp, isPlatformAdmin } = useAuthStore();

  if (!activeCondoCorp) {
    if (isPlatformAdmin) {
      return <Navigate to="/condocorps" replace />;
    }
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-gray-500">No CondoCorp selected.</p>
      </div>
    );
  }

  return <>{children}</>;
}
