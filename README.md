# Claude 会话历史浏览器（claude-sessions-history）

一个 **Electron 桌面应用**,用于浏览、搜索、重命名、整理 Claude Code 在本地留下的所有对话历史。按项目(文件夹)聚合展示会话,支持对标题和内容做模糊全文搜索,在应用内只读查看完整对话,也可一键调起 `claude --resume` 恢复会话,给会话起自定义名字,以及隐藏 / 删除会话、删除对话里污染上下文的单条消息(**默认只读;所有变更都先备份或走废纸篓,可恢复**)。

> 本文是一份"可复刻"规格文档:综合了完整的需求、Claude 本地数据格式、架构、数据库设计、核心算法、IPC 契约、UI/主题设计、安全与构建测试。照此可从零重建整个项目。

---

## 1. 背景与动机

Claude Code 把所有对话以 JSONL 形式散落存储在 `~/.claude/projects/<编码后的项目路径>/<sessionId>.jsonl`,通常有几十个项目、数百 MB 数据。原生只能在终端里 `claude --resume` 逐个翻找,**无法跨项目浏览、全文搜索、重命名**。本工具填补这个空白。

---

## 2. 功能需求

### 2.1 核心需求(MVP)
1. **展示所有会话历史** —— 扫描本地全部会话文件并列出。
2. **按项目(文件夹)聚合** —— 左栏按项目分组,显示每个项目的会话数与最近活动时间。
3. **模糊搜索** —— 同时对会话**标题**和**对话内容**做模糊/全文搜索,结果高亮命中片段。
4. **点击打开对话** —— 在应用内只读渲染完整对话;**并且**提供「在 Claude Code 中恢复」按钮调起 `claude --resume`。
5. **修改对话名称** —— 给会话起自定义别名。

### 2.2 关键产品决策
- **形态**:Electron 桌面应用(跨平台、富文本展示好)。
- **打开对话**:既要应用内只读查看,又要能调起 `claude --resume`(两者都做)。
- **改名存储**:写入**独立别名文件** `~/.claude/session-aliases.json`,不改动原始 `.jsonl`(安全、可回退、不与升级冲突)。
- **数据修改原则(重要)**:默认全程只读;所有会引起变更的操作都做成**显式触发 + 可恢复**:
  - 隐藏会话 / 删除单条消息的展示态 → 只写独立元数据文件,不碰原始 `.jsonl`;
  - 删除整个会话 → 原始文件移入**系统废纸篓**(非永久删除,可从废纸篓恢复);
  - 删除单条消息的上下文 → **占位改写**原始 `.jsonl`(内容替换为 `[已移除]`,但保留 uuid/父子链/tool 配对结构),改写前先把完整原文存入**归档备份**,随时可一键恢复。
  - 一句话:默认不动原始数据;确需改动时,一律先备份 / 可回退,绝不做不可逆的破坏。

### 2.3 迭代增强需求
6. **命令/系统标签转化**:历史文本里夹杂 `<command-name>`、`<command-message>`、`<command-args>`、`<local-command-stdout>`、`<local-command-caveat>`、`<system-reminder>` 等 Claude Code 内部标签。要把它们解析成结构化、友好的展示,而非显示成生标签。
7. **标签默认隐藏**:这些命令/系统片段默认折叠,在消息开头放一个可点击的标记(chip),点开才展开查看;正文照常显示。
8. **Markdown 渲染 + 代码高亮**:Claude 回复按 Markdown 渲染(表格/列表/引用),代码块语法高亮。
9. **修复对话归属**:`type=user` 的消息里大量是 **工具结果回传(tool_result)**——这是 Claude 调用工具后系统回传的,不是真人输入。要识别出来,归到 **Claude 一侧**、默认折叠、等宽原样展示,不能误显示成"用户发送"。
10. **5 套内置主题 + 切换功能**:至少一套深色;切换器在 UI 上可点,选择持久化。
11. **隐藏会话(软删除)**:把不想看到的会话从列表隐藏,记录在独立文件;侧栏「显示已隐藏」开关可随时查看并取消隐藏;不碰原始数据。
12. **删除会话**:把整个会话原始 `.jsonl` 移入系统废纸篓,并清理索引与该会话的全部附属数据(别名/隐藏/删除记录/归档);二次确认弹窗。
13. **删除 / 恢复单条消息**:对话里某几条消息污染了上下文时,占位删除它(内容改 `[已移除]`、保留结构以免 resume 报错);原文进归档,悬停可查看原文、可一键恢复。

---

## 3. 技术栈

| 领域 | 选型 |
|------|------|
| 框架 | **Electron + Vite + React + TypeScript**,脚手架用 `electron-vite`(主/预加载/渲染三段式) |
| 本地索引 | **better-sqlite3**(同步 API,适合主进程)+ **FTS5 全文索引**,分词器用 **`trigram`**(支持任意子串、对中文友好) |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` + `highlight.js` |
| 测试 | `vitest` |

进程模型:**主进程**负责所有文件系统/数据库访问;**渲染进程**只通过 `contextBridge` 暴露的安全 IPC 调用,开启 `contextIsolation: true`、`nodeIntegration: false`。

---

## 4. 数据源:Claude Code 会话存储格式(关键事实)

> 复刻时**务必**按此处理,否则解析会出错。

### 4.1 目录结构
```
~/.claude/projects/
  └── -Users-name-AI_Plugins-xxx/          # 项目目录(编码后的项目路径)
        ├── <sessionId>.jsonl              # 一个会话 = 一个 JSONL 文件(UUID 命名)
        ├── <sessionId>/                   # 同名目录:子 agent、工具结果缓存等(本工具不依赖)
        └── memory/
