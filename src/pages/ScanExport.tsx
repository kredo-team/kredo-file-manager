import { useState, useEffect, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../store/appStore';
import { IconEye, IconSearch, IconPaperPlane } from '../components/Icons';
import type { SmtpConfig, EmailPayload } from '../types';

/* ═══ Types ═══ */
interface AuditRow { client: string; fy: string; month: string; statement_path: string; status: string; count: number; }
interface AuditResult { rows: AuditRow[]; total_folders: number; filled: number; empty: number; completion: number; }
interface ChipRow { client: string; fy: string; statementType: string; isFyLevel: boolean; months: Record<string, number>; total: number; }

const MONTH_NAMES = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const DASH = '\u2014';

/* ═══ Helpers ═══ */
function fyMonthKeys(fy: string): string[] {
  const match = fy.match(/(\d{4})-(\d{2,4})/);
  if (!match) return [];
  const sy = parseInt(match[1]);
  const ey = match[2].length === 2 ? parseInt(match[1].slice(0, 2) + match[2]) : parseInt(match[2]);
  return [
    `01 Apr ${sy}`, `02 May ${sy}`, `03 Jun ${sy}`, `04 Jul ${sy}`, `05 Aug ${sy}`, `06 Sep ${sy}`,
    `07 Oct ${sy}`, `08 Nov ${sy}`, `09 Dec ${sy}`, `10 Jan ${ey}`, `11 Feb ${ey}`, `12 Mar ${ey}`,
  ];
}

function tog(arr: string[], v: string) { return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]; }

function pivotToChipGrid(rows: AuditRow[]): ChipRow[] {
  const aggMap = new Map<string, { client: string; fy: string; month: string; type: string; count: number }>();
  for (const r of rows) {
    const fyShort = r.fy.replace('FY ', '');
    const pt = r.statement_path.split(' \u2192 ')[0] || r.statement_path;
    const k = `${r.client}||${fyShort}||${r.month}||${pt}`;
    const ex = aggMap.get(k);
    if (ex) { ex.count += r.count; } else { aggMap.set(k, { client: r.client, fy: fyShort, month: r.month, type: pt, count: r.count }); }
  }
  const groupMap = new Map<string, ChipRow>();
  for (const agg of aggMap.values()) {
    const isFy = agg.month === DASH;
    const gk = `${agg.client}||${agg.fy}||${agg.type}||${isFy ? 'fy' : 'month'}`;
    if (!groupMap.has(gk)) groupMap.set(gk, { client: agg.client, fy: agg.fy, statementType: agg.type, isFyLevel: isFy, months: {}, total: 0 });
    const row = groupMap.get(gk)!;
    row.months[agg.month] = (row.months[agg.month] || 0) + agg.count;
    row.total += agg.count;
  }
  const result = Array.from(groupMap.values());
  result.sort((a, b) => {
    let c = a.client.localeCompare(b.client);
    if (c !== 0) return c;
    c = a.fy.localeCompare(b.fy);
    if (c !== 0) return c;
    if (a.isFyLevel !== b.isFyLevel) return a.isFyLevel ? 1 : -1;
    return a.statementType.localeCompare(b.statementType);
  });
  return result;
}

