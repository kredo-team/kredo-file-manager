use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String, pub path: String, pub relative_path: String, pub extension: String,
    pub size_bytes: u64, pub size_display: String, pub parent_folder: String, pub depth: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanResult {
    pub total_files: usize, pub total_folders: usize, pub total_size_bytes: u64,
    pub total_size_display: String, pub files: Vec<FileEntry>,
    pub folder_summary: Vec<FolderSummary>, pub extension_summary: Vec<ExtensionSummary>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderSummary { pub name: String, pub path: String, pub file_count: usize, pub total_size: u64 }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtensionSummary { pub extension: String, pub count: usize, pub total_size: u64 }

fn format_size(bytes: u64) -> String {
    if bytes == 0 { return "0 B".to_string(); }
    let units = ["B", "KB", "MB", "GB"];
    let mut size = bytes as f64; let mut idx = 0;
    while size >= 1024.0 && idx < units.len() - 1 { size /= 1024.0; idx += 1; }
    if idx == 0 { format!("{} {}", bytes, units[idx]) } else { format!("{:.1} {}", size, units[idx]) }
}

#[tauri::command]
pub fn scan_directory(root_path: String, entity_name: String, account_name: String, financial_year: String) -> Result<ScanResult, String> {
    let scan_path = PathBuf::from(&root_path).join(&entity_name).join(&account_name).join(&financial_year);
    if !scan_path.exists() { return Err(format!("Path does not exist: {}", scan_path.display())); }
    let mut files: Vec<FileEntry> = Vec::new();
    let mut total_folders: usize = 0; let mut total_size: u64 = 0;
    let mut folder_map: std::collections::HashMap<String, (String, usize, u64)> = std::collections::HashMap::new();
    let mut ext_map: std::collections::HashMap<String, (usize, u64)> = std::collections::HashMap::new();
    let base_str = scan_path.to_string_lossy().to_string();
    for entry in WalkDir::new(&scan_path).min_depth(0).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path(); let depth = entry.depth();
        if path.is_dir() { if depth > 0 { total_folders += 1; let fn_ = path.file_name().unwrap_or_default().to_string_lossy().to_string(); let fp = path.to_string_lossy().to_string(); folder_map.insert(fp.clone(), (fn_, 0, 0)); } continue; }
        if let Ok(metadata) = entry.metadata() {
            let size = metadata.len(); total_size += size;
            let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let extension = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            let full_path = path.to_string_lossy().to_string();
            let relative_path = full_path.strip_prefix(&base_str).unwrap_or(&full_path).trim_start_matches(std::path::MAIN_SEPARATOR).to_string();
            let parent = path.parent().unwrap_or(path).file_name().unwrap_or_default().to_string_lossy().to_string();
            let parent_path = path.parent().unwrap_or(path).to_string_lossy().to_string();
            if let Some(entry) = folder_map.get_mut(&parent_path) { entry.1 += 1; entry.2 += size; }
            let ext_key = if extension.is_empty() { "no extension".to_string() } else { extension.clone() };
            let ext_entry = ext_map.entry(ext_key).or_insert((0, 0)); ext_entry.0 += 1; ext_entry.1 += size;
            files.push(FileEntry { name: file_name, path: full_path, relative_path, extension, size_bytes: size, size_display: format_size(size), parent_folder: parent, depth });
        }
    }
    let mut folder_summary: Vec<FolderSummary> = folder_map.into_iter().map(|(path, (name, file_count, total_size))| FolderSummary { name, path, file_count, total_size }).collect();
    folder_summary.sort_by(|a, b| a.name.cmp(&b.name));
    let mut extension_summary: Vec<ExtensionSummary> = ext_map.into_iter().map(|(extension, (count, total_size))| ExtensionSummary { extension, count, total_size }).collect();
    extension_summary.sort_by(|a, b| b.count.cmp(&a.count));
    Ok(ScanResult { total_files: files.len(), total_folders, total_size_bytes: total_size, total_size_display: format_size(total_size), files, folder_summary, extension_summary })
}

