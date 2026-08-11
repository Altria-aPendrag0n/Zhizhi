# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-08-11

v0.1 测试版（Beta）首发。

### 新增

**核心学习流程**
- 学习会话：与 AI 流式对话（支持 Anthropic / OpenAI / DeepSeek / 通义千问 / 智谱 / Ollama），本地向量检索注入上下文（RAG）
- 划线摘录：把 AI 回答提炼为原子笔记（`[[wikilink]]` 双向链接形成知识网络）
- 分支追问：从任意消息/笔记分叉出深度追问分支（最多 3 层）
- Obsidian 兼容 Markdown Vault：笔记/会话为纯 Markdown 文件，可复制目录即备份

**复习系统**
- 间隔重复（SRS）调度：到期清单、掌握度 × 复习曲线难度信号
- 六类出题题型：选择题 / 判断题 / 填空 / 简答 / 簇关联 / 辩论（多轮状态机）
- AI 正误判定：标准答案 + 首行判定徽章，反馈按题型适配
- 复习会话流式出题、临时复用与清理

**学习地图与数据总览**
- 主界面数据总览：问答/复习/笔记按天聚合，GitHub 风格全年学习频率格子图
- 学习地图视图：复习入口 + 认知地图（演示数据，后续开发）

**桌面能力（v0.1 测试版基础设施）**
- 自动更新：设置页「关于知枝」→「检查更新」（tauri updater + GitHub Releases 静态清单）
- 反馈渠道：一键导出调试日志、复制反馈信息、邮件反馈至 `1074253861@qq.com`
- 全局错误收集：未处理异常与 Promise 拒绝自动写入日志系统
- 首次启动欢迎引导：测试版声明 + 建 Vault / 配 API Key / 开始对话三步
- 应用内版本信息与「关于知枝」区块

**本地优先架构**
- 内置离线 Embedding 模型（all-MiniLM-L6-v2 + onnxruntime wasm），完全离线可用
- 无账号、无云同步，数据全部存于本地 Vault

### 文档
- 新增[用户手册](docs/user-guide.md)：快速上手、数据与隐私、FAQ、反馈方式
- 新增[运行与打包指南](docs/RUN.md)、[Code Wiki](docs/code-wiki/README.md)、[发布计划](docs/v0.1-release-plan.md)
- 构建可复现：Embedding 模型下载脚本 + 构建前校验门禁

### 说明
- 测试版未购买代码签名证书，Windows 安装时可能出现 SmartScreen 提示，点击「更多信息 → 仍要运行」即可安装
- 「新建项目」入口暂为占位提示，后续版本实现
