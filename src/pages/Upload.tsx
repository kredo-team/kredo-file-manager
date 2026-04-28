import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../store/appStore';
import { IconUpload, IconRefresh, IconExplorer, IconSearch, IconTrash, IconFolder } from '../components/Icons';
import ConfirmDialog from '../components/ConfirmDialog';

interface TreeNode {
  name: string; path: string; full_path: string; depth: number;
  is_expanded: boolean; has_children: boolean; file_count: number;
}
interface FileItem {
  name: string; full_path: string; extension: string;
  size_bytes: number; size_display: string; modified: string;
  is_folder: boolean; item_count: number;
}

/* ═══ Windows-style file type icons ═══ */
const FileTypeIcon = ({ ext }: { ext: string }) => {
  if (ext === 'pdf') return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#E25C5C"/>
      <rect x="7" y="4" width="18" height="3" rx="1" fill="white" opacity="0.4"/>
      <rect x="7" y="9" width="14" height="2" rx="1" fill="white" opacity="0.3"/>
      <rect x="7" y="13" width="16" height="2" rx="1" fill="white" opacity="0.3"/>
      <text x="16" y="25" textAnchor="middle" fontSize="7" fontWeight="700" fill="white" fontFamily="system-ui">PDF</text>
    </svg>
  );
  if (['xlsx','xls','xlsb','csv'].includes(ext)) return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#1D9E75"/>
      <rect x="7" y="5" width="8" height="4" rx="0.5" fill="white" opacity="0.35"/>
      <rect x="17" y="5" width="8" height="4" rx="0.5" fill="white" opacity="0.25"/>
      <rect x="7" y="11" width="8" height="4" rx="0.5" fill="white" opacity="0.25"/>
      <rect x="17" y="11" width="8" height="4" rx="0.5" fill="white" opacity="0.35"/>
      <text x="16" y="25" textAnchor="middle" fontSize="7" fontWeight="700" fill="white" fontFamily="system-ui">XLS</text>
    </svg>
  );
  if (['doc','docx'].includes(ext)) return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#4A90D9"/>
      <rect x="7" y="5" width="18" height="2" rx="1" fill="white" opacity="0.4"/>
      <rect x="7" y="9" width="14" height="2" rx="1" fill="white" opacity="0.3"/>
      <rect x="7" y="13" width="16" height="2" rx="1" fill="white" opacity="0.3"/>
      <text x="16" y="25" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="white" fontFamily="system-ui">DOC</text>
    </svg>
  );
  if (['ppt','pptx'].includes(ext)) return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#D4813B"/>
      <rect x="9" y="5" width="14" height="10" rx="1.5" fill="white" opacity="0.35"/>
      <text x="16" y="25" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="white" fontFamily="system-ui">PPT</text>
    </svg>
  );
  if (['zip','rar','7z'].includes(ext)) return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#908EAF"/>
      <rect x="13" y="3" width="6" height="2" rx="0.5" fill="white" opacity="0.4"/>
      <rect x="13" y="7" width="6" height="2" rx="0.5" fill="white" opacity="0.4"/>
      <rect x="13" y="11" width="6" height="2" rx="0.5" fill="white" opacity="0.4"/>
      <rect x="11" y="16" width="10" height="8" rx="1.5" fill="white" opacity="0.35"/>
    </svg>
  );
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#615FFF"/>
      <circle cx="13" cy="10" r="3" fill="white" opacity="0.4"/>
      <polygon points="8,24 16,15 20,20 24,16 26,24" fill="white" opacity="0.35"/>
    </svg>
  );
  if (ext === 'html' || ext === 'htm') return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#D4813B"/>
      <text x="16" y="18" textAnchor="middle" fontSize="10" fontWeight="700" fill="white" opacity="0.5" fontFamily="system-ui">&lt;/&gt;</text>
    </svg>
  );
  if (ext === 'txt') return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#B4B2A9"/>
      <rect x="8" y="6" width="16" height="2" rx="0.5" fill="white" opacity="0.5"/>
      <rect x="8" y="10" width="12" height="2" rx="0.5" fill="white" opacity="0.4"/>
      <rect x="8" y="14" width="14" height="2" rx="0.5" fill="white" opacity="0.4"/>
    </svg>
  );
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <rect x="4" y="1" width="24" height="30" rx="2" fill="#C4C3D4"/>
      <rect x="8" y="6" width="16" height="2" rx="0.5" fill="white" opacity="0.4"/>
      <rect x="8" y="10" width="12" height="2" rx="0.5" fill="white" opacity="0.3"/>
      <rect x="8" y="14" width="14" height="2" rx="0.5" fill="white" opacity="0.3"/>
    </svg>
  );
};