```

- **项目目录名** = 项目绝对路径,把 `/` 换成 `-`,并加前导 `-`。
  例:`/Users/name/proj` → `-Users-name-proj`。
- **⚠️ 不可逆**:原路径本身含 `-`(如 `claude-sessions-history`)会被一并编码,无法从目录名完美还原。**真实工作目录(cwd)应优先从 JSONL 行内的 `cwd` 字段读取**,目录名仅作 fallback。
- **会话文件**:`<sessionId>.jsonl`,UUID 命名,逐行独立 JSON,**append-only**。

### 4.2 JSONL 行格式
每行是一个独立 JSON 对象,关键 `type`:

**用户消息** `type: "user"`:
```jsonc
{
  "type": "user",
  "message": { "role": "user", "content": "..." },  // content 可能是 string,也可能是 array
  "uuid": "...", "timestamp": "2026-06-18T06:56:56.381Z",
  "sessionId": "...", "cwd": "/Users/me/proj",       // ← 真实工作目录
  "slug": "peaceful-snowglobe", "gitBranch": "...", "isSidechain": false
}
```

**助手消息** `type: "assistant"`:
```jsonc
{
  "type": "assistant",
  "message": {
    "role": "assistant", "model": "claude-opus-4-8",
    "content": [
      { "type": "thinking", "thinking": "..." },
      { "type": "text", "text": "..." },
      { "type": "tool_use", "name": "Write", "input": { ... } }
    ],
    "usage": { ... }
  },
  "uuid": "...", "timestamp": "...", "sessionId": "..."
}
```

**AI 生成标题** `type: "ai-title"`:
```jsonc
{ "type": "ai-title", "aiTitle": "构建会话搜索工具", "sessionId": "..." }
```

### 4.3 重要数据特征(实测统计,务必处理)
- **`type=user` 的 content 形态分布**(真实占比):
  - `array[仅 tool_result]` —— **最多**(约 80%),是工具结果回传,**非真人输入** → 应识别为 `tool` 角色。
  - `string` —— 真人输入。
  - `array[仅 text]` —— 真人输入。
  - `array[document]` —— 真人粘贴文档,算真人输入。
- `top.type` 与 `message.role` 实测**完全一致**,无错位。
- `isSidechain: true` 是子 agent 消息,主会话展示时应跳过。

### 4.4 标题来源优先级
**自定义别名 > `aiTitle` > `slug` > 首条真人 user 消息(截断) > sessionId 前 8 位短码**

### 4.5 其它相关文件
- `~/.claude/history.jsonl` —— 全局命令历史(本工具未使用)。
- `~/.claude/session-aliases.json` —— **本工具自建**的别名文件。
- `~/.claude/hidden-sessions.json` —— **本工具自建**:被隐藏会话记录 `{ sessionId: hiddenAt }`。
- `~/.claude/removed-messages.json` —— **本工具自建**:被占位删除的消息 uuid `{ sessionId: uuid[] }`。
- `~/.claude/session-backups/<sessionId>.jsonl` —— **本工具自建**:删过消息的会话的**完整归档**(始终保留原文,供悬停查看与恢复)。
- `~/.claude/session-history-index.sqlite` —— **本工具自建**的索引缓存(放 `~/.claude` 下,不污染项目目录)。

---

## 5. 整体架构与目录结构

```
src/
├── shared/
│   └── types.ts                 # 主/预加载/渲染三方共用类型
├── main/                        # 主进程(Node 全权限)
│   ├── index.ts                 # 创建窗口、注册 IPC、启动后台索引
│   ├── paths.ts                 # ~/.claude 路径常量;目录名↔路径解析(dirNameToPath)
│   ├── jsonl-parser.ts          # 纯函数:解析单文件 → 索引元数据 / 展示消息
│   ├── db.ts                    # better-sqlite3:schema、FTS5、查询函数
│   ├── search-utils.ts          # 纯函数:LIKE / FTS phrase 转义(可单测)
│   ├── indexer.ts               # 增量扫描索引 + 进度回调
│   ├── aliases.ts               # 别名读写(原子写,可注入路径以便测试)
│   ├── hidden.ts                # 隐藏会话记录读写(原子写,可单测)
│   ├── removed.ts               # 被删消息 uuid 记录读写(原子写,可单测)
│   ├── message-edit.ts          # 纯函数:占位改写 / 恢复 / 归档追加(可单测,核心)
│   ├── messages.ts              # 删除/恢复单条消息 + 归档维护(副作用编排)
│   ├── delete.ts                # 删除会话:移入废纸篓 + 清理附属数据
│   ├── resume.ts                # 调起终端(依赖 electron)
│   ├── resume-utils.ts          # resume 的纯逻辑(UUID 校验/转义/命令构造,可单测)
│   ├── ipc-utils.ts             # 纯函数:标题解析 / 命中分类 / 摘要组装(可单测)
│   └── ipc.ts                   # IPC handler 汇总 + 别名·隐藏·删除合并
├── preload/
│   ├── index.ts                 # contextBridge.exposeInMainWorld('api', ...)
│   └── index.d.ts               # window.api 类型声明
└── renderer/
    ├── index.html               # 含 CSP meta
    └── src/
        ├── main.tsx             # 挂载 React;渲染前先 applyStoredTheme() 防闪烁
        ├── App.tsx              # 状态编排中枢
        ├── styles.css           # 全部样式 + 5 套主题(CSS 变量 + [data-theme])
        ├── themes.ts            # 主题元数据 + localStorage 读写 + applyTheme
        ├── messageContent.ts    # 纯函数:user 文本 → 片段(text/command/stdout/caveat/reminder)
        ├── hooks/
        │   ├── useApi.ts        # useDebouncedValue + 时间/路径格式化工具
        │   └── useTheme.ts      # 主题状态 hook
        └── components/
            ├── ProjectSidebar.tsx   # 左栏:项目聚合 + 索引进度 + 主题切换器
            ├── SearchBar.tsx        # 顶部搜索框(防抖)
            ├── SessionList.tsx      # 中栏:会话卡片 + 命中片段高亮
            ├── ConversationView.tsx # 右栏:对话头部 + 消息列表 + 改名/恢复按钮
            ├── MessageBubble.tsx    # 单条消息(user/assistant/tool 三态)
            ├── UserSegments.tsx     # user 消息片段渲染 + 隐藏标记 chip
            ├── Markdown.tsx         # react-markdown 封装(GFM + 代码高亮)
            ├── RenameDialog.tsx     # 重命名弹窗
            ├── ConfirmDialog.tsx    # 破坏性操作二次确认弹窗(删除会话)
            └── ThemeSwitcher.tsx    # 侧栏底部主题色卡
