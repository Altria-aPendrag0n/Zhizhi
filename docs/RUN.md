# 知枝 (Study Thread) — 运行与打包指南

> **版本**: V1.0 | **更新日期**: 2026-07-30
>
> 面向开发者/维护者。**面向最终用户的文档请见 [用户手册](./user-guide.md)。**

---

## 目录

1. [环境准备](#1-环境准备)
2. [命令行运行（开发模式）](#2-命令行运行开发模式)
3. [打包构建](#3-打包构建)
4. [安装包分发](#4-安装包分发)
5. [通过安装包运行](#5-通过安装包运行)
6. [常见问题](#6-常见问题)

---

## 1. 环境准备

### 1.1 必需软件

| 软件 | 最低版本 | 用途 | 安装方式 |
|------|---------|------|---------|
| **Node.js** | 18.x 或 20.x | 前端构建与包管理 | [nodejs.org](https://nodejs.org) |
| **Rust** | 1.70+ | Tauri 后端编译 | [rustup.rs](https://rustup.rs) |
| **Git** | 2.0+ | 版本控制 | [git-scm.com](https://git-scm.com) |

### 1.2 Windows 额外要求

| 组件 | 说明 |
|------|------|
| **Microsoft Visual Studio C++ Build Tools** | Rust 编译 Windows 原生代码所需。下载 [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/zh-hans/downloads/)，安装时勾选「使用 C++ 的桌面开发」工作负载。 |
| **WebView2 运行时** | Windows 10 1809+ 已预装，Windows 7/8 需手动安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。 |

### 1.3 macOS 额外要求

```bash
xcode-select --install
```

### 1.4 Linux 额外要求

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
# Fedora
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel patchelf
# Arch
sudo pacman -S webkit2gtk-4.1 libappindicator-gtk3 librsvg patchelf
```

### 1.5 验证环境

```bash
node --version   # 应输出 v18.x 或 v20.x
npm --version    # 应输出 9.x 或 10.x
rustc --version  # 应输出 1.70 以上
cargo --version  # 应输出对应版本
```

---

## 2. 命令行运行（开发模式）

开发模式同时启动 Vite 前端热更新服务器和 Tauri 桌面窗口，修改代码后前端自动刷新。

### 2.1 克隆并进入项目

```bash
git clone <仓库地址> zhizhi
cd zhizhi/study-thread
```

### 2.2 安装依赖

```bash
npm install
```

### 2.3 启动开发模式

```bash
npm run tauri dev
```

**发生了什么：**
1. `npm run dev` 启动 Vite 开发服务器（默认 `http://localhost:1420`）
2. Cargo 编译 Rust 后端（首次编译需 3-5 分钟，后续增量编译 < 10s）
3. Tauri 启动桌面窗口，加载 `http://localhost:1420`

**开发技巧：**
- 修改 Vue/TS 前端代码 → 浏览器自动热更新，无需重启
- 修改 Rust 后端代码 → 自动重新编译，应用自动重启
- 按 `F12` 或 `Ctrl+Shift+I` 打开开发者工具调试前端
- 终端中 `Ctrl+C` 停止开发服务器

### 2.4 仅启动前端（不含 Tauri 桌面窗口）

如果只需要在浏览器中调试前端 UI：

```bash
npm run dev
```

浏览器访问 `http://localhost:1420`。注意：此模式下 Tauri 后端命令（文件读写等）不可用。

### 2.5 前端类型检查

```bash
npx vue-tsc --noEmit
```

### 2.6 前端生产构建（仅前端）

```bash
npm run build
```

构建产物在 `dist/` 目录下，可用 `npm run preview` 本地预览。

---

## 3. 打包构建

打包构建会生成可直接分发的安装包。

### 3.1 完整构建（推荐）

```bash
npm run tauri build
```

**构建过程：**
1. `check:models` 校验内置 Embedding 模型资源（缺失则报错，见下方 3.2）
2. `vue-tsc --noEmit` 检查 TypeScript 类型
3. `vite build` 打包前端为静态文件
4. `cargo build --release` 编译 Rust 后端为优化二进制
5. 将前端 + 后端 + 资源文件打包为安装包

**构建耗时：** 首次约 5-10 分钟（Rust 编译），后续增量约 2-3 分钟。

### 3.2 内置 Embedding 模型资源（构建前置条件）

应用内置离线 Embedding 模型（约 60MB，含 onnxruntime wasm），用于本地知识检索。这些二进制资源不纳入版本库，**换机器/CI 构建前需先补齐**：

```bash
npm run fetch:models            # 下载模型 + 复制 ort wasm（幂等，已存在跳过）
npm run fetch:models -- --mirror  # 国内网络使用 hf-mirror 镜像下载
```

- 构建时 `npm run build` 会自动执行 `check:models` 校验；资源缺失会**直接报错**并提示运行上面的命令，不会产出残缺安装包。
- 开发机本地已缓存该目录时无需重复执行。

### 3.2 构建产物位置

| 平台 | 产物路径 | 格式 |
|------|---------|------|
| Windows | `src-tauri/target/release/bundle/msi/知枝_0.1.0_x64_zh-CN.msi` | MSI 安装包 |
| Windows | `src-tauri/target/release/bundle/nsis/知枝_0.1.0_x64-setup.exe` | NSIS 安装程序 |
| macOS | `src-tauri/target/release/bundle/dmg/知枝_0.1.0_x64.dmg` | DMG 磁盘映像 |
| Linux | `src-tauri/target/release/bundle/deb/知枝_0.1.0_amd64.deb` | DEB 包 |
| Linux | `src-tauri/target/release/bundle/appimage/知枝_0.1.0_amd64.AppImage` | AppImage |

### 3.4 仅构建特定平台的安装包

修改 `src-tauri/tauri.conf.json` 中的 `bundle.targets`：

```json
{
  "bundle": {
    "targets": ["msi", "nsis"]      // Windows: MSI + NSIS 安装程序
    // "targets": ["dmg"]            // macOS: DMG 磁盘映像
    // "targets": ["deb", "appimage"] // Linux: DEB + AppImage
  }
}
```

### 3.4 构建调试版本（含调试符号，体积较大）

```bash
npm run tauri build -- --debug
```

### 3.6 仅构建二进制（不打包安装程序）

```bash
cargo build --release
```

产物在 `src-tauri/target/release/study-thread.exe`（Windows）。

### 3.7 更新版本号

打包前在以下文件中更新版本号：

- `study-thread/package.json` → `"version": "0.2.0"`
- `study-thread/src-tauri/tauri.conf.json` → `"version": "0.2.0"`
- `study-thread/src-tauri/Cargo.toml` → `version = "0.2.0"`

---

## 4. 安装包分发

### 4.1 分发文件清单

> 大小估算已包含内置 Embedding 模型资源（约 60MB），实际以构建产物为准。

| 平台 | 文件 | 大小（估） | 说明 |
|------|------|-----------|------|
| Windows | `知枝_0.1.0_x64_zh-CN.msi` | ~90 MB | 推荐，支持静默安装和组策略部署 |
| Windows | `知枝_0.1.0_x64-setup.exe` | ~90 MB | NSIS 安装程序，带语言选择界面 |
| macOS | `知枝_0.1.0_x64.dmg` | ~95 MB | 拖拽到 Applications 文件夹 |
| Linux | `知枝_0.1.0_amd64.deb` | ~90 MB | 适用于 Debian/Ubuntu 系 |
| Linux | `知枝_0.1.0_amd64.AppImage` | ~95 MB | 免安装，直接运行 |

### 4.2 分发方式

| 方式 | 适用场景 |
|------|---------|
| **GitHub Releases** | 公开分发，附 Release Notes 和更新日志 |
| **自建下载站** | 企业内部分发，可控访问权限 |
| **网盘分享** | 小范围测试，快速分享 |
| **包管理器** | 后续可上架 winget (Windows) / Homebrew (macOS) / Snap (Linux) |

### 4.3 应用签名（可选，推荐正式发布前完成）

**Windows：**
- 购买代码签名证书（EV Code Signing Certificate）
- 用 `signtool` 对 `.msi` 和 `.exe` 签名
- 避免 SmartScreen 拦截

**macOS：**
- 加入 Apple Developer Program（$99/年）
- 用 `codesign` 签名，通过公证（notarization）
- 避免 Gatekeeper 拦截

**Linux：**
- 一般不需要签名，可直接分发

### 4.4 自动更新

应用已内置 Tauri updater 自动更新（设置页「关于知枝」→「检查更新」）：检查到新版本后后台下载安装并自动重启。更新清单（`latest.json`）与安装包托管在 **GitHub Releases**，无需自建服务器。

#### 4.4.1 一次性配置（首次发版前完成）

**① 生成签名密钥对**（任一终端执行，密钥务必私密保存）：

```bash
npx @tauri-apps/cli signer generate
```

输出中 `Public key` 即为签名公钥，私钥（`~/.tauri/<app>.key`）与密码用于后续构建。

**② 填入 `src-tauri/tauri.conf.json`** 的 `plugins.updater`：

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json"
      ],
      "pubkey": "<上一步生成的 Public key>"
    }
  }
}
```

把 `<OWNER>/<REPO>` 替换为真实 GitHub 仓库。

#### 4.4.2 每次发版流程

1. **同步版本号**：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 三处版本号一致（见 §3.7）。
2. **带签名构建**（Windows PowerShell 设置环境变量后执行）：

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY="<私钥内容>"
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<密钥密码>"
   npm run tauri build
   ```

   产物旁的 `*.sig` 文件即签名（未配置密钥则不会生成签名文件）。
3. **生成更新清单**：

   ```bash
   node scripts/release-latest.mjs `
     --base-url=https://github.com/<OWNER>/<REPO>/releases/latest/download `
     --notes "v0.2.0 更新内容" `
     --output dist/latest.json
   ```

   脚本会扫描 `src-tauri/target/release/bundle/` 下各平台安装包与 `.sig`，生成 `latest.json` 并打印待上传清单。
4. **发布 GitHub Release**：创建对应版本号的 Release，上传 **安装包 + 对应 `.sig` 文件 + `latest.json`** 三个部分（NSIS 安装包是 Windows 自更新的承载格式；`.sig` 缺失会导致客户端签名校验失败无法更新）。

#### 4.4.3 说明

- **客户端更新流程**：`check()` 读取 `latest.json` 比对版本 → `downloadAndInstall()` 后台下载安装 → `relaunch()` 重启。更新失败（网络/签名校验不通过）时应用内降级为错误提示，不影响正常使用。
- **Windows 仅 NSIS 支持自更新**（MSI 不支持 updater），分发时请以 NSIS 安装包为准。
- 未签名安装包仍会触发 SmartScreen 拦截，正式版建议购买代码签名证书（见 §4.3）。

---

## 5. 通过安装包运行

### 5.1 Windows

**MSI 安装（推荐）：**
1. 双击 `知枝_0.1.0_x64_zh-CN.msi`
2. 按向导点击「下一步」完成安装
3. 安装路径默认为 `C:\Program Files\知枝\`
4. 从开始菜单或桌面快捷方式启动「知枝」

**NSIS 安装：**
1. 双击 `知枝_0.1.0_x64-setup.exe`
2. 选择安装语言（简体中文 / English）
3. 选择安装路径，完成安装
4. 从开始菜单启动

**首次启动：**
1. 打开「知枝」应用，窗口尺寸 1440×900
2. 打开或创建 Vault（知识库目录）
3. 进入「设置」页面配置 API Key
4. 支持的服务商：Anthropic、OpenAI、DeepSeek、通义千问、智谱、Ollama
5. 返回「学习会话」开始对话

**卸载：**
- 通过 Windows 设置 → 应用 → 找到「知枝」→ 卸载
- 或运行安装目录下的卸载程序
- 注意：Vault 数据目录不会被自动删除，需手动清理

### 5.2 macOS

1. 双击 `知枝_0.1.0_x64.dmg` 挂载
2. 将「知枝」拖入 `Applications` 文件夹
3. 首次启动若提示「无法验证开发者」：
   - 打开「系统设置 → 隐私与安全性」
   - 点击「仍要打开」
4. 后续步骤同 Windows 首次启动

### 5.3 Linux

**DEB 安装：**
```bash
sudo dpkg -i 知枝_0.1.0_amd64.deb
```

**AppImage 运行：**
```bash
chmod +x 知枝_0.1.0_amd64.AppImage
./知枝_0.1.0_amd64.AppImage
```

---

## 6. 常见问题

### 6.1 首次 Tauri 编译失败

**问题：** `cargo build` 报错，提示找不到 Windows SDK 或 linker。

**解决：**
1. 确保已安装 Visual Studio 2022 Build Tools，并勾选「使用 C++ 的桌面开发」
2. 重启终端后重试
3. 若仍失败，检查 Rust 工具链：`rustup default stable-msvc`

### 6.2 开发模式窗口空白

**问题：** `npm run tauri dev` 启动后窗口显示空白。

**解决：**
1. 确认 Vite 开发服务器已启动（终端应有 `http://localhost:1420` 输出）
2. 检查 `src-tauri/tauri.conf.json` 中 `devUrl` 端口是否正确
3. 清除浏览器缓存：开发工具 → Application → Clear storage

### 6.3 前端构建 chunk 过大警告

**说明：** 构建时出现 `Some chunks are larger than 500 kB` 是正常警告，主要来自 CodeMirror 6 语言包、D3.js 和 transformers.js。不影响功能。

### 6.4 API 请求失败

**问题：** 对话时报错「fetch failed」。

**解决：**
1. 检查 CSP 配置：`tauri.conf.json` → `app.security.csp` 中是否包含目标 API 域名
2. 确认 API Key 有效且未过期
3. 检查网络代理设置

### 6.5 Vault 数据在哪里

- 用户自行选择 Vault 目录路径
- Vault 元数据（learner.md、session-tree.json 等）存储在 `<vault>/.study-thread/` 下
- 卸载应用不会删除 Vault 数据

### 6.6 如何同时支持 macOS 打包

在 macOS 机器上执行相同命令即可。跨平台编译需要额外配置（交叉编译），建议在各目标平台上分别构建。

### 6.7 端口冲突

Vite 默认使用 `1420` 端口。若被占用，修改 `tauri.conf.json`：

```json
{
  "build": {
    "devUrl": "http://localhost:3000"
  }
}
```

同时修改 `vite.config.ts` 中的 server port。

---

> **提示：** 如遇到本文档未覆盖的问题，请查阅 [Tauri v2 官方文档](https://v2.tauri.app) 或提交 Issue。