/* ═══ Context Menu ═══ */
const ContextMenu = ({ x, y, items, onClose }: {
  x: number; y: number; items: { label: string; shortcut?: string; danger?: boolean; divider?: boolean; action: () => void }[];
  onClose: () => void;
}) => {
  useEffect(() => {
    const h = () => onClose();
    document.addEventListener('click', h);
    document.addEventListener('contextmenu', h);
    return () => { document.removeEventListener('click', h); document.removeEventListener('contextmenu', h); };
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', left: x, top: y, zIndex: 200, background: 'var(--card-solid)', borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(19,17,38,0.12)', padding: '4px 0', minWidth: 200, animation: 'dialogIn 0.12s ease' }}>
      {items.map((item, i) => item.divider ? (
        <div key={i} style={{ height: 1, background: 'var(--divider)', margin: '4px 0' }} />
      ) : (
        <div key={i} onClick={(e) => { e.stopPropagation(); item.action(); onClose(); }}
          style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 500, color: item.danger ? '#E25C5C' : 'var(--ink)', cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={(e) => e.currentTarget.style.background = item.danger ? 'rgba(226,92,92,0.04)' : 'var(--hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
          <span>{item.label}</span>
          {item.shortcut && <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontWeight: 400, marginLeft: 20 }}>{item.shortcut}</span>}
        </div>
      ))}
    </div>
  );
};

type SortKey = 'name' | 'extension' | 'size_bytes' | 'modified';
type SortDir = 'asc' | 'desc';

