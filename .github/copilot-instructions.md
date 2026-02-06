# Copilot Instructions for NapCat Plugin Template

## 目标

为 AI 编程代理提供立即可用的、与本仓库紧密相关的上下文：架构要点、开发/构建流程、约定与关键集成点，便于自动完成改进、修复与小功能。

---

## 一句话概览

这是一个面向 NapCat 的插件开发模板（TypeScript，ESM），使用 Vite 打包到 `dist/index.mjs` 作为插件入口；包含消息处理、配置管理和 WebUI 支持。

---

## 架构设计

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      index.ts (入口)                         │
│         生命周期钩子 + WebUI 路由注册 + 事件分发              │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Handlers    │  │   Services    │  │     WebUI     │
│  消息处理入口  │  │   业务逻辑    │  │   前端界面    │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │
        └────────┬─────────┘
                 ▼
        ┌───────────────┐
        │  core/state   │
        │  全局状态单例  │
        └───────────────┘
```

### 核心设计模式

| 模式 | 实现位置 | 说明 |
|------|----------|------|
| 单例状态 | `src/core/state.ts` | `pluginState` 全局单例，持有 ctx、config、logger |
| 服务分层 | `src/services/*.ts` | 按职责拆分业务逻辑 |
| 配置校验 | `sanitizeConfig()` | 类型安全的运行时配置验证 |

---

## 关键文件与职责

### 入口与生命周期

| 文件 | 职责 |
|------|------|
| `src/index.ts` | 插件入口，导出 `plugin_init`, `plugin_onmessage` 等生命周期钩子 |
| `src/config.ts` | NapCat WebUI 配置 Schema 定义 (`plugin_config_ui`) |

### 核心状态

| 文件 | 职责 |
|------|------|
| `src/core/state.ts` | 全局状态单例 `pluginState`，管理配置持久化及 API 调用封装 |
| `src/types.ts` | TypeScript 类型定义 |

### 业务服务

| 文件 | 职责 |
|------|------|
| `src/services/api-service.ts` | WebUI API 路由注册 |

### 消息处理

| 文件 | 职责 |
|------|------|
| `src/handlers/message-handler.ts` | 消息事件入口，处理用户消息 |

### 前端 WebUI

| 文件 | 职责 |
|------|------|
| `src/webui/dashboard.html` | 管理界面，用于配置和状态展示 |

---

## 开发流程

### 环境准备

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm run typecheck

# 构建产物
pnpm run build
# 输出: dist/index.mjs
```

---

## 编码约定

### ESM 模块规范

- `package.json` 中 `type: "module"`
- 导入使用 `.js` 扩展名（TypeScript 编译后）

### 状态访问模式

```typescript
import { pluginState } from '../core/state';
const config = pluginState.config;
pluginState.log('info', '处理消息');
```

### API 响应格式

```typescript
// 成功响应
res.json({ code: 0, data: { ... } });

// 错误响应
res.status(500).json({ code: -1, message: '错误描述' });
```

---

## 注意事项

- **日志**：统一使用 `pluginState.log()`。
- **配置持久化**：通过 `pluginState.saveConfig()` 保存。
- **群配置**：使用 `pluginState.isGroupEnabled()` 检查。
