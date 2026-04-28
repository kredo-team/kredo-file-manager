use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub extension: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub parent_folder: String,
    pub depth: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanResult {
    pub total_files: usize,
    pub total_folders: usize,
    pub total_size_bytes: u64,
    pub total_size_display: String,
    pub files: Vec<FileEntry>,
    pub folder_summary: Vec<FolderSummary>,
    pub extension_summary: Vec<ExtensionSummary>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderSummary {
    pub name: String,
    pub path: String,
    pub file_count: usize,
    pub total_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtensionSummary {
    pub extension: String,
    pub count: usize,
    pub total_size: u64,
}

fn format_size(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    let units = ["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    let mut unit_idx = 0;
    while size >= 1024.0 && unit_idx < units.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }
    if unit_idx == 0 {
        format!("{} {}", bytes, units[unit_idx])
    } else {
        format!("{:.1} {}", size, units[unit_idx])
    }
}

/// Scan all files recursively under a given path
#[tauri::command]
pub fn scan_directory(
    root_path: String,
    entity_name: String,
    financial_year: String,
) -> Result<ScanResult, String> {
    let scan_path = PathBuf::from(&root_path)
        .join("data")
        .join(&entity_name)
        .join(&financial_year);

    if !scan_path.exists() {
        return Err(format!("Path does not exist: {}", scan_path.display()));
    }

    let mut files: Vec<FileEntry> = Vec::new();
    let mut total_folders: usize = 0;
    let mut total_size: u64 = 0;
    let mut folder_map: std::collections::HashMap<String, (String, usize, u64)> =
        std::collections::HashMap::new();
    let mut ext_map: std::collections::HashMap<String, (usize, u64)> =
        std::collections::HashMap::new();

    let base_str = scan_path.to_string_lossy().to_string();

    for entry in WalkDir::new(&scan_path)
        .min_depth(0)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let depth = entry.depth();

        if path.is_dir() {
            if depth > 0 {
                total_folders += 1;
                let folder_name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let folder_path = path.to_string_lossy().to_string();
                folder_map.insert(
                    folder_path.clone(),
                    (folder_name, 0, 0),
                );
            }
            continue;
        }

        if let Ok(metadata) = entry.metadata() {
            let size = metadata.len();
            total_size += size;

            let file_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let extension = path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();

            let full_path = path.to_string_lossy().to_string();
            let relative_path = full_path
                .strip_prefix(&base_str)
                .unwrap_or(&full_path)
                .trim_start_matches(std::path::MAIN_SEPARATOR)
                .to_string();

            let parent = path
                .parent()
                .unwrap_or(path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // Update folder summary
            let parent_path = path
                .parent()
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            if let Some(entry) = folder_map.get_mut(&parent_path) {
                entry.1 += 1;
                entry.2 += size;
            }

            // Update extension summary
            let ext_key = if extension.is_empty() {
                "no extension".to_string()
            } else {
                extension.clone()
            };
            let ext_entry = ext_map.entry(ext_key).or_insert((0, 0));
            ext_entry.0 += 1;
            ext_entry.1 += size;

            files.push(FileEntry {
                name: file_name,
                path: full_path,
                relative_path,
                extension,
                size_bytes: size,
                size_display: format_size(size),
                parent_folder: parent,
                depth,
            });
        }
    }

    let mut folder_summary: Vec<FolderSummary> = folder_map
        .into_iter()
        .map(|(path, (name, file_count, total_size))| FolderSummary {
            name,
            path,
            file_count,
            total_size,
        })
        .collect();
    folder_summary.sort_by(|a, b| a.name.cmp(&b.name));

    let mut extension_summary: Vec<ExtensionSummary> = ext_map
        .into_iter()
        .map(|(extension, (count, total_size))| ExtensionSummary {
            extension,
            count,
            total_size,
        })
        .collect();
    extension_summary.sort_by(|a, b| b.count.cmp(&a.count));

    Ok(ScanResult {
        total_files: files.len(),
        total_folders,
        total_size_bytes: total_size,
        total_size_display: format_size(total_size),
        files,
        folder_summary,
        extension_summary,
    })
}


// ═══ Audit scan (bulletproof) ═══

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditRow {
    pub client: String,
    pub month: String,         // "01 Apr 2026" or "—" for FY-level
    pub statement_path: String, // "Bank Statement → SBI" or "—" or "Unsorted"
    pub status: String,         // "ok" or "empty"
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

/// Count direct files (non-hidden, non-system) in a directory
fn count_direct_files(dir: &std::path::Path) -> usize {
    std::fs::read_dir(dir).map(|entries| {
        entries.flatten().filter(|e| {
            e.path().is_file() && !is_junk_file(&e.file_name().to_string_lossy())
        }).count()
    }).unwrap_or(0)
}

/// Check if a file is system junk / temp that should be ignored
fn is_junk_file(name: &str) -> bool {
    if name.starts_with('.') || name.starts_with('_') { return true; }
    let lower = name.to_lowercase();
    lower == "thumbs.db" || lower == "desktop.ini" || lower == ".ds_store"
        || name.starts_with("~$") // Office temp files
        || lower == "ethumbs.db"
}

/// Check if name looks like a month folder (starts with 01-12)
fn is_month_folder(name: &str) -> bool {
    if name.len() < 2 { return false; }
    let first_two = &name[..2];
    first_two.chars().all(|c| c.is_ascii_digit()) && {
        if let Ok(n) = first_two.parse::<u32>() { (1..=12).contains(&n) } else { false }
    }
}

/// Walk a statement-type directory tree and collect audit rows for every leaf
fn audit_statement_tree(
    dir: &std::path::Path,
    client: &str,
    month: &str,
    path_prefix: &[String],
    rows: &mut Vec<AuditRow>,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut sub_dirs: Vec<(String, PathBuf)> = Vec::new();
    let mut file_count: usize = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('_') { continue; }
        if path.is_dir() {
            sub_dirs.push((name, path));
        } else if !is_junk_file(&name) {
            file_count += 1;
        }
    }

    // Leaf folder — report it
    if sub_dirs.is_empty() && !path_prefix.is_empty() {
        rows.push(AuditRow {
            client: client.to_string(),
            month: month.to_string(),
            statement_path: path_prefix.join(" \u{2192} "),
            status: if file_count > 0 { "ok".to_string() } else { "empty".to_string() },
            count: file_count,
        });
    } else if !path_prefix.is_empty() && file_count > 0 {
        // Non-leaf but has direct files — report those too
        rows.push(AuditRow {
            client: client.to_string(),
            month: month.to_string(),
            statement_path: path_prefix.join(" \u{2192} "),
            status: "ok".to_string(),
            count: file_count,
        });
    }

    sub_dirs.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, path) in &sub_dirs {
        let mut child_prefix = path_prefix.to_vec();
        child_prefix.push(name.clone());
        audit_statement_tree(&path, client, month, &child_prefix, rows);
    }
}

/// Scan a month directory: count loose files + walk statement type sub-dirs
fn audit_month(
    month_path: &std::path::Path,
    client: &str,
    month_name: &str,
    rows: &mut Vec<AuditRow>,
) {
    let entries = match std::fs::read_dir(month_path) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut sub_dirs: Vec<(String, PathBuf)> = Vec::new();
    let mut loose_files: usize = 0;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with('_') { continue; }
        if path.is_dir() {
            sub_dirs.push((name, path));
        } else if !is_junk_file(&name) {
            loose_files += 1;
        }
    }

    // Completely empty month → report so it counts in denominator
    if sub_dirs.is_empty() && loose_files == 0 {
        rows.push(AuditRow {
            client: client.to_string(),
            month: month_name.to_string(),
            statement_path: "\u{2014}".to_string(),
            status: "empty".to_string(),
            count: 0,
        });
        return;
    }

    // Loose files in month folder → "Unsorted"
    if loose_files > 0 {
        rows.push(AuditRow {
            client: client.to_string(),
            month: month_name.to_string(),
            statement_path: "Unsorted".to_string(),
            status: "ok".to_string(),
            count: loose_files,
        });
    }

    // Walk statement type sub-directories
    sub_dirs.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, path) in &sub_dirs {
        audit_statement_tree(&path, client, month_name, &[name.clone()], rows);
    }
}

