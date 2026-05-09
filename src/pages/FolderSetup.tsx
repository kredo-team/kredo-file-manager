import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../store/appStore';
import { generateFinancialYears, getCurrentFinancialYear } from '../utils/helpers';
import type { FolderResult, FolderNode, SelectedFolderNode, SelectedStatementType } from '../types';

interface UnsortedFile { name: string; path: string; }
interface MoveResult { moved: number; failed: string[]; }

/* ═══ Helpers ═══ */
function countAll(nodes: FolderNode[]): number {
  let c = 0;
  for (const n of nodes) { c++; c += countAll(n.children || []); }
  return c;
}

function extractSelected(nodes: FolderNode[]): SelectedFolderNode[] {
  return nodes.map((n) => ({ name: n.name, children: extractSelected(n.children || []) }));
}

function getKidsAtPath(nodes: FolderNode[], path: string[]): FolderNode[] {
  let current = nodes;
  for (const seg of path) {
    const found = current.find((k) => k.name === seg);
    if (!found) return [];
    current = found.children || [];
  }
  return current;
}

/* ═══ Arrow icon ═══ */
const ArrowRight = () => (
  <svg width="10" height="10" viewBox="0 0 320 512" fill="currentColor">
    <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" />
  </svg>
);

export default function FolderSetup() {
  const { settings, saveSettings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);

  const [entities, setEntities] = useState<string[]>([]);
  const [entityInput, setEntityInput] = useState('');
  const [accountInput, setAccountInput] = useState('');
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedFY, setSelectedFY] = useState(getCurrentFinancialYear());
  const [loading, setLoading] = useState(false);

  /* Statement types — two-panel state */
  const [activeTab, setActiveTab] = useState('');
  const [navPath, setNavPath] = useState<string[]>([]);
  const [newTypeName, setNewTypeName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const crumbRef = useRef<HTMLDivElement>(null);

  /* Unsorted files */
  const [unsortedFiles, setUnsortedFiles] = useState<UnsortedFile[]>([]);
  const [showUnsorted, setShowUnsorted] = useState(false);
  const [moving, setMoving] = useState(false);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [showError, setShowError] = useState(false);

  const fyList = generateFinancialYears();
  const masterTypes = settings?.statement_types || [];

  useEffect(() => {
    if (!settings?.root_path) return;
    invoke<string[]>('list_entities', { rootPath: settings.root_path }).then(setEntities).catch(() => {});
  }, [settings?.root_path]);

  // Load accounts when entity changes
  useEffect(() => {
    if (!settings?.root_path || !entityInput.trim()) { setAccounts([]); return; }
    invoke<string[]>('list_accounts', { rootPath: settings.root_path, entityNames: [entityInput.trim()] })
      .then(setAccounts).catch(() => setAccounts([]));
  }, [settings?.root_path, entityInput]);

  // Set active tab to first type if available
  useEffect(() => {
    if (masterTypes.length > 0 && !activeTab) setActiveTab(masterTypes[0].name);
  }, [masterTypes.length]);

  // Auto-scroll breadcrumb
  useEffect(() => {
    if (crumbRef.current) crumbRef.current.scrollLeft = crumbRef.current.scrollWidth;
  }, [navPath]);

  /* ═══ Type management ═══ */
  const toggleType = async (name: string) => {
    if (!settings) return;
    const updated = masterTypes.map((t) => t.name === name ? { ...t, monthly: t.monthly } : t);
    // We just use presence in selection for create - toggling is visual via checkbox
    // Actually, we track selection state directly in the master types as a convention
    // No - let's use a separate selected set
    // SIMPLIFY: we'll track which types are "selected" in local state
    setSelectedTypes((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const toggleMonthly = async (name: string) => {
    if (!settings) return;
    const updated = masterTypes.map((t) => t.name === name ? { ...t, monthly: !t.monthly } : t);
    await saveSettings({ ...settings, statement_types: updated });
  };

  const addNewType = async () => {
    const name = newTypeName.trim();
    if (!name || !settings) return;
    if (masterTypes.some((t) => t.name === name)) { addToast('error', 'Type already exists'); return; }
    const updated = [...masterTypes, { name, sub_folders: [], monthly: false }];
    await saveSettings({ ...settings, statement_types: updated });
    setActiveTab(name);
    setSelectedTypes((prev) => [...prev, name]);
    setNavPath([]);
    setNewTypeName('');
  };

  const addNewSub = async () => {
    const name = newSubName.trim();
    if (!name || !activeTab || !settings) return;
    const st = masterTypes.find((t) => t.name === activeTab);
    if (!st) return;
    const currentKids = getKidsAtPath(st.sub_folders, navPath);
    if (currentKids.some((k) => k.name === name)) { addToast('error', 'Folder already exists'); return; }

    const updateNode = (nodes: FolderNode[], path: string[], newName: string): FolderNode[] => {
      if (path.length === 0) {
        if (nodes.some((n) => n.name === newName)) return nodes;
        return [...nodes, { name: newName, children: [] }];
      }
      return nodes.map((n) => n.name === path[0] ? { ...n, children: updateNode(n.children, path.slice(1), newName) } : n);
    };
    const updatedMaster = masterTypes.map((t) =>
      t.name === activeTab ? { ...t, sub_folders: updateNode(t.sub_folders, navPath, name) } : t
    );
    await saveSettings({ ...settings, statement_types: updatedMaster });
    setNewSubName('');
  };

  const removeSub = async (folderName: string) => {
    if (!activeTab || !settings) return;
    const removeNode = (nodes: FolderNode[], path: string[], target: string): FolderNode[] => {
      if (path.length === 0) return nodes.filter((n) => n.name !== target);
      return nodes.map((n) => n.name === path[0] ? { ...n, children: removeNode(n.children, path.slice(1), target) } : n);
    };
    const updatedMaster = masterTypes.map((t) =>
      t.name === activeTab ? { ...t, sub_folders: removeNode(t.sub_folders, navPath, folderName) } : t
    );
    await saveSettings({ ...settings, statement_types: updatedMaster });
  };

  /* ═══ Create folders ═══ */
  const handleCreate = async () => {
    const name = entityInput.trim();
    const account = accountInput.trim();
    if (!name || !account || !selectedFY || !settings?.root_path) {
      addToast('error', 'Enter client name, account name, select FY, and set root folder');
      return;
    }
    setLoading(true);
    try {
      const stmtPayload: SelectedStatementType[] = masterTypes
        .filter((t) => selectedTypes.includes(t.name))
        .map((t) => ({ name: t.name, monthly: t.monthly, folders: extractSelected(t.sub_folders) }));

      const res = await invoke<FolderResult>('create_folders', {
        rootPath: settings.root_path, entityName: name, accountName: account,
        financialYear: selectedFY, statementTypes: stmtPayload,
      });
      if (res.created.length > 0) addToast('success', `Created ${res.created.length} folder${res.created.length > 1 ? 's' : ''}`);
      else addToast('success', 'All folders already exist');
      const updated = await invoke<string[]>('list_entities', { rootPath: settings.root_path });
      setEntities(updated);

      // Check for unsorted files
      const unsorted = await invoke<UnsortedFile[]>('list_unsorted_files', {
        rootPath: settings.root_path, entityName: name, accountName: account, financialYear: selectedFY,
      });
      if (unsorted.length > 0) { setUnsortedFiles(unsorted); setShowUnsorted(true); }
    } catch (err) { addToast('error', String(err)); }
    finally { setLoading(false); }
  };

  const handleMove = async () => {
    if (!settings?.root_path) return;
    setMoving(true);
    try {
      const result = await invoke<MoveResult>('move_unsorted_files', {
        rootPath: settings.root_path, entityName: entityInput.trim(), accountName: accountInput.trim(), financialYear: selectedFY,
      });
      setShowUnsorted(false);
      if (result.failed.length > 0) {
        setFailedFiles(result.failed); setTotalAttempted(unsortedFiles.length); setShowError(true);
        if (result.moved > 0) addToast('success', `Moved ${result.moved} files`);
      } else { addToast('success', `Moved ${result.moved} files to _Unsorted`); }
    } catch (err) { addToast('error', String(err)); setShowUnsorted(false); }
    finally { setMoving(false); }
  };

  /* ═══ Template / Import / Export ═══ */
  const handleTemplate = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const defaultName = `Kredo_${entityInput.trim() || 'Template'}_${selectedFY.replace(/\s/g, '')}.xlsx`;
      const path = await save({ defaultPath: defaultName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!path) return;
      await invoke('generate_template', { savePath: path, clientName: entityInput.trim(), financialYear: selectedFY, structure: 'month_wise' });
      addToast('success', 'Template saved');
      try { const { open } = await import('@tauri-apps/plugin-shell'); await open(path); } catch {}
    } catch (err) { addToast('error', `Template failed: ${err}`); }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx,.xls';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const tempPath = await invoke<string>('save_temp_file', { fileName: file.name, data: Array.from(bytes) });
        const result = await invoke<{ client_name: string; financial_year: string; structure: string; statement_types: any[]; warnings: string[] }>('parse_import', { filePath: tempPath });
        if (!settings) return;
        if (result.client_name) setEntityInput(result.client_name);
        if (result.financial_year) setSelectedFY(result.financial_year);
        if (result.statement_types.length > 0) {
          const withMonthly = result.statement_types.map((t: any) => ({ ...t, monthly: t.monthly ?? false }));
          await saveSettings({ ...settings, statement_types: withMonthly });
          setSelectedTypes(withMonthly.map((t: any) => t.name));
        }
        for (const w of result.warnings) addToast('error', w);
        addToast('success', `Imported ${result.statement_types.length} type${result.statement_types.length !== 1 ? 's' : ''}`);
      } catch (err) { addToast('error', String(err)); }
    };
    input.click();
  };

  const handleExport = async () => {
    if (masterTypes.length === 0) { addToast('error', 'Nothing to export'); return; }
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const defaultName = `Kredo_${entityInput.trim() || 'Config'}_${selectedFY.replace(/\s/g, '')}.xlsx`;
      const path = await save({ defaultPath: defaultName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!path) return;
      await invoke('export_config', { savePath: path, clientName: entityInput.trim(), financialYear: selectedFY, structure: 'month_wise', statementTypes: masterTypes });
      addToast('success', 'Configuration exported');
      try { const { open } = await import('@tauri-apps/plugin-shell'); await open(path); } catch {}
    } catch (err) { addToast('error', `Export failed: ${err}`); }
  };

  const rootSet = !!settings?.root_path;
  const VISIBLE_COUNT = 6;

  /* Current panel data */
  const activeST = masterTypes.find((t) => t.name === activeTab);
  const currentKids = activeST ? getKidsAtPath(activeST.sub_folders, navPath) : [];
  const selectedCount = selectedTypes.length;

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">Create Folders</div>
        <div className="page-head-subtitle">Configure statement types and folder structures</div>
      </div>

      {!rootSet && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 28px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13.5, fontWeight: 500 }}>
          Please set a root folder in Settings before creating folders.
        </div>
      )}

      <div className="card">
        {/* Header */}
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Configure statement types</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>Select types and manage sub-folders</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: 'Template', handler: handleTemplate },
              { label: 'Import', handler: handleImport },
              { label: 'Export', handler: handleExport },
            ].map((a) => (
              <button key={a.label} onClick={a.handler}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font)', cursor: 'pointer', transition: 'background 0.12s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--input-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card-divider" />

        {/* Top fields: Client + Account + FY */}
        <div style={{ padding: '16px 28px', display: 'flex', gap: 12, borderBottom: '1px solid var(--divider)' }}>
          <div className="input-group" style={{ flex: 1 }}>
            <label className="input-label">Client</label>
            <input className="input-field" placeholder="Type or select client..." value={entityInput}
              onChange={(e) => setEntityInput(e.target.value)} list="entity-suggestions" />
            <datalist id="entity-suggestions">{entities.map((e) => <option key={e} value={e} />)}</datalist>
          </div>
          <div className="input-group" style={{ flex: 1 }}>
            <label className="input-label">Account</label>
            <input className="input-field" placeholder="Account name..." value={accountInput}
              onChange={(e) => setAccountInput(e.target.value)} list="account-suggestions" />
            <datalist id="account-suggestions">{accounts.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
          <div className="input-group" style={{ flex: 1 }}>
            <label className="input-label">Financial Year</label>
            <select className="select-field" value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
              {fyList.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          </div>
        </div>

        {/* Two-panel configurator */}
        <div style={{ display: 'flex', minHeight: 320 }}>
          {/* Left: Statement types */}
          <div style={{ width: 250, borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 42, padding: '0 16px', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--ink-3)', background: 'var(--input-bg)', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center' }}>
              Statement types
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 240 }}>
              {masterTypes.map((t) => {
                const isActive = activeTab === t.name;
                const isSel = selectedTypes.includes(t.name);
                const total = countAll(t.sub_folders || []);
                return (
                  <div key={t.name} onClick={() => { setActiveTab(t.name); setNavPath([]); }}
                    style={{ display: 'flex', alignItems: 'center', padding: '0 14px', height: 44, gap: 8, cursor: 'pointer', borderBottom: '1px solid var(--divider)', transition: 'background 0.1s', background: isActive ? 'rgba(97,95,255,0.05)' : 'transparent' }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--input-bg)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'rgba(97,95,255,0.05)' : 'transparent'; }}>
                    <div onClick={(e) => { e.stopPropagation(); toggleType(t.name); }}
                      style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${isSel ? '#615FFF' : 'var(--ink-4)'}`, background: isSel ? '#615FFF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}>
                      {isSel && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: isActive ? '#615FFF' : 'var(--ink)', fontWeight: isActive ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    {total > 0 && <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 10, background: 'rgba(97,95,255,0.08)', color: '#615FFF', flexShrink: 0 }}>{total}</span>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <span style={{ fontSize: 9, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.3px', fontWeight: 500 }}>M</span>
                      <div onClick={() => toggleMonthly(t.name)}
                        style={{ width: 26, height: 14, borderRadius: 7, background: t.monthly ? '#615FFF' : 'var(--ink-4)', cursor: 'pointer', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', width: 10, height: 10, borderRadius: '50%', background: 'white', top: 2, left: t.monthly ? 14 : 2, transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '6px 14px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input className="input-field" style={{ height: 34, fontSize: 12.5, fontWeight: 500 }} placeholder="Add new type..." value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNewType()} />
              <button onClick={addNewType}
                style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 'var(--r-sm)', background: '#615FFF', color: 'white', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'background 0.12s', flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#4A48DB'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#615FFF'; }}>
                Add
              </button>
            </div>
          </div>

          {/* Right: Sub-folders with breadcrumb */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Breadcrumb */}
            <div ref={crumbRef} style={{ height: 42, padding: '0 16px', background: 'var(--input-bg)', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 5, overflowX: 'auto', scrollbarWidth: 'thin' }}>
              {activeTab ? (
                <>
                  <span onClick={() => setNavPath([])}
                    style={{ fontSize: 12, fontWeight: navPath.length === 0 ? 600 : 500, color: navPath.length === 0 ? 'var(--ink)' : '#615FFF', cursor: navPath.length > 0 ? 'pointer' : 'default', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {activeTab}
                  </span>
                  {navPath.map((seg, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: 'var(--ink-3)', margin: '0 2px' }}>/</span>
                      <span onClick={() => { if (i < navPath.length - 1) setNavPath(navPath.slice(0, i + 1)); }}
                        style={{ fontSize: 12, fontWeight: i === navPath.length - 1 ? 600 : 500, color: i === navPath.length - 1 ? 'var(--ink)' : '#615FFF', cursor: i < navPath.length - 1 ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                        {seg}
                      </span>
                    </span>
                  ))}
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Select a statement type</span>
              )}
            </div>

            {/* Folder list */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 240 }}>
              {!activeTab ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)', fontSize: 12, padding: 20, textAlign: 'center', lineHeight: 1.6 }}>
                  Select a statement type to manage its sub-folders
                </div>
              ) : currentKids.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)', fontSize: 12, padding: 20, textAlign: 'center', lineHeight: 1.6 }}>
                  {navPath.length === 0
                    ? `No sub-folders yet.\nFiles will go directly under ${activeST?.monthly ? 'each month folder' : 'this type'}.`
                    : 'Empty. Add sub-folders below.'}
                </div>
              ) : (
                currentKids.map((f) => {
                  const sc = countAll(f.children || []);
                  return (
                    <div key={f.name} style={{ display: 'flex', alignItems: 'center', padding: '0 14px', height: 44, gap: 8, borderBottom: '1px solid var(--divider)', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--input-bg)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{f.name}</div>
                      {sc > 0 && <span style={{ fontSize: 10, color: 'var(--ink-3)', flexShrink: 0 }}>{sc} sub{sc > 1 ? 's' : ''}</span>}
                      <button onClick={() => setNavPath([...navPath, f.name])}
                        style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', border: '1px solid var(--divider)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, transition: 'all 0.1s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(97,95,255,0.06)'; e.currentTarget.style.color = '#615FFF'; e.currentTarget.style.borderColor = '#615FFF'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-2)'; e.currentTarget.style.borderColor = 'var(--divider)'; }}>
                        <ArrowRight />
                      </button>
                      <button onClick={() => removeSub(f.name)}
                        style={{ width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.1s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(232,54,79,0.08)'; e.currentTarget.style.color = '#E25C5C'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)'; }}>
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add folder */}
            {activeTab && (
              <div style={{ padding: '6px 14px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input className="input-field" style={{ height: 34, fontSize: 12.5, fontWeight: 500 }} placeholder="Add folder..." value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNewSub()} />
                <button onClick={addNewSub}
                  style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 'var(--r-sm)', background: '#615FFF', color: 'white', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'background 0.12s', flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#4A48DB'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#615FFF'; }}>
                  Add
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ height: 48, padding: '0 20px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)' }}>
            <b style={{ color: '#615FFF', fontWeight: 500 }}>{selectedCount}</b> type{selectedCount !== 1 ? 's' : ''} selected
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink-4)', flexShrink: 0 }} />
            <span>Toggle</span>
            <b style={{ color: '#615FFF', fontWeight: 500 }}>M</b>
            <span>to create monthly folders</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={!rootSet || !entityInput.trim() || !accountInput.trim() || loading}
              style={{ height: 34, padding: '0 20px', borderRadius: 'var(--r-sm)', background: '#615FFF', border: 'none', color: 'white', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.12s', opacity: (!rootSet || !entityInput.trim() || !accountInput.trim() || loading) ? 0.5 : 1 }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#4A48DB'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#615FFF'; }}
              onMouseDown={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}>
              {loading ? 'Creating...' : 'Create Folders'}
            </button>
          </div>
        </div>
      </div>

      {/* Unsorted Files Dialog */}
      {showUnsorted && (
        <div className="dialog-overlay" onClick={() => setShowUnsorted(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="dialog-title" style={{ textAlign: 'left' }}>{unsortedFiles.length} unsorted file{unsortedFiles.length > 1 ? 's' : ''} found</div>
            <div style={{ marginTop: 16, marginBottom: unsortedFiles.length > VISIBLE_COUNT ? 4 : 20, borderTop: '1px solid var(--divider)', maxHeight: 180, overflowY: 'auto' }}>
              {unsortedFiles.slice(0, unsortedFiles.length > VISIBLE_COUNT ? VISIBLE_COUNT : unsortedFiles.length).map((f) => (
                <div key={f.name} style={{ padding: '9px 4px', borderBottom: '1px solid var(--divider)', fontSize: 12.5, fontFamily: 'monospace', color: 'var(--ink-2)' }}>{f.name}</div>
              ))}
            </div>
            {unsortedFiles.length > VISIBLE_COUNT && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20, paddingLeft: 4 }}>+{unsortedFiles.length - VISIBLE_COUNT} more files</div>
            )}
            <div className="dialog-buttons">
              <button className="btn btn-secondary" onClick={() => setShowUnsorted(false)}>Leave</button>
              <button className="btn btn-primary" onClick={handleMove} disabled={moving}>{moving ? 'Moving...' : 'Move all'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Error */}
      {showError && (
        <div className="dialog-overlay" onClick={() => setShowError(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 16 }}>⚠</div>
            <div className="dialog-title">{failedFiles.length} of {totalAttempted} couldn't be moved</div>
            <div style={{ textAlign: 'left', marginTop: 16, borderTop: '1px solid var(--divider)', marginBottom: failedFiles.length > 3 ? 4 : 20 }}>
              {failedFiles.slice(0, 3).map((f, i) => (
                <div key={f} style={{ padding: '9px 4px', borderBottom: i < Math.min(failedFiles.length, 3) - 1 ? '1px solid var(--divider)' : 'none', fontSize: 12.5, fontFamily: 'monospace', color: 'var(--ink-2)' }}>{f}</div>
              ))}
            </div>
            {failedFiles.length > 3 && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20, textAlign: 'left', paddingLeft: 4 }}>+{failedFiles.length - 3} more failed</div>
            )}
            <div className="dialog-buttons"><button className="btn btn-secondary" onClick={() => setShowError(false)}>Dismiss</button></div>
          </div>
        </div>
      )}
    </>
  );
}
