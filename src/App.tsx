import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FolderSetup from './pages/FolderSetup';
import ScanPreview from './pages/ScanPreview';
import ExportEmail from './pages/ExportEmail';
import ExportZip from './pages/ExportZip';
import Upload from './pages/Upload';
import Settings from './pages/Settings';
import Toast from './components/Toast';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui' }}>
          <h2 style={{ color: '#E25C5C' }}>Something went wrong</h2>
          <pre style={{ marginTop: 12, fontSize: 13, color: '#5E5C7A', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const isLoggedIn = useAppStore((s) => s.isLoggedIn);

  if (!isLoggedIn) {
    return (
      <>
        <Login />
        <Toast />
      </>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/folders" element={<FolderSetup />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/scan" element={<ScanPreview />} />
          <Route path="/export" element={<ExportEmail />} />
          <Route path="/export-zip" element={<ExportZip />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