#[tauri::command]
pub fn scan_audit(
    root_path: String,
    entity_names: Vec<String>,
    financial_year: String,
) -> Result<AuditResult, String> {
    let data = PathBuf::from(&root_path).join("data");
    let mut rows: Vec<AuditRow> = Vec::new();
    let dash = "\u{2014}".to_string(); // em-dash

    for client in &entity_names {
        let fy_path = data.join(client).join(&financial_year);
        if !fy_path.exists() { continue; }

        let entries = std::fs::read_dir(&fy_path)
            .map_err(|e| format!("Cannot read {}: {}", fy_path.display(), e))?;

        let mut month_dirs: Vec<(String, PathBuf)> = Vec::new();
        let mut non_month_dirs: Vec<(String, PathBuf)> = Vec::new();
        let mut fy_loose_files: usize = 0;

        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name.starts_with('_') { continue; }

            if path.is_dir() {
                if is_month_folder(&name) {
                    month_dirs.push((name, path));
                } else {
                    non_month_dirs.push((name, path));
                }
            } else if !is_junk_file(&name) {
                fy_loose_files += 1;
            }
        }

        // 1. Loose files directly in FY folder → month="—", type="—"
        if fy_loose_files > 0 {
            rows.push(AuditRow {
                client: client.to_string(),
                month: dash.clone(),
                statement_path: dash.clone(),
                status: "ok".to_string(),
                count: fy_loose_files,
            });
        }

        // 2. Non-month directories (Notes, Archives, etc.) → month="—", type=folder name
        non_month_dirs.sort_by(|a, b| a.0.cmp(&b.0));
        for (name, path) in &non_month_dirs {
            audit_statement_tree(&path, client, &dash, &[name.clone()], &mut rows);
        }

        // 3. Month directories — normal flow
        month_dirs.sort_by(|a, b| a.0.cmp(&b.0));
        for (month_name, month_path) in &month_dirs {
            audit_month(&month_path, client, month_name, &mut rows);
        }
    }

    // Smart completion: if a client has month-based rows, exclude FY-level ("—") rows
    // from the completion calculation so loose files don't inflate the percentage
    let clients_with_months: std::collections::HashSet<&String> = entity_names.iter()
        .filter(|c| rows.iter().any(|r| r.client == **c && r.month != dash))
        .collect();

    let completion_rows: Vec<&AuditRow> = rows.iter().filter(|r| {
        // If this client has month rows, exclude FY-level rows from completion
        if clients_with_months.contains(&r.client) && r.month == dash {
            return false;
        }
        true
    }).collect();

    let total = rows.len();
    let comp_total = completion_rows.len();
    let comp_filled = completion_rows.iter().filter(|r| r.status == "ok").count();
    let filled = rows.iter().filter(|r| r.status == "ok").count();
    let empty = total - filled;
    let completion = if comp_total > 0 { (comp_filled as f64 / comp_total as f64) * 100.0 } else { 0.0 };

    Ok(AuditResult {
        rows,
        total_folders: total,
        filled,
        empty,
        completion: (completion * 10.0).round() / 10.0,
    })
}