// ═══ Audit scan — new hierarchy: Client → Account → FY → StatementType → Month(opt) → subfolders ═══

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditRow {
    pub client: String,
    pub account: String,
    pub fy: String,
    pub month: String,
    pub statement_path: String,
    pub status: String,
    pub count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditResult {
    pub rows: Vec<AuditRow>,
    pub total_folders: usize,
    pub filled: usize,
    pub empty: usize,
    pub completion: f64,
}

fn is_junk_file(name: &str) -> bool {
    if name.starts_with('.') || name.starts_with('_') { return true; }
    let lower = name.to_lowercase();
    lower == "thumbs.db" || lower == "desktop.ini" || lower == ".ds_store" || name.starts_with("~$") || lower == "ethumbs.db"
}

fn is_month_folder(name: &str) -> bool {
    if name.len() < 2 { return false; }
    let first_two = &name[..2];
    first_two.chars().all(|c| c.is_ascii_digit()) && {
        if let Ok(n) = first_two.parse::<u32>() { (1..=12).contains(&n) } else { false }
    }
}

/// Walk a subfolder tree and collect audit rows for every leaf
fn audit_statement_tree(
    dir: &std::path::Path, client: &str, account: &str, fy: &str, month: &str,
    path_prefix: &[String], rows: &mut Vec<AuditRow>,
) {
    let entries = match std::fs::read_dir(dir) { Ok(e) => e, Err(_) => return };
    let mut sub_dirs: Vec<(String, PathBuf)> = Vec::new();
    let mut file_count: usize = 0;
    for entry in entries.flatten() {
        let path = entry.path(); let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('_') { continue; }
        if path.is_dir() { sub_dirs.push((name, path)); } else if !is_junk_file(&name) { file_count += 1; }
    }
    if sub_dirs.is_empty() && !path_prefix.is_empty() {
        rows.push(AuditRow { client: client.to_string(), account: account.to_string(), fy: fy.to_string(), month: month.to_string(),
            statement_path: path_prefix.join(" \u{2192} "), status: if file_count > 0 { "ok".to_string() } else { "empty".to_string() }, count: file_count });
        return;
    } else if !path_prefix.is_empty() && file_count > 0 {
        rows.push(AuditRow { client: client.to_string(), account: account.to_string(), fy: fy.to_string(), month: month.to_string(),
            statement_path: path_prefix.join(" \u{2192} "), status: "ok".to_string(), count: file_count });
    }
    sub_dirs.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, path) in &sub_dirs {
        let mut child_prefix = path_prefix.to_vec(); child_prefix.push(name.clone());
        audit_statement_tree(&path, client, account, fy, month, &child_prefix, rows);
    }
}