```

**文件组织原则**:多而小、高内聚低耦合;纯逻辑(解析、resume 校验、别名)与副作用(IO、electron)分离,便于单测。

---

## 6. 数据层设计(SQLite + 增量索引)

### 6.1 数据库 schema(`db.ts`)
```sql
-- 文件指纹,用于增量判断
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY, mtime INTEGER, size INTEGER, session_id TEXT
);

-- 会话元数据(别名不入库,运行时合并)
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project_dir TEXT, project_path TEXT, file_path TEXT,
  ai_title TEXT, slug TEXT, first_user_msg TEXT,
  created_at INTEGER, updated_at INTEGER, message_count INTEGER, model TEXT
);
CREATE INDEX idx_sessions_project ON sessions(project_dir);
CREATE INDEX idx_sessions_updated ON sessions(updated_at);

-- 全文搜索:trigram 分词器,支持任意子串、对中文友好(查询需 ≥3 字符)
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  session_id UNINDEXED, role UNINDEXED, content, tokenize = 'trigram'
);
```
- 用 `journal_mode = WAL`。
- **别名不入库**:运行时从 `aliases.json` 合并,保证单一可信源、可手改。

### 6.2 增量索引策略(`indexer.ts`)
1. 遍历 `~/.claude/projects/*/*.jsonl`,对每个文件 `statSync` 取 `mtime`(取整 `mtimeMs`)+ `size`。
2. 与 `files` 表指纹比对:**未变跳过**;变化或新增则读全文 → 解析 → 覆盖式写库(事务内:先 `DELETE` 旧 sessions+fts 行,再 `INSERT`)。
3. **清理**:库里有但磁盘已删的文件 → `removeFile`。
4. **让出事件循环**:每处理若干文件 `await setImmediate`,避免长时间阻塞主进程 IPC;每 N 个文件回调一次进度。
5. **容错**:单文件/单行失败都跳过计数,绝不中断整体。
6. 首次全量在窗口加载后后台跑,渲染层显示进度;之后启动只增量,秒级完成。

### 6.3 解析(`jsonl-parser.ts`,纯函数,便于单测)
两个入口,都接收"文件内容字符串",不做 IO:

- `parseSessionForIndex(content) → ParsedSession`:逐行 `JSON.parse`(坏行 try/catch 跳过并 `skippedLines++`);收集 `sessionId`、`cwd`、`slug`、`aiTitle`、首条真人 user 文本(截断 200 字)、首尾 `timestamp`、`message_count`、`model`;把 user/assistant 的纯文本推入 `ftsMessages` 供全文索引。
- `parseSessionDetail(content) → DetailMessage[]`:产出有序展示消息;assistant 抽取 `thinking`、`text`、`tool_use` 摘要;**按 `timestamp` 稳定排序**;无任何可展示内容的行跳过。

**文本抽取** `extractText(content)`:`string` 直接返回;`array` 抽 `text` 块,`tool_result` 块递归抽其 `content`。

**工具结果识别** `isToolResultContent(content)`(核心修复点):
```
string → false(真人)
array 含 text 或 document → false(真人)
array 仅含 tool_result(无 text/document) → true(工具结果)
```
`parseSessionDetail` 中:`type==='user' && isToolResultContent(content)` → `role = 'tool'`。

---

## 7. 核心逻辑详解

### 7.1 标题计算(`ipc.ts`)
```
resolveTitle = 别名 || ai_title || slug || first_user_msg || sessionId.slice(0,8)
```
别名在 IPC 层从 `aliases.json` 合并进每个 `SessionSummary`。

### 7.2 命令/系统标签解析(`messageContent.ts`,纯函数)
`parseUserSegments(text) → Segment[]`,Segment 类型:
```ts
type Segment =
  | { kind: 'text'; text: string }                                  // 正文 → Markdown 渲染
  | { kind: 'command'; name: string; args: string; message: string }// 斜杠命令
  | { kind: 'stdout'; text: string }                                // local-command-stdout
  | { kind: 'caveat'; text: string }                                // local-command-caveat
  | { kind: 'reminder'; text: string }                              // system-reminder
```
实现:用一个统一正则线性扫描所有已知标签块,块之间的文本作为 `text` 片段;相邻的 `command-message/name/args` 合并成一个 `command`(同字段重复出现视为新命令开始);**未识别/未闭合标签原样留在 text**,交给 Markdown 安全转义(不会被吞、也防 XSS)。

匹配正则:
```
/<(command-message|command-name|command-args|local-command-stdout|local-command-caveat|system-reminder)>([\s\S]*?)<\/\1>/g
```

### 7.3 全文搜索(`db.ts` + `ipc.ts`)
- **标题维度**:对 `ai_title`/`slug`/`first_user_msg` 做 `LIKE %q%`(转义 `\ % _`);别名维度在 IPC 层对合并后的别名做包含匹配。会话数量少,LIKE 足够快。
- **内容维度**:查询长度 **≥3 字符**才走 FTS5(trigram 限制);把整个 query 作为一个 phrase 子串匹配(转义内部双引号):`MATCH '"<q>"'`;用 `snippet(messages_fts, 2, '[[', ']]', '…', 12)` 生成高亮片段。
- 合并标题命中与内容命中,去重,标注 `matchedIn: 'title' | 'content' | 'both'`,按 `updated_at` 倒序返回。
- 前端用 `[[ ]]` 标记渲染成 `<mark>` 高亮。

### 7.4 别名管理(`aliases.ts`)
- 文件 `~/.claude/session-aliases.json`,结构 `{ [sessionId]: { alias: string, updatedAt: number } }`。
- **原子写**:先写 `*.tmp` 再 `renameSync`,避免并发/中断损坏。
- 读时不存在或损坏 → 返回空表(绝不让损坏文件搞崩应用)。
- 函数签名带可选 `file` 参数(默认全局路径),便于单测注入临时文件。
- `setAlias(id, alias, now, file?)`:去空白后为空 → 删除该别名(清除)。

### 7.5 调起 resume(`resume.ts` / `resume-utils.ts`)
- **命令注入防护(必须)**:`sessionId` 强制匹配 UUID 正则才执行,否则 reject。
- cwd 取自会话记录的 `project_path`(优先 jsonl 内 cwd)。
- **macOS**:`execFile('osascript', ['-e', script])`,AppleScript 打开 Terminal 执行 `cd <cwd> && claude --resume <sessionId>`;cwd 经 AppleScript 字符串转义(反斜杠、双引号),命令里 cwd 用 `JSON.stringify` 包裹。
- **非 macOS 或失败**:把命令复制到剪贴板(`clipboard.writeText`)兜底,返回 `{ mode: 'clipboard' }`。
- 纯逻辑(`isValidSessionId`/`escapeForAppleScript`/`buildResumeCommand`)拆到 `resume-utils.ts`,不依赖 electron,可单测。

### 7.6 隐藏 / 删除会话
- **隐藏(软删除)**:`hidden.ts` 维护 `~/.claude/hidden-sessions.json`(`{ sessionId: hiddenAt }`,原子写、损坏返回空表)。`listSessions`/`searchSessions` 带 `includeHidden` 参数,**默认过滤掉隐藏项**;`SessionSummary.hidden` 由 IPC 层从隐藏表合并。别名不入库、隐藏也不入库,均运行时合并,保持单一可信源。
- **删除会话**(`delete.ts`):`sessionId` 先过 UUID 校验;把原始 `.jsonl` 用 **Electron `shell.trashItem()` 移入系统废纸篓**(可恢复,**绝不 `unlink` 永久删**),再 `removeFile` 清索引三表,并清理该会话的别名 / 隐藏 / 删除记录,以及把归档备份也移入废纸篓。失败(trash 抛错)时不清索引。

### 7.7 删除 / 恢复单条消息 + 归档(`message-edit.ts` 纯逻辑 + `messages.ts` 副作用)
> 这是全项目**唯一会改写原始 `.jsonl`** 的能力,因此纯逻辑单独拆出并用单测锁死"改写后结构仍合法"。

- **占位改写规则**(`redactContent`,只清文本载荷、保留所有结构键):
  ```
  string 内容          → "[已移除]"
  text 块 .text        → "[已移除]"
  thinking 块 .thinking→ "[已移除]"
  tool_use 块 .input   → {}          (保留 id/name → 配对不断)
  tool_result 块.content→ "[已移除]" (保留 tool_use_id → 配对不断)
  ```
  保留 `uuid`/`parentUuid` 父子链与 tool 配对键,`claude --resume` **不会因结构损坏报错**,那条消息在上下文里只剩 `[已移除]` 几乎不占 token。
- **只改命中行**:`redactMessage(全文, uuid)` 按行扫描,只对目标 uuid 行 `JSON.parse`→改 `message.content`→`stringify`,**其他行原样保留**(避免 `parentUuid`/`toolUseResult` 等一堆顶层字段被序列化漂移)。
- **完整归档**(`~/.claude/session-backups/<sessionId>.jsonl`):首次删除时把当前完整 `.jsonl` 复制为归档;之后**每次打开详情**用 `mergeNewMessages` 把工作文件里归档没有的 uuid 行追加进归档 → **归档始终完整且跟随对话增长**,已有 uuid(含被占位的原文)不覆盖。每会话仅一份。
- **删除流程**:①无归档则先建、有归档则先并入删除前的新消息(确保待删原文在归档里)→ ②原子改写工作文件该行为占位 → ③`removed.ts` 记 uuid。
- **恢复流程**:从归档 `findLineByUuid(uuid)` 取原始整行 → 原子写回工作文件替换占位行 → 撤销 uuid 记录。
- **详情合并**:`getSessionDetail` 对 `removed` 表里的 uuid 标 `removed=true`,并从归档解析回填 `originalText` 供悬停查看。

---

## 8. IPC 接口契约

preload 通过 `contextBridge.exposeInMainWorld('api', api)` 暴露,渲染层调 `window.api.*`。共享类型 `ClaudeSessionsApi`:

| 方法 | 说明 | 返回 |
|------|------|------|
| `listProjects()` | 项目列表(各自会话数、最近活动) | `ProjectSummary[]` |
| `listSessions(projectDir?, includeHidden?)` | 某项目(或全部)会话,已合并别名/隐藏,按更新时间倒序;默认过滤隐藏 | `SessionSummary[]` |
| `searchSessions(query, includeHidden?)` | 标题 + 内容模糊搜索,返回命中 + 高亮片段;默认过滤隐藏 | `SearchHit[]` |
| `getSessionDetail(sessionId)` | 解析该 jsonl,返回有序消息(含 removed 标记 + 原文);顺带同步归档 | `SessionDetail` |
| `renameSession(sessionId, alias)` | 写别名文件(空串=清除),返回更新后的会话 | `SessionSummary` |
| `hideSession(sessionId, hidden)` | 隐藏/取消隐藏(软删除,可逆),返回更新后的会话 | `SessionSummary` |
| `deleteSession(sessionId)` | 原始 jsonl 移入废纸篓 + 清索引与附属数据 | `DeleteResult` |
| `deleteMessage(sessionId, uuid)` | 占位删除一条消息(原文进归档,可恢复) | `MessageEditResult` |
| `restoreMessage(sessionId, uuid)` | 从归档取回原文写回工作文件 | `MessageEditResult` |
| `resumeSession(sessionId)` | 调起终端恢复;非 macOS/失败则复制命令 | `ResumeResult` |
| `reindex()` | 手动触发增量重建 | `IndexProgress` |
| `onIndexProgress(cb)` | 订阅索引进度(返回取消订阅函数) | `() => void` |

### 关键类型(`shared/types.ts`)
```ts
interface ProjectSummary { projectDir, projectPath, sessionCount, lastActivity }
interface SessionSummary {
  sessionId, projectDir, projectPath,
  title,        // 最终展示标题(已按优先级解析)
  alias, aiTitle, slug, firstUserMsg,
  createdAt, updatedAt, messageCount, model,
  hidden: boolean               // 是否已隐藏(软删除)
}
interface SearchHit { session: SessionSummary; matchedIn: 'title'|'content'|'both'; snippet: string|null }
interface DetailMessage {
  uuid; role: 'user'|'assistant'|'tool';  // 'tool' = 工具结果回传
  timestamp; text; thinking; toolUses: { name, input }[]; model
  images?: string[]             // 内嵌图片,已拼成 data: URI 可直接用于 <img src>
  removed?: boolean             // 是否被占位删除
  originalText?: string         // 被删消息原文(从归档取,供悬停/恢复)
}
interface SessionDetail { sessionId, projectPath, messages: DetailMessage[] }
interface IndexProgress { total, done, finished, skippedLines }
interface ResumeResult { mode: 'launched'|'clipboard'; command: string }
interface DeleteResult { trashed: boolean }        // 会话删除:是否已入废纸篓
interface MessageEditResult { ok: boolean }        // 单条消息删除/恢复是否命中
```

进度推送:主进程通过 `webContents.send('index:progress', p)`,preload 用 `ipcRenderer.on` 转给回调。启动索引在 `did-finish-load` 后触发。

---

## 9. 前端 UI 设计

### 9.1 三栏布局
```
┌─────────────┬──────────────────┬───────────────────────────┐
│ 左栏 250px  │ 中栏 360px       │ 右栏 1fr                  │
│ 项目聚合    │ 搜索框 + 会话卡片 │ 对话头部 + 消息列表       │
│ ...         │ ...              │ [重命名][在 Claude 中恢复]│
│ 索引进度    │                  │                           │
│ 主题切换器  │                  │                           │
└─────────────┴──────────────────┴───────────────────────────┘
```
- `App.tsx` 是状态中枢:`projects / activeProjectDir / sessions / query(防抖) / searchHits / activeSession / detail / progress / renameTarget / toast`。
- 搜索框输入 → `useDebouncedValue` 防抖 300ms → `searchSessions`;有 query 时中栏显示命中列表(带 snippet),否则显示当前项目会话列表。
- 改名后同步更新 `sessions / searchHits / activeSession` 三处的该会话。

### 9.2 消息渲染(`MessageBubble.tsx`)
三种 `role`:
- **`user`(真人)**:右侧气泡;文本走 `UserSegments`(命令/系统标签处理 + Markdown)。
- **`assistant`**:左侧气泡;`thinking` 折叠块、`text` 走 Markdown(代码高亮)、`tool_use` 折叠摘要。
- **`tool`(工具结果)**:**归到左侧(Claude 一侧)**;渲染成一个**默认折叠**的「⚙ 工具结果」块,折叠时旁边显示首行预览;展开用**等宽 `pre` 原样显示**(不走 Markdown,避免命令/JSON 输出被破坏)。气泡用稍暗、略淡样式区分。

**内嵌图片**:消息 `content` 里的 `image` 块(base64)由解析层 `extractImages` 拼成 `data:` URI(递归处理 `tool_result` 内嵌的截图);对话侧(user/assistant)**默认展示**(限宽 320px),工具结果里的图片随折叠展开时显示。**纯图片消息**(无文字)也保留展示——解析层特意不把它当空行跳过。需 CSP 放行 `img-src 'self' data:`(见 §11)。

**消息级删除 / 恢复**:
- 每条消息**悬停时**右上角浮现一个 `✕` 删除按钮,点击即占位删除(原文备份,可恢复)。
- 被删消息渲染成**虚线占位气泡**:显示「⊘ 已移除 · 不进入上下文」+「恢复」按钮;**悬停气泡展开原文**(等宽 `pre`,纯 CSS `:hover`,不走 Markdown)。

### 9.3 命令/系统标签的隐藏与展开(`UserSegments.tsx`)
- 把片段分为正文 `text` 与「元片段」(command/stdout/caveat/reminder)。
- `command` 显示成一行 `⌘ /命令名 参数`(等宽)。
- `stdout`(命令输出)/`caveat`(本地命令说明)/`reminder`(系统提醒)各渲染成一个**默认折叠**块,**复用 Claude 侧同款折叠样式**(`.collapse-btn` 的 `▸ 标签` + 左边框 + 展开等宽 `pre`),与思考块/工具结果视觉一致。
- 正文 `text` 始终显示,走 Markdown。
- 所有等宽内容(命令/输出/代码块/思考/工具输出)统一用主题变量 `--font-mono`,随主题变化、避免硬编码字体在深浅主题下不一致。

### 9.4 Markdown(`Markdown.tsx`)
`react-markdown` + `remark-gfm`(表格/任务列表/删除线)+ `rehype-highlight`(`{ detect: true, ignoreMissing: true }`)。**默认不解析原始 HTML**(不启用 rehype-raw):对话里的 `<div>` 等会被安全转义成字面文本,既防 XSS 又不吞标签。

---

## 10. 主题系统(5 套内置主题 + 切换)

### 10.1 五套主题
| key | 名称 | 明暗 | 性格 |
|-----|------|------|------|
| `obsidian` | 黑曜 | 深色 | 近黑蓝底 + 青/蓝 accent(**默认**) |
| `nocturne` | 夜曲 | 深色 | 靛紫底 + 紫/粉 accent |
| `phosphor` | 磷光 | 深色 | 黑底磷光绿 + 琥珀,**整体等宽字体**,复古终端风 |
| `paper` | 纸墨 | 浅色 | 米白纸底 + 朱红/墨绿,**标题衬线** |
| `sepia` | 羊皮 | 浅色 | 暖褐羊皮纸,护眼,**标题衬线** |

### 10.2 实现机制
- **CSS 变量驱动**:`:root` 定义默认(obsidian)全部变量;`[data-theme='nocturne'|'phosphor'|'paper'|'sepia']` 各覆盖一套。变量集合:
  - 颜色:`--bg --bg-2 --bg-3 --panel --border --text --text-dim --text-faint --accent --accent-2 --mark --danger --bubble-user-bg --bubble-user-border --overlay --shadow`
  - 字体:`--font-ui --font-display --font-mono`(phosphor 覆盖 ui 为等宽;paper/sepia 覆盖 display 为衬线)
  - 代码高亮:`--hl-keyword --hl-string --hl-comment --hl-number --hl-func --hl-attr`
- **切换** = `document.documentElement.setAttribute('data-theme', key)`(`themes.ts` 的 `applyTheme`)。
- **持久化**:`localStorage['csh-theme']`;`main.tsx` 在 React 渲染前调 `applyStoredTheme()` **避免首屏闪烁**。
- **切换器 UI**(`ThemeSwitcher.tsx`,侧栏底部):5 个圆形色卡,每个用主题真实色做预览(底色 + 两个 accent 点),当前主题有 accent 描边 ring + hover 微浮动。
- **代码高亮跟随主题**:**不 import 固定的 hljs 主题 css**,改在 styles.css 里用 `--hl-*` 变量给 `.hljs-keyword/string/comment/...` 上色 → 浅色主题下代码块也是浅色配色。
- **平滑过渡**:`body` 及主要面板加 `transition: background-color/border-color/color`。

### 10.3 关键设计点(避免浅色主题翻车)
- 凡是"accent 上的文字"统一用 `var(--bg-3)`:`bg-3` 永远是明暗两极之一,而 accent 是中间调,深浅主题对比都成立。
- 所有原本写死的深色值(user 气泡背景、弹窗遮罩 `--overlay`、阴影 `--shadow`)都必须改成主题变量,否则浅色主题会出现突兀深块。

---

## 11. 安全设计
- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`;渲染层无 Node 权限,只能调白名单 IPC。
- `index.html` 设 CSP:`default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:`。`data:` 仅用于显示对话内嵌的 base64 图片,**不放行任何外部 http(s) 图源**。
- **resume 命令注入防护**:`sessionId` 必须匹配 UUID 正则;cwd 经转义 + `JSON.stringify`。
- Markdown 不渲染原始 HTML,防 XSS。
- **数据修改一律显式 + 可恢复**(见 §2.2):默认只读;删除会话走**系统废纸篓**(非永久删)、删除单条消息**先归档备份再占位改写**、隐藏只写独立元数据;`sessionId` 均经 UUID 校验后才碰文件系统。
- 占位改写**只重写目标行、保留结构键**,不破坏父子链与 tool 配对;改写与备份均**原子写**(tmp + rename)。
- 所有自建元数据文件(别名/隐藏/删除记录)损坏都不致崩溃(返回空表)。

---

## 12. 构建、运行、测试

### 12.1 脚本(`package.json`)
```jsonc
{
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "rebuild": "electron-rebuild -f -w better-sqlite3",
    "postinstall": "electron-rebuild -f -w better-sqlite3",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```
- **better-sqlite3 是原生模块**,必须用 `electron-rebuild` 针对 Electron 的 ABI 重编译(已挂 `postinstall`)。
- `electron.vite.config.ts`:main 把 `better-sqlite3` 列入 `rollupOptions.external`;renderer 用 `@vitejs/plugin-react`,alias `@renderer → src/renderer/src`。
- 三套 tsconfig:`tsconfig.json`(references)、`tsconfig.node.json`(main/preload/shared)、`tsconfig.web.json`(renderer)。

### 12.2 运行
```bash
npm install        # 装依赖 + 自动 electron-rebuild
npm run dev        # 开发模式(起 vite + electron 窗口)
npm run build      # 生产构建到 out/
npm test           # 跑单测
```

### 12.3 测试覆盖(vitest,共 98 个 / 11 文件)
`vitest.config.ts`:`include: ['src/**/*.test.ts']`,`environment: 'node'`。纯逻辑与依赖 electron/DOM/原生模块的代码分离,测试才能在 node 环境跑;别名/隐藏/删除记录测试均注入临时文件路径,**绝不污染真实 `~/.claude`**。
- `jsonl-parser.test.ts`(11):各 type 行解析、坏行容错、isSidechain 跳过、**tool_result 标 `tool` / 含 text 仍 `user`**、时间排序、**image 块抽为 data: URI / 纯图片消息不被丢弃 / tool_result 内嵌图片**。
- `paths.test.ts`(3):`dirNameToPath`(含连字符不可逆的已知限制)。
- `aliases.test.ts`(6):增删改、空白=清除、原子写不残留 tmp、损坏 JSON 返回空表。
- `resume-utils.test.ts`(4):UUID 校验拒绝注入、AppleScript 转义、命令构造。
- `messageContent.test.ts`(8):命令三元组合并、stdout/caveat/reminder 提取、文本与标签混排保序、未知标签原样保留、连续多命令。
- `search-utils.test.ts`(6):LIKE 通配符 / FTS phrase 双引号转义(含中文)。
- `ipc-utils.test.ts`(17):标题五级优先级、别名命中、`matchedIn` 分类、摘要组装(含 hidden)。
- `useApi.test.ts`(14):`basename` / 相对时间 / 日期时间格式化(本地构造+解析,时区无关)。
- `hidden.test.ts`(6):隐藏增删、原子写、损坏返回空表。
- `removed.test.ts`(7):删除记录增删、幂等去重、整会话清空、损坏返回空表。
- `message-edit.test.ts`(16,**核心**):占位改写**保留 tool 配对键**(id/tool_use_id)、只改命中行其他行逐字保留、恢复精确还原、归档追加不覆盖原文。

