# 13 · Rust 后端

> 本模块覆盖：Tauri v2 装配、文件系统命令、文件变更监听与权限配置。
> 相关代码：`study-thread/src-tauri/`。

---

## 1. 模块职责

- 提供桌面壳（Tauri Builder）与 10 个文件系统 Tauri 命令，供前端通过 IPC 调用。
- 使用 `notify` crate 递归监听 Vault 目录变更，通过事件 `file-changed` 推送给前端。
- 配置窗口、CSP、打包（MSI/NSIS）与权限能力（capabilities）。

## 2. 工程结构

```
src-tauri/
├── Cargo.toml            # 依赖：tauri v2 / tauri-plugin-opener / tauri-plugin-dialog / serde / serde_json / notify v6
├── tauri.conf.json       # 应用配置（产品名"知枝"、窗口、CSP、打包）
├── build.rs              # tauri-build
├── capabilities/default.json
├── icons/
└── src/
    ├── main.rs           # 入口：windows_subsystem + study_thread_lib::run()
    ├── lib.rs            # Tauri Builder 装配与命令注册
    └── commands/
        ├── mod.rs        # pub mod vault;
        └── vault.rs      # 全部文件系统命令 + 单元测试
```

## 3. 入口与装配

### 3.1 `main.rs`

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { study_thread_lib::run() }
```

### 3.2 `lib.rs`

```rust
mod commands;
use commands::vault::WatcherState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())   // 系统文件/目录选择对话框（VaultSettings 选目录）
        .manage(WatcherState(Mutex::new(None)))        // 文件监听器状态
        .invoke_handler(tauri::generate_handler![
            commands::vault::read_file,
            commands::vault::write_file,
            commands::vault::list_dir,
            commands::vault::create_dir,
            commands::vault::file_exists,
            commands::vault::delete_file,
            commands::vault::start_watch,
            commands::vault::stop_watch,
            commands::vault::read_file_bytes,
            commands::vault::write_file_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## 4. 文件系统命令（`commands/vault.rs`）

所有命令返回 `Result<T, String>`（错误消息为中文描述）。

| 命令 | 签名 | 行为 |
|------|------|------|
| `read_file` | `(path) → String` | `fs::read_to_string` |
| `write_file` | `(path, content)` | **自动创建父目录**后写入 |
| `list_dir` | `(path) → Vec<DirEntry>` | `read_dir_recursive` 递归（最大深度 3）；**跳过隐藏文件、`node_modules`、`target`**；排序：目录在前、名称升序 |
| `create_dir` | `(path)` | `fs::create_dir_all` |
| `file_exists` | `(path) → bool` | `Path::exists` |
| `delete_file` | `(path)` | 目录 → `remove_dir_all`；文件 → `remove_file` |
| `start_watch` | `(window, path, state)` | `notify::recommended_watcher` 递归监听，事件经 `window.emit("file-changed", {kind, paths})` 推送 |
| `stop_watch` | `(state)` | 将 `WatcherState` 置 None（drop 监听器） |
| `read_file_bytes` | `(path) → Vec<u8>` | 二进制读取 |
| `write_file_bytes` | `(path, bytes)` | 二进制写入（自动建父目录） |

### 4.1 数据结构

```rust
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<DirEntry>>,
}

pub struct VaultInfo { pub path: String, pub note_count: usize, pub session_count: usize } // 预留

pub struct WatcherState(pub Mutex<Option<Box<dyn Watcher + Send>>>); // notify 监听器状态
```

### 4.2 `list_dir` 实现要点

- 隐藏文件（以 `.` 开头）、`node_modules`、`target` 一律跳过。
- 递归深度上限 3 层。
- 排序：`b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))`。

### 4.3 文件监听（start_watch / stop_watch）

```rust
let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
    if let Ok(event) = res {
        let payload = serde_json::json!({
            "kind": format!("{:?}", event.kind),
            "paths": event.paths.iter().map(...).collect::<Vec<_>>(),
        });
        let _ = window.emit("file-changed", payload);
    }
})?;
watcher.watch(Path::new(&watch_path), RecursiveMode::Recursive)?;
*state.0.lock()... = Some(Box::new(watcher));
```

前端对应 `utils/vault-fs.ts` 的 `startWatching` / `stopWatching`（[07-vault-module.md](./07-vault-module.md)）。

## 5. 配置

### 5.1 `tauri.conf.json` 关键项

| 配置 | 值 |
|------|----|
| `productName` / `version` / `identifier` | `知枝` / `0.1.0` / `com.study-thread.app` |
| `build.beforeDevCommand` / `devUrl` | `npm run dev` / `http://localhost:1420` |
| `build.beforeBuildCommand` / `frontendDist` | `npm run build` / `../dist` |
| 窗口 | 1440×900，min 1024×700，可调整大小 |
| `security.csp` | `default-src 'self'`；`connect-src` 白名单：Anthropic / OpenAI / DeepSeek / 通义千问 / 智谱 / `http://localhost:11434`(Ollama) / HuggingFace / hf-mirror / jsdelivr；允许 `wasm-unsafe-eval`（onnxruntime wasm） |
| `bundle.targets` | `["msi", "nsis"]`（Windows），中文语言包 |
| `bundle.resources` | `../src/skills/**/*.md` |

### 5.2 `capabilities/default.json`

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default", "opener:default", "dialog:default"]
}
```

## 6. 单元测试

`commands/vault.rs` 内置 `#[cfg(test)] mod tests`，约 20 个用例，覆盖：
- `read_file`：成功 / 不存在 / 空文件
- `write_file`：成功 / 自动建父目录 / 覆盖
- `list_dir`：成功 / 非目录报错 / 跳过隐藏与 node_modules / 排序规则
- `create_dir`：成功 / 已存在 / 嵌套
- `file_exists`：true / false
- `delete_file`：文件 / 目录 / 不存在
- `write_file_bytes` / `read_file_bytes`：往返一致 / 建父目录 / 覆盖 / 不存在

运行：`cargo test`（在 `src-tauri/` 下）。

## 7. 与前端协作

```
utils/vault-fs.ts  ──invoke──►  命令
   readFile/writeFile         read_file/write_file
   listDir                    list_dir
   createDir/fileExists       create_dir/file_exists
   deleteFile                 delete_file
   readFileBytes/writeFileBytes  read_file_bytes/write_file_bytes
   startWatching/stopWatching start_watch/stop_watch + listen('file-changed')
```

---

> 上一模块 → [12 Pinia 状态管理](./12-stores.md)  
> 返回目录 → [README](./README.md)