/// New hierarchy scan: Client → Account → FY → StatementType → [Month(opt)] → subfolders
#[tauri::command]
pub fn scan_audit(
    root_path: String, entity_names: Vec<String>, account_names: Vec<String>, financial_years: Vec<String>,
) -> Result<AuditResult, String> {
    let root = PathBuf::from(&root_path);
    let mut rows: Vec<AuditRow> = Vec::new();
    let dash = "\u{2014}".to_string();
    let filter_accounts = !account_names.is_empty();

    for client in &entity_names {
        let client_path = root.join(client);
        if !client_path.exists() { continue; }

        // Walk accounts
        let accounts_iter = match std::fs::read_dir(&client_path) { Ok(e) => e, Err(_) => continue };
        let mut accounts: Vec<(String, PathBuf)> = Vec::new();
        for entry in accounts_iter.flatten() {
            let path = entry.path(); let name = entry.file_name().to_string_lossy().to_string();
            if !path.is_dir() || name.starts_with('.') || name.starts_with('_') { continue; }
            if filter_accounts && !account_names.contains(&name) { continue; }
            accounts.push((name, path));
        }
        accounts.sort_by(|a, b| a.0.cmp(&b.0));

        for (account, account_path) in &accounts {
            for fy in &financial_years {
                let fy_path = account_path.join(fy);
                if !fy_path.exists() { continue; }

                // FY children are statement types
                let fy_entries = match std::fs::read_dir(&fy_path) { Ok(e) => e, Err(_) => continue };
                let mut stmt_dirs: Vec<(String, PathBuf)> = Vec::new();
                let mut fy_loose_files: usize = 0;

                for entry in fy_entries.flatten() {
                    let path = entry.path(); let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with('.') || name.starts_with('_') { continue; }
                    if path.is_dir() { stmt_dirs.push((name, path)); }
                    else if !is_junk_file(&name) { fy_loose_files += 1; }
                }

                // Loose files directly in FY folder
                if fy_loose_files > 0 {
                    rows.push(AuditRow { client: client.to_string(), account: account.to_string(), fy: fy.to_string(),
                        month: dash.clone(), statement_path: dash.clone(), status: "ok".to_string(), count: fy_loose_files });
                }

                // Walk each statement type
                stmt_dirs.sort_by(|a, b| a.0.cmp(&b.0));
                for (stmt_name, stmt_path) in &stmt_dirs {
                    // Check if this statement type has month subfolders
                    let st_entries = match std::fs::read_dir(stmt_path) { Ok(e) => e, Err(_) => continue };
                    let mut month_dirs: Vec<(String, PathBuf)> = Vec::new();
                    let mut non_month_dirs: Vec<(String, PathBuf)> = Vec::new();
                    let mut stmt_loose_files: usize = 0;

                    for entry in st_entries.flatten() {
                        let path = entry.path(); let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with('.') || name.starts_with('_') { continue; }
                        if path.is_dir() {
                            if is_month_folder(&name) { month_dirs.push((name, path)); }
                            else { non_month_dirs.push((name, path)); }
                        } else if !is_junk_file(&name) { stmt_loose_files += 1; }
                    }

                    if !month_dirs.is_empty() {
                        // Monthly statement type — walk each month
                        // First: loose files at statement type level (outside months)
                        if stmt_loose_files > 0 {
                            rows.push(AuditRow { client: client.to_string(), account: account.to_string(), fy: fy.to_string(),
                                month: dash.clone(), statement_path: stmt_name.clone(), status: "ok".to_string(), count: stmt_loose_files });
                        }
                        // Non-month subdirs at statement type level
                        non_month_dirs.sort_by(|a, b| a.0.cmp(&b.0));
                        for (name, path) in &non_month_dirs {
                            audit_statement_tree(path, client, account, fy, &dash, &[stmt_name.clone(), name.clone()], &mut rows);
                        }
                        // Month directories
                        month_dirs.sort_by(|a, b| a.0.cmp(&b.0));
                        for (month_name, month_path) in &month_dirs {
                            // Count files and subdirs inside month
                            let m_entries = match std::fs::read_dir(month_path) { Ok(e) => e, Err(_) => continue };
                            let mut m_sub_dirs: Vec<(String, PathBuf)> = Vec::new();
                            let mut m_loose: usize = 0;
                            for entry in m_entries.flatten() {
                                let path = entry.path(); let name = entry.file_name().to_string_lossy().to_string();
                                if name.starts_with('.') || name.starts_with('_') { continue; }
                                if path.is_dir() { m_sub_dirs.push((name, path)); }
                                else if !is_junk_file(&name) { m_loose += 1; }
                            }

                            if m_sub_dirs.is_empty() && m_loose == 0 { continue; } // empty month — skip

                            if m_loose > 0 && m_sub_dirs.is_empty() {
                                // Only loose files in month
                                rows.push(AuditRow { client: client.to_string(), account: account.to_string(), fy: fy.to_string(),
                                    month: month_name.to_string(), statement_path: stmt_name.clone(), status: "ok".to_string(), count: m_loose });
                            } else {
                                if m_loose > 0 {
                                    rows.push(AuditRow { client: client.to_string(), account: account.to_string(), fy: fy.to_string(),
                                        month: month_name.to_string(), statement_path: format!("{} \u{2192} Unsorted", stmt_name), status: "ok".to_string(), count: m_loose });
                                }
                                m_sub_dirs.sort_by(|a, b| a.0.cmp(&b.0));
                                for (name, path) in &m_sub_dirs {
                                    audit_statement_tree(&path, client, account, fy, month_name, &[stmt_name.clone(), name.clone()], &mut rows);
                                }
                            }
                        }
                    } else {
                        // Non-monthly statement type — files/subfolders directly under type
                        if non_month_dirs.is_empty() {
                            // Leaf: just this statement type folder
                            rows.push(AuditRow { client: client.to_string(), account: account.to_string(), fy: fy.to_string(),
                                month: dash.clone(), statement_path: stmt_name.clone(),
                                status: if stmt_loose_files > 0 { "ok".to_string() } else { "empty".to_string() }, count: stmt_loose_files });
                        } else {
                            if stmt_loose_files > 0 {
                                rows.push(AuditRow { client: client.to_string(), account: account.to_string(), fy: fy.to_string(),
                                    month: dash.clone(), statement_path: stmt_name.clone(), status: "ok".to_string(), count: stmt_loose_files });
                            }
                            non_month_dirs.sort_by(|a, b| a.0.cmp(&b.0));
                            for (name, path) in &non_month_dirs {
                                audit_statement_tree(&path, client, account, fy, &dash, &[stmt_name.clone(), name.clone()], &mut rows);
                            }
                        }
                    }
                }
            }
        }
    }

    let total = rows.len();
    let filled = rows.iter().filter(|r| r.status == "ok").count();
    let empty = total - filled;
    let completion = if total > 0 { ((filled as f64 / total as f64) * 1000.0).round() / 10.0 } else { 0.0 };

    Ok(AuditResult { rows, total_folders: total, filled, empty, completion })
}

