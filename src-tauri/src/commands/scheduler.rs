use crate::commands::scanner::scan_audit;
use crate::commands::email::{send_email, SmtpConfig, EmailPayload};
use rust_xlsxwriter::{Color, Format, Workbook};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AutoEmailResult {
    pub success: bool,
    pub message: String,
    pub rows_sent: usize,
    pub timestamp: String,
}

/// A row with FY info attached
struct TaggedRow {
    client: String,
    fy: String,
    month: String,
    statement_path: String,
    status: String,
    count: usize,
}

/// Aggregate audit rows to parent statement type level, tagged with FY
fn aggregate_tagged(rows: &[TaggedRow]) -> Vec<TaggedRow> {
    use std::collections::BTreeMap;
    let mut map: BTreeMap<String, TaggedRow> = BTreeMap::new();
    for r in rows {
        let parent = r.statement_path.split(" \u{2192} ").next().unwrap_or(&r.statement_path).to_string();
        let key = format!("{}||{}||{}||{}", r.client, r.fy, r.month, parent);
        let entry = map.entry(key).or_insert_with(|| TaggedRow {
            client: r.client.clone(), fy: r.fy.clone(), month: r.month.clone(),
            statement_path: parent.clone(), status: "empty".to_string(), count: 0,
        });
        entry.count += r.count;
        if entry.count > 0 { entry.status = "ok".to_string(); }
    }
    map.into_values().collect()
}

/// Generate Excel summary
fn generate_summary_excel(rows: &[TaggedRow], temp_dir: &PathBuf) -> Result<String, String> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Status Report").map_err(|e| e.to_string())?;

    let header_fmt = Format::new().set_bold().set_font_size(11.0)
        .set_font_color(Color::White).set_background_color(Color::RGB(0x615FFF));
    let ok_fmt = Format::new().set_font_color(Color::RGB(0x1D9E75));
    let empty_fmt = Format::new().set_font_color(Color::RGB(0xE25C5C));

    let headers = ["Client", "FY", "Month", "Statement Type", "Status", "Count"];
    let widths = [18, 14, 14, 25, 10, 10];
    for (col, (h, w)) in headers.iter().zip(widths.iter()).enumerate() {
        sheet.set_column_width(col as u16, *w).map_err(|e| e.to_string())?;
        sheet.write_string_with_format(0, col as u16, *h, &header_fmt).map_err(|e| e.to_string())?;
    }

    for (i, row) in rows.iter().enumerate() {
        let r = (i + 1) as u32;
        sheet.write_string(r, 0, &row.client).map_err(|e| e.to_string())?;
        sheet.write_string(r, 1, &row.fy).map_err(|e| e.to_string())?;
        sheet.write_string(r, 2, &row.month).map_err(|e| e.to_string())?;
        sheet.write_string(r, 3, &row.statement_path).map_err(|e| e.to_string())?;
        let fmt = if row.status == "ok" { &ok_fmt } else { &empty_fmt };
        sheet.write_string_with_format(r, 4, &row.status, fmt).map_err(|e| e.to_string())?;
        sheet.write_number(r, 5, row.count as f64).map_err(|e| e.to_string())?;
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("Kredo_AutoReport_{}.xlsx", timestamp);
    let filepath = temp_dir.join(&filename);
    workbook.save(filepath.to_str().unwrap_or("report.xlsx")).map_err(|e| e.to_string())?;
    Ok(filepath.to_string_lossy().to_string())
}

