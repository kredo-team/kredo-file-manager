use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct EmailMapping {
    #[serde(default)]
    pub entity_name: String,
    #[serde(default)]
    pub to: Vec<String>,
    #[serde(default)]
    pub cc: Vec<String>,
    #[serde(default)]
    pub subject: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SmtpSettings {
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub from_name: String,
    #[serde(default)]
    pub from_email: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AuthCredentials {
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub is_setup: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct FolderNode {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub children: Vec<FolderNode>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct StatementType {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub sub_folders: Vec<FolderNode>,
    #[serde(default)]
    pub monthly: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AutoEmailConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub schedule: String,       // "every_minute", "daily", "weekly", "monthly"
    #[serde(default)]
    pub time: String,           // "09:00" (24h)
    #[serde(default)]
    pub day_of_week: u8,        // 0=Mon..6=Sun
    #[serde(default)]
    pub day_of_month: u8,       // 1-28
    #[serde(default)]
    pub to: Vec<String>,
    #[serde(default)]
    pub cc: Vec<String>,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub last_sent: String,      // ISO timestamp
    #[serde(default)]
    pub last_status: String,    // "success" or error
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub auth: AuthCredentials,
    #[serde(default)]
    pub root_path: String,
    #[serde(default)]
    pub smtp: SmtpSettings,
    #[serde(default)]
    pub email_mappings: Vec<EmailMapping>,
    #[serde(default)]
    pub statement_types: Vec<StatementType>,
    #[serde(default)]
    pub auto_email: AutoEmailConfig,
}

fn settings_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&config_dir).ok();
    config_dir.join("settings.json")
}

use tauri::Manager;

fn write_defaults(path: &PathBuf) -> Result<AppSettings, String> {
    let default = AppSettings::default();
    let json = serde_json::to_string_pretty(&default)
        .map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(path, json).map_err(|e| format!("Write error: {}", e))?;
    Ok(default)
}

#[tauri::command]
pub fn load_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app_handle);

    if !path.exists() {
        return write_defaults(&path);
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return write_defaults(&path),
    };

    // If parsing fails (schema mismatch from old version), reset to defaults
    match serde_json::from_str::<AppSettings>(&content) {
        Ok(settings) => Ok(settings),
        Err(_) => {
            // Old schema — overwrite with fresh defaults
            write_defaults(&path)
        }
    }
}

#[tauri::command]
pub fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<bool, String> {
    let path = settings_path(&app_handle);
    let json =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Write error: {}", e))?;
    Ok(true)
}

/// Save a temporary file (PDF/Excel export) and return its path
#[tauri::command]
pub fn save_temp_file(
    app_handle: tauri::AppHandle,
    file_name: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let temp_dir = app_handle
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&temp_dir).ok();
    let file_path = temp_dir.join(&file_name);
    fs::write(&file_path, &data).map_err(|e| format!("Failed to save temp file: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}
