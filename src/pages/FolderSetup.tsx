import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../store/appStore';
import { generateFinancialYears, getCurrentFinancialYear } from '../utils/helpers';
import { IconFolderPlus } from '../components/Icons';
import type { FolderResult, FolderMode, FolderNode, SelectedFolderNode, SelectedStatementType } from '../types';

interface UnsortedFile { name: string; path: string; }
interface MoveResult { moved: number; failed: string[]; }

/* ═══ Working tree types for the popup ═══ */
interface WNode { name: string; sel: boolean; children: WNode[]; }
interface WType { selected: boolean; typeOnly: boolean; kids: WNode[]; }

/* ═══ Helpers ═══ */
function countAll(nodes: WNode[] | FolderNode[]): number {
  let c = 0;
  for (const n of nodes) { c++; c += countAll((n as any).children || (n as any).kids || []); }
  return c;
}

function cloneTree(nodes: FolderNode[]): WNode[] {
  return nodes.map((n) => ({ name: n.name, sel: false, children: cloneTree(n.children || []) }));
}

function getKidsAtPath(kids: WNode[], path: string[]): WNode[] {
  let current = kids;
  for (const seg of path) {
    const found = current.find((k) => k.name === seg);
    if (!found) return [];
    current = found.children;
  }
  return current;
}

function extractSelected(nodes: WNode[]): SelectedFolderNode[] {
  const result: SelectedFolderNode[] = [];
  for (const n of nodes) {
    if (n.sel) {
      result.push({ name: n.name, children: extractSelected(n.children) });
    } else {
      const childSel = extractSelected(n.children);
      if (childSel.length > 0) {
        result.push({ name: n.name, children: childSel });
      }
    }
  }
  return result;
}

function restoreSelections(wNodes: WNode[], selected: SelectedFolderNode[]) {
  for (const sel of selected) {
    const wn = wNodes.find((w) => w.name === sel.name);
    if (wn) {
      wn.sel = true;
      if (sel.children.length > 0) restoreSelections(wn.children, sel.children);
    }
  }
}

/* ═══ Summarize tree into readable lines ═══ */
function getLeafPaths(nodes: SelectedFolderNode[], trail: string[] = []): string[][] {
  const result: string[][] = [];
  const leaves: string[] = [];
  const branches: SelectedFolderNode[] = [];
  for (const n of nodes) {
    if (n.children.length === 0) leaves.push(n.name);
    else branches.push(n);
  }
  if (leaves.length > 0) result.push([...trail, leaves.join(', ')]);
  for (const b of branches) {
    const childPaths = getLeafPaths(b.children, [...trail, b.name]);
    result.push(...childPaths);
  }
  if (leaves.length === 0 && branches.length === 0 && trail.length > 0) {
    result.push(trail);
  }
  return result;
}

function summarizeType(st: SelectedStatementType): string[] {
  if (st.type_only || st.folders.length === 0) return [st.name];
  const paths = getLeafPaths(st.folders);
  return paths.map((p) => st.name + ' → ' + p.join(' → '));
}

/* ═══ Arrow icon SVG ═══ */
const ArrowRight = () => (
  <svg width="12" height="12" viewBox="0 0 320 512" fill="currentColor">
    <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" />
  </svg>
);

