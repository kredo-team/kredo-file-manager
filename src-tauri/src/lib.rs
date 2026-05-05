mod commands;

use commands::{email, excel, folder, scanner, scheduler, settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // Folder operations
            folder::create_folders,
            folder::path_exists,
            folder::list_entities,
            folder::list_financial_years,
            folder::list_unsorted_files,
            folder::move_unsorted_files,
            folder::open_in_explorer,
            folder::list_all_financial_years,
            folder::export_zip,
            folder::browse_data_tree,
            folder::list_folder_files,
            folder::upload_files_to_folder,
            folder::delete_files,
            folder::open_file_default,
            folder::create_subfolder,
            // Scanner
            scanner::scan_directory,
            scanner::scan_audit,
            scanner::list_statement_types,
            scanner::generate_scan_excel,
            // Email
            email::send_email,
            // Scheduler
            scheduler::send_auto_email,
            // Settings
            settings::load_settings,
            settings::save_settings,
            settings::save_temp_file,
            // Excel
            excel::generate_template,
            excel::parse_import,
            excel::export_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
