mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::vault::read_file,
            commands::vault::write_file,
            commands::vault::list_dir,
            commands::vault::create_dir,
            commands::vault::file_exists,
            commands::vault::delete_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}