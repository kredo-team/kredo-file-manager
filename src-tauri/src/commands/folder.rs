use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderResult {
    pub success: bool,
    pub message: String,
    pub created: Vec<String>,
    pub skipped: Vec<String>,
}

fn root_dir(root_path: &str) -> PathBuf {
    let p = PathBuf::from(root_path);
    fs::create_dir_all(&p).ok();
    p
}

fn is_junk_file(name: &str) -> bool {
    if name.starts_with('.') || name.starts_with('_') { return true; }
    let lower = name.to_lowercase();
    lower == "thumbs.db" || lower == "desktop.ini" || lower == ".ds_store"
        || name.starts_with("~$") || lower == "ethumbs.db"
}

fn month_folders(financial_year: &str) -> Vec<String> {
    let parts: Vec<&str> = financial_year.split_whitespace().collect();
    let year_part = if parts.len() > 1 { parts[1] } else { parts[0] };
    let year_split: Vec<&str> = year_part.split('-').collect();
    let start_year: u32 = year_split[0].parse().unwrap_or(2026);
    let end_year: u32 = if year_split.len() > 1 {
        let short = year_split[1].parse::<u32>().unwrap_or(0);
        if short < 100 { (start_year / 100) * 100 + short } else { short }
    } else { start_year + 1 };
    vec![
        format!("01 Apr {}", start_year), format!("02 May {}", start_year),
        format!("03 Jun {}", start_year), format!("04 Jul {}", start_year),
        format!("05 Aug {}", start_year), format!("06 Sep {}", start_year),
        format!("07 Oct {}", start_year), format!("08 Nov {}", start_year),
        format!("09 Dec {}", start_year), format!("10 Jan {}", end_year),
        format!("11 Feb {}", end_year),  format!("12 Mar {}", end_year),
    ]
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SelectedFolderNode {
    pub name: String,
    #[serde(default)]
    pub children: Vec<SelectedFolderNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SelectedStatementType {
    pub name: String,
    #[serde(default)]
    pub monthly: bool,
    #[serde(default)]
    pub folders: Vec<SelectedFolderNode>,
}

fn create_tree(parent: &PathBuf, nodes: &[SelectedFolderNode], created: &mut Vec<String>, skipped: &mut Vec<String>) -> Result<(), String> {
    for node in nodes {
        let path = parent.join(&node.name);
        if !path.exists() {
            fs::create_dir_all(&path).map_err(|e| format!("Failed to create '{}': {}", node.name, e))?;
            created.push(node.name.clone());
        } else { skipped.push(node.name.clone()); }
        if !node.children.is_empty() { create_tree(&path, &node.children, created, skipped)?; }
    }
    Ok(())
}

/// Create folders: Client -> Account -> FY -> StatementType -> Month(optional) -> subfolders
#[tauri::command]
pub fn create_folders(
    root_path: String, entity_name: String, account_name: String,
    financial_year: String, statement_types: Vec<SelectedStatementType>,
) -> Result<FolderResult, String> {
    let root = root_dir(&root_path);
    let mut created: Vec<String> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();

    let client_path = root.join(&entity_name);
    if !client_path.exists() { fs::create_dir_all(&client_path).map_err(|e| format!("Failed: {}", e))?; created.push(entity_name.clone()); }
    else { skipped.push(entity_name.clone()); }

    let account_path = client_path.join(&account_name);
    if !account_path.exists() { fs::create_dir_all(&account_path).map_err(|e| format!("Failed: {}", e))?; created.push(account_name.clone()); }
    else { skipped.push(account_name.clone()); }

    let fy_path = account_path.join(&financial_year);
    if !fy_path.exists() { fs::create_dir_all(&fy_path).map_err(|e| format!("Failed: {}", e))?; created.push(financial_year.clone()); }
    else { skipped.push(financial_year.clone()); }

    for st in &statement_types {
        let st_path = fy_path.join(&st.name);
        if !st_path.exists() { fs::create_dir_all(&st_path).map_err(|e| format!("Failed: {}", e))?; created.push(st.name.clone()); }
        else { skipped.push(st.name.clone()); }

        if st.monthly {
            let months = month_folders(&financial_year);
            for month in &months {
                let mp = st_path.join(month);
                if !mp.exists() { fs::create_dir_all(&mp).map_err(|e| format!("Failed: {}", e))?; created.push(month.to_string()); }
                else { skipped.push(month.to_string()); }
                if !st.folders.is_empty() { create_tree(&mp, &st.folders, &mut created, &mut skipped)?; }
            }
        } else if !st.folders.is_empty() {
            create_tree(&st_path, &st.folders, &mut created, &mut skipped)?;
        }
    }

    Ok(FolderResult { success: true, message: format!("Created {} folders, skipped {}", created.len(), skipped.len()), created, skipped })
}

#[tauri::command]
pub fn path_exists(path: String) -> bool { Path::new(&path).exists() }

#[tauri::command]
pub fn list_entities(root_path: String) -> Result<Vec<String>, String> {
    let root = root_dir(&root_path);
    if !root.exists() { return Ok(Vec::new()); }
    let mut entities: Vec<String> = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| format!("Failed: {}", e))?.flatten() {
        if entry.path().is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') && !name.starts_with('_') { entities.push(name); }
        }
    }
    entities.sort();
    Ok(entities)
}

