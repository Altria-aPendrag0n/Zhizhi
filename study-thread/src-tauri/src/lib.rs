mod commands;
use commands::vault::WatcherState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::vault::read_file,
            commands::vault::write_file,
            commands::vault::list_dir,
            commands::vault::create_dir,
            commands::vault::file_exists,
            commands::vault::delete_file,
            commands::vault::start_watch,
            commands::vault::stop_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}