import { useState, useEffect, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../store/appStore';
import { IconPaperPlane, IconEye } from '../components/Icons';
import type { SmtpConfig, EmailPayload } from '../types';

interface AuditRow { client: string; month: string; statement_path: string; status: string; count: number; }
interface AuditResult { rows: AuditRow[]; total_folders: number; filled: number; empty: number; completion: number; }
interface ChipRow { client: string; fy: string; statementType: string; isFyLevel: boolean; months: Record<string, number>; total: number; }

const MONTH_NAMES = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const DASH = '\u2014';

function fyMonthKeys(fy: string): string[] {
  const match = fy.match(/FY\s*(\d{4})-(\d{2,4})/);
  if (!match) return [];
  const sy = parseInt(match[1]);
  const ey = match[2].length === 2 ? parseInt(match[1].slice(0, 2) + match[2]) : parseInt(match[2]);
  const ms = [
    { i: '01', n: 'Apr', y: sy }, { i: '02', n: 'May', y: sy }, { i: '03', n: 'Jun', y: sy },
    { i: '04', n: 'Jul', y: sy }, { i: '05', n: 'Aug', y: sy }, { i: '06', n: 'Sep', y: sy },
    { i: '07', n: 'Oct', y: sy }, { i: '08', n: 'Nov', y: sy }, { i: '09', n: 'Dec', y: sy },
    { i: '10', n: 'Jan', y: ey }, { i: '11', n: 'Feb', y: ey }, { i: '12', n: 'Mar', y: ey },
  ];
  return ms.map((m) => `${m.i} ${m.n} ${m.y}`);
}

function pivotToChipGrid(rows: AuditRow[], fy: string): ChipRow[] {
  const aggMap = new Map<string, { client: string; month: string; type: string; count: number }>();
  for (const r of rows) {
    const pt = r.statement_path.split(' \u2192 ')[0] || r.statement_path;
    const k = `${r.client}||${r.month}||${pt}`;
    const ex = aggMap.get(k);
    if (ex) { ex.count += r.count; } else { aggMap.set(k, { client: r.client, month: r.month, type: pt, count: r.count }); }
  }
  const groupMap = new Map<string, ChipRow>();
  const fyShort = fy.replace('FY ', '');
  for (const agg of aggMap.values()) {
    const isFy = agg.month === DASH;
    const gk = `${agg.client}||${agg.type}||${isFy ? 'fy' : 'month'}`;
    if (!groupMap.has(gk)) groupMap.set(gk, { client: agg.client, fy: fyShort, statementType: agg.type, isFyLevel: isFy, months: {}, total: 0 });
    const row = groupMap.get(gk)!;
    row.months[agg.month] = (row.months[agg.month] || 0) + agg.count;
    row.total += agg.count;
  }
  const result = Array.from(groupMap.values());
  result.sort((a, b) => { const c = a.client.localeCompare(b.client); if (c !== 0) return c; if (a.isFyLevel !== b.isFyLevel) return a.isFyLevel ? 1 : -1; return a.statementType.localeCompare(b.statementType); });
  return result;
}

/* ═══ HTML Email with chips ═══ */
function generateEmailHTML(chipRows: ChipRow[], monthKeys: string[], filled: number, empty: number, total: number, completion: number, _clients: string, _fy: string): string {
  const cs = (green: boolean) => `display:block;padding:3px 0;border-radius:3px;font-size:8px;font-weight:600;background:${green ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.08)'};color:${green ? '#1D9E75' : '#E25C5C'};`;
  const cellS = 'text-align:center;padding:2px 1px;';

  let prev = '';
  const rows = chipRows.map((r) => {
    const sep = prev && prev !== r.client ? '<tr><td colspan="5" style="padding:0;border-bottom:none;height:8px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:2px solid #EEEDFA;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>' : '';
    prev = r.client;
    const tn = r.statementType === DASH ? `${DASH} (FY level)` : r.statementType;
    const fyShort = r.fy.replace(/^FY\s*/i, '');
    const chips = r.isFyLevel
      ? `<span style="display:inline-block;padding:3px 8px;border-radius:3px;font-size:8px;font-weight:600;background:${r.total > 0 ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.08)'};color:${r.total > 0 ? '#1D9E75' : '#E25C5C'};">FY</span>`
      : `<table cellpadding="0" cellspacing="1" width="100%"><tr>${monthKeys.slice(0, 6).map((mk, i) => `<td style="${cellS}"><span style="${cs((r.months[mk] || 0) > 0)}">${MONTH_NAMES[i]}</span></td>`).join('')}</tr><tr>${monthKeys.slice(6).map((mk, i) => `<td style="${cellS}"><span style="${cs((r.months[mk] || 0) > 0)}">${MONTH_NAMES[i + 6]}</span></td>`).join('')}</tr></table>`;
    const tdS = 'border-bottom:1px solid #F0EFF5;vertical-align:middle;';
    return `${sep}<tr style="height:48px;">
      <td style="padding:0 6px;font-size:11px;color:#615FFF;font-weight:600;${tdS}white-space:nowrap;">${r.client}</td>
      <td style="padding:0 6px;font-size:11px;color:#5E5C7A;${tdS}white-space:nowrap;">${fyShort}</td>
      <td style="padding:0 6px;font-size:11px;color:#131126;font-weight:500;${tdS}">${tn}</td>
      <td style="padding:4px 2px;${tdS}">${chips}</td>
      <td style="padding:0 6px;text-align:right;font-size:11px;font-weight:600;color:${r.total > 0 ? '#131126' : '#E25C5C'};${tdS}white-space:nowrap;">${r.total}</td>
    </tr>`;
  }).join('');

  const thS = 'padding:0 6px;text-align:left;font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;border-bottom:1.5px solid #F0EFF5;vertical-align:middle;';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F4FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4FC;padding:16px 0;"><tr><td align="center">
<table cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#FFF;border-radius:12px;overflow:hidden;">
<tr><td style="background:#615FFF;padding:18px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="32" height="32" style="background:rgba(255,255,255,0.2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;color:white;line-height:32px;">K</td>
    <td style="padding-left:10px;vertical-align:middle;"><div style="color:white;font-size:14px;font-weight:600;line-height:1.2;">Kredo File Manager</div><div style="color:rgba(255,255,255,0.65);font-size:10px;line-height:1.2;margin-top:2px;">Automated status report</div></td>
  </tr></table>
</td></tr>
<tr><td style="padding:14px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0EFF5;border-radius:6px;overflow:hidden;">
    <tr>
      <td width="50%" style="text-align:center;padding:12px 0;border-right:1px solid #F0EFF5;border-bottom:1px solid #F0EFF5;"><div style="font-size:22px;font-weight:700;color:#131126;">${total}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;">Total</div></td>
      <td width="50%" style="text-align:center;padding:12px 0;border-bottom:1px solid #F0EFF5;"><div style="font-size:22px;font-weight:700;color:#1D9E75;">${filled}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;">Filled</div></td>
    </tr>
    <tr>
      <td width="50%" style="text-align:center;padding:12px 0;border-right:1px solid #F0EFF5;"><div style="font-size:22px;font-weight:700;color:#E25C5C;">${empty}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;">Empty</div></td>
      <td width="50%" style="text-align:center;padding:12px 0;"><div style="font-size:22px;font-weight:700;color:#615FFF;">${completion}%</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;">Complete</div></td>
    </tr>
  </table>
</td></tr>
<tr><td style="padding:0 16px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0EFF5;border-radius:6px;overflow:hidden;">
    <tr style="background:#F5F4FC;height:48px;">
      <th style="${thS}">Client</th>
      <th style="${thS}">FY</th>
      <th style="${thS}">Type</th>
      <th style="${thS}padding:0 2px;">Months</th>
      <th style="${thS}text-align:right;">Count</th>
    </tr>
    ${rows}
  </table>
</td></tr>
<tr><td style="padding:12px 16px;border-top:1px solid #F0EFF5;text-align:center;font-size:10px;color:#C4C3D4;">Automated report by Kredo File Manager</td></tr>
</table></td></tr></table></body></html>`;
}

/* ═══ Component ═══ */
export default function ExportEmail() {
  const { settings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);
  const navigate = useNavigate();

  const [entities, setEntities] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [fyList, setFyList] = useState<string[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [rawRows, setRawRows] = useState<AuditRow[]>([]);
  const [hasResults, setHasResults] = useState(false);

  const [clientDDOpen, setClientDDOpen] = useState(false);
  const [toField, setToField] = useState('');
  const [ccField, setCcField] = useState('');
  const [subjectField, setSubjectField] = useState('');

  useEffect(() => {
    if (!settings?.root_path) return;
    invoke<string[]>('list_entities', { rootPath: settings.root_path }).then(setEntities).catch(() => {});
  }, [settings?.root_path]);

  useEffect(() => {
    if (!settings?.root_path || selectedEntities.length === 0) { setFyList([]); return; }
    invoke<string[]>('list_all_financial_years', { rootPath: settings.root_path, entityNames: selectedEntities })
      .then((fys) => { setFyList(fys); if (fys.length > 0 && !fys.includes(selectedFY)) setSelectedFY(fys[fys.length - 1]); }).catch(() => {});
  }, [settings?.root_path, selectedEntities]);

  useEffect(() => {
    if (!clientDDOpen) return;
    const h = () => setClientDDOpen(false);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [clientDDOpen]);

  useEffect(() => { setHasResults(false); }, [selectedEntities, selectedFY]);

  useEffect(() => {
    const names = selectedEntities.join(', ');
    setSubjectField(`Kredo — ${names || '...'} — ${selectedFY || '...'} — Monthly Status Report`);
    const mappings = settings?.email_mappings || [];
    const tos: string[] = []; const ccs: string[] = [];
    for (const e of selectedEntities) {
      const m = mappings.find((x) => x.entity_name.toLowerCase() === e.toLowerCase());
      if (m) { tos.push(...m.to); ccs.push(...m.cc); }
    }
    setToField([...new Set(tos)].join(', '));
    setCcField([...new Set(ccs)].join(', '));
  }, [selectedEntities, selectedFY, settings?.email_mappings]);

  const toggleEntity = (n: string) => setSelectedEntities((p) => p.includes(n) ? p.filter((e) => e !== n) : [...p, n]);
  const toggleAllEntities = () => setSelectedEntities(selectedEntities.length === entities.length ? [] : [...entities]);
  const allEntitiesSelected = selectedEntities.length === entities.length;
  const clientLabel = allEntitiesSelected ? 'All clients' : selectedEntities.length === 0 ? 'Select' : selectedEntities.length <= 2 ? selectedEntities.join(', ') : `${selectedEntities.length} selected`;

  const handleGenerate = async () => {
    if (selectedEntities.length === 0 || !selectedFY || !settings?.root_path) { addToast('error', 'Select clients and FY'); return; }
    setLoading(true); setHasResults(false);
    try {
      const result = await invoke<AuditResult>('scan_audit', { rootPath: settings.root_path, entityNames: selectedEntities, financialYear: selectedFY });
      setRawRows(result.rows); setHasResults(true);
      addToast('success', `Generated: ${result.completion}% complete`);
    } catch (err) { addToast('error', String(err)); }
    finally { setLoading(false); }
  };

  const chipRows = pivotToChipGrid(rawRows, selectedFY);
  const monthKeys = fyMonthKeys(selectedFY);
  const total = chipRows.length;
  const filled = chipRows.filter((r) => r.total > 0).length;
  const empty = total - filled;
  const chipsFilled = chipRows.reduce((s, r) => r.isFyLevel ? s + (r.total > 0 ? 1 : 0) : s + monthKeys.filter((mk) => (r.months[mk] || 0) > 0).length, 0);
  const chipsTotal = chipRows.reduce((s, r) => r.isFyLevel ? s + 1 : s + 12, 0);
  const completion = chipsTotal > 0 ? Math.round((chipsFilled / chipsTotal) * 1000) / 10 : 0;

  const handleSend = async () => {
    if (!settings?.smtp?.host) { addToast('error', 'Configure SMTP in Settings first'); return; }
    const toList = toField.split(',').map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) { addToast('error', 'Enter at least one recipient'); return; }
    const ccList = ccField.split(',').map((s) => s.trim()).filter(Boolean);
    setSending(true);
    try {
      const html = generateEmailHTML(chipRows, monthKeys, filled, empty, total, completion, selectedEntities.join(', '), selectedFY);
      const smtp: SmtpConfig = { host: settings.smtp.host, port: settings.smtp.port, username: settings.smtp.username, password: settings.smtp.password, from_name: settings.smtp.from_name, from_email: settings.smtp.from_email };
      const payload: EmailPayload = { to: toList, cc: ccList, subject: subjectField, body: html, attachments: [] };
      const res = await invoke<{ success: boolean; message: string }>('send_email', { smtpConfig: smtp, email: payload });
      addToast(res.success ? 'success' : 'error', res.message);
    } catch (err) {
      const e = String(err);
      if (e.includes('Authentication') || e.includes('credentials')) addToast('error', 'SMTP login failed. Check credentials.');
      else if (e.includes('connect') || e.includes('timeout')) addToast('error', 'Cannot connect to mail server.');
      else addToast('error', `Email failed: ${e}`);
    } finally { setSending(false); }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateEmailHTML(chipRows, monthKeys, filled, empty, total, completion, selectedEntities.join(', '), selectedFY));
      addToast('success', 'HTML copied to clipboard');
    } catch { addToast('error', 'Could not copy'); }
  };

  const smtpOk = !!settings?.smtp?.host;
  const getClientGroup = (idx: number) => chipRows[idx]?.client;

  const MultiDD = ({ open, items, checked, toggle, allChecked, toggleAll, allLabel, labelFn }: any) => (
    open ? (
      <div onClick={(e: any) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--card-solid)', borderRadius: 'var(--r-sm)', border: '1px solid var(--input-border)', boxShadow: 'var(--shadow-float)', zIndex: 50, maxHeight: 240, overflowY: 'auto' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink)', borderBottom: '1px solid var(--divider)' }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ accentColor: '#615FFF', width: 15, height: 15 }} />{allLabel}
        </label>
        {items.map((item: string) => (
          <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', borderBottom: '1px solid var(--divider)' }}>
            <input type="checkbox" checked={checked(item)} onChange={() => toggle(item)} style={{ accentColor: '#615FFF', width: 15, height: 15 }} />{labelFn ? labelFn(item) : item}
          </label>
        ))}
      </div>
    ) : null
  );

  /* ═══ Chip renderer (shared between preview table and email) ═══ */
  const renderChips = (row: ChipRow) => (
    <div style={{ display: 'flex', gap: 3 }}>
      {row.isFyLevel ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, height: 24, padding: '0 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
          background: row.total > 0 ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.07)', color: row.total > 0 ? '#1D9E75' : '#E25C5C' }}>FY</span>
      ) : monthKeys.map((mk, mi) => {
        const count = row.months[mk] || 0;
        return (
          <span key={mk} title={`${MONTH_NAMES[mi]} — ${count} file${count !== 1 ? 's' : ''}`}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, height: 24, borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: count > 0 ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.07)', color: count > 0 ? '#1D9E75' : '#E25C5C' }}>{MONTH_NAMES[mi]}</span>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">Export & Email</div>
        <div className="page-head-subtitle">Generate and send monthly compliance reports</div>
      </div>

      {/* Auto email indicator */}
      {settings?.auto_email?.enabled && (
        <div className="card" style={{ marginBottom: 16, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => navigate('/settings?tab=scheduler')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: 4, background: '#1D9E75', animation: 'pulse 2s infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              Auto email active — <span style={{ color: 'var(--brand)', fontWeight: 500 }}>{settings.auto_email.schedule === 'every_minute' ? 'Every minute' : settings.auto_email.schedule === 'daily' ? `Daily at ${settings.auto_email.time}` : settings.auto_email.schedule === 'weekly' ? `Weekly at ${settings.auto_email.time}` : `Monthly at ${settings.auto_email.time}`}</span>
              {settings.auto_email.last_sent && <span style={{ color: 'var(--ink-4)', marginLeft: 8 }}>· Last: {new Date(settings.auto_email.last_sent).toLocaleString()}</span>}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 500 }}>Configure</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Report configuration</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="input-group" style={{ flex: 1, position: 'relative' }}>
              <label className="input-label">Clients</label>
              <div className="select-field" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={(e) => { e.stopPropagation(); setClientDDOpen(!clientDDOpen); }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedEntities.length === 0 ? 'var(--ink-3)' : 'var(--ink)' }}>{clientLabel}</span>
              </div>
              <MultiDD open={clientDDOpen} items={entities} checked={(e: string) => selectedEntities.includes(e)} toggle={toggleEntity} allChecked={allEntitiesSelected} toggleAll={toggleAllEntities} allLabel="All clients" />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Financial Year</label>
              <select className="select-field" value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
                {fyList.length === 0 && <option value="">—</option>}
                {fyList.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={selectedEntities.length === 0 || !selectedFY || loading} style={{ minWidth: 120 }}>
              {loading ? <><span className="btn-spinner" /> Generating</> : <><IconEye /> Generate</>}
            </button>
          </div>
        </div>
      </div>

      {hasResults && (
        <div className="card">
          {!smtpOk && (
            <div style={{ padding: '12px 28px', background: 'var(--brand-bg)', fontSize: 12.5, color: 'var(--brand)', fontWeight: 500, borderBottom: '1px solid var(--divider)' }}>
              Configure SMTP in Settings to send emails directly
            </div>
          )}

          <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14 }}>
            <span className="card-title">Email preview</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="input-group" style={{ flex: 1 }}>
                <label className="input-label">To</label>
                <input className="input-field" placeholder="email@example.com, ..." value={toField} onChange={(e) => setToField(e.target.value)} />
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <label className="input-label">CC</label>
                <input className="input-field" placeholder="Optional..." value={ccField} onChange={(e) => setCcField(e.target.value)} />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Subject</label>
              <input className="input-field" value={subjectField} onChange={(e) => setSubjectField(e.target.value)} />
            </div>
          </div>

          <div className="card-divider" />

          {/* Preview — exact premium layout, chips instead of month+status */}
          <div style={{ padding: '20px 28px' }}>
            <div style={{ border: '1px solid var(--divider)', borderRadius: 'var(--r-sm)', overflow: 'hidden', background: '#F5F4FC' }}>
              <div style={{ background: '#615FFF', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700 }}>K</div>
                <div>
                  <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>Kredo File Manager</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>Monthly status report</div>
                </div>
              </div>
              <div style={{ padding: '14px 22px', background: 'white', borderBottom: '1px solid #F0EFF5' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 6, overflow: 'hidden' }}>
                  {[{ v: total, l: 'Total', c: 'var(--ink)' }, { v: filled, l: 'Filled', c: '#1D9E75' }, { v: empty, l: 'Empty', c: '#E25C5C' }, { v: `${completion}%`, l: 'Complete', c: '#615FFF' }].map((s, i) => (
                    <div key={s.l} style={{ textAlign: 'center', padding: '12px 0', borderBottom: i < 2 ? '1px solid #F0EFF5' : 'none', borderRight: i % 2 === 0 ? '1px solid #F0EFF5' : 'none' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
                      <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.4px', color: 'var(--ink-3)', marginTop: 3 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: '14px 22px 18px', background: 'white' }}>
                <div style={{ border: '1px solid #F0EFF5', borderRadius: 6, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F5F4FC' }}>
                        {['Client', 'FY', 'Statement type', 'Months', 'Count'].map((h, i) => (
                          <th key={h} style={{ padding: '7px 12px', textAlign: i === 4 ? 'right' : 'left', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.4px', color: 'var(--ink-3)', borderBottom: '2px solid #F0EFF5' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chipRows.map((r, i) => {
                        const sep = i > 0 && getClientGroup(i) !== getClientGroup(i - 1);
                        return (
                          <Fragment key={`${r.client}-${r.statementType}-${r.isFyLevel}`}>
                            {sep && <tr style={{ background: 'none' }}><td colSpan={5} style={{ padding: '6px 0', height: 'auto', borderBottom: 'none' }}><div style={{ height: 1, background: 'var(--divider)' }} /></td></tr>}
                            <tr>
                              <td style={{ padding: '7px 12px', fontSize: 11.5, color: '#615FFF', fontWeight: 500, borderBottom: '1px solid #F0EFF5' }}>{r.client}</td>
                              <td style={{ padding: '7px 12px', fontSize: 11.5, color: 'var(--ink-2)', borderBottom: '1px solid #F0EFF5', whiteSpace: 'nowrap' }}>{r.fy}</td>
                              <td style={{ padding: '7px 12px', fontSize: 11.5, color: 'var(--ink)', fontWeight: 500, borderBottom: '1px solid #F0EFF5' }}>{r.statementType === DASH ? `${DASH} (FY level)` : r.statementType}</td>
                              <td style={{ padding: '7px 10px', borderBottom: '1px solid #F0EFF5' }}>{renderChips(r)}</td>
                              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, fontSize: 11.5, color: r.total > 0 ? 'var(--ink)' : '#E25C5C', borderBottom: '1px solid #F0EFF5', fontVariantNumeric: 'tabular-nums' }}>{r.total}</td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ padding: '12px 22px', borderTop: '1px solid #F0EFF5', textAlign: 'center', fontSize: 10, color: '#C4C3D4', background: 'white' }}>Generated by Kredo File Manager</div>
            </div>
          </div>

          <div style={{ padding: '0 28px 24px', display: 'flex', gap: 10 }}>
            <button onClick={handleSend} disabled={sending || !smtpOk || !toField.trim()} className="btn btn-primary" style={{ flex: 1 }}>
              {sending ? <><span className="btn-spinner" /> Sending...</> : <><IconPaperPlane /> Send Email</>}
            </button>
            <button onClick={handleCopy} className="btn btn-secondary" style={{ minWidth: 120 }}>Copy HTML</button>
          </div>
        </div>
      )}
    </>
  );
}