/// List account folders under root/client/ for given clients
#[tauri::command]
pub fn list_accounts(root_path: String, entity_names: Vec<String>) -> Result<Vec<String>, String> {
    let root = root_dir(&root_path);
    let entities = if entity_names.is_empty() { list_entities(root_path.clone())? } else { entity_names };
    let mut set: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for entity in &entities {
        if let Ok(entries) = fs::read_dir(root.join(entity)) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') && !name.starts_with('_') { set.insert(name); }
                }
            }
        }
    }
    Ok(set.into_iter().collect())
}

/// List FY folders under root/client/ (walks through accounts)
#[tauri::command]
pub fn list_financial_years(root_path: String, entity_name: String) -> Result<Vec<String>, String> {
    let entity_path = root_dir(&root_path).join(&entity_name);
    if !entity_path.exists() { return Ok(Vec::new()); }
    let mut years: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    if let Ok(accounts) = fs::read_dir(&entity_path) {
        for account in accounts.flatten() {
            if !account.path().is_dir() { continue; }
            let aname = account.file_name().to_string_lossy().to_string();
            if aname.starts_with('.') || aname.starts_with('_') { continue; }
            if let Ok(fys) = fs::read_dir(account.path()) {
                for fy in fys.flatten() {
                    if fy.path().is_dir() {
                        let fname = fy.file_name().to_string_lossy().to_string();
                        if !fname.starts_with('.') && !fname.starts_with('_') { years.insert(fname); }
                    }
                }
            }
        }
    }
    Ok(years.into_iter().collect())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnsortedFile { pub name: String, pub path: String }

#[tauri::command]
pub fn list_unsorted_files(root_path: String, entity_name: String, account_name: String, financial_year: String) -> Result<Vec<UnsortedFile>, String> {
    let fy_path = root_dir(&root_path).join(&entity_name).join(&account_name).join(&financial_year);
    if !fy_path.exists() { return Ok(Vec::new()); }
    let mut files: Vec<UnsortedFile> = Vec::new();
    for entry in fs::read_dir(&fy_path).map_err(|e| format!("Failed: {}", e))?.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                files.push(UnsortedFile { name: name.to_string(), path: path.to_string_lossy().to_string() });
            }
        }
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MoveResult { pub moved: usize, pub failed: Vec<String> }

