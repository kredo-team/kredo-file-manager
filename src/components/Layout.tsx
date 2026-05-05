import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getVersion } from '@tauri-apps/api/app';
import { useAppStore } from '../store/appStore';
import {
  IconHome, IconFolderPlus, IconEye, IconPaperPlane, IconZip, IconUpload,
  IconGear, IconSignOut, IconHelp,
} from './Icons';
import Toast from './Toast';
import { useAutoEmail } from '../hooks/useAutoEmail';

const navItems = [
  { to: '/', icon: <IconHome />, label: 'Dashboard', shortcut: '' },
  { to: '/folders', icon: <IconFolderPlus />, label: 'Create Folders', shortcut: '' },
  { to: '/upload', icon: <IconUpload />, label: 'Upload & Organize', shortcut: 'Ctrl+U' },
  { to: '/scan', icon: <IconEye />, label: 'Scan & Export', shortcut: 'Ctrl+S' },
  { to: '/export-zip', icon: <IconZip />, label: 'Export Zip', shortcut: '' },
];

/* ═══ Global Help Overlay ═══ */
const HelpOverlay = ({ onClose }: { onClose: () => void }) => {
  const sections = [
    {
      title: 'Navigation',
      shortcuts: [
        { keys: 'Ctrl + U', desc: 'Upload & Organize' },
        { keys: 'Ctrl + S', desc: 'Scan & Export' },
      ],
    },
    {
      title: 'Upload & Organize',
      shortcuts: [
        { keys: 'Ctrl + Shift + N', desc: 'New folder' },
        { keys: 'Ctrl + A', desc: 'Select all files' },
        { keys: 'Ctrl + F', desc: 'Focus search' },
        { keys: 'Delete', desc: 'Delete selected' },
        { keys: 'Escape', desc: 'Clear selection' },
        { keys: 'Double-click', desc: 'Open file' },
      ],
    },
    {
      title: 'General',
      shortcuts: [
        { keys: 'F5', desc: 'Refresh' },
        { keys: '?', desc: 'Show this help' },
      ],
    },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,17,38,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, animation: 'overlayIn 0.15s ease' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--card-solid)', borderRadius: 14, padding: '28px 32px', maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(19,17,38,0.15)', animation: 'dialogIn 0.2s cubic-bezier(0.4,0,0.2,1)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 320 512" style={{ width: 14, height: 14, fill: 'var(--brand)' }}><path d="M80 160c0-35.3 28.7-64 64-64h32c35.3 0 64 28.7 64 64v3.6c0 21.8-11.1 42.1-29.4 53.8l-42.2 27.1c-6.3 4-10.4 10.7-10.4 18V280c0 13.3 10.7 24 24 24s24-10.7 24-24v-10.7c0-8.2 4.2-15.8 11-20.2l42.2-27.1c36.6-23.6 58.8-64.1 58.8-107.6V160c0-70.7-57.3-128-128-128H144C73.3 32 16 89.3 16 160c0 13.3 10.7 24 24 24s24-10.7 24-24zm80 320a40 40 0 1 0 0-80 40 40 0 1 0 0 80z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Keyboard shortcuts</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>Kredo File Manager</div>
          </div>
        </div>

        {/* Sections */}
        {sections.map((section, si) => (
          <div key={si} style={{ marginBottom: si < sections.length - 1 ? 20 : 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--brand)', marginBottom: 8 }}>{section.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {section.shortcuts.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < section.shortcuts.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>{s.desc}</span>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    {s.keys.split(' + ').map((k, j) => (
                      <span key={j} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {j > 0 && <span style={{ color: 'var(--ink-4)', margin: '0 1px', fontSize: 9 }}>+</span>}
                        <span style={{ padding: '3px 8px', background: 'var(--input-bg)', border: '1px solid var(--divider)', borderRadius: 5, fontSize: 11, fontWeight: 500, color: 'var(--ink-2)', fontFamily: 'var(--font)', lineHeight: 1 }}>{k}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <button onClick={onClose} style={{ marginTop: 22, width: '100%', height: 38, border: '1px solid var(--divider)', borderRadius: 'var(--r-xs)', background: 'transparent', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font)', cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
          Close
        </button>
      </div>
    </div>
  );
};

export default function Layout() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setLoggedIn = useAppStore((s) => s.setLoggedIn);
  const navigate = useNavigate();
  const showHelp = useAppStore((s) => s.showHelp);
  const setShowHelp = useAppStore((s) => s.setShowHelp);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => { getVersion().then(setAppVersion).catch(() => {}); }, []);

  // Auto email scheduler
  useAutoEmail();

  // Silent update check on launch (once)
  const updateChecked = useRef(false);
  useEffect(() => {
    if (updateChecked.current) return;
    updateChecked.current = true;
    const addToast = useAppStore.getState().addToast;
    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) {
          addToast('success', `Update v${update.version} available — go to Settings > About to install`);
        }
      } catch {
        // Silent fail — network down, dev mode, etc.
      }
    })();
  }, []);

  // Persist sidebar state
  useEffect(() => {
    const saved = localStorage.getItem('kredo_sidebar');
    if (saved === 'collapsed') useAppStore.getState().setSidebarCollapsed(true);
  }, []);
  useEffect(() => {
    localStorage.setItem('kredo_sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      const inInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'u': e.preventDefault(); navigate('/upload'); break;
          case 's': if (!inInput) { e.preventDefault(); navigate('/scan'); } break;
        }
      }
      // ? key opens help (only when not in input)
      if (e.key === '?' && !inInput) {
        setShowHelp(true);
      }
      // Escape closes help
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, showHelp]);

  return (
    <div className="app-layout">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-top" onClick={toggleSidebar} title="Toggle sidebar">
          <div className="sidebar-icon-box">K</div>
          <div className="sidebar-brand-info">
            <div className="sidebar-brand-name">Kredo Files</div>
            <div className="sidebar-brand-ver">v{appVersion || '...'}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : item.shortcut || undefined}
            >
              {item.icon}
              <span className="sidebar-item-label">{item.label}</span>
              {!collapsed && item.shortcut && <span className="kbd">{item.shortcut.replace('Ctrl+', '⌃')}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className="sidebar-item sidebar-help"
            onClick={() => setShowHelp(true)}
            title={collapsed ? 'Shortcuts (?)' : undefined}
          >
            <IconHelp />
            <span className="sidebar-item-label">Shortcuts</span>
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            title={collapsed ? 'Settings' : undefined}
          >
            <IconGear />
            <span className="sidebar-item-label">Settings</span>
          </NavLink>
          <button
            className="sidebar-item logout"
            onClick={() => setLoggedIn(false)}
            title={collapsed ? 'Logout' : undefined}
          >
            <IconSignOut />
            <span className="sidebar-item-label">Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      <Toast />
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