/// List all unique statement type folder names in new hierarchy
#[tauri::command]
pub fn list_statement_types(
    root_path: String, entity_names: Vec<String>, account_names: Vec<String>, financial_years: Vec<String>,
) -> Result<Vec<String>, String> {
    let root = PathBuf::from(&root_path);
    let mut types: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    let filter_accounts = !account_names.is_empty();

    for client in &entity_names {
        let client_path = root.join(client);
        if !client_path.exists() { continue; }
        let accounts_iter = match std::fs::read_dir(&client_path) { Ok(e) => e, Err(_) => continue };
        for account_entry in accounts_iter.flatten() {
            let apath = account_entry.path(); let aname = account_entry.file_name().to_string_lossy().to_string();
            if !apath.is_dir() || aname.starts_with('.') || aname.starts_with('_') { continue; }
            if filter_accounts && !account_names.contains(&aname) { continue; }
            for fy in &financial_years {
                let fy_path = apath.join(fy);
                if !fy_path.exists() { continue; }
                if let Ok(entries) = std::fs::read_dir(&fy_path) {
                    for entry in entries.flatten() {
                        let path = entry.path(); let name = entry.file_name().to_string_lossy().to_string();
                        if path.is_dir() && !name.starts_with('.') && !name.starts_with('_') { types.insert(name); }
                    }
                }
            }
        }
    }
    Ok(types.into_iter().collect())
}

/// Generate Excel from scan audit rows — now with Account column
#[tauri::command]
pub fn generate_scan_excel(rows: Vec<AuditRow>) -> Result<String, String> {
    use rust_xlsxwriter::{Workbook, Format, Color};
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Scan Report").map_err(|e| e.to_string())?;
    let header_fmt = Format::new().set_bold().set_font_size(11.0).set_font_color(Color::White).set_background_color(Color::RGB(0x615FFF));
    let ok_fmt = Format::new().set_font_color(Color::RGB(0x1D9E75));
    let empty_fmt = Format::new().set_font_color(Color::RGB(0xE25C5C));

    let headers = ["Client", "Account", "FY", "Month", "Statement Type", "File Count"];
    let widths: [f64; 6] = [18.0, 18.0, 14.0, 14.0, 25.0, 12.0];
    for (col, (h, w)) in headers.iter().zip(widths.iter()).enumerate() {
        sheet.set_column_width(col as u16, *w).map_err(|e| e.to_string())?;
        sheet.write_string_with_format(0, col as u16, *h, &header_fmt).map_err(|e| e.to_string())?;
    }
    let mut sorted = rows.clone();
    sorted.sort_by(|a, b| a.client.cmp(&b.client).then(a.account.cmp(&b.account)).then(a.fy.cmp(&b.fy)).then(a.month.cmp(&b.month)).then(a.statement_path.cmp(&b.statement_path)));
    for (i, row) in sorted.iter().enumerate() {
        let r = (i + 1) as u32;
        sheet.write_string(r, 0, &row.client).map_err(|e| e.to_string())?;
        sheet.write_string(r, 1, &row.account).map_err(|e| e.to_string())?;
        sheet.write_string(r, 2, &row.fy).map_err(|e| e.to_string())?;
        sheet.write_string(r, 3, &row.month).map_err(|e| e.to_string())?;
        sheet.write_string(r, 4, &row.statement_path).map_err(|e| e.to_string())?;
        let fmt = if row.count > 0 { &ok_fmt } else { &empty_fmt };
        sheet.write_number_with_format(r, 5, row.count as f64, fmt).map_err(|e| e.to_string())?;
    }
    let temp_dir = std::env::temp_dir();
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("Kredo_Report_{}.xlsx", timestamp);
    let filepath = temp_dir.join(&filename);
    workbook.save(filepath.to_str().unwrap_or("report.xlsx")).map_err(|e| e.to_string())?;
    Ok(filepath.to_string_lossy().to_string())
}
