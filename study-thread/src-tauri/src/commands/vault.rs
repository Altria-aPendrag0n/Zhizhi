use std::fs;
use std::path::Path;
use std::sync::Mutex;
use notify::{Event, RecursiveMode, Watcher};
use tauri::Emitter;
use tauri::Window;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<DirEntry>>,
}

#[derive(Debug, Serialize)]
pub struct VaultInfo {
    pub path: String,
    pub note_count: usize,
    pub session_count: usize,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    // 确保父目录存在
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }
    read_dir_recursive(dir, 3) // 最大递归深度 3
}

fn read_dir_recursive(dir: &Path, max_depth: u32) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        // 忽略隐藏文件和 node_modules
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }

        let children = if is_dir && max_depth > 0 {
            Some(read_dir_recursive(&entry.path(), max_depth - 1)?)
        } else {
            None
        };

        entries.push(DirEntry {
            name,
            path,
            is_dir,
            children,
        });
    }

    // 排序：目录在前，然后按名称排序
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {}", e))
}

#[tauri::command]
pub fn file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("删除目录失败: {}", e))
    } else {
        fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))
    }
}

// 使用 Mutex<Option<Watcher>> 作为 Tauri State 管理 watcher 生命周期
pub struct WatcherState(pub Mutex<Option<Box<dyn Watcher + Send>>>);

#[tauri::command]
pub fn start_watch(window: Window, path: String, state: tauri::State<'_, WatcherState>) -> Result<(), String> {
    let watch_path = path.clone();
    
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            // 发送文件变更事件到前端
            let payload = serde_json::json!({
                "kind": format!("{:?}", event.kind),
                "paths": event.paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
            });
            let _ = window.emit("file-changed", payload);
        }
    }).map_err(|e| format!("创建 watcher 失败: {}", e))?;
    
    watcher
        .watch(Path::new(&watch_path), RecursiveMode::Recursive)
        .map_err(|e| format!("开始监听失败: {}", e))?;
    
    // 存储 watcher 到 State
    let mut state = state.0.lock().map_err(|e| format!("锁定状态失败: {}", e))?;
    *state = Some(Box::new(watcher));
    
    Ok(())
}

#[tauri::command]
pub fn stop_watch(state: tauri::State<'_, WatcherState>) -> Result<(), String> {
    let mut state = state.0.lock().map_err(|e| format!("锁定状态失败: {}", e))?;
    *state = None; // drop the watcher
    Ok(())
}