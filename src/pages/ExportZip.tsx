import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../hooks/useSettings';
import { useAppStore } from '../store/appStore';
import { IconZip, IconDownload } from '../components/Icons';
import type { ScanResult } from '../types';

interface ZipResult { success: boolean; message: string; file_count: number; total_size: number; }

export default function ExportZip() {
  const { settings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);

  const [entities, setEntities] = useState<string[]>([]);
  const [selectedEntity, setSelectedEntity] = useState('');
  const [fyList, setFyList] = useState<string[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<{ files: number; folders: number; size: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Load entities
  useEffect(() => {
    if (!settings?.root_path) return;
    invoke<string[]>('list_entities', { rootPath: settings.root_path }).then(setEntities).catch(() => {});
  }, [settings?.root_path]);

  // Load FYs when entity changes
  useEffect(() => {
    if (!settings?.root_path || !selectedEntity) { setFyList([]); setSelectedFY(''); return; }
    invoke<string[]>('list_all_financial_years', {
      rootPath: settings.root_path,
      entityNames: [selectedEntity],
    }).then((fys) => {
      setFyList(fys);
      if (fys.length > 0) setSelectedFY(fys[fys.length - 1]);
      else setSelectedFY('');
    }).catch(() => {});
  }, [settings?.root_path, selectedEntity]);

  // Auto-scan for preview when both selected
  useEffect(() => {
    if (!selectedEntity || !selectedFY || !settings?.root_path) { setPreview(null); return; }
    setScanning(true);
    invoke<ScanResult>('scan_directory', {
      rootPath: settings.root_path,
      entityName: selectedEntity,
      financialYear: selectedFY,
    }).then((res) => {
      setPreview({
        files: res.total_files,
        folders: res.total_folders,
        size: res.total_size_display,
      });
    }).catch(() => {
      setPreview({ files: 0, folders: 0, size: '—' });
    }).finally(() => setScanning(false));
  }, [selectedEntity, selectedFY, settings?.root_path]);

  const handleExport = async () => {
    if (!selectedEntity || !selectedFY || !settings?.root_path) return;
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const defaultName = `${selectedEntity}_${selectedFY.replace(/\s/g, '')}.zip`;
      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      });
      if (!path) return;

      setExporting(true);
      const result = await invoke<ZipResult>('export_zip', {
        rootPath: settings.root_path,
        entityName: selectedEntity,
        financialYear: selectedFY,
        savePath: path,
      });
      addToast('success', result.message);

      // Try to open the folder containing the zip
      try {
        const folder = path.replace(/[\\/][^\\/]+$/, '');
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(folder);
      } catch {}
    } catch (err) {
      addToast('error', String(err));
    } finally {
      setExporting(false);
    }
  };

  const rootSet = !!settings?.root_path;
  const canExport = selectedEntity && selectedFY && preview && preview.files > 0 && !exporting;

  return (
    <>
      <div className="page-head">
        <div className="page-head-title">Export Zip</div>
        <div className="page-head-subtitle">Download a client's financial year as a zip archive</div>
      </div>

      {!rootSet && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 28px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13.5, fontWeight: 500 }}>
          Please set a root folder in Settings first.
        </div>
      )}

      <div className="card">
        <div className="card-header"><span className="card-title">Select Client & Financial Year</span></div>
        <div className="card-body">
          <div className="form-grid form-grid-2" style={{ marginBottom: 20 }}>
            <div className="input-group">
              <label className="input-label">Client Name</label>
              <select className="select-field" value={selectedEntity} onChange={(e) => setSelectedEntity(e.target.value)}>
                <option value="">Select client</option>
                {entities.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Financial Year</label>
              <select className="select-field" value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
                {fyList.length === 0 && <option value="">—</option>}
                {fyList.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
              </select>
            </div>
          </div>

          {/* Preview */}
          {scanning && (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
              Scanning files...
            </div>
          )}

          {preview && !scanning && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', flexWrap: 'wrap' }}>
                <div style={{ width: 28, height: 28, borderRadius: 'var(--r-xs)', background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconZip style={{ width: 14, height: 14, fill: 'var(--brand)' }} />
                </div>
                {[
                  selectedEntity,
                  selectedFY,
                  `${preview.files} file${preview.files !== 1 ? 's' : ''}`,
                  `${preview.folders} folder${preview.folders !== 1 ? 's' : ''}`,
                  preview.size,
                ].map((label, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>·</span>}
                    <span style={{ padding: '4px 12px', borderRadius: 20, background: i >= 2 ? 'var(--brand-bg)' : 'var(--input-bg)', fontSize: 12, fontWeight: 500, color: i >= 2 ? 'var(--brand)' : 'var(--ink-2)' }}>{label}</span>
                  </span>
                ))}
              </div>

              {preview.files === 0 && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--ink-3)' }}>
                  No files found in this directory. Nothing to export.
                </div>
              )}
            </div>
          )}

          <button onClick={handleExport} disabled={!canExport}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--brand-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onMouseDown={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            style={{ width: '100%', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px solid var(--brand)', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--brand)', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: canExport ? 'pointer' : 'default', opacity: canExport ? 1 : 0.45, transition: 'background 0.15s, transform 0.1s' }}>
            <IconDownload style={{ width: 15, height: 15, fill: 'var(--brand)' }} />
            {exporting ? 'Exporting...' : 'Export as Zip'}
          </button>
        </div>
      </div>
    </>
  );
}
