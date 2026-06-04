import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AuthGuard } from './components/auth/AuthGuard';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { RequestAccessPage } from './pages/RequestAccessPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChatPage } from './pages/ChatPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FaqsPage } from './pages/FaqsPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/SettingsPage';
import { PlatformAdminPage } from './pages/PlatformAdminPage';
import { CondoCorpsPage } from './pages/CondoCorpsPage';
import { TicketsPage } from './pages/TicketsPage';
import { HomeRedirect } from './components/layout/HomeRedirect';
import { CondoCorpRequired } from './components/auth/CondoCorpRequired';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export default function App() {
  const { initialize, initialized } = useAuthStore();

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialize, initialized]);

  const routes = (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
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
          <Route path="tickets" element={<CondoCorpRequired><TicketsPage /></CondoCorpRequired>} />
          <Route path="documents" element={<CondoCorpRequired><DocumentsPage /></CondoCorpRequired>} />
          <Route path="faqs" element={<CondoCorpRequired><FaqsPage /></CondoCorpRequired>} />
          <Route path="users" element={<CondoCorpRequired><UsersPage /></CondoCorpRequired>} />
          <Route path="settings" element={<CondoCorpRequired><SettingsPage /></CondoCorpRequired>} />
          <Route path="platform" element={<PlatformAdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );

  if (!googleClientId) {
    return routes;
  }

  return <GoogleOAuthProvider clientId={googleClientId}>{routes}</GoogleOAuthProvider>;
}
