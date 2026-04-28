// ── Financial Year Helpers ──

export function generateFinancialYears(count: number = 10): string[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0 = Jan
  // FY starts April: if month >= April (3), current FY is currentYear-nextYear
  const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;

  const years: string[] = [];
  for (let i = 2; i >= -count + 3; i--) {
    const y = startYear + i;
    const shortNext = String(y + 1).slice(-2);
    years.push(`FY ${y}-${shortNext}`);
  }
  return years;
}

export function getCurrentFinancialYear(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const shortNext = String(startYear + 1).slice(-2);
  return `FY ${startYear}-${shortNext}`;
}

// ── Month Labels ──
export const MONTHS = [
  '01-April',
  '02-May',
  '03-June',
  '04-July',
  '05-August',
  '06-September',
  '07-October',
  '08-November',
  '09-December',
  '10-January',
  '11-February',
  '12-March',
] as const;

export const MONTH_SHORT: Record<string, string> = {
  '01-April': 'Apr',
  '02-May': 'May',
  '03-June': 'Jun',
  '04-July': 'Jul',
  '05-August': 'Aug',
  '06-September': 'Sep',
  '07-October': 'Oct',
  '08-November': 'Nov',
  '09-December': 'Dec',
  '10-January': 'Jan',
  '11-February': 'Feb',
  '12-March': 'Mar',
};

// ── Size Formatter ──
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return idx === 0 ? `${bytes} ${units[0]}` : `${size.toFixed(1)} ${units[idx]}`;
}

// ── File Extension Icon Mapping ──
export function getFileIcon(ext: string): string {
  const map: Record<string, string> = {
    pdf: '📄',
    xlsx: '📊',
    xls: '📊',
    csv: '📊',
    doc: '📝',
    docx: '📝',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    zip: '📦',
    rar: '📦',
    json: '⚙️',
    xml: '⚙️',
    txt: '📃',
  };
  return map[ext.toLowerCase()] || '📎';
}

// ── Email Body Template ──
export function buildEmailBody(
  entityName: string,
  financialYear: string,
  totalFiles: number,
  totalFolders: number,
  totalSize: string,
  folderDetails: { name: string; fileCount: number }[]
): string {
  const folderRows = folderDetails
    .map(
      (f) =>
        `<tr><td style="padding:8px 16px;border-bottom:1px solid #eee;font-size:14px;">${f.name}</td><td style="padding:8px 16px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${f.fileCount}</td></tr>`
    )
    .join('');

  return `
    <div style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#615FFF;color:white;padding:24px 28px;border-radius:10px 10px 0 0;">
        <h2 style="margin:0;font-size:18px;font-weight:700;">Kredo File Manager — Summary Report</h2>
      </div>
      <div style="padding:24px 28px;background:white;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;">
        <p style="margin:0 0 4px;font-size:14px;color:#5E5C7A;">Entity</p>
        <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#131126;">${entityName}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#5E5C7A;">Financial Year</p>
        <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#131126;">${financialYear}</p>
        <div style="display:flex;gap:16px;margin-bottom:20px;">
          <div style="flex:1;padding:12px 16px;background:#f8f7ff;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#131126;">${totalFiles}</div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#908EAF;">Files</div>
          </div>
          <div style="flex:1;padding:12px 16px;background:#f8f7ff;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#131126;">${totalFolders}</div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#908EAF;">Folders</div>
          </div>
          <div style="flex:1;padding:12px 16px;background:#f8f7ff;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#131126;">${totalSize}</div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#908EAF;">Total Size</div>
          </div>
        </div>
        ${
          folderRows
            ? `<table style="width:100%;border-collapse:collapse;margin-top:12px;">
                <thead><tr>
                  <th style="padding:8px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#908EAF;border-bottom:2px solid #eee;">Folder</th>
                  <th style="padding:8px 16px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#908EAF;border-bottom:2px solid #eee;">Files</th>
                </tr></thead>
                <tbody>${folderRows}</tbody>
               </table>`
            : ''
        }
        <p style="margin:20px 0 0;font-size:12px;color:#908EAF;text-align:center;">Generated by Kredo File Manager</p>
      </div>
    </div>
  `;
}