> ⚠️ 纯逻辑(解析、别名、resume-utils、messageContent)与依赖 electron/DOM 的代码必须分离,测试才能在 node 环境跑。别名测试通过注入临时文件路径隔离,**绝不污染真实 `~/.claude`**。

### 12.4 运行时验证要点(复刻后自检)
- better-sqlite3 捆绑的 SQLite **必须支持 `trigram` FTS5 分词器**(SQLite 3.34+ 默认编译);可用 `ELECTRON_RUN_AS_NODE=1 electron <脚本>` 加载 better-sqlite3、建 trigram 虚拟表、插中文、`MATCH '"子串"'` 验证命中。
- 首次索引会在 `~/.claude/session-history-index.sqlite` 生成;真机应能列出全部项目与会话。
- **主题切换必须做运行时实测验证**(只看源码/编辑器反馈不可靠,见 §15 提醒)。在 DevTools console 或 Playwright 里执行:
  ```js
  const html = document.documentElement
  const read = t => { html.setAttribute('data-theme', t); return getComputedStyle(html).getPropertyValue('--bg').trim() }
  ;['obsidian','nocturne','phosphor','paper','sepia'].map(t => [t, read(t)])
  // 期望:每套返回各自的 --bg(paper=#faf8f2、phosphor=#0a0e0a …);若全部相同 → [data-theme] 块缺失/未生效
  ```
  也可直接 `fetch('/src/renderer/src/styles.css').then(r=>r.text()).then(c=>c.match(/\[data-theme=/g)?.length)`,应为 **4**(默认 obsidian 在 `:root`,其余 4 套各一块)。