export default function Upload() {
  const { settings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [selectedFullPath, setSelectedFullPath] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; type: 'file' | 'empty'; filePath?: string } | null>(null);
  const [newFolderInput, setNewFolderInput] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const lastClickedIdx = useRef<number>(-1);
  const rootPath = settings?.root_path || '';

  // Load tree
  const loadTree = useCallback(async () => {
    if (!rootPath) return;
    try {
      const nodes = await invoke<TreeNode[]>('browse_data_tree', { rootPath });
      setTree(nodes);
      const firstLevel = new Set(nodes.filter((n) => n.depth === 0).map((n) => n.path));
      setExpanded((prev) => new Set([...prev, ...firstLevel]));
    } catch (err) { addToast('error', String(err)); }
  }, [rootPath]);
  useEffect(() => { loadTree(); }, [loadTree]);

  // Load files
  const loadFiles = useCallback(async () => {
    if (!selectedFullPath) { setFiles([]); return; }
    try {
      const items = await invoke<FileItem[]>('list_folder_files', { folderPath: selectedFullPath });
      setFiles(items); setSelectedFiles(new Set());
    } catch { setFiles([]); }
  }, [selectedFullPath]);
  useEffect(() => { loadFiles(); }, [loadFiles]);

  // Auto-refresh when window regains focus (user may have changed files in Explorer)
  useEffect(() => {
    const onFocus = () => { loadTree(); loadFiles(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadTree, loadFiles]);

  // Focus new folder input
  useEffect(() => { if (newFolderInput !== null) newFolderRef.current?.focus(); }, [newFolderInput]);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) { for (const p of prev) { if (p.startsWith(path + '/') || p === path) next.delete(p); } }
      else { next.add(path); }
      return next;
    });
  };

  const selectFolder = (node: TreeNode) => { setSelectedPath(node.path); setSelectedFullPath(node.full_path); setSearch(''); };

  const visibleNodes = tree.filter((node) => {
    if (node.depth === 0) return true;
    const parts = node.path.split('/');
    for (let i = 1; i < parts.length; i++) { if (!expanded.has(parts.slice(0, i).join('/'))) return false; }
    return true;
  });

  const breadcrumbs = selectedPath ? selectedPath.split('/') : [];

  // Upload
  const handleUpload = async () => {
    if (!selectedFullPath) return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: true, title: 'Select files to upload' });
      if (!selected || (Array.isArray(selected) && selected.length === 0)) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      setLoading(true);
      const result = await invoke<{ copied: number; failed: number; message: string }>('upload_files_to_folder', { sourcePaths: paths, destinationFolder: selectedFullPath });
      addToast(result.failed > 0 ? 'error' : 'success', result.message);
      await loadFiles(); await loadTree();
    } catch (err) { addToast('error', String(err)); }
    finally { setLoading(false); }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const msg = await invoke<string>('delete_files', { filePaths: deleteConfirm });
      addToast('success', msg); setDeleteConfirm(null); setSelectedFiles(new Set());
      await loadFiles(); await loadTree();
    } catch (err) { addToast('error', String(err)); }
  };

  const handleOpen = async (path: string) => { try { await invoke('open_file_default', { filePath: path }); } catch (err) { addToast('error', String(err)); } };
  const handleExplorer = async () => { if (selectedFullPath) try { await invoke('open_in_explorer', { path: selectedFullPath }); } catch {} };
  const handleRefresh = async () => { await loadTree(); await loadFiles(); addToast('success', 'Refreshed'); };

  // New folder
  const handleNewFolder = async () => {
    if (!selectedFullPath) { addToast('error', 'Select a folder first'); return; }
    setNewFolderInput('');
  };
  const submitNewFolder = async () => {
    if (!newFolderInput?.trim() || !selectedFullPath) { setNewFolderInput(null); return; }
    try {
      await invoke<string>('create_subfolder', { parentPath: selectedFullPath, folderName: newFolderInput.trim() });
      addToast('success', `Created folder "${newFolderInput.trim()}"`);
      setNewFolderInput(null);
      await loadTree();
    } catch (err) { addToast('error', String(err)); }
  };

  // Copy path
  const handleCopyPath = async (path?: string) => {
    const p = path || selectedFullPath;
    try { await navigator.clipboard.writeText(p); addToast('success', 'Path copied'); } catch {}
  };

  // File selection
  const handleFileClick = (path: string, idx: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIdx.current >= 0) {
      const start = Math.min(lastClickedIdx.current, idx), end = Math.max(lastClickedIdx.current, idx);
      setSelectedFiles((prev) => { const next = new Set(prev); displayFiles.slice(start, end + 1).forEach((f) => next.add(f.full_path)); return next; });
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedFiles((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; });
      lastClickedIdx.current = idx;
    } else { setSelectedFiles(new Set([path])); lastClickedIdx.current = idx; }
  };
  const selectAllFiles = () => setSelectedFiles(new Set(displayFiles.map((f) => f.full_path)));

  // Sort
  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc'); } };

  const q = search.toLowerCase();
  const displayFiles = [...files]
    .filter((f) => !q || f.name.toLowerCase().includes(q) || f.extension.toLowerCase().includes(q))
    .sort((a, b) => { const av = a[sortKey], bv = b[sortKey]; const cmp = typeof av === 'number' ? (av as number) - (bv as number) : String(av).localeCompare(String(bv)); return sortDir === 'asc' ? cmp : -cmp; });

  const folderCount = files.filter((f) => f.is_folder).length;
  const fileCount = files.filter((f) => !f.is_folder).length;
  const totalSize = files.filter((f) => !f.is_folder).reduce((s, f) => s + f.size_bytes, 0);
  const totalDisplay = totalSize < 1024 ? `${totalSize} B` : totalSize < 1048576 ? `${(totalSize / 1024).toFixed(1)} KB` : `${(totalSize / 1048576).toFixed(1)} MB`;

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, type: 'file' | 'empty', filePath?: string) => {
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, type, filePath });
  };
  const ctxItems = ctxMenu?.type === 'file' && ctxMenu.filePath ? [
    { label: 'Open', shortcut: 'Double-click', action: () => handleOpen(ctxMenu.filePath!) },
    { label: 'Copy path', action: () => handleCopyPath(ctxMenu.filePath!) },
    { label: '', divider: true, action: () => {} },
    { label: 'Delete', shortcut: 'Del', danger: true, action: () => setDeleteConfirm([ctxMenu.filePath!]) },
  ] : [
    { label: 'Upload files', shortcut: 'Ctrl+U', action: handleUpload },
    { label: 'New folder', shortcut: 'Ctrl+Shift+N', action: handleNewFolder },
    { label: '', divider: true, action: () => {} },
    { label: 'Open in Explorer', action: handleExplorer },
    { label: 'Refresh', shortcut: 'F5', action: handleRefresh },
  ];

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F5') { e.preventDefault(); handleRefresh(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); handleNewFolder(); return; }
        if (e.key === 'u' || e.key === 'U') { e.preventDefault(); handleUpload(); }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); searchRef.current?.focus(); }
        if ((e.key === 'a' || e.key === 'A') && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); selectAllFiles(); }
      }
      if (e.key === 'Delete' && selectedFiles.size > 0 && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); setDeleteConfirm([...selectedFiles]); }
      if (e.key === 'Escape') { setSelectedFiles(new Set()); setCtxMenu(null); setNewFolderInput(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedFiles, selectedFullPath, displayFiles]);

  const SortTh = ({ label, k, style: s }: { label: string; k: SortKey; style?: React.CSSProperties }) => (
    <th onClick={() => handleSort(k)} style={{ ...s, cursor: 'pointer', userSelect: 'none', padding: '14px 20px 12px' }}>
      {label}
      <span style={{ marginLeft: 4, fontSize: 8, color: sortKey === k ? 'var(--brand)' : 'var(--ink-4)' }}>
        {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
      </span>
    </th>
  );

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div className="page-head-title">Upload & Organize</div>
        <div className="page-head-subtitle">Browse your structured folders and import files</div>
      </div>

      {!rootPath ? (
        <div className="card" style={{ padding: '16px 28px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13.5, fontWeight: 500 }}>
          Please set a root folder in Settings first.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: 'calc(100vh - 180px)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--card-solid)' }}>

          {/* ═══ LEFT: Tree ═══ */}
          <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '0 14px', minHeight: 46, borderBottom: '1px solid var(--divider)', background: 'var(--input-bg)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span>Folders</span>
              <button onClick={handleRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }} title="Refresh (F5)">
                <IconRefresh style={{ width: 12, height: 12, fill: 'var(--ink-3)' }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {visibleNodes.map((node, nodeIdx) => {
                const isActive = node.path === selectedPath;
                const isExp = expanded.has(node.path);

                // Determine if new folder input should appear after this node
                const showNewFolderHere = newFolderInput !== null && selectedPath && (() => {
                  // The input goes after the last visible descendant of the selected node
                  // Check: is this node the selected node or a descendant?
                  const isDescendant = node.path === selectedPath || node.path.startsWith(selectedPath + '/');
                  if (!isDescendant) return false;
                  // Check: is the NEXT node NOT a descendant (or there is no next node)?
                  const nextNode = visibleNodes[nodeIdx + 1];
                  return !nextNode || !nextNode.path.startsWith(selectedPath + '/');
                })();

                const selectedDepth = visibleNodes.find((n) => n.path === selectedPath)?.depth ?? 0;

                return (
                  <div key={node.path}>
                    <div onClick={() => selectFolder(node)}
                      onDoubleClick={() => node.has_children && toggleExpand(node.path)}
                      onContextMenu={(e) => { selectFolder(node); handleContextMenu(e, 'empty'); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', paddingLeft: 10 + node.depth * 16,
                        cursor: 'pointer', fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                        color: isActive ? 'var(--brand)' : 'var(--ink-2)',
                        background: isActive ? 'rgba(97,95,255,0.04)' : 'transparent',
                        borderLeft: isActive ? '2.5px solid var(--brand)' : '2.5px solid transparent',
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'rgba(97,95,255,0.04)' : 'transparent'; }}>
                      <span onClick={(e) => { e.stopPropagation(); if (node.has_children) toggleExpand(node.path); }}
                        style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', visibility: node.has_children ? 'visible' : 'hidden' }}>
                        <svg viewBox="0 0 320 512" style={{ width: 8, height: 8, fill: 'var(--ink-4)' }}><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" /></svg>
                      </span>
                      <IconFolder style={{ width: 16, height: 16, fill: isActive ? 'var(--brand)' : 'var(--ink-3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                      {!node.has_children && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500, background: node.file_count > 0 ? 'var(--input-bg)' : 'rgba(226,92,92,0.06)', color: node.file_count > 0 ? 'var(--ink-3)' : '#E25C5C' }}>
                          {node.file_count}
                        </span>
                      )}
                    </div>
                    {/* New folder input — inline right after selected node's children */}
                    {showNewFolderHere && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', paddingLeft: 10 + (selectedDepth + 1) * 16 }}>
                        <IconFolder style={{ width: 16, height: 16, fill: 'var(--brand)', flexShrink: 0 }} />
                        <input ref={newFolderRef} value={newFolderInput || ''} onChange={(e) => setNewFolderInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setNewFolderInput(null); }}
                          onBlur={submitNewFolder}
                          placeholder="Folder name..."
                          style={{ flex: 1, height: 26, padding: '0 8px', border: '1.5px solid var(--brand)', borderRadius: 4, fontSize: 12, fontFamily: 'var(--font)', outline: 'none', background: 'white' }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {tree.length === 0 && <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>No folders found. Create folders first.</div>}
            </div>
          </div>

          {/* ═══ RIGHT: Files ═══ */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onContextMenu={(e) => { if (selectedFullPath) handleContextMenu(e, 'empty'); }}>
            {/* Pinned breadcrumb */}
            <div style={{ padding: '0 16px', minHeight: 46, borderBottom: '1px solid var(--divider)', background: 'var(--input-bg)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                {breadcrumbs.map((seg, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <span onClick={() => { if (!isLast) { const pp = breadcrumbs.slice(0, i + 1).join('/'); const n = tree.find((t) => t.path === pp); if (n) selectFolder(n); } }}
                        style={{ fontSize: 12, fontWeight: isLast ? 600 : 500, color: isLast ? 'var(--brand)' : 'var(--ink)', cursor: isLast ? 'default' : 'pointer', padding: '2px 3px', borderRadius: 3 }}
                        onMouseEnter={(e) => { if (!isLast) e.currentTarget.style.background = 'var(--hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>{seg}</span>
                      {!isLast && <span style={{ color: 'var(--ink-4)', margin: '0 2px', fontSize: 10 }}>/</span>}
                    </span>
                  );
                })}
                {!selectedPath && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Select a folder</span>}
              </div>
              <button onClick={handleExplorer} title="Open in Explorer" className="icon-btn icon-btn-brand" style={{ width: 28, height: 28, flexShrink: 0 }}>
                <IconExplorer style={{ width: 13, height: 13 }} />
              </button>
              <button onClick={handleUpload} disabled={!selectedFullPath || loading}
                style={{ height: 30, padding: '0 14px', borderRadius: 'var(--r-xs)', border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, opacity: selectedFullPath ? 1 : 0.4, flexShrink: 0 }}>
                {loading ? <span className="btn-spinner" style={{ width: 12, height: 12 }} /> : <IconUpload style={{ width: 12, height: 12, fill: 'white' }} />}
                Upload
              </button>
            </div>

            {/* Pinned search */}
            {selectedFullPath && (
              <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div className="search-wrapper" style={{ width: 200 }}>
                  <IconSearch />
                  <input ref={searchRef} className="input-field" placeholder="Search files..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ height: 30, fontSize: 11.5 }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{folderCount > 0 ? `${folderCount} folder${folderCount !== 1 ? 's' : ''} · ` : ''}{fileCount} file{fileCount !== 1 ? 's' : ''} · {totalDisplay}</span>
              </div>
            )}

            {/* Scrollable file area */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!selectedFullPath ? (
                <div style={{ padding: '80px 20px', textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <IconFolder style={{ width: 22, height: 22, fill: 'var(--ink-4)' }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>Select a folder</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Choose a folder from the tree to view files</div>
                </div>
              ) : displayFiles.length === 0 && !search ? (
                <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <IconFolder style={{ width: 22, height: 22, fill: 'var(--ink-4)' }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>This folder is empty</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>Upload files or right-click for options</div>
                  <button onClick={handleUpload}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 16px', borderRadius: 'var(--r-xs)', border: 'none', background: 'var(--brand)', color: 'white', fontSize: 12, fontWeight: 500, fontFamily: 'var(--font)', cursor: 'pointer' }}>
                    <IconUpload style={{ width: 12, height: 12, fill: 'white' }} /> Upload files
                  </button>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <SortTh label="Name" k="name" style={{ width: '46%' }} />
                      <SortTh label="Type" k="extension" style={{ width: '10%' }} />
                      <SortTh label="Size" k="size_bytes" style={{ width: '14%' }} />
                      <SortTh label="Modified" k="modified" style={{ width: '20%' }} />
                      <th style={{ width: '6%', padding: '14px 20px 12px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayFiles.map((f, idx) => (
                      <tr key={f.full_path}
                        onClick={(e) => !f.is_folder && handleFileClick(f.full_path, idx, e)}
                        onDoubleClick={() => {
                          if (f.is_folder) {
                            // Navigate into folder: find matching tree node
                            const node = tree.find((n) => n.full_path === f.full_path);
                            if (node) {
                              // Expand parent in tree
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                const parts = node.path.split('/');
                                for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join('/'));
                                return next;
                              });
                              selectFolder(node);
                            }
                          } else {
                            handleOpen(f.full_path);
                          }
                        }}
                        onContextMenu={(e) => { e.stopPropagation(); handleContextMenu(e, f.is_folder ? 'empty' : 'file', f.full_path); }}
                        style={{ background: selectedFiles.has(f.full_path) ? 'rgba(97,95,255,0.04)' : undefined, cursor: f.is_folder ? 'pointer' : 'default', userSelect: 'none' }}>
                        <td style={{ padding: '0 20px', height: 44 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500, fontSize: 12.5 }}>
                            {f.is_folder
                              ? <IconFolder style={{ width: 18, height: 18, fill: 'var(--ink-3)', flexShrink: 0 }} />
                              : <FileTypeIcon ext={f.extension} />
                            }
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0 20px', height: 44 }}>
                          <span style={{ fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase' }}>
                            {f.is_folder ? 'Folder' : (f.extension || '—')}
                          </span>
                        </td>
                        <td style={{ padding: '0 20px', height: 44, color: 'var(--ink-3)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>
                          {f.size_display}
                        </td>
                        <td style={{ padding: '0 20px', height: 44, color: 'var(--ink-4)', fontSize: 11 }}>{f.modified}</td>
                        <td style={{ padding: '0 20px', height: 44 }}>
                          <div className="file-hover-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm([f.full_path]); }} className="icon-btn icon-btn-danger" style={{ width: 26, height: 26 }} title="Delete">
                              <IconTrash style={{ width: 11, height: 11 }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {displayFiles.length === 0 && search && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13 }}>No files match "{search}"</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pinned status bar */}
            {selectedFullPath && (
              <div style={{ padding: '7px 16px', borderTop: '1px solid var(--divider)', background: 'var(--input-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-4)', flexShrink: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>{selectedFullPath}</span>
                <span style={{ flexShrink: 0, marginLeft: 12 }}>
                  {folderCount > 0 && `${folderCount} folder${folderCount !== 1 ? 's' : ''} · `}
                  {fileCount} file{fileCount !== 1 ? 's' : ''}
                  {selectedFiles.size > 0 && ` · ${selectedFiles.size} selected`}
                  <span style={{ margin: '0 6px', color: 'var(--divider)' }}>|</span>
                  <span style={{ color: 'var(--ink-4)' }}>Ctrl+U Upload · Ctrl+Shift+N New folder · Del Delete</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />}

      {/* Delete confirm */}
      {deleteConfirm && (() => {
        const names = deleteConfirm.map((p) => p.split(/[\\/]/).pop() || p);
        const shown = names.slice(0, 5);
        const more = names.length > 5 ? names.length - 5 : 0;
        const msg = shown.join('\n') + (more > 0 ? `\n...and ${more} more` : '') + '\n\nThis cannot be undone.';
        return (
          <ConfirmDialog open={true} title={`Delete ${deleteConfirm.length} file${deleteConfirm.length > 1 ? 's' : ''}?`}
            message={msg}
            confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} />
        );
      })()}
    </>
  );
}
