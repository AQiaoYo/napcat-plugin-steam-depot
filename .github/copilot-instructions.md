# Copilot Instructions for napcat-plugin-steam-depot

## 目标

为 AI 编程代理提供立即可用的、与本仓库紧密相关的上下文：架构要点、数据流、开发/构建流程、约定与关键集成点，便于自动完成改进、修复与功能开发。

---

## 一句话概览

这是一个 NapCat QQ 机器人插件（TypeScript，ESM），用于从 GitHub 仓库和 ManifestHub 数据源获取 Steam 游戏的 Manifest 和 Depot 解密密钥，自动生成 Lua 脚本并打包成 ZIP 发送到 QQ 群；使用 Vite 打包后端到 `dist/index.mjs`，前端 WebUI 使用 React + TailwindCSS 独立构建。

---

## 核心功能

- **群命令交互**：用户在群聊发送 `#depot <AppID>` 触发下载流程
- **双数据源**：优先使用 ManifestHub（在线 API），回退到 GitHub 仓库（Branch/Encrypted/Decrypted 三种类型）
- **自动生成 Lua 脚本**：包含 `addappid()` 和 `setManifestid()` 调用，用于 Steam 模拟器
- **ZIP 打包上传**：将 Lua 脚本、密钥文件、Manifest 信息打包后通过合并转发/群文件上传
- **DepotKeys 缓存**：支持内存缓存 + 本地文件缓存，可配置过期时间
- **竞速下载**：SAC 数据源使用多 CDN 镜像并发请求，首个成功后取消其余
- **冷却机制**：同一群同一 AppID 有可配置的 CD 时间，失败不计入 CD
- **WebUI 控制台**：React SPA，提供仪表盘、配置管理、仓库管理、群管理四个页面

---

## 架构设计

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      index.ts (入口)                         │
│     生命周期钩子 + WebUI 路由/静态资源注册 + 事件分发         │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────┐
│   Handlers    │  │   Services    │  │      WebUI        │
│  消息处理入口  │  │   业务逻辑    │  │  React SPA 前端   │
└───────┬───────┘  └───────┬───────┘  └───────────────────┘
        │                  │
        └────────┬─────────┘
                 ▼
        ┌───────────────┐
        │  core/state   │
        │  全局状态单例  │
        └───────────────┘
```

### 数据流（#depot 命令）

```
用户发送 #depot <AppID>
  → message-handler.ts 解析命令、检查群启用/CD
    → 优先: manifesthub-service.ts
      → 并行获取 DepotKeys (SAC竞速/Sudama) + Manifests (steam.ddxnb.cn) + DLC (steamcmd.net)
      → 生成 Lua 脚本 + 打包 ZIP
    → 回退: steam-depot-service.ts
      → 遍历启用的 GitHub 仓库 (Branch → Encrypted/Decrypted)
      → 下载 manifest 文件 + 解析 VDF 密钥 + 生成 Lua + 打包 ZIP
  → 合并转发消息（游戏信息 + 密钥统计 + ZIP 文件 + 完成提示）
  → 失败则尝试单独上传群文件作为兜底