---

## 13. 依赖清单(参考版本)

**dependencies**
- `better-sqlite3` ^11
- `react-markdown` ^9, `remark-gfm` ^4, `rehype-highlight` ^7, `highlight.js` ^11

**devDependencies**
- `electron` ^33, `electron-vite` ^2, `vite` ^5, `@vitejs/plugin-react` ^4
- `@electron/rebuild` ^3
- `react` ^18, `react-dom` ^18
- `typescript` ^5.7, `vitest` ^2
- `@types/better-sqlite3`, `@types/node`, `@types/react`, `@types/react-dom`

---

## 14. 已知限制与注意事项
- **目录名逆向不可靠**:始终以 jsonl 内 `cwd` 为准,目录名仅兜底。
- **删单条消息后索引/搜索延迟同步**:占位改写只改工作文件,SQLite 索引要到下次增量索引才更新,短期内全文搜索仍可能命中被删消息的原文。
- **隐藏不改项目会话计数**:左栏 `sessionCount` 来自索引、不感知隐藏表,隐藏一个会话后该项目计数不减 1(删除会减,因为索引行被移除)。
- **占位改写会动原始 `.jsonl`**:虽保留结构 + 完整归档备份,但若在 Claude Code 正打开该会话时改写,可能需重新 `resume` 生效。
- **内容搜索需 ≥3 字符**(trigram 限制);更短的查询只搜标题。
- **resume 调起目前只保证 macOS**;其它平台走剪贴板兜底。
- 首次全量索引在数百 MB 数据下需要一定时间(增量后秒级);用事务批量提交 + 让出事件循环缓解。
- Electron 窗口 `backgroundColor` 固定深色,浅色主题首帧会短暂见深色窗口底(可接受)。
- 中文搜索依赖 trigram;若底层 SQLite 不含 trigram 需换 SQLite 构建或改分词策略。

