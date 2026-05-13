# rebuildproject

> 一条命令，把本地代码仓库反推成一份**项目搭建实战课**——不只是步骤清单，而是教你**为什么这么搭、重点在哪里、难点怎么破、可迁移的精髓是什么**。

`rebuildproject` 是一个 CLI 工具：在任意代码仓库里跑一条命令，它会用 AI **从代码反推出工程师的搭建思路**，按"立意 → 选型 → 抽象 → 模块深挖 → 串通 → 韧化 → 出厂"的认知顺序，生成一份 Markdown 实战课。读完跟着做，你会得到与原项目逐字节一致的副本——但更重要的是，你**掌握**了它**为什么是这样**、其中哪几步是关键、哪几步是难点。

> 它和 [zread\_cli](https://github.com/ZreadAI/zread_cli) 的核心区别——
> zread 输出"项目是什么"的 Wiki；本工具输出"项目是如何被一步步建造起来的"的实战课，每章强制包含 **设计思路 / 重点 / 难点 / 实现 / 精髓** 五个深度小节。

***

## 手册章节脉络（按"工程师怎么思考"组织，不是按"目录顺序"）

| 章 | 标题 | 在教什么 | 强制深度小节 |
|---|---|---|---|
| 00 | 立意与全景 | 项目要解决什么真问题？边界在哪？哪几个设计决策贯穿全书？ | 项目意图 / 关键设计决策 / 重难点地图 / 学习路线 |
| 01 | 选型与脚手架 | 为什么是这个语言/框架/构建工具？同类替代为什么不选？项目从零怎么起 | 设计思路 / 重点 / 难点 / 精髓 |
| 02 | 依赖与配置 | 把工程跑起来的全部基础——依赖背后的取舍、配置的契约 | 设计思路 / 重点 / 难点 / 精髓 |
| 03 | 核心抽象 | 入口、跨模块契约、关键类型与接口——这是看懂全书的"语言" |设计思路 / 重点 / 难点 / 精髓 |
| 04 | **模块深挖**（每个模块独立一章）| 这个模块要解决的子问题、可选解、最终选了哪种、踩过什么坑 | 设计思路 / 重点 / 难点 / 实现 / 精髓 |
| 05 | 韧性与测试 | 边界、错误路径、防退化——工程"硬度"是怎么注入进去的 | 设计思路 / 重点 / 难点 / 精髓 |
| 06 | 出厂与运维 | 从 main 分支到生产，构建/部署/CI/可观测的完整链路 | 设计思路 / 重点 / 难点 / 精髓 |

**核心承诺**：每章不是"复述代码做了什么"，而是回答 4 个问题——
1. **为什么必须有这一步？**（设计思路）
2. **本章里哪几个决策是命脉？**（重点）
3. **哪里最容易踩坑、最反直觉？**（难点）
4. **跳出本项目，能迁移到别处的工程原则是什么？**（精髓）

***

## 工具实现：一条 5 步 pipeline + 自主迭代

```
┌─────────────────────────────────────────────────────────────────────┐
│                        rebuildproject pipeline                      │
├──────────┬──────────┬──────────┬──────────┬──────────┐              │
│ Discover │   Map    │   Plan   │  Author  │ Compose  │              │
│  扫文件  │ 建依赖图 │ 章节大纲 │  AI 撰写 │ 写到磁盘       │                    │
│  识技术栈│ 拓扑排序 │ 思路脉络 │  自校验  │ + 索引       │                   │
│          │          │          │  + 修订  │          │               │
└──────────┴──────────┴──────────┴──────────┴──────────┘              │
                                      │                               │
                                      ▼                               │
                          ┌─────────────────────────┐                 │
                          │ Critique → Repair (loop)│ 自主迭代         │
                          │ 缺设计思路？补；缺难点？补；│                 │
                          │ 缺精髓？补；缺代码？补     │                 │
                          └─────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Author 步是核心**：每章生成后 validator 检查 6 个深度小节（设计思路 / 重点 / 难点 / 实现步骤 / 精髓 / 验证）+ 文件代码块完整性 + 占位符。任一不达标，把缺陷列表喂回模型让它针对性修订，最多 2 轮。这就是"自主迭代"——AI 不是一锤子买卖，而是写 → 自我审查 → 修订循环。

***

## 安装为全局命令

```bash
# 克隆并打包
git clone <this-repo>
cd rebuildproject
npm install
npm run build

# 全局链接，从此 `rebuildproject` 在任意目录都能跑
npm link
```

或者发布到 npm 后：

```bash
npm i -g rebuildproject
```

需要 Node.js ≥ 20。

***

## 快速开始

```bash
# 1. 体检环境（可选，但推荐）
rebuildproject doctor

# 2. 配置 AI provider（首次使用）
rebuildproject config

# 3. 在任意目标项目里
cd ~/work/some-repo
rebuildproject generate

# 4. 浏览器看
rebuildproject preview
# 打开 http://localhost:4567

# 5. 自检：把手册里的代码块复原出来，逐文件 diff 原项目
rebuildproject verify
```

输出落在 `./rebuild-guide/`：

```
rebuild-guide/
├── README.md                       # 总目录
├── 00-intent.md                    # 立意与全景：项目意图 / 关键设计决策 / 重难点地图
├── 01-stack-and-scaffold.md        # 选型与脚手架：栈为什么这么挑
├── 02-deps-and-config.md           # 依赖与配置：跑起来的全部基础
├── 03-core-abstractions.md         # 核心抽象：入口、契约与跨模块语言
├── 04-modules/                     # 模块深挖：每个模块独立一章，思路/重点/难点
├── 05-resilience-and-tests.md      # 韧性与测试：守住边界，防止退化
└── 06-ship-and-ops.md              # 出厂与运维：从 main 到生产
```

每章统一深度结构：**目标 / 前置 / 设计思路 / 重点（2-4 个）/ 难点（1-3 个）/ 实现步骤（含完整代码块）/ 精髓 / 验证**。

***

## 三种 AI Provider

| Provider              | 适用场景                                                | 凭据                                |
| --------------------- | --------------------------------------------------- | --------------------------------- |
| **claude-code**（推荐）   | 已装 Claude Code CLI，希望直接复用其登录态                       | 不需要 API key                       |
| **claude**            | 想直接用 Anthropic API                                  | `ANTHROPIC_API_KEY` 或 `config` 里填 |
| **openai-compatible** | 用 OpenAI / DeepSeek / Kimi / 智谱 / OpenRouter / 自建端点 | `OPENAI_API_KEY` + 改 `baseURL`    |

切换 provider：

```bash
rebuildproject config                   # 交互式重选
# 或单次命令覆盖：
rebuildproject generate -p openai-compatible
```

配置文件：`~/.rebuildproject/config.yaml`

***

## 子命令一览

| 命令                        | 说明                                      |
| ------------------------- | --------------------------------------- |
| `rebuildproject generate` | 主流程：跑完整 pipeline，落盘手册                   |
| `rebuildproject config`   | 交互式选 provider / 填 API key / 选输出语言       |
| `rebuildproject preview`  | 起本地静态服务（默认 4567）在浏览器里看手册                |
| `rebuildproject verify`   | 提取手册里的代码块写到临时目录，与原项目逐文件 diff            |
| `rebuildproject doctor`   | 体检：claude CLI / API key / Node 版本 / 写权限 |

`generate` 常用 flag：

```bash
rebuildproject generate -C /path/to/repo  # 指定目录
rebuildproject generate -c 5              # 章节并发数
rebuildproject generate -r 2              # 每章最多 2 轮自动修订
rebuildproject generate -p claude-code    # 临时切 provider
```

***

## 代码组织（好读好理解）

```
src/
├── cli.ts                       入口：注册命令并 dispatch
├── commands/                    五个子命令，每个独立一文件
│   ├── generate.ts              ── 唯一职责：解析 flag → runPipeline
│   ├── config.ts
│   ├── preview.ts
│   ├── verify.ts
│   └── doctor.ts
├── pipeline/
│   ├── index.ts                 串联 PIPELINE = [discover, map, plan, author, compose]
│   ├── types.ts                 Step<I,O> 接口 + 各步 typed I/O
│   └── steps/                   每步一文件，看名字就知道做什么
│       ├── discover.ts
│       ├── map.ts
│       ├── plan.ts
│       ├── author.ts            ── 含 critique/repair 循环
│       └── compose.ts
├── core/                        无 AI 的纯本地分析
│   ├── scanner.ts
│   ├── stack-detector.ts
│   ├── dep-graph.ts
│   ├── layerer.ts
│   ├── planner.ts
│   ├── chapter-builder.ts       唯一与 prompt 模板交互的地方
│   ├── validators.ts            自检规则
│   └── writer.ts
├── providers/                   AI 后端，统一 Provider 接口
│   ├── types.ts
│   ├── claude-code.ts           ── 用本地 `claude -p` 子进程
│   ├── claude.ts                ── @anthropic-ai/sdk
│   ├── openai.ts                ── OpenAI 兼容
│   └── index.ts                 工厂
├── prompts/index.ts             所有 prompt 模板集中在此
├── config/store.ts              ~/.rebuildproject/config.yaml
└── utils/
    ├── exec.ts                  subprocess 封装
    ├── concurrency.ts           p-limit 风格的并发控制
    └── logger.ts
```

读源码的入口顺序：`src/cli.ts` → `src/commands/generate.ts` → `src/pipeline/index.ts` → `src/pipeline/steps/*.ts`。

***

## 设计取舍

- **依赖图浅解析**：跨语言只做正则级 import 抽取，复杂仓库可能漏边——L4 兜底按目录聚合。
- **完整代码块**：Author 强制 AI 给出每个文件的完整内容；validator 检测占位符；这样 `verify` 才能 diff 原项目。
- **本地优先**：所有 IO 仅在本地，不上传任何代码。
- **claude-code 模式**：跟 claude 子进程通信用 stdin/stdout，禁用 `Edit/Write/NotebookEdit` 工具——只让它产生文本，不碰你的文件。

## 许可证

MIT
