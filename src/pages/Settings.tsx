import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { useSearchParams } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useUpdater } from '../hooks/useUpdater';
import { useAppStore } from '../store/appStore';
import { IconFolder, IconXmark } from '../components/Icons';
import type { EmailMapping, SmtpConfig } from '../types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SCHEDULES = [
  { value: 'every_minute', label: 'Every minute (testing)' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

type Tab = 'workspace' | 'email' | 'scheduler' | 'about';

export default function Settings() {
  const { settings, saveSettings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'workspace';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Sync tab when navigating from other pages
  useEffect(() => {
    const tab = searchParams.get('tab') as Tab;
    if (tab && ['workspace', 'email', 'scheduler', 'about'].includes(tab)) setActiveTab(tab);
  }, [searchParams]);

  // ── Workspace state ──
  const [rootPath, setRootPath] = useState('');

  // ── About & Updates state ──
  const updater = useUpdater();
  const [appVersion, setAppVersion] = useState('');
  const [changelog, setChangelog] = useState<{ version: string; date: string; notes: string }[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<{ version: string; date: string; notes: string } | null>(null);
  useEffect(() => { getVersion().then(setAppVersion).catch(() => setAppVersion('—')); }, []);
  useEffect(() => {
    if (activeTab !== 'about') return;
    fetch('https://api.github.com/repos/kredo-team/kredo-file-manager/releases?per_page=5')
      .then((r) => r.json())
      .then((releases: any[]) => {
        if (Array.isArray(releases)) {
          setChangelog(releases.map((r) => ({
            version: r.tag_name || r.name || '',
            date: r.published_at ? new Date(r.published_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
            notes: r.body || 'No release notes.',
          })));
        }
      }).catch(() => {});
  }, [activeTab]);
  // ── Email Setup state ──
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [entities, setEntities] = useState<string[]>([]);
  const [editingMapping, setEditingMapping] = useState<string | null>(null);
  const [mappingTo, setMappingTo] = useState('');
  const [mappingCc, setMappingCc] = useState('');
  const [mappingSubject, setMappingSubject] = useState('');
  const [toList, setToList] = useState<string[]>([]);
  const [ccList, setCcList] = useState<string[]>([]);

  // ── Scheduler state ──
  const [aeEnabled, setAeEnabled] = useState(false);
  const [aeSchedule, setAeSchedule] = useState('daily');
  const [aeTime, setAeTime] = useState('09:00');
  const [aeDow, setAeDow] = useState(0);
  const [aeDom, setAeDom] = useState(1);
  const [aeTo, setAeTo] = useState<string[]>([]);
  const [aeCc, setAeCc] = useState<string[]>([]);
  const [aeSubject, setAeSubject] = useState('Kredo — Automated Status Report');
  const [aeToInput, setAeToInput] = useState('');
  const [aeCcInput, setAeCcInput] = useState('');
  const [aeSending, setAeSending] = useState(false);
  const [aeSendMode, setAeSendMode] = useState<'all' | 'configured'>('all');

  // ── Load settings into local state ──
  useEffect(() => {
    if (!settings) return;
    setRootPath(settings.root_path || '');
    setSmtpHost(settings.smtp?.host || '');
    setSmtpPort(String(settings.smtp?.port || 587));
    setSmtpUser(settings.smtp?.username || '');
    setSmtpPass(settings.smtp?.password || '');
    setFromName(settings.smtp?.from_name || '');
    setFromEmail(settings.smtp?.from_email || '');
    const ae = settings.auto_email;
    if (ae) {
      setAeEnabled(ae.enabled || false);
      setAeSchedule(ae.schedule || 'daily');
      setAeTime(ae.time || '09:00');
      setAeDow(ae.day_of_week ?? 0);
      setAeDom(ae.day_of_month || 1);
      setAeTo(ae.to || []);
      setAeCc(ae.cc || []);
      setAeSubject(ae.subject || 'Kredo — Automated Status Report');
    }
  }, [settings]);

  useEffect(() => {
    if (!settings?.root_path) return;
    invoke<string[]>('list_entities', { rootPath: settings.root_path }).then(setEntities).catch(() => {});
  }, [settings?.root_path]);

  // ── Workspace handlers ──
  const handleBrowse = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, title: 'Select root folder' });
      if (selected) setRootPath(selected as string);
    } catch {}
  };
  const handleSaveWorkspace = async () => {
    if (!settings) return;
    await saveSettings({ ...settings, root_path: rootPath });
  };

  // ── Email Setup handlers ──
  const handleSaveSmtp = async () => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      smtp: { host: smtpHost, port: parseInt(smtpPort) || 587, username: smtpUser, password: smtpPass, from_name: fromName, from_email: fromEmail },
    });
    addToast('success', 'SMTP settings saved');
  };
  const openMappingEditor = (entityName: string) => {
    const m = (settings?.email_mappings || []).find((x) => x.entity_name.toLowerCase() === entityName.toLowerCase());
    setEditingMapping(entityName);
    setToList(m?.to || []); setCcList(m?.cc || []);
    setMappingSubject(m?.subject || `File Summary — ${entityName}`);
    setMappingTo(''); setMappingCc('');
  };
  const saveMappingEditor = async () => {
    if (!settings || !editingMapping) return;
    const newMapping: EmailMapping = { entity_name: editingMapping, to: toList, cc: ccList, subject: mappingSubject };
    const existing = settings.email_mappings || [];
    const idx = existing.findIndex((m) => m.entity_name.toLowerCase() === editingMapping.toLowerCase());
    const updated = idx >= 0 ? existing.map((m, i) => (i === idx ? newMapping : m)) : [...existing, newMapping];
    await saveSettings({ ...settings, email_mappings: updated });
    setEditingMapping(null);
    addToast('success', 'Email mapping saved');
  };
  const addMappingTo = () => { const e = mappingTo.trim(); if (e && !toList.includes(e)) { setToList([...toList, e]); setMappingTo(''); } };
  const addMappingCc = () => { const e = mappingCc.trim(); if (e && !ccList.includes(e)) { setCcList([...ccList, e]); setMappingCc(''); } };

  // ── Scheduler handlers ──
  const handleToggle = async () => {
    const next = !aeEnabled;
    setAeEnabled(next);
    if (settings) {
      await saveSettings({ ...settings, auto_email: { ...settings.auto_email, enabled: next } });
      addToast('success', next ? 'Scheduler enabled' : 'Scheduler disabled');
    }
  };
  const handleSaveScheduler = async () => {
    if (!settings) return;
    await saveSettings({
      ...settings,
      auto_email: {
        ...settings.auto_email, enabled: aeEnabled,
        schedule: aeSchedule, time: aeTime, day_of_week: aeDow, day_of_month: aeDom,
        to: aeTo, cc: aeCc, subject: aeSubject,
      },
    });
    addToast('success', 'Scheduler settings saved');
  };
  const handleSendNow = async () => {
    if (!settings) return;
    if (!settings.smtp?.host) { addToast('error', 'Configure SMTP first (Email Setup tab)'); return; }
    if (!settings.root_path) { addToast('error', 'Set root folder first (Workspace tab)'); return; }

    // Determine recipients based on send mode
    let sendTo: string[] = [];
    let sendCc: string[] = [];
    if (aeSendMode === 'configured') {
      const mappings = settings.email_mappings || [];
      for (const m of mappings) { sendTo.push(...m.to); sendCc.push(...m.cc); }
      sendTo = [...new Set(sendTo)];
      sendCc = [...new Set(sendCc)];
      if (sendTo.length === 0) { addToast('error', 'No configured recipients. Set email mappings below.'); return; }
    } else {
      sendTo = aeTo;
      sendCc = aeCc;
      if (sendTo.length === 0) { addToast('error', 'Add at least one recipient'); return; }
    }

    setAeSending(true);
    try {
      const smtp: SmtpConfig = {
        host: settings.smtp.host, port: settings.smtp.port,
        username: settings.smtp.username, password: settings.smtp.password,
        from_name: settings.smtp.from_name, from_email: settings.smtp.from_email,
      };
      const result = await invoke<{ success: boolean; message: string; timestamp: string }>('send_auto_email', {
        rootPath: settings.root_path, smtpConfig: smtp,
        to: sendTo, cc: sendCc, subject: aeSubject || 'Kredo — Automated Status Report',
      });
      await saveSettings({
        ...settings,
        auto_email: { ...settings.auto_email, last_sent: result.timestamp, last_status: 'success' },
      });
      addToast('success', result.message);
    } catch (err) {
      await saveSettings({
        ...settings,
        auto_email: { ...settings.auto_email, last_sent: new Date().toISOString(), last_status: String(err) },
      });
      addToast('error', String(err));
    } finally { setAeSending(false); }
  };
  const aeAddTo = () => { const e = aeToInput.trim(); if (e && !aeTo.includes(e)) { setAeTo([...aeTo, e]); setAeToInput(''); } };
  const aeAddCc = () => { const e = aeCcInput.trim(); if (e && !aeCc.includes(e)) { setAeCc([...aeCc, e]); setAeCcInput(''); } };

  const lastSent = settings?.auto_email?.last_sent;
  const lastStatus = settings?.auto_email?.last_status;
  const lastSentDisplay = lastSent ? new Date(lastSent).toLocaleString() : 'Never';

  // ── Tab styling ──
  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: '10px 18px', fontSize: 13, fontWeight: activeTab === tab ? 600 : 500,
    color: activeTab === tab ? 'var(--brand)' : 'var(--ink-3)',
    cursor: 'pointer', borderBottom: activeTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
    marginBottom: -1.5, transition: 'color 0.15s',
  });

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">Settings</div>
        <div className="page-head-subtitle">Configure workspace, email delivery, scheduled reports, and updates</div>
      </div>

      {/* ═══ Tabs ═══ */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1.5px solid var(--divider)', marginBottom: 20 }}>
        <div style={tabStyle('workspace')} onClick={() => setActiveTab('workspace')}
          onMouseEnter={(e) => { if (activeTab !== 'workspace') (e.target as HTMLElement).style.color = 'var(--ink-2)'; }}
          onMouseLeave={(e) => { if (activeTab !== 'workspace') (e.target as HTMLElement).style.color = 'var(--ink-3)'; }}>
          Workspace
        </div>
        <div style={tabStyle('email')} onClick={() => setActiveTab('email')}
          onMouseEnter={(e) => { if (activeTab !== 'email') (e.target as HTMLElement).style.color = 'var(--ink-2)'; }}
          onMouseLeave={(e) => { if (activeTab !== 'email') (e.target as HTMLElement).style.color = 'var(--ink-3)'; }}>
          Email Setup
        </div>
        <div style={tabStyle('scheduler')} onClick={() => setActiveTab('scheduler')}
          onMouseEnter={(e) => { if (activeTab !== 'scheduler') (e.target as HTMLElement).style.color = 'var(--ink-2)'; }}
          onMouseLeave={(e) => { if (activeTab !== 'scheduler') (e.target as HTMLElement).style.color = 'var(--ink-3)'; }}>
          Scheduler
          {aeEnabled && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: '#1D9E75', marginLeft: 6, verticalAlign: 'middle', animation: 'pulse 2s infinite' }} />}
        </div>
        <div style={tabStyle('about')} onClick={() => setActiveTab('about')}
          onMouseEnter={(e) => { if (activeTab !== 'about') (e.target as HTMLElement).style.color = 'var(--ink-2)'; }}
          onMouseLeave={(e) => { if (activeTab !== 'about') (e.target as HTMLElement).style.color = 'var(--ink-3)'; }}>
          About
        </div>
      </div>

      {/* ═══ Tab: Workspace ═══ */}
      {activeTab === 'workspace' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Root Folder</span></div>
          <div style={{ padding: '16px 20px', display: 'grid', gap: 16 }}>
            <div className="input-group">
              <label className="input-label">Folder Path</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input-field" style={{ flex: 1 }} value={rootPath} onChange={(e) => setRootPath(e.target.value)} placeholder="C:\Users\..." />
                <button className="btn btn-secondary btn-sm" onClick={handleBrowse}><IconFolder style={{ width: 12, height: 12 }} /></button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 6 }}>All client data will be stored inside a "data" subfolder of this path</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSaveWorkspace}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Tab: Email Setup ═══ */}
      {activeTab === 'email' && (
        <>
          {/* SMTP */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">SMTP Configuration</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Mail server for sending emails</span>
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
                <div className="input-group"><label className="input-label">Host</label><input className="input-field" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" /></div>
                <div className="input-group"><label className="input-label">Port</label><input className="input-field" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group"><label className="input-label">Username</label><input className="input-field" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} /></div>
                <div className="input-group"><label className="input-label">Password</label><input className="input-field" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="input-group"><label className="input-label">From Name</label><input className="input-field" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Kredo File Manager" /></div>
                <div className="input-group"><label className="input-label">From Email</label><input className="input-field" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="notify@company.com" /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleSaveSmtp}>Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ Tab: Scheduler & Mappings ═══ */}
      {activeTab === 'scheduler' && (
        <>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="card-title">Scheduled Email Reports</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span style={{ fontSize: 12, color: aeEnabled ? 'var(--brand)' : 'var(--ink-3)', fontWeight: 500 }}>{aeEnabled ? 'Active' : 'Disabled'}</span>
              <div onClick={handleToggle}
                style={{ width: 38, height: 20, borderRadius: 10, background: aeEnabled ? 'var(--brand)' : 'var(--divider)', transition: 'background 0.2s', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: 'white', position: 'absolute', top: 2, left: aeEnabled ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }} />
              </div>
            </label>
          </div>

          <div style={{ padding: '16px 20px', display: 'grid', gap: 16 }}>
            {/* Schedule config — dims when disabled */}
            <div style={{ display: 'grid', gap: 16, opacity: aeEnabled ? 1 : 0.5, pointerEvents: aeEnabled ? 'auto' : 'none' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
                <div className="input-group" style={{ minWidth: 180 }}>
                  <label className="input-label">Schedule</label>
                  <select className="select-field" value={aeSchedule} onChange={(e) => setAeSchedule(e.target.value)}>
                    {SCHEDULES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {aeSchedule !== 'every_minute' && (
                  <div className="input-group" style={{ width: 120 }}>
                    <label className="input-label">Time</label>
                    <input className="input-field" type="time" value={aeTime} onChange={(e) => setAeTime(e.target.value)} />
                  </div>
                )}
                {aeSchedule === 'weekly' && (
                  <div className="input-group" style={{ minWidth: 140 }}>
                    <label className="input-label">Day</label>
                    <select className="select-field" value={aeDow} onChange={(e) => setAeDow(Number(e.target.value))}>
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                {aeSchedule === 'monthly' && (
                  <div className="input-group" style={{ width: 100 }}>
                    <label className="input-label">Day of month</label>
                    <select className="select-field" value={aeDom} onChange={(e) => setAeDom(Number(e.target.value))}>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Subject — always accessible */}
            <div className="input-group">
              <label className="input-label">Subject</label>
              <input className="input-field" value={aeSubject} onChange={(e) => setAeSubject(e.target.value)} placeholder="Kredo — Automated Status Report" />
            </div>

            {/* Send mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}>Send to:</span>
              <div style={{ display: 'flex', borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--input-border)' }}>
                <button type="button" onClick={() => setAeSendMode('all')}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: aeSendMode === 'all' ? 'var(--brand)' : 'var(--input-bg)', color: aeSendMode === 'all' ? 'white' : 'var(--ink-3)', transition: 'all 0.15s' }}>
                  All (Global TO/CC)
                </button>
                <button type="button" onClick={() => setAeSendMode('configured')}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 500, border: 'none', borderLeft: '1px solid var(--input-border)', cursor: 'pointer', background: aeSendMode === 'configured' ? 'var(--brand)' : 'var(--input-bg)', color: aeSendMode === 'configured' ? 'white' : 'var(--ink-3)', transition: 'all 0.15s' }}>
                  Configured recipients
                </button>
              </div>
            </div>

            {/* TO/CC — only when "All" mode */}
            {aeSendMode === 'all' && (<>
              <div className="input-group">
                <label className="input-label">TO</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input-field" style={{ flex: 1 }} value={aeToInput} onChange={(e) => setAeToInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aeAddTo()} placeholder="email@example.com" />
                  <button className="btn btn-primary" onClick={aeAddTo}>Add</button>
                </div>
                {aeTo.length > 0 && <div className="tag-list">{aeTo.map((em) => <span className="tag" key={em}>{em}<button className="tag-remove" onClick={() => setAeTo(aeTo.filter((x) => x !== em))}><IconXmark /></button></span>)}</div>}
              </div>
              <div className="input-group">
                <label className="input-label">CC</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input-field" style={{ flex: 1 }} value={aeCcInput} onChange={(e) => setAeCcInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aeAddCc()} placeholder="cc@example.com" />
                  <button className="btn btn-secondary" onClick={aeAddCc}>Add</button>
                </div>
                {aeCc.length > 0 && <div className="tag-list">{aeCc.map((em) => <span className="tag" key={em}>{em}<button className="tag-remove" onClick={() => setAeCc(aeCc.filter((x) => x !== em))}><IconXmark /></button></span>)}</div>}
              </div>
            </>)}

            {/* Info when configured mode */}
            {aeSendMode === 'configured' && (
              <div style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--input-bg)', fontSize: 12, color: 'var(--ink-2)' }}>
                Emails will be sent to each client's configured recipients from the mappings table below.
              </div>
            )}

            {/* Status — always visible */}
            <div style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                Last sent: <strong style={{ color: 'var(--ink-2)' }}>{lastSentDisplay}</strong>
                {lastStatus && (
                  <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 500, background: lastStatus === 'success' ? 'rgba(29,158,117,0.08)' : 'rgba(226,92,92,0.08)', color: lastStatus === 'success' ? '#1D9E75' : '#E25C5C' }}>
                    {lastStatus === 'success' ? 'Success' : 'Failed'}
                  </span>
                )}
              </div>
            </div>

            {/* Actions — always enabled */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-secondary" onClick={handleSendNow} disabled={aeSending || (aeSendMode === 'all' && aeTo.length === 0) || (aeSendMode === 'configured' && entities.length === 0)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {aeSending ? <span className="btn-spinner" style={{ width: 12, height: 12 }} /> : null}
                {aeSending ? 'Sending...' : 'Send Now'}
              </button>
              <button className="btn btn-primary" onClick={handleSaveScheduler}>Save</button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 512 512" style={{ width: 12, height: 12, fill: 'var(--ink-4)', flexShrink: 0 }}><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24H216c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z" /></svg>
              App must be running for scheduled emails
            </div>
          </div>
        </div>

        {/* Email Mappings — in Scheduler tab */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Email Mappings</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Per-client recipients</span>
          </div>
          <div className="table-wrapper" style={{ padding: '0 0 16px', maxHeight: 300, overflowY: 'auto' }}>
            {entities.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No clients found</div><div className="empty-state-desc">Create folders first, then clients appear here</div></div>
            ) : (
              <table><thead><tr>
                <th style={{ width: '35%' }}>Client</th><th style={{ width: '35%' }}>Recipients</th><th style={{ width: '30%', textAlign: 'center' }}>Action</th>
              </tr></thead><tbody>
                {entities.map((e) => {
                  const m = (settings?.email_mappings || []).find((x) => x.entity_name.toLowerCase() === e.toLowerCase());
                  return (
                    <tr key={e}>
                      <td className="primary-cell" style={{ fontWeight: 600 }}>{e}</td>
                      <td>{m && m.to.length > 0 ? <span className="chip">{m.to.length} recipient{m.to.length > 1 ? 's' : ''}</span> : <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Not set</span>}</td>
                      <td style={{ textAlign: 'center' }}><button className="btn btn-secondary btn-sm" onClick={() => openMappingEditor(e)}>Configure</button></td>
                    </tr>
                  );
                })}
              </tbody></table>
            )}
          </div>
        </div>
        </>
      )}

      {/* ═══ Tab: About & Updates ═══ */}
      {activeTab === 'about' && (
        <div className="card">
          <div className="card-header"><span className="card-title">About Kredo File Manager</span></div>
          <div style={{ padding: '20px 20px 24px', display: 'grid', gap: 20 }}>

            {/* Version info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>K</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Kredo File Manager</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>Version {appVersion || '—'} · Built with Tauri</div>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--divider)' }} />

            {/* Update section */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Software Updates</div>

              {updater.status === 'idle' && (
                <button className="btn btn-primary" onClick={updater.checkForUpdates}>Check for Updates</button>
              )}

              {updater.status === 'checking' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
                  <span className="btn-spinner" style={{ width: 14, height: 14 }} /> Checking for updates...
                </div>
              )}

              {updater.status === 'up-to-date' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1D9E75', fontWeight: 500 }}>
                    <svg viewBox="0 0 512 512" style={{ width: 14, height: 14, fill: '#1D9E75' }}><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335.2 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" /></svg>
                    You're on the latest version
                  </div>
                  <button className="btn btn-secondary" onClick={updater.checkForUpdates} style={{ fontSize: 12 }}>Check again</button>
                </div>
              )}

              {updater.status === 'available' && updater.info && (
                <div style={{ border: '1px solid var(--divider)', borderRadius: 'var(--r-sm)', padding: 16, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>v{updater.info.version} available</div>
                      {updater.info.date && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{updater.info.date}</div>}
                    </div>
                    <button className="btn btn-primary" onClick={updater.downloadAndInstall}>Download & Install</button>
                  </div>
                  {updater.info.body && (
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap', padding: '10px 12px', background: 'var(--input-bg)', borderRadius: 'var(--r-sm)' }}>{updater.info.body}</div>
                  )}
                </div>
              )}

              {updater.status === 'downloading' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-2)' }}>
                    <span>Downloading update...</span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{updater.progress}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--input-bg)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${updater.progress}%`, background: 'var(--brand)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}

              {updater.status === 'ready' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1D9E75', fontWeight: 500 }}>
                  <svg viewBox="0 0 512 512" style={{ width: 14, height: 14, fill: '#1D9E75' }}><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335.2 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" /></svg>
                  Update installed — restarting...
                </div>
              )}

              {updater.status === 'error' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, color: '#E25C5C' }}>Update check failed: {updater.error}</div>
                  <button className="btn btn-secondary" onClick={updater.checkForUpdates} style={{ fontSize: 12 }}>Retry</button>
                </div>
              )}
            </div>

            {/* Changelog */}
            {changelog.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--divider)' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Release History</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {changelog.map((r) => {
                      const isCurrent = r.version === `v${appVersion}`;
                      return (
                        <div key={r.version} onClick={() => setSelectedRelease(r)}
                          style={{ padding: '12px 14px', borderRadius: 'var(--r-sm)', background: isCurrent ? 'var(--brand-bg)' : 'var(--input-bg)', cursor: 'pointer', transition: 'background 0.15s', border: isCurrent ? '1px solid rgba(97,95,255,0.15)' : '1px solid transparent' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>{r.version}</span>
                              {isCurrent && <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 6px', borderRadius: 4, background: 'var(--brand)', color: 'white' }}>Current</span>}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{r.date}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ Release Notes Popup ═══ */}
      {selectedRelease && (
        <div className="dialog-overlay" onClick={() => setSelectedRelease(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div className="dialog-title" style={{ textAlign: 'left', marginBottom: 2 }}>{selectedRelease.version}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{selectedRelease.date}</div>
              </div>
              <button onClick={() => setSelectedRelease(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 'var(--r-sm)' }}>
                <IconXmark style={{ width: 14, height: 14, fill: 'var(--ink-3)' }} />
              </button>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto', padding: '16px 18px', background: 'var(--input-bg)', borderRadius: 'var(--r-sm)' }}>
              {(selectedRelease.notes || 'No release notes available.').split('\n').map((line, i) => {
                const l = line.trim();
                if (!l) return <div key={i} style={{ height: 10 }} />;
                if (l.startsWith('## ')) return <div key={i} style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, marginTop: i > 0 ? 8 : 0 }}>{l.replace('## ', '')}</div>;
                if (l.startsWith('**') && l.endsWith('**')) return <div key={i} style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)', marginTop: 14, marginBottom: 6 }}>{l.replace(/\*\*/g, '')}</div>;
                if (l.startsWith('- ')) return (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 3 }}>
                    <span style={{ color: 'var(--brand)', fontWeight: 600, flexShrink: 0 }}>•</span>
                    <span>{l.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')}</span>
                  </div>
                );
                return <div key={i} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{l}</div>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Mapping Editor Dialog ═══ */}
      {editingMapping && (
        <div className="dialog-overlay" onClick={() => setEditingMapping(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="dialog-title" style={{ textAlign: 'left', marginBottom: 16 }}>Email Mapping — {editingMapping}</div>
            <div className="input-group" style={{ marginBottom: 16 }}>
              <label className="input-label">Subject</label>
              <input className="input-field" value={mappingSubject} onChange={(e) => setMappingSubject(e.target.value)} />
            </div>
            <div className="input-group" style={{ marginBottom: 16 }}>
              <label className="input-label">TO</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input-field" style={{ flex: 1 }} value={mappingTo} onChange={(e) => setMappingTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMappingTo()} placeholder="email@example.com" />
                <button className="btn btn-primary btn-sm" onClick={addMappingTo}>Add</button>
              </div>
              {toList.length > 0 && <div className="tag-list">{toList.map((em) => <span className="tag" key={em}>{em}<button className="tag-remove" onClick={() => setToList(toList.filter((x) => x !== em))}><IconXmark /></button></span>)}</div>}
            </div>
            <div className="input-group" style={{ marginBottom: 24 }}>
              <label className="input-label">CC</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input-field" style={{ flex: 1 }} value={mappingCc} onChange={(e) => setMappingCc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMappingCc()} placeholder="cc@example.com" />
                <button className="btn btn-secondary btn-sm" onClick={addMappingCc}>Add</button>
              </div>
              {ccList.length > 0 && <div className="tag-list">{ccList.map((em) => <span className="tag" key={em}>{em}<button className="tag-remove" onClick={() => setCcList(ccList.filter((x) => x !== em))}><IconXmark /></button></span>)}</div>}
            </div>
            <div className="dialog-buttons">
              <button className="btn btn-secondary" onClick={() => setEditingMapping(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveMappingEditor}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
