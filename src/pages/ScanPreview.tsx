import { useState, useEffect, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../store/appStore';
import { IconEye, IconSearch } from '../components/Icons';

interface AuditRow {
  client: string;
  month: string;
  statement_path: string;
  status: string;
  count: number;
}
interface AuditResult {
  rows: AuditRow[];
  total_folders: number;
  filled: number;
  empty: number;
  completion: number;
}
interface ChipRow {
  client: string;
  fy: string;
  statementType: string;
  isFyLevel: boolean;
  months: Record<string, number>;
  total: number;
}

const MONTH_NAMES = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const DASH = '\u2014';

function shortMonth(m: string): string {
  const parts = m.trim().split(/\s+/);
  if (parts.length >= 3) {
    const yr = parts[2].length === 4 ? parts[2].slice(2) : parts[2];
    return `${parts[1]} ${yr}`;
  }
  return m;
}

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
  result.sort((a, b) => {
    const c = a.client.localeCompare(b.client);
    if (c !== 0) return c;
    if (a.isFyLevel !== b.isFyLevel) return a.isFyLevel ? 1 : -1;
    return a.statementType.localeCompare(b.statementType);
  });
  return result;
}

export default function ScanPreview() {
  const { settings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);

  const [entities, setEntities] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [fyList, setFyList] = useState<string[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [loading, setLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string[]>(['empty', 'ok']);
  const [search, setSearch] = useState('');

  // Dropdowns
  const [clientDDOpen, setClientDDOpen] = useState(false);
  const [statusDDOpen, setStatusDDOpen] = useState(false);

  // Results
  const [rawRows, setRawRows] = useState<AuditRow[]>([]);
  const [hasResults, setHasResults] = useState(false);

  // Load entities
  useEffect(() => {
    if (!settings?.root_path) return;
    invoke<string[]>('list_entities', { rootPath: settings.root_path }).then((list) => {
      setEntities(list);
      setSelectedEntities(list);
    }).catch(() => {});
  }, [settings?.root_path]);

  // Dynamic FY
  useEffect(() => {
    if (!settings?.root_path || selectedEntities.length === 0) { setFyList([]); return; }
    invoke<string[]>('list_all_financial_years', {
      rootPath: settings.root_path,
      entityNames: selectedEntities,
    }).then((fys) => {
      setFyList(fys);
      if (fys.length > 0 && !fys.includes(selectedFY)) setSelectedFY(fys[fys.length - 1]);
    }).catch(() => {});
  }, [settings?.root_path, selectedEntities]);

  // Close dropdowns
  useEffect(() => {
    if (!clientDDOpen && !statusDDOpen) return;
    const handler = () => { setClientDDOpen(false); setStatusDDOpen(false); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [clientDDOpen, statusDDOpen]);

  const toggleEntity = (n: string) => setSelectedEntities((p) => p.includes(n) ? p.filter((e) => e !== n) : [...p, n]);
  const toggleAllEntities = () => setSelectedEntities(selectedEntities.length === entities.length ? [] : [...entities]);
  const allEntitiesSelected = selectedEntities.length === entities.length;

  const toggleStatus = (v: string) => setStatusFilter((p) => p.includes(v) ? p.filter((s) => s !== v) : [...p, v]);
  const allStatusSelected = statusFilter.length === 2;
  const toggleAllStatus = () => setStatusFilter(allStatusSelected ? [] : ['empty', 'ok']);

  // Labels
  const clientLabel = allEntitiesSelected ? 'All clients' : selectedEntities.length === 0 ? 'Select' : selectedEntities.length <= 2 ? selectedEntities.join(', ') : `${selectedEntities.length} selected`;
  const statusLabel = allStatusSelected ? 'All' : statusFilter.length === 0 ? 'None' : statusFilter.map((s) => s === 'ok' ? 'Has files' : 'Empty').join(', ');

  // Scan
  const handleScan = async () => {
    if (selectedEntities.length === 0 || !selectedFY || !settings?.root_path) {
      addToast('error', 'Select at least one client and a financial year'); return;
    }
    setLoading(true); setHasResults(false);
    try {
      const result = await invoke<AuditResult>('scan_audit', {
        rootPath: settings.root_path,
        entityNames: selectedEntities,
        financialYear: selectedFY,
      });
      setRawRows(result.rows);
      setHasResults(true);
      addToast('success', `Scanned ${result.total_folders} folders — ${result.completion}% complete`);
    } catch (err) { addToast('error', String(err)); }
    finally { setLoading(false); }
  };

  // Pivot + filter
  const chipRows = pivotToChipGrid(rawRows, selectedFY);
  const monthKeys = fyMonthKeys(selectedFY);

  const displayRows = chipRows.filter((r) => {
    const rowStatus = r.total > 0 ? 'ok' : 'empty';
    if (!statusFilter.includes(rowStatus)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.client.toLowerCase().includes(q) && !r.statementType.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const statsTotal = displayRows.length;
  const statsFilled = displayRows.filter((r) => r.total > 0).length;
  const statsEmpty = statsTotal - statsFilled;
  const chipsFilled = displayRows.reduce((s, r) => {
    if (r.isFyLevel) return s + (r.total > 0 ? 1 : 0);
    return s + monthKeys.filter((mk) => (r.months[mk] || 0) > 0).length;
  }, 0);
  const chipsTotal = displayRows.reduce((s, r) => r.isFyLevel ? s + 1 : s + 12, 0);
  const statsCompletion = chipsTotal > 0 ? Math.round((chipsFilled / chipsTotal) * 1000) / 10 : 0;

  /* ═══ Multi-select dropdown helper ═══ */
  const MultiDD = ({ open, allChecked, toggleAll, allLabel, items, checked, toggle, labelFn }: {
    open: boolean; allChecked: boolean; toggleAll: () => void; allLabel: string;
    items: string[]; checked: (v: string) => boolean; toggle: (v: string) => void; labelFn?: (v: string) => string;
  }) => (
    open ? (
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
        background: 'var(--card-solid)', borderRadius: 'var(--r-sm)',
        border: '1px solid var(--input-border)', boxShadow: 'var(--shadow-float)',
        zIndex: 50, maxHeight: 240, overflowY: 'auto',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink)', borderBottom: '1px solid var(--divider)' }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ accentColor: '#615FFF', width: 15, height: 15 }} />
          {allLabel}
        </label>
        {items.map((item) => (
          <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', borderBottom: '1px solid var(--divider)' }}>
            <input type="checkbox" checked={checked(item)} onChange={() => toggle(item)} style={{ accentColor: '#615FFF', width: 15, height: 15 }} />
            {labelFn ? labelFn(item) : item}
          </label>
        ))}
      </div>
    ) : null
  );

  const getClientGroup = (idx: number) => displayRows[idx]?.client;

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">Scan & Preview</div>
        <div className="page-head-subtitle">Audit folder completion across clients and financial years</div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Filters</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Client */}
            <div className="input-group" style={{ flex: 1, minWidth: 130, position: 'relative' }}>
              <label className="input-label">Clients</label>
              <div className="select-field" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={(e) => { e.stopPropagation(); setClientDDOpen(!clientDDOpen); setStatusDDOpen(false); }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedEntities.length === 0 ? 'var(--ink-3)' : 'var(--ink)' }}>{clientLabel}</span>
              </div>
              <MultiDD open={clientDDOpen} allChecked={allEntitiesSelected} toggleAll={toggleAllEntities} allLabel="All clients"
                items={entities} checked={(e) => selectedEntities.includes(e)} toggle={toggleEntity} />
            </div>

            {/* FY */}
            <div className="input-group" style={{ flex: 1, minWidth: 120 }}>
              <label className="input-label">Financial Year</label>
              <select className="select-field" value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
                {fyList.length === 0 && <option value="">No FY found</option>}
                {fyList.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
              </select>
            </div>

            {/* Status */}
            <div className="input-group" style={{ flex: 1, minWidth: 110, position: 'relative' }}>
              <label className="input-label">Status</label>
              <div className="select-field" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={(e) => { e.stopPropagation(); setStatusDDOpen(!statusDDOpen); setClientDDOpen(false); }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{statusLabel}</span>
              </div>
              <MultiDD open={statusDDOpen} allChecked={allStatusSelected} toggleAll={toggleAllStatus} allLabel="All"
                items={['empty', 'ok']} checked={(s) => statusFilter.includes(s)} toggle={toggleStatus} labelFn={(s) => s === 'ok' ? 'Has files' : 'Empty'} />
            </div>

            <button className="btn btn-primary" onClick={handleScan} disabled={selectedEntities.length === 0 || !selectedFY || loading} style={{ minWidth: 100 }}>
              {loading ? <><span className="btn-spinner" /> Scanning</> : <><IconEye /> Scan</>}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {hasResults && (
        <div className="card">
          {/* Stats — identical to premium */}
          <div style={{ padding: '20px 28px' }}>
            <div className="stats-grid">
              {[
                { v: statsTotal, l: 'Total', c: 'var(--ink)' },
                { v: statsFilled, l: 'Filled', c: '#1D9E75' },
                { v: statsEmpty, l: 'Empty', c: '#E25C5C' },
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

          <div className="scroll-table">
            {displayRows.length === 0 ? (
              <div style={{ padding: '40px 28px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>No results match the current filters</div>
            ) : (
              <table>
                <thead><tr>
                  <th style={{ width: '12%' }}>Client</th>
                  <th style={{ width: '10%' }}>FY</th>
                  <th style={{ width: '18%' }}>Statement type</th>
                  <th style={{ textAlign: 'center', padding: '0 10px 14px' }}>Months</th>
                  <th style={{ width: '8%', textAlign: 'right' }}>Count</th>
                </tr></thead>
                <tbody>
                  {displayRows.map((row, idx) => {
                    const showSep = idx > 0 && getClientGroup(idx) !== getClientGroup(idx - 1);
                    return (
                      <Fragment key={`${row.client}-${row.statementType}-${row.isFyLevel}`}>
                        {showSep && <tr style={{ background: 'none' }}><td colSpan={5} style={{ padding: '6px 0', height: 'auto', borderBottom: 'none' }}><div style={{ height: 1, background: 'var(--divider)' }} /></td></tr>}
                        <tr>
                          <td style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 500 }}>{row.client}</td>
                          <td style={{ color: 'var(--ink-2)', fontSize: 12, whiteSpace: 'nowrap' }}>{row.fy}</td>
                          <td style={{ fontWeight: 500, fontSize: 12.5 }}>
                            {row.statementType === DASH ? `${DASH} (FY level)` : row.statementType}
                          </td>
                          <td style={{ padding: '0 10px' }}>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {row.isFyLevel ? (
                                <span title={`FY level — ${row.total} file${row.total !== 1 ? 's' : ''}`}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, height: 24, padding: '0 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                    background: row.total > 0 ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.07)',
                                    color: row.total > 0 ? '#1D9E75' : '#E25C5C',
                                  }}>FY</span>
                              ) : (
                                monthKeys.map((mk, mi) => {
                                  const count = row.months[mk] || 0;
                                  return (
                                    <span key={mk} title={`${MONTH_NAMES[mi]} — ${count} file${count !== 1 ? 's' : ''}`}
                                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, height: 24, borderRadius: 4, fontSize: 10, fontWeight: 600,
                                        background: count > 0 ? 'rgba(29,158,117,0.1)' : 'rgba(226,92,92,0.07)',
                                        color: count > 0 ? '#1D9E75' : '#E25C5C',
                                      }}>{MONTH_NAMES[mi]}</span>
                                  );
                                })
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: row.total > 0 ? 'var(--ink)' : '#E25C5C', fontSize: 12.5 }}>
                            {row.total}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
