# 知枝 (Study Thread) 任务驱动开发工作流 Spec

## Why
知枝项目的开发任务已通过 `progress.json` 详细规划，包含 28 个任务，每个任务有明确的步骤描述。需要一套规范的开发工作流，确保每次只实现一个任务，按照步骤执行，通过单元测试验证，提交 git，然后进入下一个任务，保证开发过程有序、可追溯。

## What Changes
- 定义从 `progress.json` 读取任务列表并逐任务实现的开发工作流
- 每个任务实现前需查阅本地 git 仓库了解当前开发环境
- 按照任务描述中的 step 逐步实现，不跳过任何步骤
- 开发完成后必须进行单元测试，测试通过后将 `pass` 改为 `true`
- 每个任务完成后提交 git
- 提交后压缩对话上下文，然后读取下一个 `pass` 为 `false` 的任务继续实现

## Impact
- Affected specs: 无（这是开发工作流规范，不涉及功能变更）
- Affected code: `progress.json`（修改 pass 字段），Tauri + Vue 3 项目代码（按任务实现）

## ADDED Requirements

### Requirement: 任务驱动开发工作流
系统 SHALL 按照 `progress.json` 中定义的任务列表，一次只实现一个任务，按照任务描述中的 step 逐步执行。

#### Scenario: 开始新任务
- **WHEN** 需要开始下一个任务时
- **THEN** 首先查阅本地 git 仓库状态（git status, git log）了解当前开发环境

#### Scenario: 实现任务步骤
- **WHEN** 实现任务时
- **THEN** 严格按照任务描述中的 step 字段逐步实现，不跳过任何步骤

#### Scenario: 任务完成验证
- **WHEN** 任务开发完成后
- **THEN** 进行单元测试验证功能正确性

#### Scenario: 测试通过
- **WHEN** 单元测试通过后
- **THEN** 将 `progress.json` 中对应任务的 `pass` 字段改为 `true`

#### Scenario: 提交代码
- **WHEN** pass 修改完成后
- **THEN** 提交 git，commit message 包含任务名称

#### Scenario: 进入下一个任务
- **WHEN** git 提交完成后
- **THEN** 压缩对话上下文，阅读 `progress.json` 中下一个 `pass` 为 `false` 的任务，开始新一轮实现

### Requirement: 单任务专注原则
系统 SHALL 确保一次只开发和实现一个任务，不跨任务混合开发。

#### Scenario: 多任务隔离
- **WHEN** 当前任务尚未完成（pass 未改为 true 且未提交 git）
- **THEN** 不开始下一个任务的实现

### Requirement: 任务实现顺序
系统 SHALL 按照 `progress.json` 中任务的顺序依次实现，从第一个 `pass` 为 `false` 的任务开始。

#### Scenario: 确定下一个任务
- **WHEN** 需要确定要实现的下一任务时
- **THEN** 读取 `progress.json`，找到数组中第一个 `pass` 为 `false` 的任务