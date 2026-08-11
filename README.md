# 知枝 (Study Thread)

**知枝**是一款 AI 伴读桌面应用：在学习会话中与 AI 对话，划选摘录沉淀原子笔记，通过间隔重复按时复习，把每一次问答、笔记与复习沉淀成可检索、可回顾的学习资产。

- 技术栈：Tauri v2（Rust）+ Vue 3 + TypeScript
- 数据完全本地优先：笔记/会话为 Markdown 文件，模型内置离线，无账号、无云同步
- 当前版本：v0.1 测试版（Beta）

## 文档

| 文档 | 读者 | 说明 |
|------|------|------|
| [用户手册](docs/user-guide.md) | 最终用户 | 安装、快速上手、核心概念、数据与隐私、FAQ、反馈方式 |
| [运行与打包指南](docs/RUN.md) | 开发者/维护者 | 环境准备、开发运行、打包构建、安装包分发 |
| [开发设计文档](docs/DEVELOPMENT.md) | 开发者 | 产品设计、功能规格 |
| [Code Wiki](docs/code-wiki/README.md) | 开发者 | 代码实现角度的模块文档 |
| [发布计划](docs/v0.1-release-plan.md) | 维护者 | v0.1 测试版发布评审与待办存档 |

## 仓库结构

```
docs/             # 文档（用户手册 / 运行指南 / 开发文档 / code-wiki / 发布计划）
study-thread/     # 应用主体（前端 Vue 3 + Rust 后端）
```

## 快速开始（开发）

```bash
cd study-thread
npm install
npm run tauri dev
```

详见 [docs/RUN.md](docs/RUN.md)。
