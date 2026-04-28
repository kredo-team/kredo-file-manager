use crate::commands::settings::{FolderNode, StatementType};
use calamine::{open_workbook, Reader, Xlsx};
use rust_xlsxwriter::{Color, Format, Workbook};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const TEMPLATE_VERSION: &str = "1.0";

// ═══ Import result struct ═══

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ImportResult {
    pub client_name: String,
    pub financial_year: String,
    pub structure: String, // "month_wise" or "fy_only"
    pub statement_types: Vec<StatementType>,
    pub warnings: Vec<String>,
}

// ═══ Config keys ═══
const KEY_VERSION: &str = "Template Version";
const KEY_CLIENT: &str = "Client Name";
const KEY_FY: &str = "Financial Year";
const KEY_STRUCTURE: &str = "Structure";
const HEADER_SEPARATOR: &str = "---";

// ═══ Generate template ═══

#[tauri::command]
pub fn generate_template(
    save_path: String,
    client_name: String,
    financial_year: String,
    structure: String,
) -> Result<String, String> {
    let mut workbook = Workbook::new();

    // ═══ Data sheet ═══
    let sheet = workbook.add_worksheet();
    sheet.set_name("Folder Structure").map_err(|e| e.to_string())?;

    let key_fmt = Format::new()
        .set_bold()
        .set_font_size(11.0)
        .set_font_color(Color::RGB(0x615FFF));

    let val_fmt = Format::new().set_font_size(11.0);

    let header_fmt = Format::new()
        .set_bold()
        .set_font_size(11.0)
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x615FFF));

    let sep_fmt = Format::new()
        .set_font_color(Color::RGB(0xCCCCCC))
        .set_font_size(9.0);

    let example_fmt = Format::new()
        .set_italic()
        .set_font_color(Color::RGB(0x999999));

    // Column widths
    for col in 0..6u16 {
        sheet.set_column_width(col, 22).map_err(|e| e.to_string())?;
    }

    // Row 0-3: Config header (key-value pairs)
    let structure_display = if structure == "month_wise" { "Month-wise" } else { "FY only" };
    let config_rows: Vec<(&str, &str)> = vec![
        (KEY_VERSION, TEMPLATE_VERSION),
        (KEY_CLIENT, &client_name),
        (KEY_FY, &financial_year),
        (KEY_STRUCTURE, structure_display),
    ];

    for (row, (key, value)) in config_rows.iter().enumerate() {
        sheet.write_string_with_format(row as u32, 0, *key, &key_fmt)
            .map_err(|e| e.to_string())?;
        sheet.write_string_with_format(row as u32, 1, *value, &val_fmt)
            .map_err(|e| e.to_string())?;
    }

    // Row 4: Separator
    sheet.write_string_with_format(4, 0, HEADER_SEPARATOR, &sep_fmt)
        .map_err(|e| e.to_string())?;

    // Row 5: Column headers
    let headers = ["Statement Type", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5"];
    for (col, h) in headers.iter().enumerate() {
        sheet.write_string_with_format(5, col as u16, *h, &header_fmt)
            .map_err(|e| e.to_string())?;
    }

    // Row 6+: Example rows
    let examples = vec![
        vec!["Bank Statement", "SBI", "Current Account", "", "", ""],
        vec!["Bank Statement", "SBI", "Savings Account", "", "", ""],
        vec!["Bank Statement", "ICICI", "", "", "", ""],
        vec!["GSTR-1", "Filed", "", "", "", ""],
        vec!["GSTR-1", "Pending", "", "", "", ""],
        vec!["ITC", "", "", "", "", ""],
    ];

    for (row, example) in examples.iter().enumerate() {
        for (col, val) in example.iter().enumerate() {
            if !val.is_empty() {
                sheet.write_string_with_format((row + 6) as u32, col as u16, *val, &example_fmt)
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    // ═══ Instructions sheet ═══
    let instr = workbook.add_worksheet();
    instr.set_name("Instructions").map_err(|e| e.to_string())?;
    instr.set_column_width(0, 80).map_err(|e| e.to_string())?;

    let title_fmt = Format::new()
        .set_bold()
        .set_font_size(14.0)
        .set_font_color(Color::RGB(0x615FFF));

    let body_fmt = Format::new().set_font_size(11.0);

    let instructions: Vec<(&str, bool)> = vec![
        ("Kredo File Manager — Template Guide", true),
        ("", false),
        ("Configuration (Rows 1-4):", true),
        ("Row 1: Template Version — do not change this value", false),
        ("Row 2: Client Name — the client/entity this config belongs to", false),
        ("Row 3: Financial Year — e.g., FY 2026-27", false),
        ("Row 4: Structure — either 'Month-wise' or 'FY only'", false),
        ("", false),
        ("Folder Structure (Row 6 onwards):", true),
        ("Column A (Statement Type): The type name (e.g., Bank Statement, GSTR-1)", false),
        ("Columns B-F (Level 1-5): Sub-folder names, filled left to right", false),
        ("", false),
        ("Rules:", true),
        ("- Each row represents one folder path", false),
        ("- Leave Level columns empty for a type-only folder (no sub-folders)", false),
        ("- Multiple rows with the same Statement Type create multiple sub-folders", false),
        ("- Delete the grey example rows before importing", false),
        ("- Row 5 (---) is a separator — do not remove it", false),
        ("- Duplicate paths are ignored during import", false),
        ("", false),
        ("Example:", true),
        ("Bank Statement | SBI | Current Account → creates Bank Statement/SBI/Current Account/", false),
        ("Bank Statement | HDFC |               → creates Bank Statement/HDFC/", false),
        ("ITC            |     |               → creates ITC/ (type-only)", false),
    ];

    for (row, (text, is_title)) in instructions.iter().enumerate() {
        if !text.is_empty() {
            let fmt = if *is_title { &title_fmt } else { &body_fmt };
            instr.write_string_with_format(row as u32, 0, *text, fmt)
                .map_err(|e| e.to_string())?;
        }
    }

    workbook.save(&save_path).map_err(|e| format!("Failed to save: {}", e))?;
    Ok(save_path)
}

// ═══ Parse import ═══

#[tauri::command]
pub fn parse_import(file_path: String) -> Result<ImportResult, String> {
    let mut workbook: Xlsx<_> = open_workbook(&file_path)
        .map_err(|e| format!("Could not read this file. Please use a .xlsx Excel file. ({})", e))?;

    let sheet_name = workbook.sheet_names()
        .iter()
        .find(|n| n.contains("Folder") || n.contains("Structure"))
        .cloned()
        .or_else(|| workbook.sheet_names().first().cloned())
        .ok_or("No sheets found in this file.")?;

    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| format!("Failed to read sheet: {}", e))?;

    let rows: Vec<Vec<String>> = range.rows()
        .map(|r| r.iter().map(|c| c.to_string().trim().to_string()).collect())
        .collect();

    if rows.len() < 5 {
        return Err("This doesn't look like a Kredo template. The file needs at least 5 rows (configuration + headers).".to_string());
    }

    let mut result = ImportResult::default();
    let mut warnings: Vec<String> = Vec::new();

    // ═══ Parse config header (key-value pairs in first rows before separator) ═══
    let mut config: BTreeMap<String, String> = BTreeMap::new();
    let mut data_start_row: usize = 0;

    for (i, row) in rows.iter().enumerate() {
        let first_cell = row.first().cloned().unwrap_or_default();

        // Found separator — next row is column headers, data starts after
        if first_cell == HEADER_SEPARATOR || first_cell == "---" {
            data_start_row = i + 2; // skip separator + header row
            break;
        }

        // Found column header row directly (no separator — legacy format)
        if first_cell.to_lowercase().contains("statement type") {
            data_start_row = i + 1;
            break;
        }

        // Key-value pair
        if row.len() >= 2 && !first_cell.is_empty() {
            config.insert(first_cell.clone(), row[1].clone());
        }
    }

    // If we never found a data start, try to be lenient
    if data_start_row == 0 {
        // Look for the first row that could be a header
        for (i, row) in rows.iter().enumerate() {
            let first = row.first().cloned().unwrap_or_default().to_lowercase();
            if first.contains("statement") || first.contains("type") {
                data_start_row = i + 1;
                break;
            }
        }
        if data_start_row == 0 {
            return Err("Could not find the folder structure section. Make sure the file has a '---' separator row or a 'Statement Type' header.".to_string());
        }
        warnings.push("No configuration header found — using defaults.".to_string());
    }

    // ═══ Validate config ═══

    // Version check
    if let Some(version) = config.get(KEY_VERSION) {
        if version != TEMPLATE_VERSION {
            warnings.push(format!("Template version is '{}', expected '{}'. Some fields may not import correctly.", version, TEMPLATE_VERSION));
        }
    }

    // Client name
    result.client_name = config.get(KEY_CLIENT)
        .cloned()
        .unwrap_or_default();
    if result.client_name.is_empty() {
        warnings.push("Client Name is empty in the file.".to_string());
    }

    // Financial year
    result.financial_year = config.get(KEY_FY)
        .cloned()
        .unwrap_or_default();
    if !result.financial_year.is_empty() {
        // Validate format: should start with "FY" and have year pattern
        let fy = result.financial_year.to_uppercase();
        if !fy.starts_with("FY") {
            return Err(format!("Financial Year '{}' doesn't match expected format (e.g., FY 2026-27).", result.financial_year));
        }
    } else {
        warnings.push("Financial Year is empty — will use current FY.".to_string());
    }

    // Structure
    let structure_raw = config.get(KEY_STRUCTURE)
        .cloned()
        .unwrap_or_else(|| "Month-wise".to_string());
    let structure_lower = structure_raw.to_lowercase().replace("-", "").replace(" ", "");
    result.structure = match structure_lower.as_str() {
        "monthwise" | "monthly" | "month" => "month_wise".to_string(),
        "fyonly" | "fy" | "yearly" => "fy_only".to_string(),
        _ => {
            return Err(format!("Structure must be 'Month-wise' or 'FY only'. Found '{}'.", structure_raw));
        }
    };

    // ═══ Parse folder tree ═══
    let mut types_map: BTreeMap<String, Vec<Vec<String>>> = BTreeMap::new();
    let mut skipped_rows = 0;

    for (row_idx, row) in rows.iter().enumerate() {
        if row_idx < data_start_row { continue; }

        let cells: Vec<String> = row.iter()
            .map(|c| c.to_string().trim().to_string())
            .collect();

        let type_name = cells.first().cloned().unwrap_or_default();

        // Skip completely empty rows
        if cells.iter().all(|c| c.is_empty()) { continue; }

        // Row has levels but no type name — warning
        if type_name.is_empty() {
            let has_data = cells.iter().skip(1).any(|c| !c.is_empty());
            if has_data {
                skipped_rows += 1;
            }
            continue;
        }

        let levels: Vec<String> = cells.iter()
            .skip(1)
            .filter(|s| !s.is_empty())
            .cloned()
            .collect();

        types_map.entry(type_name).or_default().push(levels);
    }

    if skipped_rows > 0 {
        warnings.push(format!("{} row(s) skipped — had sub-folder data but no Statement Type.", skipped_rows));
    }

    // Build tree
    for (type_name, paths) in &types_map {
        let mut root_children: Vec<FolderNode> = Vec::new();
        for path in paths {
            if !path.is_empty() {
                insert_path(&mut root_children, path, 0);
            }
        }
        result.statement_types.push(StatementType {
            name: type_name.clone(),
            sub_folders: root_children,
        });
    }

    if result.statement_types.is_empty() {
        warnings.push("No statement types found. Only base folders will be created.".to_string());
    }

    result.warnings = warnings;
    Ok(result)
}

/// Recursively insert a path into the folder tree
fn insert_path(children: &mut Vec<FolderNode>, path: &[String], depth: usize) {
    if depth >= path.len() { return; }
    let name = &path[depth];
    let existing = children.iter_mut().find(|c| &c.name == name);
    match existing {
        Some(node) => {
            insert_path(&mut node.children, path, depth + 1);
        }
        None => {
            let mut new_node = FolderNode {
                name: name.clone(),
                children: Vec::new(),
            };
            insert_path(&mut new_node.children, path, depth + 1);
            children.push(new_node);
        }
    }
}

// ═══ Export config ═══

#[tauri::command]
pub fn export_config(
    save_path: String,
    client_name: String,
    financial_year: String,
    structure: String,
    statement_types: Vec<StatementType>,
) -> Result<String, String> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Folder Structure").map_err(|e| e.to_string())?;

    let key_fmt = Format::new()
        .set_bold()
        .set_font_size(11.0)
        .set_font_color(Color::RGB(0x615FFF));

    let val_fmt = Format::new().set_font_size(11.0);

    let header_fmt = Format::new()
        .set_bold()
        .set_font_size(11.0)
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x615FFF));

    let sep_fmt = Format::new()
        .set_font_color(Color::RGB(0xCCCCCC))
        .set_font_size(9.0);

    for col in 0..6u16 {
        sheet.set_column_width(col, 22).map_err(|e| e.to_string())?;
    }

    // Config header
    let structure_display = if structure == "month_wise" { "Month-wise" } else { "FY only" };
    let config_rows: Vec<(&str, &str)> = vec![
        (KEY_VERSION, TEMPLATE_VERSION),
        (KEY_CLIENT, &client_name),
        (KEY_FY, &financial_year),
        (KEY_STRUCTURE, structure_display),
    ];

    for (row, (key, value)) in config_rows.iter().enumerate() {
        sheet.write_string_with_format(row as u32, 0, *key, &key_fmt)
            .map_err(|e| e.to_string())?;
        sheet.write_string_with_format(row as u32, 1, *value, &val_fmt)
            .map_err(|e| e.to_string())?;
    }

    // Separator
    sheet.write_string_with_format(4, 0, HEADER_SEPARATOR, &sep_fmt)
        .map_err(|e| e.to_string())?;

    // Column headers
    let headers = ["Statement Type", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5"];
    for (col, h) in headers.iter().enumerate() {
        sheet.write_string_with_format(5, col as u16, *h, &header_fmt)
            .map_err(|e| e.to_string())?;
    }

    // Data rows
    let mut row: u32 = 6;
    for st in &statement_types {
        if st.sub_folders.is_empty() {
            sheet.write_string(row, 0, &st.name).map_err(|e| e.to_string())?;
            row += 1;
        } else {
            let paths = flatten_tree(&st.sub_folders, vec![]);
            for path in paths {
                sheet.write_string(row, 0, &st.name).map_err(|e| e.to_string())?;
                for (col, seg) in path.iter().enumerate() {
                    sheet.write_string(row, (col + 1) as u16, seg).map_err(|e| e.to_string())?;
                }
                row += 1;
            }
        }
    }

    workbook.save(&save_path).map_err(|e| format!("Failed to save: {}", e))?;
    Ok(save_path)
}

/// Flatten a tree into a list of paths
fn flatten_tree(nodes: &[FolderNode], prefix: Vec<String>) -> Vec<Vec<String>> {
    let mut result: Vec<Vec<String>> = Vec::new();
    for node in nodes {
        let mut path = prefix.clone();
        path.push(node.name.clone());
        if node.children.is_empty() {
            result.push(path);
        } else {
            result.extend(flatten_tree(&node.children, path));
        }
    }
    result
}
