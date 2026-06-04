import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export function HomeRedirect() {
  const { isPlatformAdmin, viewingAsCondoAdmin, activeCondoCorp } = useAuthStore();

  if (isPlatformAdmin && !viewingAsCondoAdmin && !activeCondoCorp) {
    return <Navigate to="/condocorps" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}