export default function FolderSetup() {
  const { settings, saveSettings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);

  const [entities, setEntities] = useState<string[]>([]);
  const [entityInput, setEntityInput] = useState('');
  const [selectedFY, setSelectedFY] = useState(getCurrentFinancialYear());
  const [mode, setMode] = useState<FolderMode>('month_wise');
  const [loading, setLoading] = useState(false);

  /* Statement type popup state */
  const [showPopup, setShowPopup] = useState(false);
  const [workingTypes, setWorkingTypes] = useState<Record<string, WType>>({});
  const [activeTab, setActiveTab] = useState('');
  const [navPath, setNavPath] = useState<string[]>([]);
  const [newTypeName, setNewTypeName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const crumbRef = useRef<HTMLDivElement>(null);

  /* Applied selections */
  const [appliedSelections, setAppliedSelections] = useState<SelectedStatementType[]>([]);

  /* Unsorted files */
  const [unsortedFiles, setUnsortedFiles] = useState<UnsortedFile[]>([]);
  const [showUnsorted, setShowUnsorted] = useState(false);
  const [moving, setMoving] = useState(false);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [showError, setShowError] = useState(false);

  const fyList = generateFinancialYears(10);
  const masterTypes = settings?.statement_types || [];

  useEffect(() => {
    if (!settings?.root_path) return;
    invoke<string[]>('list_entities', { rootPath: settings.root_path }).then(setEntities).catch(() => {});
  }, [settings?.root_path]);

  /* Auto-scroll breadcrumb to end */
  useEffect(() => {
    if (crumbRef.current) crumbRef.current.scrollLeft = crumbRef.current.scrollWidth;
  }, [navPath]);

  /* ═══ Popup logic ═══ */
  const openPopup = () => {
    const wt: Record<string, WType> = {};
    masterTypes.forEach((t) => {
      const kids = cloneTree(t.sub_folders || []);
      const applied = appliedSelections.find((a) => a.name === t.name);
      wt[t.name] = {
        selected: !!applied,
        typeOnly: applied?.type_only || false,
        kids,
      };
      if (applied && applied.folders.length > 0) restoreSelections(kids, applied.folders);
    });
    setWorkingTypes(wt);
    setActiveTab(masterTypes.length > 0 ? masterTypes[0].name : '');
    setNavPath([]);
    setShowPopup(true);
  };

  const addNewType = async () => {
    const name = newTypeName.trim();
    if (!name || !settings) return;
    if (masterTypes.some((t) => t.name === name)) { addToast('error', 'Type already exists'); return; }
    const updated = [...masterTypes, { name, sub_folders: [] }];
    await saveSettings({ ...settings, statement_types: updated });
    setWorkingTypes((prev) => ({ ...prev, [name]: { selected: false, typeOnly: false, kids: [] } }));
    setActiveTab(name);
    setNavPath([]);
    setNewTypeName('');
  };

  const addNewSub = async () => {
    const name = newSubName.trim();
    if (!name || !activeTab || !settings) return;
    const currentKids = getKidsAtPath(workingTypes[activeTab]?.kids || [], navPath);
    if (currentKids.some((k) => k.name === name)) { addToast('error', 'Folder already exists'); return; }

    // Update master (persisted)
    const updateMasterNode = (nodes: FolderNode[], path: string[], newName: string): FolderNode[] => {
      if (path.length === 0) {
        if (nodes.some((n) => n.name === newName)) return nodes;
        return [...nodes, { name: newName, children: [] }];
      }
      return nodes.map((n) => n.name === path[0] ? { ...n, children: updateMasterNode(n.children, path.slice(1), newName) } : n);
    };
    const updatedMaster = masterTypes.map((t) =>
      t.name === activeTab ? { ...t, sub_folders: updateMasterNode(t.sub_folders, navPath, name) } : t
    );
    await saveSettings({ ...settings, statement_types: updatedMaster });

    // Update working tree
    const wt = workingTypes[activeTab];
    if (wt) {
      currentKids.push({ name, sel: wt.selected && !wt.typeOnly, children: [] });
      setWorkingTypes({ ...workingTypes });
    }
    setNewSubName('');
  };

  const removeSub = async (folderName: string) => {
    if (!activeTab || !settings) return;
    const currentKids = getKidsAtPath(workingTypes[activeTab]?.kids || [], navPath);
    const idx = currentKids.findIndex((k) => k.name === folderName);
    if (idx >= 0) currentKids.splice(idx, 1);

    // Update master
    const removeMasterNode = (nodes: FolderNode[], path: string[], targetName: string): FolderNode[] => {
      if (path.length === 0) return nodes.filter((n) => n.name !== targetName);
      return nodes.map((n) => n.name === path[0] ? { ...n, children: removeMasterNode(n.children, path.slice(1), targetName) } : n);
    };
    const updatedMaster = masterTypes.map((t) =>
      t.name === activeTab ? { ...t, sub_folders: removeMasterNode(t.sub_folders, navPath, folderName) } : t
    );
    await saveSettings({ ...settings, statement_types: updatedMaster });
    setWorkingTypes({ ...workingTypes });
  };

  const toggleType = (name: string) => {
    const wt = workingTypes[name];
    if (!wt) return;
    setWorkingTypes({ ...workingTypes, [name]: { ...wt, selected: !wt.selected, typeOnly: !wt.selected ? wt.typeOnly : false } });
  };

  const toggleTypeOnly = () => {
    const wt = workingTypes[activeTab];
    if (!wt) return;
    setWorkingTypes({ ...workingTypes, [activeTab]: { ...wt, typeOnly: !wt.typeOnly } });
  };

  const toggleSub = (folderName: string) => {
    const currentKids = getKidsAtPath(workingTypes[activeTab]?.kids || [], navPath);
    const node = currentKids.find((k) => k.name === folderName);
    if (node) node.sel = !node.sel;
    setWorkingTypes({ ...workingTypes });
  };

  const applySelections = () => {
    const result: SelectedStatementType[] = [];
    Object.entries(workingTypes).forEach(([name, wt]) => {
      if (wt.selected) {
        result.push({ name, type_only: wt.typeOnly, folders: wt.typeOnly ? [] : extractSelected(wt.kids) });
      }
    });
    setAppliedSelections(result);
    setShowPopup(false);
  };

  /* ═══ Create folders ═══ */
  const handleCreate = async () => {
    const name = entityInput.trim();
    if (!name || !selectedFY || !settings?.root_path) { addToast('error', 'Enter client name, select FY, and set root folder'); return; }
    setLoading(true);
    try {
      const res = await invoke<FolderResult>('create_folders', {
        rootPath: settings.root_path, entityName: name, financialYear: selectedFY,
        monthWise: mode === 'month_wise', statementTypes: appliedSelections,
      });
      if (res.created.length > 0) addToast('success', `Created ${res.created.length} folder${res.created.length > 1 ? 's' : ''}`);
      else addToast('success', 'All folders already exist');
      const updated = await invoke<string[]>('list_entities', { rootPath: settings.root_path });
      setEntities(updated);
      if (mode === 'month_wise') {
        const unsorted = await invoke<UnsortedFile[]>('list_unsorted_files', { rootPath: settings.root_path, entityName: name, financialYear: selectedFY });
        if (unsorted.length > 0) { setUnsortedFiles(unsorted); setShowUnsorted(true); }
      }
    } catch (err) { addToast('error', String(err)); }
    finally { setLoading(false); }
  };

  const handleMove = async () => {
    if (!settings?.root_path) return;
    setMoving(true);
    try {
      const result = await invoke<MoveResult>('move_unsorted_files', { rootPath: settings.root_path, entityName: entityInput.trim(), financialYear: selectedFY });
      setShowUnsorted(false);
      if (result.failed.length > 0) {
        setFailedFiles(result.failed); setTotalAttempted(unsortedFiles.length); setShowError(true);
        if (result.moved > 0) addToast('success', `Moved ${result.moved} files`);
      } else { addToast('success', `Moved ${result.moved} files to _Unsorted`); }
    } catch (err) { addToast('error', String(err)); setShowUnsorted(false); }
    finally { setMoving(false); }
  };

  const rootSet = !!settings?.root_path;
  const VISIBLE_COUNT = 6;

  /* Preview helpers */
  const parts = selectedFY.split(' ');
  const yearPart = parts.length > 1 ? parts[1] : parts[0];
  const ySplit = yearPart.split('-');
  const startY = parseInt(ySplit[0]) || 2026;
  const endY = ySplit.length > 1 ? Math.floor(startY / 100) * 100 + (parseInt(ySplit[1]) || 0) : startY + 1;
  const firstMonth = `01 Apr ${startY}`;
  const lastMonth = `12 Mar ${endY}`;

  const stmtLabel = appliedSelections.length === 0 ? 'None selected'
    : appliedSelections.map((s) => s.type_only ? `${s.name} (only)` : s.name).join(', ');

  const selectedCount = Object.values(workingTypes).filter((w) => w.selected).length;

  /* ═══ Template / Import / Export ═══ */
  const handleTemplate = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const defaultName = `Kredo_${entityInput.trim() || 'Template'}_${selectedFY.replace(/\s/g, '')}.xlsx`;
      const path = await save({ defaultPath: defaultName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!path) return;
      await invoke('generate_template', {
        savePath: path,
        clientName: entityInput.trim(),
        financialYear: selectedFY,
        structure: mode,
      });
      addToast('success', 'Template saved');
      try { const { open } = await import('@tauri-apps/plugin-shell'); await open(path); } catch {}
    } catch (err) { addToast('error', `Template failed: ${err}`); }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const tempPath = await invoke<string>('save_temp_file', { fileName: file.name, data: Array.from(bytes) });
        const result = await invoke<{
          client_name: string;
          financial_year: string;
          structure: string;
          statement_types: any[];
          warnings: string[];
        }>('parse_import', { filePath: tempPath });

        if (!settings) return;

        // Auto-fill form from imported config
        if (result.client_name) setEntityInput(result.client_name);
        if (result.financial_year) setSelectedFY(result.financial_year);
        if (result.structure === 'month_wise' || result.structure === 'fy_only') setMode(result.structure as FolderMode);

        // Save imported types to master
        if (result.statement_types.length > 0) {
          await saveSettings({ ...settings, statement_types: result.statement_types });

          // Auto-select all imported types for preview
          const selections: SelectedStatementType[] = result.statement_types.map((t: any) => ({
            name: t.name,
            type_only: (t.sub_folders || []).length === 0,
            folders: (t.sub_folders || []).length > 0 ? convertToSelected(t.sub_folders) : [],
          }));
          setAppliedSelections(selections);
        }

        // Show warnings
        if (result.warnings.length > 0) {
          for (const w of result.warnings) addToast('error', w);
        }

        const typeCount = result.statement_types.length;
        addToast('success', `Imported${result.client_name ? ` for ${result.client_name}` : ''}: ${typeCount} type${typeCount !== 1 ? 's' : ''}`);
      } catch (err) { addToast('error', String(err)); }
    };
    input.click();
  };

  const handleExport = async () => {
    if (masterTypes.length === 0 && !entityInput.trim()) { addToast('error', 'Nothing to export'); return; }
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const defaultName = `Kredo_${entityInput.trim() || 'Config'}_${selectedFY.replace(/\s/g, '')}.xlsx`;
      const path = await save({ defaultPath: defaultName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
      if (!path) return;
      await invoke('export_config', {
        savePath: path,
        clientName: entityInput.trim(),
        financialYear: selectedFY,
        structure: mode,
        statementTypes: masterTypes,
      });
      addToast('success', 'Configuration exported');
      try { const { open } = await import('@tauri-apps/plugin-shell'); await open(path); } catch {}
    } catch (err) { addToast('error', `Export failed: ${err}`); }
  };

  // Convert FolderNode[] to SelectedFolderNode[] (select all)
  function convertToSelected(nodes: FolderNode[]): SelectedFolderNode[] {
    return nodes.map((n) => ({ name: n.name, children: convertToSelected(n.children || []) }));
  }

  /* Current popup view data */
  const activeWT = workingTypes[activeTab];
  const currentKids = activeWT ? getKidsAtPath(activeWT.kids, navPath) : [];

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">Create Folders</div>
        <div className="page-head-subtitle">Set up financial year and monthly folder structures</div>
      </div>

      {!rootSet && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 28px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13.5, fontWeight: 500 }}>
          Please set a root folder in Settings before creating folders.
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="card-title">Folder Configuration</span>
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
        <div className="card-body">
          {/* Row 1: Client + FY */}
          <div className="form-grid form-grid-2" style={{ marginBottom: 12 }}>
            <div className="input-group">
              <label className="input-label">Client Name</label>
              <input className="input-field" placeholder="Type or select client..." value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)} list="entity-suggestions" />
              <datalist id="entity-suggestions">{entities.map((e) => <option key={e} value={e} />)}</datalist>
            </div>
            <div className="input-group">
              <label className="input-label">Financial Year</label>
              <select className="select-field" value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
                {fyList.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Structure + Statement Types */}
          <div className="form-grid form-grid-2" style={{ marginBottom: 20 }}>
            <div className="input-group">
              <label className="input-label">Structure</label>
              <div className="toggle-group">
                <button className={`toggle-option ${mode === 'month_wise' ? 'active' : ''}`} onClick={() => setMode('month_wise')}>Month-wise</button>
                <button className={`toggle-option ${mode === 'fy_only' ? 'active' : ''}`} onClick={() => setMode('fy_only')}>FY Only</button>
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Statement Types (optional)</label>
              <button onClick={openPopup} className="select-field"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', fontFamily: 'var(--font)', fontWeight: appliedSelections.length > 0 ? 500 : 400, color: appliedSelections.length > 0 ? 'var(--brand)' : 'var(--ink-3)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stmtLabel}</span>
                <span style={{ color: 'var(--brand)', fontSize: 14, flexShrink: 0 }}>+</span>
              </button>
            </div>
          </div>

          {/* Preview */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 20, overflow: 'hidden' }}>
            {/* Info banner for month-wise */}
            {mode === 'month_wise' && appliedSelections.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--brand-bg)', fontSize: 11.5, color: 'var(--brand)', fontWeight: 500 }}>
                <span style={{ fontSize: 13 }}>ℹ</span>
                Repeats across all 12 months ({firstMonth} → {lastMonth})
              </div>
            )}
            {/* Summary pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', flexWrap: 'wrap', borderBottom: appliedSelections.length > 0 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: 'var(--r-xs)', background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconFolderPlus style={{ width: 14, height: 14, fill: 'var(--brand)' }} />
              </div>
              {[
                entityInput || '...',
                selectedFY,
                mode === 'month_wise' ? '12 months' : 'FY only',
                ...(appliedSelections.length > 0 ? [`${appliedSelections.length} type${appliedSelections.length > 1 ? 's' : ''}`] : []),
              ].map((label, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {i > 0 && <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>·</span>}
                  <span style={{ padding: '4px 12px', borderRadius: 20, background: i >= 2 ? 'var(--brand-bg)' : 'var(--input-bg)', fontSize: 12, fontWeight: 500, color: i >= 2 ? 'var(--brand)' : 'var(--ink-2)' }}>{label}</span>
                </span>
              ))}
            </div>
            {/* Type summary lines */}
            {appliedSelections.length > 0 && (
              <div style={{ padding: '10px 16px' }}>
                {appliedSelections.flatMap((st) => summarizeType(st)).map((line, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: 12.5, color: 'var(--ink-2)', padding: '4px 0', lineHeight: 1.5 }}>
                    {line.split(' → ').map((seg, j, arr) => (
                      <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                        <span style={{ color: j === arr.length - 1 ? 'var(--ink-3)' : 'var(--ink-2)', fontWeight: j === 0 ? 500 : 400 }}>{seg}</span>
                        {j < arr.length - 1 && <span style={{ color: 'var(--ink-4)', margin: '0 6px', fontSize: 11 }}>→</span>}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={handleCreate} disabled={!rootSet || !entityInput.trim() || loading}
            className="create-folder-btn"
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = 'var(--brand-bg)'; e.currentTarget.style.transform = 'scale(1)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseDown={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            style={{ width: '100%', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px solid var(--brand)', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--brand)', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', opacity: (!rootSet || !entityInput.trim() || loading) ? 0.45 : 1, transition: 'background 0.15s, transform 0.1s' }}>
            <IconFolderPlus style={{ width: 15, height: 15, fill: 'var(--brand)' }} /> {loading ? 'Creating...' : 'Create Folders'}
          </button>
        </div>
      </div>

      {/* ═══ Statement Type Popup ═══ */}
      {showPopup && (
        <div className="dialog-overlay" onClick={() => setShowPopup(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620, padding: 0 }}>
            {/* Header */}
            <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Configure statement types</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>Select types and sub-folders to include</div>
              </div>
              <button onClick={() => setShowPopup(false)}
                style={{ width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 'var(--r-xs)', fontSize: 18, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Two-column body */}
            <div style={{ display: 'flex', minHeight: 340, borderTop: '1px solid var(--divider)' }}>
              {/* Left: Types */}
              <div style={{ width: 200, borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-3)', padding: '12px 16px 8px' }}>Statement types</div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {masterTypes.map((t) => {
                    const wt = workingTypes[t.name];
                    const isActive = activeTab === t.name;
                    const total = countAll(t.sub_folders || []);
                    return (
                      <div key={t.name} onClick={() => { setActiveTab(t.name); setNavPath([]); }}
                        style={{ padding: '9px 16px', fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--brand)' : 'var(--ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderLeft: `2.5px solid ${isActive ? 'var(--brand)' : 'transparent'}`, background: isActive ? 'var(--brand-bg)' : 'transparent' }}>
                        <input type="checkbox" checked={wt?.selected || false} onChange={() => toggleType(t.name)} onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: '#615FFF', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{t.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--ink-3)', background: 'var(--input-bg)', padding: '2px 7px', borderRadius: 4 }}>
                          {wt?.typeOnly ? 'only' : total}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: '1px solid var(--divider)' }}>
                  <input className="input-field" style={{ height: 30, fontSize: 12 }} placeholder="Add new type..." value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNewType()} />
                  <button className="btn btn-primary btn-sm" style={{ height: 30, padding: '0 12px', fontSize: 11 }} onClick={addNewType}>Add</button>
                </div>
              </div>

              {/* Right: Sub-folders with breadcrumb */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* Breadcrumb */}
                {activeTab && (
                  <div ref={crumbRef} style={{ overflowX: 'auto', whiteSpace: 'nowrap', borderBottom: '1px solid var(--divider)', background: 'var(--input-bg)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 0, scrollbarWidth: 'thin' }}>
                    <span onClick={() => setNavPath([])}
                      style={{ fontSize: 12, fontWeight: navPath.length === 0 ? 600 : 500, color: navPath.length === 0 ? 'var(--brand)' : 'var(--ink)', cursor: navPath.length > 0 ? 'pointer' : 'default', whiteSpace: 'nowrap', padding: '2px 4px', borderRadius: 4, flexShrink: 0 }}>
                      {activeTab}
                    </span>
                    {navPath.map((seg, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 3px' }}>/</span>
                        <span onClick={() => { if (i < navPath.length - 1) setNavPath(navPath.slice(0, i + 1)); }}
                          style={{ fontSize: 12, fontWeight: i === navPath.length - 1 ? 600 : 500, color: i === navPath.length - 1 ? 'var(--brand)' : 'var(--ink)', cursor: i < navPath.length - 1 ? 'pointer' : 'default', whiteSpace: 'nowrap', padding: '2px 4px', borderRadius: 4 }}>
                          {seg}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Folder-only toggle */}
                {activeWT?.selected && navPath.length === 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 12, color: 'var(--ink-2)', borderBottom: '1px solid var(--divider)', background: 'var(--input-bg)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={activeWT.typeOnly} onChange={toggleTypeOnly}
                      style={{ accentColor: '#615FFF', width: 14, height: 14 }} />
                    Folder only (no sub-folders)
                  </label>
                )}

                {/* Items list */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {!activeTab ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>Select a type</div>
                  ) : !activeWT?.selected ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>Enable this type first</div>
                  ) : activeWT.typeOnly && navPath.length === 0 ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>Folder only mode</div>
                  ) : currentKids.length === 0 ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>No folders here yet</div>
                  ) : (
                    currentKids.map((k) => {
                      const totalInside = countAll(k.children);
                      return (
                        <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', fontSize: 13, color: 'var(--ink)', borderBottom: '1px solid var(--divider)' }}>
                          <input type="checkbox" checked={k.sel} disabled={activeWT.typeOnly}
                            onChange={() => toggleSub(k.name)}
                            style={{ accentColor: '#615FFF', width: 14, height: 14, cursor: activeWT.typeOnly ? 'not-allowed' : 'pointer', flexShrink: 0 }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: activeWT.typeOnly ? 0.35 : 1 }}>{k.name}</span>
                            {totalInside > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--ink-3)', background: 'var(--input-bg)', padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>{totalInside}</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <button onClick={() => setNavPath([...navPath, k.name])}
                              style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--brand-bg)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
                              <ArrowRight />
                            </button>
                            <button onClick={() => removeSub(k.name)}
                              style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--ink-3)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--red-bg)'; e.currentTarget.style.color = 'var(--red)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--ink-3)'; }}>
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add sub-folder */}
                {activeWT?.selected && !activeWT.typeOnly && (
                  <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: '1px solid var(--divider)' }}>
                    <input className="input-field" style={{ height: 30, fontSize: 12 }} placeholder="Add folder..." value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNewSub()} />
                    <button className="btn btn-primary btn-sm" style={{ height: 30, padding: '0 12px', fontSize: 11 }} onClick={addNewSub}>Add</button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderTop: '1px solid var(--divider)' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{selectedCount} type{selectedCount !== 1 ? 's' : ''} selected</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowPopup(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={applySelections}>Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