#[tauri::command]
pub fn move_unsorted_files(root_path: String, entity_name: String, account_name: String, financial_year: String) -> Result<MoveResult, String> {
    let fy_path = root_dir(&root_path).join(&entity_name).join(&account_name).join(&financial_year);
    let unsorted_dir = fy_path.join("_Unsorted");
    let mut files_to_move: Vec<(PathBuf, String)> = Vec::new();
    for entry in fs::read_dir(&fy_path).map_err(|e| format!("Failed: {}", e))?.flatten() {
        let path = entry.path();
        if path.is_file() { if let Some(name) = path.file_name().and_then(|n| n.to_str()) { files_to_move.push((path.clone(), name.to_string())); } }
    }
    if files_to_move.is_empty() { return Ok(MoveResult { moved: 0, failed: Vec::new() }); }
    fs::create_dir_all(&unsorted_dir).map_err(|e| format!("Failed: {}", e))?;
    let mut moved: usize = 0;
    let mut failed: Vec<String> = Vec::new();
    for (src, name) in &files_to_move {
        let dest = unsorted_dir.join(name);
        match fs::rename(src, &dest) {
            Ok(_) => moved += 1,
            Err(_) => match fs::copy(src, &dest) {
                Ok(_) => { if fs::remove_file(src).is_ok() { moved += 1; } else { let _ = fs::remove_file(&dest); failed.push(name.clone()); } }
                Err(_) => failed.push(name.clone()),
            }
        }
    }
    Ok(MoveResult { moved, failed })
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| format!("Failed: {}", e))?; }
    #[cfg(not(target_os = "windows"))]
    { std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| format!("Failed: {}", e))?; }
    Ok(())
}

/// List all unique FYs across clients and accounts
#[tauri::command]
pub fn list_all_financial_years(root_path: String, entity_names: Vec<String>, account_names: Vec<String>) -> Result<Vec<String>, String> {
    let root = root_dir(&root_path);
    let entities = if entity_names.is_empty() {
        let mut all: Vec<String> = Vec::new();
        if let Ok(entries) = fs::read_dir(&root) { for e in entries.flatten() { if e.path().is_dir() { let n = e.file_name().to_string_lossy().to_string(); if !n.starts_with('.') && !n.starts_with('_') { all.push(n); } } } }
        all
    } else { entity_names };
    let filter_accounts = !account_names.is_empty();
    let mut fy_set: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for entity in &entities {
        if let Ok(accounts) = fs::read_dir(root.join(entity)) {
            for account in accounts.flatten() {
                if !account.path().is_dir() { continue; }
                let aname = account.file_name().to_string_lossy().to_string();
                if aname.starts_with('.') || aname.starts_with('_') { continue; }
                if filter_accounts && !account_names.contains(&aname) { continue; }
                if let Ok(fys) = fs::read_dir(account.path()) {
                    for fy in fys.flatten() { if fy.path().is_dir() { let fname = fy.file_name().to_string_lossy().to_string(); if !fname.starts_with('.') && !fname.starts_with('_') { fy_set.insert(fname); } } }
                }
            }
        }
    }
    Ok(fy_set.into_iter().collect())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ZipResult { pub success: bool, pub message: String, pub file_count: usize, pub total_size: u64 }

#[tauri::command]
pub fn export_zip(root_path: String, entity_name: String, account_name: String, financial_year: String, save_path: String) -> Result<ZipResult, String> {
    let source = root_dir(&root_path).join(&entity_name).join(&account_name).join(&financial_year);
    if !source.exists() { return Err(format!("Directory not found")); }
    let zip_file = fs::File::create(&save_path).map_err(|e| format!("Could not create zip: {}", e))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut file_count: usize = 0;
    let mut total_size: u64 = 0;
    fn add_dir(zip: &mut zip::ZipWriter<fs::File>, options: &zip::write::SimpleFileOptions, dir: &Path, base: &Path, fc: &mut usize, ts: &mut u64) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| format!("{}", e))?.flatten() {
            let path = entry.path();
            let relative = path.strip_prefix(base).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
            if path.is_dir() { zip.add_directory(&format!("{}/", relative), *options).map_err(|e| e.to_string())?; add_dir(zip, options, &path, base, fc, ts)?; }
            else { let data = fs::read(&path).map_err(|e| e.to_string())?; *ts += data.len() as u64; *fc += 1; zip.start_file(&relative, *options).map_err(|e| e.to_string())?; use std::io::Write; zip.write_all(&data).map_err(|e| e.to_string())?; }
        }
        Ok(())
    }
    add_dir(&mut zip, &options, &source, &source, &mut file_count, &mut total_size)?;
    zip.finish().map_err(|e| e.to_string())?;
    let sd = if total_size < 1024 { format!("{} B", total_size) } else if total_size < 1048576 { format!("{:.1} KB", total_size as f64 / 1024.0) } else { format!("{:.1} MB", total_size as f64 / 1048576.0) };
    Ok(ZipResult { success: true, message: format!("Exported {} files ({})", file_count, sd), file_count, total_size })
}

