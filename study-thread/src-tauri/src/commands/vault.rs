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
#[allow(dead_code)]
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // ========== read_file 测试 ==========

    #[test]
    fn test_read_file_success() {
        let tmp = std::env::temp_dir().join("test_read_file.txt");
        fs::write(&tmp, "hello world").unwrap();
        let result = read_file(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "hello world");
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn test_read_file_not_found() {
        let result = read_file("/nonexistent/path/to/file.txt".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_read_file_empty() {
        let tmp = std::env::temp_dir().join("test_empty.txt");
        fs::write(&tmp, "").unwrap();
        let result = read_file(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "");
        fs::remove_file(&tmp).ok();
    }

    // ========== write_file 测试 ==========

    #[test]
    fn test_write_file_success() {
        let tmp = std::env::temp_dir().join("test_write_file.txt");
        let result = write_file(
            tmp.to_string_lossy().to_string(),
            "test content".to_string(),
        );
        assert!(result.is_ok());
        let content = fs::read_to_string(&tmp).unwrap();
        assert_eq!(content, "test content");
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn test_write_file_creates_parent_dir() {
        let tmp = std::env::temp_dir().join("test_nested_dir").join("sub").join("file.txt");
        let result = write_file(
            tmp.to_string_lossy().to_string(),
            "nested".to_string(),
        );
        assert!(result.is_ok());
        let content = fs::read_to_string(&tmp).unwrap();
        assert_eq!(content, "nested");
        // 清理
        fs::remove_dir_all(tmp.parent().unwrap().parent().unwrap()).ok();
    }

    #[test]
    fn test_write_file_overwrite() {
        let tmp = std::env::temp_dir().join("test_overwrite.txt");
        fs::write(&tmp, "old").unwrap();
        let result = write_file(
            tmp.to_string_lossy().to_string(),
            "new".to_string(),
        );
        assert!(result.is_ok());
        let content = fs::read_to_string(&tmp).unwrap();
        assert_eq!(content, "new");
        fs::remove_file(&tmp).ok();
    }

    // ========== list_dir 测试 ==========

    #[test]
    fn test_list_dir_success() {
        let tmp = std::env::temp_dir().join("test_list_dir");
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("a.txt"), "a").unwrap();
        fs::create_dir(tmp.join("sub")).unwrap();
        fs::write(tmp.join("sub").join("b.txt"), "b").unwrap();

        let result = list_dir(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        let entries = result.unwrap();

        // 应该有 a.txt（文件）和 sub（目录）
        assert_eq!(entries.len(), 2);
        // 目录应该在前面
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "sub");
        assert_eq!(entries[1].name, "a.txt");

        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn test_list_dir_not_a_directory() {
        let tmp = std::env::temp_dir().join("test_list_dir_file.txt");
        fs::write(&tmp, "content").unwrap();
        let result = list_dir(tmp.to_string_lossy().to_string());
        assert!(result.is_err());
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn test_list_dir_skips_hidden_and_node_modules() {
        let tmp = std::env::temp_dir().join("test_list_hidden");
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join(".hidden"), "h").unwrap();
        fs::create_dir(tmp.join("node_modules")).unwrap();
        fs::write(tmp.join("visible.txt"), "v").unwrap();

        let result = list_dir(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        let entries = result.unwrap();
        // 只有 visible.txt 应该出现
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "visible.txt");

        fs::remove_dir_all(&tmp).ok();
    }

    // ========== create_dir 测试 ==========

    #[test]
    fn test_create_dir_success() {
        let tmp = std::env::temp_dir().join("test_create_dir_new");
        let result = create_dir(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert!(tmp.exists());
        assert!(tmp.is_dir());
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn test_create_dir_already_exists() {
        let tmp = std::env::temp_dir().join("test_create_dir_exist");
        fs::create_dir_all(&tmp).unwrap();
        let result = create_dir(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn test_create_dir_nested() {
        let tmp = std::env::temp_dir().join("test_create_dir").join("a").join("b").join("c");
        let result = create_dir(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert!(tmp.exists());
        fs::remove_dir_all(tmp.parent().unwrap().parent().unwrap().parent().unwrap()).ok();
    }

    // ========== file_exists 测试 ==========

    #[test]
    fn test_file_exists_true() {
        let tmp = std::env::temp_dir().join("test_exists.txt");
        fs::write(&tmp, "content").unwrap();
        let result = file_exists(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert!(result.unwrap());
        fs::remove_file(&tmp).ok();
    }

    #[test]
    fn test_file_exists_false() {
        let result = file_exists("/nonexistent/file.txt".to_string());
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    // ========== delete_file 测试 ==========

    #[test]
    fn test_delete_file_success() {
        let tmp = std::env::temp_dir().join("test_delete_file.txt");
        fs::write(&tmp, "content").unwrap();
        assert!(tmp.exists());
        let result = delete_file(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert!(!tmp.exists());
    }

    #[test]
    fn test_delete_dir_success() {
        let tmp = std::env::temp_dir().join("test_delete_dir");
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("f.txt"), "c").unwrap();
        assert!(tmp.exists());
        let result = delete_file(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert!(!tmp.exists());
    }

    #[test]
    fn test_delete_file_not_found() {
        let result = delete_file("/nonexistent/file.txt".to_string());
        // 删除不存在的文件应该报错
        assert!(result.is_err());
    }

    // ========== DirEntry 排序测试 ==========

    #[test]
    fn test_dir_entries_sorting() {
        // 验证 read_dir_recursive 的排序逻辑：目录在前，按名称排序
        let tmp = std::env::temp_dir().join("test_sort");
        fs::create_dir_all(&tmp).unwrap();
        fs::create_dir(tmp.join("z_dir")).unwrap();
        fs::create_dir(tmp.join("a_dir")).unwrap();
        fs::write(tmp.join("z.txt"), "").unwrap();
        fs::write(tmp.join("a.txt"), "").unwrap();

        let result = list_dir(tmp.to_string_lossy().to_string());
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert_eq!(entries.len(), 4);
        // 两个目录在前，按名称排序: a_dir, z_dir
        assert_eq!(entries[0].name, "a_dir");
        assert!(entries[0].is_dir);
        assert_eq!(entries[1].name, "z_dir");
        assert!(entries[1].is_dir);
        // 两个文件在后，按名称排序: a.txt, z.txt
        assert_eq!(entries[2].name, "a.txt");
        assert!(!entries[2].is_dir);
        assert_eq!(entries[3].name, "z.txt");
        assert!(!entries[3].is_dir);

        fs::remove_dir_all(&tmp).ok();
    }
}