import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AuthGuard } from './components/auth/AuthGuard';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RequestAccessPage } from './pages/RequestAccessPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FaqsPage } from './pages/FaqsPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/SettingsPage';
import { PlatformAdminPage } from './pages/PlatformAdminPage';
import { CondoCorpsPage } from './pages/CondoCorpsPage';
import { HomeRedirect } from './components/layout/HomeRedirect';
import { CondoCorpRequired } from './components/auth/CondoCorpRequired';

export default function App() {
  const { initialize, initialized } = useAuthStore();

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialize, initialized]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/request-access" element={<RequestAccessPage />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="condocorps" element={<CondoCorpsPage />} />
          <Route path="dashboard" element={<CondoCorpRequired><DashboardPage /></CondoCorpRequired>} />
          <Route path="chat" element={<CondoCorpRequired><ChatPage /></CondoCorpRequired>} />
          <Route path="documents" element={<CondoCorpRequired><DocumentsPage /></CondoCorpRequired>} />
          <Route path="faqs" element={<CondoCorpRequired><FaqsPage /></CondoCorpRequired>} />
          <Route path="users" element={<CondoCorpRequired><UsersPage /></CondoCorpRequired>} />
          <Route path="settings" element={<CondoCorpRequired><SettingsPage /></CondoCorpRequired>} />
          <Route path="platform" element={<PlatformAdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