/* ═══ Email HTML ═══ */
function generateEmailHTML(rows: ChipRow[], filled: number, empty: number, total: number, completion: number): string {
  const cs = (g: boolean) => `display:block;padding:3px 0;border-radius:3px;font-size:8px;font-weight:600;background:${g ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.08)'};color:${g ? '#1D9E75' : '#E25C5C'};`;
  const cellS = 'text-align:center;padding:2px 1px;';
  const tdS = 'border-bottom:1px solid #F0EFF5;vertical-align:middle;';
  let prev = '';
  const html = rows.map((r) => {
    const sep = prev && prev !== `${r.client}||${r.fy}` ? '<tr><td colspan="4" style="padding:0;height:8px;border-bottom:none;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:2px solid #EEEDFA;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>' : '';
    prev = `${r.client}||${r.fy}`;
    const tn = r.statementType === DASH ? `${DASH} (FY level)` : r.statementType;
    const mks = fyMonthKeys(r.fy);
    const chips = r.isFyLevel
      ? `<span style="display:inline-block;padding:3px 8px;border-radius:3px;font-size:8px;font-weight:600;background:${r.total > 0 ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.08)'};color:${r.total > 0 ? '#1D9E75' : '#E25C5C'};">FY ${r.total}</span>`
      : `<table cellpadding="0" cellspacing="1" width="100%"><tr>${mks.slice(0,6).map((mk,i) => { const c=r.months[mk]||0; return `<td style="${cellS}"><span style="${cs(c>0)}">${MONTH_NAMES[i]} ${c}</span></td>`; }).join('')}</tr><tr>${mks.slice(6).map((mk,i) => { const c=r.months[mk]||0; return `<td style="${cellS}"><span style="${cs(c>0)}">${MONTH_NAMES[i+6]} ${c}</span></td>`; }).join('')}</tr></table>`;
    return `${sep}<tr style="height:48px;">
      <td style="padding:0 6px;font-size:11px;color:#615FFF;font-weight:600;${tdS}white-space:nowrap;">${r.client}</td>
      <td style="padding:0 6px;font-size:11px;color:#5E5C7A;${tdS}white-space:nowrap;">${r.fy}</td>
      <td style="padding:0 6px;font-size:11px;color:#131126;font-weight:500;${tdS}">${tn}</td>
      <td style="padding:4px 2px;${tdS}">${chips}</td>
    </tr>`;
  }).join('');
  const thS = 'padding:0 6px;text-align:left;font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;border-bottom:1.5px solid #F0EFF5;vertical-align:middle;';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F4FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4FC;padding:16px 0;"><tr><td align="center">
<table cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#FFF;border-radius:12px;overflow:hidden;">
<tr><td style="background:#615FFF;padding:18px 16px;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="32" height="32" style="background:rgba(255,255,255,0.2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;color:white;line-height:32px;">K</td>
<td style="padding-left:10px;vertical-align:middle;"><div style="color:white;font-size:14px;font-weight:600;line-height:1.2;">Kredo File Manager</div><div style="color:rgba(255,255,255,0.65);font-size:10px;line-height:1.2;margin-top:2px;">Automated status report</div></td>
</tr></table></td></tr>
<tr><td style="padding:14px 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0EFF5;border-radius:6px;overflow:hidden;">
<tr><td width="50%" style="text-align:center;padding:12px 0;border-right:1px solid #F0EFF5;border-bottom:1px solid #F0EFF5;"><div style="font-size:22px;font-weight:700;color:#131126;">${total}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;">Total</div></td>
<td width="50%" style="text-align:center;padding:12px 0;border-bottom:1px solid #F0EFF5;"><div style="font-size:22px;font-weight:700;color:#1D9E75;">${filled}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;">Filled</div></td></tr>
<tr><td width="50%" style="text-align:center;padding:12px 0;border-right:1px solid #F0EFF5;"><div style="font-size:22px;font-weight:700;color:#E25C5C;">${empty}</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;">Empty</div></td>
<td width="50%" style="text-align:center;padding:12px 0;"><div style="font-size:22px;font-weight:700;color:#615FFF;">${completion}%</div><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;">Complete</div></td></tr>
</table></td></tr>
<tr><td style="padding:0 16px 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F0EFF5;border-radius:6px;overflow:hidden;">
<tr style="background:#F5F4FC;height:48px;"><th style="${thS}">Client</th><th style="${thS}">FY</th><th style="${thS}">Type</th><th style="${thS}padding:0 2px;">Months</th></tr>
${html}
</table></td></tr>
<tr><td style="padding:12px 16px;border-top:1px solid #F0EFF5;text-align:center;"><div style="font-size:10px;color:#908EAF;">Detailed monthly audit attached as Excel</div><div style="font-size:9px;color:#C4C3D4;margin-top:4px;">Automated report by Kredo File Manager</div></td></tr>
</table></td></tr></table></body></html>`;
}

/* ═══ Component ═══ */
export default function ScanExport() {
  const { settings, loadSettings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);
  const navigate = useNavigate();

  const [entities, setEntities] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [fyList, setFyList] = useState<string[]>([]);
  const [selectedFYs, setSelectedFYs] = useState<string[]>([]);
  const [stmtTypes, setStmtTypes] = useState<string[]>([]);
  const [selectedStmts, setSelectedStmts] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>(['empty', 'ok']);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [clientDDOpen, setClientDDOpen] = useState(false);
  const [fyDDOpen, setFyDDOpen] = useState(false);
  const [stmtDDOpen, setStmtDDOpen] = useState(false);
  const [statusDDOpen, setStatusDDOpen] = useState(false);

  const [rawRows, setRawRows] = useState<AuditRow[]>([]);
  const [hasResults, setHasResults] = useState(false);
  const [toField, setToField] = useState('');
  const [ccField, setCcField] = useState('');
  const [subjectField, setSubjectField] = useState('');

  const closeAllDD = () => { setClientDDOpen(false); setFyDDOpen(false); setStmtDDOpen(false); setStatusDDOpen(false); };

  // Reload settings on mount to pick up root_path changes from Settings page
  useEffect(() => { loadSettings(); }, []);

  // Load entities when root_path changes
  useEffect(() => {
    if (!settings?.root_path) return;
    invoke<string[]>('list_entities', { rootPath: settings.root_path }).then((list) => {
      setEntities(list); setSelectedEntities(list);
    }).catch(() => {});
    setHasResults(false); setRawRows([]);
  }, [settings?.root_path]);

  // Load FYs when entities change
  useEffect(() => {
    if (!settings?.root_path || selectedEntities.length === 0) { setFyList([]); setSelectedFYs([]); return; }
    invoke<string[]>('list_all_financial_years', { rootPath: settings.root_path, entityNames: selectedEntities })
      .then((fys) => {
        setFyList(fys);
        setSelectedFYs((prev) => { const v = prev.filter((f) => fys.includes(f)); return v.length > 0 ? v : fys.length > 0 ? [fys[fys.length - 1]] : []; });
      }).catch(() => {});
  }, [settings?.root_path, selectedEntities]);

  // Load statement types from folder structure (before scan)
  useEffect(() => {
    if (!settings?.root_path || selectedEntities.length === 0 || selectedFYs.length === 0) { setStmtTypes([]); setSelectedStmts([]); return; }
    invoke<string[]>('list_statement_types', { rootPath: settings.root_path, entityNames: selectedEntities, financialYears: selectedFYs })
      .then((types) => { setStmtTypes(types); setSelectedStmts(types); }).catch(() => {});
  }, [settings?.root_path, selectedEntities, selectedFYs]);

  // Auto-fill email from mappings
  useEffect(() => {
    const names = selectedEntities.join(', ');
    const fyLabel = selectedFYs.map((f) => f.replace('FY ', '')).join(', ');
    setSubjectField(`Kredo — ${names || '...'} — ${fyLabel || '...'} — Status Report`);
    const mappings = settings?.email_mappings || [];
    const tos: string[] = []; const ccs: string[] = [];
    for (const e of selectedEntities) {
      const m = mappings.find((x) => x.entity_name.toLowerCase() === e.toLowerCase());
      if (m) { tos.push(...m.to); ccs.push(...m.cc); }
    }
    setToField([...new Set(tos)].join(', '));
    setCcField([...new Set(ccs)].join(', '));
  }, [selectedEntities, selectedFYs, settings?.email_mappings]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!clientDDOpen && !fyDDOpen && !stmtDDOpen && !statusDDOpen) return;
    const h = () => closeAllDD();
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [clientDDOpen, fyDDOpen, stmtDDOpen, statusDDOpen]);

  useEffect(() => { setHasResults(false); }, [selectedEntities, selectedFYs]);

  // Scan
  const handleScan = async () => {
    if (selectedEntities.length === 0 || selectedFYs.length === 0 || !settings?.root_path) {
      addToast('error', 'Select at least one client and financial year'); return;
    }
    setLoading(true); setHasResults(false);
    try {
      const result = await invoke<AuditResult>('scan_audit', { rootPath: settings.root_path, entityNames: selectedEntities, financialYears: selectedFYs });
      setRawRows(result.rows); setHasResults(true);
      addToast('success', `Scanned ${result.total_folders} folders`);
    } catch (err) { addToast('error', String(err)); }
    finally { setLoading(false); }
  };

  // Pivot + filter
  const chipRows = pivotToChipGrid(rawRows);
  const displayRows = chipRows.filter((r) => {
    const rowStatus = r.total > 0 ? 'ok' : 'empty';
    if (!statusFilter.includes(rowStatus)) return false;
    // Filter by selected statement types (only real types, not synthetic "—")
    if (selectedStmts.length > 0 && selectedStmts.length < stmtTypes.length) {
      if (r.statementType !== DASH && r.statementType !== 'Unsorted' && !selectedStmts.includes(r.statementType)) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.client.toLowerCase().includes(q) && !r.statementType.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Stats from month-level chips
  const chipsFilled = displayRows.reduce((s, r) => {
    if (r.isFyLevel) return s + (r.total > 0 ? 1 : 0);
    const mks = fyMonthKeys(r.fy);
    return s + mks.filter((mk) => (r.months[mk] || 0) > 0).length;
  }, 0);
  const chipsTotal = displayRows.reduce((s, r) => r.isFyLevel ? s + 1 : s + 12, 0);
  const chipsEmpty = chipsTotal - chipsFilled;
  const statsCompletion = chipsTotal > 0 ? Math.round((chipsFilled / chipsTotal) * 1000) / 10 : 0;

  // Send with Excel attachment — both body and Excel respect current filters
  const handleSend = async () => {
    if (!settings?.smtp?.host) { addToast('error', 'Configure SMTP in Settings → Email Setup'); return; }
    const toList = toField.split(',').map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) { addToast('error', 'Enter at least one recipient'); return; }
    setSending(true);
    try {
      // Filter rawRows to match current filter selections
      const filteredRaw = rawRows.filter((r) => {
        const topType = r.statement_path.split(' \u2192 ')[0] || r.statement_path;
        if (selectedStmts.length > 0 && selectedStmts.length < stmtTypes.length && topType !== '\u2014' && topType !== 'Unsorted' && !selectedStmts.includes(topType)) return false;
        const rowStatus = r.count > 0 ? 'ok' : 'empty';
        if (!statusFilter.includes(rowStatus)) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          if (!r.client.toLowerCase().includes(q) && !r.statement_path.toLowerCase().includes(q)) return false;
        }
        return true;
      });
      const excelPath = await invoke<string>('generate_scan_excel', { rows: filteredRaw });
      const html = generateEmailHTML(displayRows, chipsFilled, chipsEmpty, chipsTotal, statsCompletion);
      const smtp: SmtpConfig = settings.smtp;
      const payload: EmailPayload = { to: toList, cc: ccField.split(',').map((s) => s.trim()).filter(Boolean), subject: subjectField, body: html, attachments: [excelPath] };
      const res = await invoke<{ success: boolean; message: string }>('send_email', { smtpConfig: smtp, email: payload });
      addToast(res.success ? 'success' : 'error', res.message);
    } catch (err) { addToast('error', `Email failed: ${String(err)}`); }
    finally { setSending(false); }
  };
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(generateEmailHTML(displayRows, chipsFilled, chipsEmpty, chipsTotal, statsCompletion)); addToast('success', 'HTML copied'); }
    catch { addToast('error', 'Copy failed'); }
  };

  const getClientGroup = (idx: number) => `${displayRows[idx]?.client}||${displayRows[idx]?.fy}`;

  /* ═══ Labels ═══ */
  const clientLabel = selectedEntities.length === entities.length && entities.length > 0 ? 'All clients' : selectedEntities.length === 0 ? 'Select' : selectedEntities.length <= 2 ? selectedEntities.join(', ') : `${selectedEntities.length} selected`;
  const fyLabel = selectedFYs.length === fyList.length && fyList.length > 0 ? 'All FYs' : selectedFYs.length === 0 ? 'Select' : selectedFYs.length <= 2 ? selectedFYs.map((f) => f.replace('FY ', '')).join(', ') : `${selectedFYs.length} selected`;
  const stmtLabel = selectedStmts.length === stmtTypes.length && stmtTypes.length > 0 ? 'All types' : selectedStmts.length === 0 ? 'None' : selectedStmts.length <= 2 ? selectedStmts.join(', ') : `${selectedStmts.length} selected`;
  const statusLabel = statusFilter.length === 2 ? 'All' : statusFilter.length === 0 ? 'None' : statusFilter.map((s) => s === 'ok' ? 'Has files' : 'Empty').join(', ');

  /* ═══ Multi-select dropdown ═══ */
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

  /* ═══ Chip renderer ═══ */
  const renderChip = (count: number, label: string, title: string) => (
    <span title={title} style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
      minWidth: 0, height: 24, borderRadius: 4, fontSize: 9, fontWeight: 600,
      background: count > 0 ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.07)',
      color: count > 0 ? '#1D9E75' : '#E25C5C',
    }}>{label} {count}</span>
  );

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">Scan & Export</div>
        <div className="page-head-subtitle">Audit folder completion and send reports</div>
      </div>

      {settings?.auto_email?.enabled && (
        <div className="card" style={{ marginBottom: 16, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => navigate('/settings?tab=scheduler')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: 4, background: '#1D9E75', animation: 'pulse 2s infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Auto email active — <span style={{ color: 'var(--brand)', fontWeight: 500 }}>{settings.auto_email.schedule === 'every_minute' ? 'Every minute' : `${settings.auto_email.schedule} at ${settings.auto_email.time}`}</span></span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 500 }}>Configure</span>
        </div>
      )}

      {/* Filters — always visible */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Filters</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Clients */}
            <div className="input-group" style={{ flex: 1, minWidth: 130, position: 'relative' }}>
              <label className="input-label">Clients</label>
              <div className="select-field" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); closeAllDD(); setClientDDOpen(!clientDDOpen); }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedEntities.length === 0 ? 'var(--ink-3)' : 'var(--ink)' }}>{clientLabel}</span>
              </div>
              <MultiDD open={clientDDOpen} allChecked={selectedEntities.length === entities.length && entities.length > 0} toggleAll={() => setSelectedEntities(selectedEntities.length === entities.length ? [] : [...entities])} allLabel="All clients" items={entities} checked={(e: string) => selectedEntities.includes(e)} toggle={(e: string) => setSelectedEntities(tog(selectedEntities, e))} />
            </div>

            {/* FY multi-select */}
            <div className="input-group" style={{ flex: 1, minWidth: 130, position: 'relative' }}>
              <label className="input-label">Financial Year</label>
              <div className="select-field" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); closeAllDD(); setFyDDOpen(!fyDDOpen); }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fyLabel}</span>
              </div>
              <MultiDD open={fyDDOpen} allChecked={selectedFYs.length === fyList.length && fyList.length > 0} toggleAll={() => setSelectedFYs(selectedFYs.length === fyList.length ? [] : [...fyList])} allLabel="All FYs" items={fyList} checked={(f: string) => selectedFYs.includes(f)} toggle={(f: string) => setSelectedFYs(tog(selectedFYs, f))} labelFn={(f: string) => f.replace('FY ', '')} />
            </div>

            {/* Statement Type — from folder structure */}
            {stmtTypes.length > 0 && (
              <div className="input-group" style={{ flex: 1, minWidth: 130, position: 'relative' }}>
                <label className="input-label">Statement Type</label>
                <div className="select-field" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); closeAllDD(); setStmtDDOpen(!stmtDDOpen); }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stmtLabel}</span>
                </div>
                <MultiDD open={stmtDDOpen} allChecked={selectedStmts.length === stmtTypes.length} toggleAll={() => setSelectedStmts(selectedStmts.length === stmtTypes.length ? [] : [...stmtTypes])} allLabel="All types" items={stmtTypes} checked={(s: string) => selectedStmts.includes(s)} toggle={(s: string) => setSelectedStmts(tog(selectedStmts, s))} />
              </div>
            )}

            {/* Status */}
            <div className="input-group" style={{ flex: 1, minWidth: 110, position: 'relative' }}>
              <label className="input-label">Status</label>
              <div className="select-field" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); closeAllDD(); setStatusDDOpen(!statusDDOpen); }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{statusLabel}</span>
              </div>
              <MultiDD open={statusDDOpen} allChecked={statusFilter.length === 2} toggleAll={() => setStatusFilter(statusFilter.length === 2 ? [] : ['empty', 'ok'])} allLabel="All" items={['empty', 'ok']} checked={(s: string) => statusFilter.includes(s)} toggle={(s: string) => setStatusFilter(tog(statusFilter, s))} labelFn={(s: string) => s === 'ok' ? 'Has files' : 'Empty'} />
            </div>

            <button className="btn btn-primary" onClick={handleScan} disabled={selectedEntities.length === 0 || selectedFYs.length === 0 || loading} style={{ minWidth: 100 }}>
              {loading ? <><span className="btn-spinner" /> Scanning</> : <><IconEye /> Scan</>}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {hasResults && (
        <div className="card">
          {/* Stats */}
          <div style={{ padding: '20px 28px' }}>
            <div className="stats-grid">
              {[
                { v: chipsTotal, l: 'Total', c: 'var(--ink)' },
                { v: chipsFilled, l: 'Filled', c: '#1D9E75' },
                { v: chipsEmpty, l: 'Empty', c: '#E25C5C' },
                { v: `${statsCompletion}%`, l: 'Completion', c: '#615FFF' },
              ].map((s) => (
                <div key={s.l} style={{ padding: '14px 18px', background: 'var(--brand-bg)', borderRadius: 'var(--r-sm)' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-3)' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-divider" />

          <div className="card-header" style={{ justifyContent: 'flex-end' }}>
            <div className="search-wrapper" style={{ width: 280 }}>
              <IconSearch />
              <input className="input-field" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Chip grid — scrollable */}
          <div className="scroll-table" style={{ maxHeight: 480, overflowY: 'auto' }}>
              {displayRows.length === 0 ? (
                <div style={{ padding: '40px 28px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>No results match the current filters</div>
              ) : (
                <table>
                  <thead><tr>
                    <th style={{ width: '12%' }}>Client</th>
                    <th style={{ width: '10%' }}>FY</th>
                    <th style={{ width: '18%' }}>Statement type</th>
                    <th style={{ textAlign: 'center', padding: '0 10px 14px' }}>Months</th>
                  </tr></thead>
                  <tbody>
                    {displayRows.map((row, idx) => {
                      const showSep = idx > 0 && getClientGroup(idx) !== getClientGroup(idx - 1);
                      const mks = fyMonthKeys(row.fy);
                      return (
                        <Fragment key={`${row.client}-${row.fy}-${row.statementType}-${row.isFyLevel}`}>
                          {showSep && <tr style={{ background: 'none' }}><td colSpan={4} style={{ padding: '6px 0', height: 'auto', borderBottom: 'none' }}><div style={{ height: 1, background: 'var(--divider)' }} /></td></tr>}
                          <tr>
                            <td style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 500 }}>{row.client}</td>
                            <td style={{ color: 'var(--ink-2)', fontSize: 12, whiteSpace: 'nowrap' }}>{row.fy}</td>
                            <td style={{ fontWeight: 500, fontSize: 12.5 }}>
                              {row.statementType === DASH ? `${DASH} (FY level)` : row.statementType}
                            </td>
                            <td style={{ padding: '0 10px' }}>
                              <div style={{ display: 'flex', gap: 3 }}>
                                {row.isFyLevel ? (
                                  <span title={`FY level — ${row.total} files`}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 36, height: 24, padding: '0 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                                      background: row.total > 0 ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.07)', color: row.total > 0 ? '#1D9E75' : '#E25C5C',
                                    }}>FY {row.total}</span>
                                ) : mks.map((mk, mi) => {
                                  const count = row.months[mk] || 0;
                                  return <Fragment key={mk}>{renderChip(count, MONTH_NAMES[mi], `${MONTH_NAMES[mi]} — ${count} files`)}</Fragment>;
                                })}
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

          {/* Email section */}
          <div className="card-divider" />
          <div className="card-header"><span className="card-title">Send report</span></div>
          <div style={{ padding: '0 20px 20px', display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group"><label className="input-label">To</label><input className="input-field" value={toField} onChange={(e) => setToField(e.target.value)} placeholder="email@company.com" /></div>
              <div className="input-group"><label className="input-label">CC</label><input className="input-field" value={ccField} onChange={(e) => setCcField(e.target.value)} placeholder="cc@company.com" /></div>
            </div>
            <div className="input-group"><label className="input-label">Subject</label><input className="input-field" value={subjectField} onChange={(e) => setSubjectField(e.target.value)} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
              <button className="btn btn-secondary" onClick={handleCopy}>Copy HTML</button>
              <button className="btn btn-primary" onClick={handleSend} disabled={sending || !toField.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {sending ? <span className="btn-spinner" style={{ width: 14, height: 14 }} /> : <IconPaperPlane style={{ width: 14, height: 14, fill: 'white' }} />}
                {sending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