```

### 核心设计模式

| 模式 | 实现位置 | 说明 |
|------|----------|------|
| 单例状态 | `src/core/state.ts` | `pluginState` 全局单例，持有 ctx、config、logger、stats |
| 服务分层 | `src/services/*.ts` | 按职责拆分：API 路由、ManifestHub、Steam Depot 下载 |
| 配置清洗 | `sanitizeConfig()` | 类型安全的运行时配置验证，防止脏数据 |
| 竞速模式 | `fetchSACDepotKeys()` | `Promise.any()` + 共享 `AbortController` 实现多源竞速 |
| 双层缓存 | `getDepotKeys()` | 内存缓存 → 本地文件缓存 → 网络请求，带过期时间 |
| CD 冷却 | `cooldownMap` | `Map<groupId:appId, expireTimestamp>`，成功才计入 CD |

---

## 关键文件与职责

### 入口与生命周期

| 文件 | 职责 |
|------|------|
| `src/index.ts` | 插件入口，导出 `plugin_init`、`plugin_onmessage`、`plugin_cleanup`、`plugin_config_ui`、`plugin_get_config`、`plugin_set_config`、`plugin_on_config_change` |
| `src/config.ts` | 默认配置 `DEFAULT_CONFIG`、NapCat WebUI 配置 Schema (`initConfigUI`)、`getDefaultConfig()` |

### 核心状态

| 文件 | 职责 |
|------|------|
| `src/core/state.ts` | `PluginState` 类（全局单例 `pluginState`）：配置加载/保存/清洗、日志封装、API 调用、运行统计、群配置管理 |
| `src/types.ts` | 全部 TypeScript 类型定义：`PluginConfig`、`RepoConfig`、`RepoType`、`DepotKey`、`DownloadResult`、`ManifestHubConfig`、`ManifestHubResult`、`DepotKeySource` 等 |

### 业务服务

| 文件 | 职责 |
|------|------|
| `src/services/api-service.ts` | WebUI API 路由注册（无认证）：`/status`、`/config`、`/groups`、`/groups/:id/config`、`/groups/bulk-config`、`/cache/status`、`/cache/clear`、`/cache/refresh` |
| `src/services/manifesthub-service.ts` | ManifestHub 数据源：DepotKeys 获取（SAC 竞速/Sudama）、Manifest 获取、DLC 列表、Lua 脚本生成、缓存管理、预加载 |
| `src/services/steam-depot-service.ts` | GitHub 仓库数据源：Branch/Encrypted/Decrypted 三种下载模式、VDF 解析、Lua 生成、ZIP 打包、Steam API 游戏信息查询 |

### 消息处理

| 文件 | 职责 |
|------|------|
| `src/handlers/message-handler.ts` | 命令解析与分发：`#depot <AppID>`（下载）、`#depot info <AppID>`（查询）、`#depot help`（帮助）；CD 冷却管理；消息发送工具函数（群消息、私聊、合并转发、表情回复、群文件上传）；消息段构建器（text/image/at/reply） |

### 前端 WebUI（React SPA）

| 文件 | 职责 |
|------|------|
| `src/webui/src/App.tsx` | 应用根组件，页面路由（status/config/repos/groups） |
| `src/webui/src/pages/StatusPage.tsx` | 仪表盘：运行状态与数据概览 |
| `src/webui/src/pages/ConfigPage.tsx` | 插件配置：基础设置、Token、ManifestHub 配置、DepotKeys 缓存管理（清除/刷新） |
| `src/webui/src/pages/ReposPage.tsx` | 仓库管理：GitHub 仓库数据源增删改 |
| `src/webui/src/pages/GroupsPage.tsx` | 群管理：群的启用/禁用控制 |
| `src/webui/src/utils/api.ts` | API 请求封装：`noAuthFetch`（插件 API）、`authFetch`（认证 API） |
| `src/webui/src/hooks/` | React Hooks：`useStatus`（状态轮询）、`useTheme`（主题切换）、`useToast`（通知提示） |
| `src/webui/src/components/` | 通用组件：`Sidebar`、`Header`、`ToastContainer`、`icons` |

### 构建辅助

| 文件 | 职责 |
|------|------|
| `vite.config.ts` | 后端构建配置：ESM 库模式，输出 `dist/index.mjs`，外部化 Node.js 内置模块 |
| `src/webui/vite.config.ts` | 前端构建配置：React SPA |
| `scripts/copy-assets.js` | 构建后复制 WebUI 产物、templates、package.json 到 `dist/` |

---

## 配置结构 (`PluginConfig`)

```typescript
{
  enabled: boolean;              // 全局开关
  debug: boolean;                // 调试模式（详细日志）
  commandPrefix: string;         // 命令前缀，默认 "#depot"
  githubToken?: string;          // GitHub API Token（提高速率限制）
  useGithubToken: boolean;       // 是否使用 Token
  repositories: RepoConfig[];    // GitHub 仓库列表 [{name, type, enabled}]
  tempDir: string;               // 临时文件目录名
  cooldownSeconds: number;       // CD 冷却秒数，0 不限制
  groupConfigs?: Record<string, GroupConfig>;  // 按群单独配置
  manifestHub: {                 // ManifestHub 数据源配置
    enabled: boolean;            // 是否启用
    depotKeySource: 'SAC' | 'Sudama';  // 密钥数据源
    includeDLC: boolean;         // 是否包含 DLC
    setManifestId: boolean;      // Lua 中是否设置固定 ManifestID
    cacheExpireHours: number;    // 缓存过期时间（小时）
  };
}
```

### 仓库类型 (`RepoType`)

| 类型 | 说明 | 下载方式 |
|------|------|----------|
| `Branch` | 分支仓库 | 下载整个分支的 ZIP（GitHub zipball API） |
| `Encrypted` | 加密仓库 | 通过 Git Tree API 下载 manifest + key.vdf，解析密钥 |
| `Decrypted` | 解密仓库 | 同 Encrypted，但无需解密密钥 |

---

## 生命周期函数

| 导出 | 说明 |
|------|------|
| `plugin_init` | 初始化：加载配置 → 注册 WebUI 路由/静态资源/页面 → 后台预加载 DepotKeys |
| `plugin_onmessage` | 消息事件：检查启用状态 → 过滤非消息事件 → 调用 `handleMessage` |
| `plugin_cleanup` | 卸载：清理临时下载目录 |
| `plugin_config_ui` | WebUI 配置 Schema（NapCat 内置配置面板） |
| `plugin_get_config` | 获取当前配置 |
| `plugin_set_config` | 完整替换配置 |
| `plugin_on_config_change` | 单项配置变更回调 |

---

## 开发流程

### 环境准备

```bash
# 安装后端依赖
pnpm install

# 安装前端依赖
cd src/webui && pnpm install && cd ../..
```

### 构建命令

```bash
# 完整构建（后端 + 前端 + 资源复制）
pnpm run build

# 仅构建后端
pnpm run watch          # 监听模式
npx vite build          # 单次构建

# 仅构建前端
pnpm run build:webui

# 前端开发服务器
pnpm run dev:webui

# 类型检查
pnpm run typecheck
```

### 构建产物结构

```
dist/
├── index.mjs           # 插件主入口（Vite 打包）
├── package.json        # 清理后的 package.json（无 devDeps/scripts）
└── webui/              # React SPA 构建产物
    └── index.html
```

---

## 编码约定

### ESM 模块规范

- `package.json` 中 `type: "module"`
- 构建目标 `ESNext`，输出 `.mjs`

### 状态访问模式

```typescript
import { pluginState } from '../core/state';

// 读取配置
const config = pluginState.config;

// 日志（三级别）
pluginState.log('info', '消息内容');
pluginState.log('warn', '警告内容');
pluginState.log('error', '错误内容', error);
pluginState.logDebug('仅 debug 模式输出');

// 配置操作
pluginState.setConfig(ctx, { key: value });       // 合并更新
pluginState.replaceConfig(ctx, fullConfig);        // 完整替换
pluginState.updateGroupConfig(ctx, groupId, cfg);  // 更新群配置
pluginState.isGroupEnabled(groupId);               // 检查群启用状态

// 统计
pluginState.incrementProcessedCount();
```

### API 响应格式

```typescript
// 成功响应
res.json({ code: 0, data: { ... } });

// 错误响应
res.status(500).json({ code: -1, message: '错误描述' });
```

### 消息发送模式

```typescript
import { sendGroupMessage, textSegment, replySegment } from '../handlers/message-handler';

// 发送群消息
await sendGroupMessage(ctx, groupId, [
    replySegment(messageId),
    textSegment('消息内容')
]);

// 合并转发消息使用 buildForwardNode + sendGroupForwardMsg
```

### WebUI 前端约定

- 使用 `noAuthFetch` 调用插件 API（路径前缀 `/plugin/<pluginName>/api`）
- 使用 `authFetch` 调用需认证的 NapCat API（路径前缀 `/api/Plugin/ext/<pluginName>`）
- 组件使用 TailwindCSS 样式，支持 `dark:` 暗色模式
- 状态每 5 秒自动轮询刷新

---

## 外部 API 依赖

| API | 用途 | 文件 |
|-----|------|------|
| `store.steampowered.com/api/appdetails` | 获取游戏名称和信息 | `steam-depot-service.ts` |
| `steam.ddxnb.cn/v1/info/<appId>` | 获取 Depot → Manifest 映射 | `manifesthub-service.ts` |
| `api.steamcmd.net/v1/info/<appId>` | 获取 DLC 列表 | `manifesthub-service.ts` |
| `api.github.com/repos/<owner>/<repo>/...` | GitHub 仓库 API（分支/树/zipball） | `steam-depot-service.ts` |
| SAC CDN 镜像（7 个源） | 下载 depotkeys.json | `manifesthub-service.ts` |
| `api.993499094.xyz/depotkeys.json` | Sudama 备用密钥源 | `manifesthub-service.ts` |

---

## 注意事项

- **日志**：统一使用 `pluginState.log()` 和 `pluginState.logDebug()`，日志前缀为 `[SteamDepot]`
- **配置持久化**：通过 `pluginState.saveConfig()` 保存到 JSON 文件，统计信息一并保存
- **配置清洗**：所有从文件读取的配置都经过 `sanitizeConfig()` 验证，防止类型不匹配
- **群配置**：使用 `pluginState.isGroupEnabled()` 检查，默认启用（除非明确设为 false）
- **CD 冷却**：成功处理才计入 CD，失败/异常不计入，保证用户可以重试
- **临时文件**：下载完成后 5 秒延迟清理，插件卸载时清理整个临时目录
- **错误处理**：ManifestHub 失败自动回退到 GitHub 仓库方式；合并转发失败回退到单独上传群文件
- **ZIP 打包**：Windows 使用 PowerShell `Compress-Archive`，Linux/macOS 使用 `zip` 命令
- **WebUI 路由**：使用 `router.getNoAuth` / `router.postNoAuth` 注册无认证路由，供前端 SPA 调用