/// Generate chip-grid HTML email body
fn generate_summary_html(rows: &[TaggedRow], total: usize, filled: usize, empty: usize, completion: f64) -> String {
    let month_labels = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    let dash = "\u{2014}";

    struct ChipEntry { client: String, fy: String, stype: String, is_fy: bool, months: std::collections::BTreeMap<String, usize>, total: usize }
    let mut chip_map: std::collections::BTreeMap<String, ChipEntry> = std::collections::BTreeMap::new();

    for r in rows {
        let is_fy = r.month == dash;
        let key = format!("{}||{}||{}||{}", r.client, r.fy, r.statement_path, if is_fy { "fy" } else { "m" });
        let entry = chip_map.entry(key).or_insert_with(|| ChipEntry {
            client: r.client.clone(), fy: r.fy.clone(), stype: r.statement_path.clone(),
            is_fy, months: std::collections::BTreeMap::new(), total: 0,
        });
        *entry.months.entry(r.month.clone()).or_insert(0) += r.count;
        entry.total += r.count;
    }

    let cs = |green: bool| -> String {
        format!("display:block;padding:3px 0;border-radius:3px;font-size:8px;font-weight:600;background:{};color:{};",
            if green { "rgba(29,158,117,0.1)" } else { "rgba(226,92,92,0.08)" },
            if green { "#1D9E75" } else { "#E25C5C" })
    };
    let cell_s = "text-align:center;padding:2px 1px;";
    let td_s = "border-bottom:1px solid #F0EFF5;vertical-align:middle;";

    let mut prev_client = String::new();
    let mut data_html = String::new();

    for entry in chip_map.values() {
        if !prev_client.is_empty() && prev_client != entry.client {
            data_html.push_str("<tr><td colspan=\"5\" style=\"padding:0;border-bottom:none;height:8px;\"><table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr><td style=\"border-bottom:2px solid #EEEDFA;font-size:0;line-height:0;\">&nbsp;</td></tr></table></td></tr>");
        }
        prev_client = entry.client.clone();

        // Strip "FY " prefix for display
        let fy_short = entry.fy.trim_start_matches("FY ").trim_start_matches("fy ");

        let chips_html = if entry.is_fy {
            format!("<span style=\"display:inline-block;padding:3px 8px;border-radius:3px;font-size:8px;font-weight:600;background:{};color:{};\">FY</span>",
                if entry.total > 0 { "rgba(29,158,117,0.1)" } else { "rgba(226,92,92,0.08)" },
                if entry.total > 0 { "#1D9E75" } else { "#E25C5C" })
        } else {
            let fy_full = if entry.fy.starts_with("FY ") { entry.fy.clone() } else { format!("FY {}", entry.fy) };
            let month_keys = fy_month_keys_rust(&fy_full);
            let row1: String = month_keys.iter().take(6).enumerate().map(|(i, mk)| {
                let count = entry.months.get(mk).copied().unwrap_or(0);
                format!("<td style=\"{}\"><span style=\"{}\">{}</span></td>", cell_s, cs(count > 0), month_labels[i])
            }).collect();
            let row2: String = month_keys.iter().skip(6).enumerate().map(|(i, mk)| {
                let count = entry.months.get(mk).copied().unwrap_or(0);
                format!("<td style=\"{}\"><span style=\"{}\">{}</span></td>", cell_s, cs(count > 0), month_labels[i + 6])
            }).collect();
            format!("<table cellpadding=\"0\" cellspacing=\"1\" width=\"100%\"><tr>{}</tr><tr>{}</tr></table>", row1, row2)
        };

        let type_name = if entry.stype == dash { format!("{} (FY level)", dash) } else { entry.stype.clone() };
        let count_color = if entry.total > 0 { "#131126" } else { "#E25C5C" };

        data_html.push_str(&format!("<tr style=\"height:48px;\">
            <td style=\"padding:0 6px;font-size:11px;color:#615FFF;font-weight:600;{}white-space:nowrap;\">{}</td>
            <td style=\"padding:0 6px;font-size:11px;color:#5E5C7A;{}white-space:nowrap;\">{}</td>
            <td style=\"padding:0 6px;font-size:11px;color:#131126;font-weight:500;{}\">{}</td>
            <td style=\"padding:4px 2px;{}\">{}</td>
            <td style=\"padding:0 6px;text-align:right;font-size:11px;font-weight:600;color:{};{}white-space:nowrap;\">{}</td>
        </tr>", td_s, entry.client, td_s, fy_short, td_s, type_name, td_s, chips_html, count_color, td_s, entry.total));
    }

    let th_s = "padding:0 6px;text-align:left;font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;border-bottom:1.5px solid #F0EFF5;vertical-align:middle;";

    format!("<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head>
<body style=\"margin:0;padding:0;background:#F5F4FC;font-family:-apple-system,sans-serif;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#F5F4FC;padding:16px 0;\"><tr><td align=\"center\">
<table cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:680px;width:100%;background:#FFF;border-radius:12px;overflow:hidden;\">
<tr><td style=\"background:#615FFF;padding:18px 16px;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>
<td width=\"32\" height=\"32\" style=\"background:rgba(255,255,255,0.2);border-radius:8px;text-align:center;font-size:14px;font-weight:700;color:white;line-height:32px;\">K</td>
<td style=\"padding-left:10px;vertical-align:middle;\"><div style=\"color:white;font-size:14px;font-weight:600;line-height:1.2;\">Kredo File Manager</div><div style=\"color:rgba(255,255,255,0.65);font-size:10px;line-height:1.2;margin-top:2px;\">Automated status report</div></td>
</tr></table></td></tr>
<tr><td style=\"padding:14px 16px;\"><table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:1px solid #F0EFF5;border-radius:6px;overflow:hidden;\">
<tr>
<td width=\"50%\" style=\"text-align:center;padding:12px 0;border-right:1px solid #F0EFF5;border-bottom:1px solid #F0EFF5;\"><div style=\"font-size:22px;font-weight:700;color:#131126;\">{}</div><div style=\"font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;\">Total</div></td>
<td width=\"50%\" style=\"text-align:center;padding:12px 0;border-bottom:1px solid #F0EFF5;\"><div style=\"font-size:22px;font-weight:700;color:#1D9E75;\">{}</div><div style=\"font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;\">Filled</div></td>
</tr><tr>
<td width=\"50%\" style=\"text-align:center;padding:12px 0;border-right:1px solid #F0EFF5;\"><div style=\"font-size:22px;font-weight:700;color:#E25C5C;\">{}</div><div style=\"font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;\">Empty</div></td>
<td width=\"50%\" style=\"text-align:center;padding:12px 0;\"><div style=\"font-size:22px;font-weight:700;color:#615FFF;\">{:.1}%</div><div style=\"font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#908EAF;margin-top:3px;\">Complete</div></td>
</tr></table></td></tr>
<tr><td style=\"padding:0 16px 16px;\"><table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:1px solid #F0EFF5;border-radius:6px;overflow:hidden;\">
<tr style=\"background:#F5F4FC;height:48px;\">
<th style=\"{}\">Client</th>
<th style=\"{}\">FY</th>
<th style=\"{}\">Type</th>
<th style=\"{}padding:0 2px;\">Months</th>
<th style=\"{}text-align:right;\">Count</th>
</tr>
{}
</table></td></tr>
<tr><td style=\"padding:12px 16px;border-top:1px solid #F0EFF5;text-align:center;font-size:10px;color:#C4C3D4;\">Automated report by Kredo File Manager</td></tr>
</table></td></tr></table></body></html>", total, filled, empty, completion, th_s, th_s, th_s, th_s, th_s, data_html)
}

/// Generate month keys for an FY (Rust version)
pub fn fy_month_keys_rust(fy: &str) -> Vec<String> {
    let re_match: Vec<&str> = fy.split(|c: char| !c.is_ascii_digit()).filter(|s| !s.is_empty()).collect();
    if re_match.len() < 2 { return vec![]; }
    let start_year: u32 = re_match[0].parse().unwrap_or(0);
    let end_str = re_match[1];
    let end_year: u32 = if end_str.len() == 2 {
        format!("{}{}", &re_match[0][..2], end_str).parse().unwrap_or(0)
    } else { end_str.parse().unwrap_or(0) };

    let names = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    let years = [start_year, start_year, start_year, start_year, start_year, start_year,
                 start_year, start_year, start_year, end_year, end_year, end_year];
    let indices = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

    indices.iter().zip(names.iter()).zip(years.iter())
        .map(|((i, n), y)| format!("{} {} {}", i, n, y))
        .collect()
}

#[tauri::command]
pub fn send_auto_email(
    app_handle: tauri::AppHandle,
    root_path: String,
    smtp_config: SmtpConfig,
    to: Vec<String>,
    cc: Vec<String>,
    subject: String,
) -> Result<AutoEmailResult, String> {
    if to.is_empty() { return Err("No recipients configured".to_string()); }
    if smtp_config.host.is_empty() { return Err("SMTP not configured".to_string()); }
    if root_path.is_empty() { return Err("Root path not configured".to_string()); }

    let data_dir = PathBuf::from(&root_path).join("data");
    if !data_dir.exists() { return Err("Data directory not found".to_string()); }

    let mut tagged_rows: Vec<TaggedRow> = Vec::new();
    let mut entities: Vec<String> = Vec::new();

    let dir_entries = fs::read_dir(&data_dir).map_err(|e| format!("Cannot read data dir: {}", e))?;
    for entry in dir_entries.flatten() {
        if entry.path().is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') && !name.starts_with('_') {
                entities.push(name);
            }
        }
    }
    entities.sort();

    for entity in &entities {
        let entity_dir = data_dir.join(entity);
        if let Ok(fys) = fs::read_dir(&entity_dir) {
            let mut fy_names: Vec<String> = fys.flatten()
                .filter(|e| e.path().is_dir() && e.file_name().to_string_lossy().starts_with("FY"))
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            fy_names.sort();

            for fy_name in &fy_names {
                match scan_audit(root_path.clone(), vec![entity.clone()], fy_name.clone()) {
                    Ok(result) => {
                        for r in result.rows {
                            tagged_rows.push(TaggedRow {
                                client: r.client, fy: fy_name.clone(),
                                month: r.month, statement_path: r.statement_path,
                                status: r.status, count: r.count,
                            });
                        }
                    }
                    Err(_) => continue,
                }
            }
        }
    }

    let agg_rows = aggregate_tagged(&tagged_rows);
    let total = agg_rows.len();
    let filled = agg_rows.iter().filter(|r| r.status == "ok").count();
    let empty = total - filled;
    let completion = if total > 0 { (filled as f64 / total as f64) * 100.0 } else { 0.0 };

    let temp_dir = app_handle.path().app_cache_dir().unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&temp_dir).ok();
    let excel_path = generate_summary_excel(&agg_rows, &temp_dir)?;
    let html = generate_summary_html(&agg_rows, total, filled, empty, completion);

    let payload = EmailPayload {
        to, cc, subject, body: html, attachments: vec![excel_path],
    };

    let result = send_email(smtp_config, payload)?;
    let timestamp = chrono::Local::now().to_rfc3339();

    Ok(AutoEmailResult {
        success: result.success,
        message: format!("Auto report sent: {} rows across {} clients", total, entities.len()),
        rows_sent: total,
        timestamp,
    })
}