---

## 15. 从零复刻建议步骤
1. `electron-vite` 脚手架建三段式骨架;配 `electron.vite.config.ts` / 三套 tsconfig / `.gitignore`(忽略 `node_modules out dist .vite coverage`)。
2. 装依赖,确认 `postinstall` 的 `electron-rebuild` 跑通;用 trigram 烟雾脚本验证 FTS5。
3. 先写 `shared/types.ts`,再写主进程纯函数层(`paths` / `jsonl-parser` / `resume-utils` / `aliases`)并配单测(TDD)。
4. 写 `db.ts`(schema + 查询)与 `indexer.ts`(增量),用 `ELECTRON_RUN_AS_NODE` 对真实数据跑一遍确认能索引。
5. 写 `ipc.ts`(别名合并 + 标题计算 + 搜索/详情/改名/resume)、`index.ts`、preload。
6. 写渲染层:`App` 状态编排 → 三栏组件 → `Markdown` / `UserSegments` / `MessageBubble`(含 tool 折叠)→ `messageContent` 解析 + 单测。
7. 最后做主题系统:`styles.css` 的 `:root` + 4 个 `[data-theme]` + `--hl-*` 代码配色 + 切换器;`themes.ts` / `useTheme.ts` / `ThemeSwitcher.tsx`;`main.tsx` 提前 `applyStoredTheme()`。
8. 全程:`npm run typecheck && npm test && npm run build` 三连验证。

> **复刻经验提醒**:CSS 变量写死值改主题化时,务必逐处把"假设深色"的硬编码(user 气泡、遮罩、阴影、accent 上的文字)改成变量并定义全部 5 套,否则浅色主题或主题切换会"无反应"/错位。
>
> **更关键的教训(主题"点击无反应"的真实根因)**:`:root` 与多个 `[data-theme]` 块若分次写入,**很容易出现"`:root` 写进去了、但 4 个 `[data-theme]` 块没真正落盘"的情况**——此时切换 `data-theme` 没有任何规则可匹配,颜色永远停在默认主题,表现就是"点击无反应"。一定要按 §12.4 做**运行时实测验证**:
> 1. `getComputedStyle(html).getPropertyValue('--bg')` 在不同 `data-theme` 下必须返回不同值(深↔浅);
> 2. `fetch` 实际加载的 `styles.css`,正则数 `[data-theme=` 必须 = 4。
>
> 不要只凭"源码看起来对了"或编辑器/命令行的文本反馈下结论——若工具反馈不可靠,运行时 `getComputedStyle` / 浏览器 `fetch` 才是唯一可信的判据。