// ═══ Upload & Organize ═══

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TreeNode { pub name: String, pub path: String, pub full_path: String, pub depth: usize, pub is_expanded: bool, pub has_children: bool, pub file_count: usize }

#[tauri::command]
pub fn browse_data_tree(root_path: String) -> Result<Vec<TreeNode>, String> {
    let root = root_dir(&root_path);
    if !root.exists() { return Ok(Vec::new()); }
    let mut nodes: Vec<TreeNode> = Vec::new();
    walk_tree(&root, &root, 0, &mut nodes)?;
    Ok(nodes)
}

fn walk_tree(dir: &Path, base: &Path, depth: usize, nodes: &mut Vec<TreeNode>) -> Result<(), String> {
    let mut entries: Vec<(String, PathBuf)> = Vec::new();
    for e in fs::read_dir(dir).map_err(|e| format!("{}", e))?.flatten() {
        let p = e.path(); let n = e.file_name().to_string_lossy().to_string();
        if n.starts_with('.') || n.starts_with('_') || !p.is_dir() { continue; }
        entries.push((n, p));
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, path) in &entries {
        let relative = path.strip_prefix(base).unwrap_or(path).to_string_lossy().to_string();
        let full = path.to_string_lossy().to_string();
        let mut file_count: usize = 0; let mut has_children = false;
        if let Ok(children) = fs::read_dir(path) {
            for child in children.flatten() {
                let cp = child.path();
                if cp.is_dir() { let cn = child.file_name().to_string_lossy().to_string(); if !cn.starts_with('.') && !cn.starts_with('_') { has_children = true; } }
                else { let cn = child.file_name().to_string_lossy().to_string(); if !is_junk_file(&cn) { file_count += 1; } }
            }
        }
        nodes.push(TreeNode { name: name.clone(), path: relative.replace('\\', "/"), full_path: full, depth, is_expanded: false, has_children, file_count });
        walk_tree(path, base, depth + 1, nodes)?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileItem { pub name: String, pub full_path: String, pub extension: String, pub size_bytes: u64, pub size_display: String, pub modified: String, pub is_folder: bool, pub item_count: usize }

#[tauri::command]
pub fn list_folder_files(folder_path: String) -> Result<Vec<FileItem>, String> {
    let dir = PathBuf::from(&folder_path);
    if !dir.exists() { return Err("Folder does not exist".to_string()); }
    let mut items: Vec<FileItem> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("{}", e))?.flatten() {
        let path = entry.path(); let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if name.starts_with('.') || name.starts_with('_') { continue; }
            let ic = fs::read_dir(&path).map(|rd| rd.flatten().filter(|e| { let n = e.file_name().to_string_lossy().to_string(); !n.starts_with('.') && !n.starts_with('_') && !is_junk_file(&n) }).count()).unwrap_or(0);
            let modified = fs::metadata(&path).ok().and_then(|m| m.modified().ok()).map(|t| { let dt: chrono::DateTime<chrono::Local> = t.into(); dt.format("%d %b %Y").to_string() }).unwrap_or_default();
            items.push(FileItem { name, full_path: path.to_string_lossy().to_string(), extension: String::new(), size_bytes: 0, size_display: format!("{} item{}", ic, if ic != 1 { "s" } else { "" }), modified, is_folder: true, item_count: ic });
        } else {
            if is_junk_file(&name) { continue; }
            let meta = fs::metadata(&path).ok(); let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta.as_ref().and_then(|m| m.modified().ok()).map(|t| { let dt: chrono::DateTime<chrono::Local> = t.into(); dt.format("%d %b %Y").to_string() }).unwrap_or_default();
            let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            let sd = if size < 1024 { format!("{} B", size) } else if size < 1048576 { format!("{:.1} KB", size as f64 / 1024.0) } else { format!("{:.1} MB", size as f64 / 1048576.0) };
            items.push(FileItem { name, full_path: path.to_string_lossy().to_string(), extension: ext, size_bytes: size, size_display: sd, modified, is_folder: false, item_count: 0 });
        }
    }
    items.sort_by(|a, b| match (a.is_folder, b.is_folder) { (true, false) => std::cmp::Ordering::Less, (false, true) => std::cmp::Ordering::Greater, _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()) });
    Ok(items)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UploadResult { pub copied: usize, pub failed: usize, pub message: String }

