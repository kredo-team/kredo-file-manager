import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { IconFolder, IconFolderPlus, IconEye, IconPaperPlane, IconFile, IconChartBar, IconUsers, IconGear } from '../components/Icons';

export default function Dashboard() {
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [entityCount, setEntityCount] = useState(0);
  const [fyCount, setFyCount] = useState(0);

  useEffect(() => {
    if (!settings?.root_path) return;
    (async () => {
      try {
        const entities = await invoke<string[]>('list_entities', { rootPath: settings.root_path });
        setEntityCount(entities.length);
        let totalFy = 0;
        for (const e of entities) {
          const fys = await invoke<string[]>('list_financial_years', { rootPath: settings.root_path, entityName: e });
          totalFy += fys.length;
        }
        setFyCount(totalFy);
      } catch { /* ignore */ }
    })();
  }, [settings?.root_path]);

  const rootSet = !!settings?.root_path;

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">Dashboard</div>
        <div className="page-head-subtitle">Overview of your file management workspace</div>
      </div>

      {!rootSet && (
        <div className="card" style={{ marginBottom: 20, padding: '48px 28px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <IconGear style={{ width: 24, height: 24, fill: 'var(--brand)' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Welcome to Kredo</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>Set up your root folder to start managing client files</div>
          <button className="btn btn-primary" onClick={() => navigate('/settings')}>Open Settings</button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><IconUsers /></div>
          <div className="stat-value">{entityCount}</div>
          <div className="stat-label">Clients</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><IconFolder /></div>
          <div className="stat-value">{fyCount}</div>
          <div className="stat-label">Financial Years</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><IconFile /></div>
          <div className="stat-value">—</div>
          <div className="stat-label">Last Scan Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><IconChartBar /></div>
          <div className="stat-value">—</div>
          <div className="stat-label">Last Scan Size</div>
        </div>
      </div>

      {/* Auto Email Status */}
      {settings?.auto_email?.enabled && (
        <div className="card" style={{ marginBottom: 20, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => navigate('/settings?tab=scheduler')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#1D9E75', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>
              Scheduled email — <span style={{ color: 'var(--brand)' }}>{settings.auto_email.schedule === 'every_minute' ? 'Every minute' : settings.auto_email.schedule === 'daily' ? `Daily at ${settings.auto_email.time}` : settings.auto_email.schedule === 'weekly' ? `Weekly at ${settings.auto_email.time}` : `Monthly at ${settings.auto_email.time}`}</span>
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
            {settings.auto_email.last_sent ? `Last: ${new Date(settings.auto_email.last_sent).toLocaleString()}` : 'Not sent yet'}
          </span>
        </div>
      )}

      {/* Quick Actions */}
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div className="page-head-title" style={{ fontSize: 16 }}>Quick Actions</div>
      </div>
      <div className="quick-grid">
        <div className="quick-card" onClick={() => navigate('/folders')}>
          <div className="quick-card-icon"><IconFolderPlus /></div>
          <div className="quick-card-title">Create Folders</div>
          <div className="quick-card-desc">Set up FY and monthly folder structures for your clients</div>
        </div>
        <div className="quick-card" onClick={() => navigate('/scan')}>
          <div className="quick-card-icon"><IconEye /></div>
          <div className="quick-card-title">Scan & Export</div>
          <div className="quick-card-desc">Audit files and send reports</div>
        </div>
        <div className="quick-card" onClick={() => navigate('/settings')}>
          <div className="quick-card-icon"><IconGear /></div>
          <div className="quick-card-title">Settings</div>
          <div className="quick-card-desc">Configure workspace, SMTP, and email mappings</div>
        </div>
      </div>
    </>
  );
}