#[tauri::command]
pub fn upload_files_to_folder(source_paths: Vec<String>, destination_folder: String) -> Result<UploadResult, String> {
    let dest = PathBuf::from(&destination_folder);
    if !dest.exists() { return Err("Destination folder does not exist".to_string()); }
    let mut copied: usize = 0; let mut failed: usize = 0;
    for sp in &source_paths {
        let src = PathBuf::from(sp);
        if !src.exists() || !src.is_file() { failed += 1; continue; }
        let fname = src.file_name().unwrap_or_default(); let mut target = dest.join(fname);
        if target.exists() {
            let stem = target.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = target.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            let mut c = 1; loop { target = dest.join(format!("{} ({}){}", stem, c, ext)); if !target.exists() { break; } c += 1; }
        }
        match fs::copy(&src, &target) { Ok(_) => copied += 1, Err(_) => failed += 1 }
    }
    let total = source_paths.len();
    let msg = if failed == 0 { format!("Uploaded {} file{}", copied, if copied != 1 { "s" } else { "" }) } else { format!("Uploaded {} of {} ({} failed)", copied, total, failed) };
    Ok(UploadResult { copied, failed, message: msg })
}

#[tauri::command]
pub fn delete_files(file_paths: Vec<String>) -> Result<String, String> {
    let mut d = 0; let mut e = 0;
    for p in &file_paths { match fs::remove_file(p) { Ok(_) => d += 1, Err(_) => e += 1 } }
    if e > 0 { Ok(format!("Deleted {}, {} failed", d, e)) } else { Ok(format!("Deleted {} file{}", d, if d != 1 { "s" } else { "" })) }
}

#[tauri::command]
pub fn open_file_default(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { std::process::Command::new("cmd").args(["/C", "start", "", &file_path]).spawn().map_err(|e| format!("{}", e))?; }
    #[cfg(not(target_os = "windows"))]
    { std::process::Command::new("xdg-open").arg(&file_path).spawn().map_err(|e| format!("{}", e))?; }
    Ok(())
}

#[tauri::command]
pub fn create_subfolder(parent_path: String, folder_name: String) -> Result<String, String> {
    let name = folder_name.trim().to_string();
    if name.is_empty() { return Err("Folder name cannot be empty".to_string()); }
    if name.contains('/') || name.contains('\\') || name.contains(':') || name.contains('*') || name.contains('?') || name.contains('"') || name.contains('<') || name.contains('>') || name.contains('|') {
        return Err("Folder name contains invalid characters".to_string());
    }
    let parent = PathBuf::from(&parent_path);
    if !parent.exists() { return Err("Parent folder does not exist".to_string()); }
    let nf = parent.join(&name);
    if nf.exists() { return Err(format!("Folder '{}' already exists", name)); }
    fs::create_dir(&nf).map_err(|e| format!("Failed: {}", e))?;
    Ok(nf.to_string_lossy().to_string())
}
