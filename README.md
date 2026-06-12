<!-- 提交前请全局搜索 〈 把所有占位符替换成真实内容 -->

# 数字庞贝 · Digital Pompeii

> 一座为链上失败而建的去中心化废墟博物馆。
> An autonomous on-chain coroner & curator — for the projects that died of greed, bugs, and betrayal.

**一句话**：输入一个已经死去的链上项目地址，一个自主 Agent 会像法医一样，从不可篡改的链上证据里还原它真正的死因，再像策展人一样，把它立成一座兼具技术严谨与文学重量的「警示碑」，陈列在一座黑暗博物馆里。

- 🏛️ 博物馆入口：https://digital-pompeii.vercel.app
- 🎬 Demo 视频：〈3–5 分钟视频链接〉
- 🏆 赛道：Z.AI · Web3 × Long-Horizon Task

---

## 一、它解决什么问题（现实意义）

在 Web2 世界，公司的失败和丑闻可以被公关、被删帖、被时间掩埋。但在链上，哪怕一个项目跑路、崩盘、被黑，它的「尸体」——智能合约与每一笔交易——依然不可篡改地、永远地沉睡在区块链上。

**数字庞贝**用这一点，对抗 Web2 的遗忘机制：

- **公共物品（Public Goods）**：我们用不可篡改的技术，为后来的建造者立起一座座警示碑——警惕贪婪，敬畏代码。每一件展品都是一份可追溯、可复核的事故档案。
- **去中心化的现实意义**：失败的记录不该由任何中心化平台决定能不能被看见。链上的尸体删不掉，我们只是把它策展出来。

---

## 二、它如何工作（核心：长程自主 Agent）

数字庞贝不是一个「把准备好的资料喂给模型润色」的内容工具。它的核心是一个**自主、多步、会自我纠错的链上法医 Agent**，由 GLM-5.1 驱动：

```
输入：一个合约地址
  │
  ▼
① 勘验现场   ── Agent 自主调用工具，取得已验证源码与基本信息
② 解剖代码   ── 通读源码，标出可疑函数 / 权限 / 缺失校验
③ 追踪血流   ── 拉取并追踪关键交易，定位「致命一刀」落在哪一笔
④ 死因假设   ── 基于代码缺陷 + 交易证据，提出死因
⑤ 交叉验证   ── 主动找反证、复核每条结论；证据冲突则修正  ← 自我纠错
⑥ 结案产出   ── 证据链成立后，生成「双层展品」
  │
  ▼
输出：一件展品（technical findings + 文学墓志铭，结构化 JSON）
```

**双层产物**，泾渭分明：
- **技术尸检层**（冷峻、可追溯）：死因、每条带证据与 `tx_hash` 的尸检结论、时间线、致命交易、损失规模。
- **策展词层**（史学家与诗人的声音）：悲剧文学笔触的墓志铭，与刻给后来者的工程警示。

> 设计铁律：**先调查、后文学；技术层零虚构。** 文学只为已查实的事实赋形，每个出现在墓志铭里的数字都必须在技术层里有据可查。证据不足时 Agent 明确标注「存疑」，绝不编造。

---

## 三、架构

```
┌─────────────────────────────────────────────────┐
│  前端 · 黑暗博物馆 (src/)                          │
│  React + Vite + Tailwind，渲染展品 JSON 成展厅      │
└───────────────▲─────────────────────────────────┘
                │  展品 JSON（约定 schema）
┌───────────────┴─────────────────────────────────┐
│  后端 · 法医 Agent (agent/coroner.py)             │
│  ├─ 运行时大脑：GLM-5.1 via Z.AI API              │
│  ├─ system prompt：策展人/法医人设                 │
│  └─ tool-calling 循环：自主调用 9 个只读工具        │
│        • get_contract_source / get_transactions  │
│        • get_tx_detail / get_event_logs          │
│        • get_large_outflows / get_token_transfers│
│        • resolve_proxy（EIP-1967 代理穿透）        │
│        • get_transactions_by_date（时间窗口查询）  │
│        • get_upgrade_history（升级考古·定位案发实现）│
└───────────────▲─────────────────────────────────┘
                │  只读
        ┌───────┴────────┐
        │  以太坊链上数据  │   （可选）OpenTimestamps：
        │  (Etherscan API)│    将报告哈希锚定上链，永久防篡改
        └────────────────┘
```

- **数据接口**：后端与前端通过一份《展品 JSON 规范》解耦（见 `exhibit_schema.json`），两端可并行开发。
- **全程只读链**：本项目不向链上写入、不持有私钥、不连接钱包（上链存证为可选模块，使用免费的 OpenTimestamps）。

技术栈：Python · GLM-5.1（Z.AI API，OpenAI 兼容）· Etherscan API · React + Vite + Tailwind CSS。

---

## 四、GLM-5.1 调用位置与关键流程

> 本节为 Z.AI 赛道必填项。

- **调用位置**：`agent/coroner.py` 中的 Agent 主循环。`system` 字段为内置的法医/策展人人设与方法论（含强制查证事件日志、代理合约穿透规则、治理攻击排查纪律等约束）。
- **关键流程**：模型在循环中**自主决定每一步该调用哪个工具、查什么**——不是固定脚本。它根据上一步工具返回的结果，决定下一步是继续读代码、还是去拉某笔交易、还是已经可以下结论；并在定稿前对自己的结论做一轮反证复核（自我纠错）。最终由模型生成符合 schema 的双层 JSON。
- **为何是长程任务**：单个案例通常需要 6–12 轮工具调用（上限 12 轮）与多次假设修正才能结案，模型需在整个过程中保持目标一致、不跑偏——这正是 GLM-5.1 长程执行能力被关键性使用的地方，而非一次性问答。

调用示例（OpenAI 兼容）：
```python
from openai import OpenAI
client = OpenAI(api_key=ZAI_API_KEY, base_url="https://api.z.ai/api/coding/paas/v4/")
# model="glm-5.1"，注册 tools，循环执行 tool calls 直至结案
```

---

## 五、运行方式

```bash
# 1. 克隆
git clone https://github.com/10yu7ian/digital-pompeii.git && cd digital-pompeii

# 2. 后端环境
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r agent/requirements.txt                # openai / requests / python-dotenv

# 3. 配置密钥（复制模板再填入你的 key）
cp .env.example .env
#   编辑 .env：ZAI_API_KEY=...   ETHERSCAN_API_KEY=...

# 4. 启动前端博物馆（已内置 5 件展品数据，这一步即可看完整 Demo）
npm install && npm run dev     # 浏览器打开 http://localhost:5173

# 5.（可选）自己对一个新合约跑尸检：输出单案 JSON，再合并进 exhibits.json
set -a && source .env && set +a
python3 agent/coroner.py 0x<合约地址> --mode ai -o data/<id>.json
python3 scripts/merge_exhibits.py
```

> 💡 **只想看 Demo**：执行第 1、4 步即可——展品数据已随仓库提供，无需密钥、无需跑后端。
> 想**复现 Agent 调查**才需要配置密钥（第 2、3 步）跑第 5 步。

### 项目结构

```
digital-pompeii/
├── agent/
│   └── coroner.py            # 法医 Agent 主体：GLM-5.1 tool-calling 循环 + 9 个只读工具
├── data/
│   ├── exhibits.json         # ← 前端读取的合并展品数据（5 案）
│   └── <id>.json             # 单案双层档案（技术尸检 + 文学策展）
├── scripts/
│   ├── merge_exhibits.py     # 合并单案 JSON → exhibits.json
│   └── build_runs_index.py   # 把 runs/ 日志构建成前端可视化索引
├── runs/                     # 每次调查的完整 JSONL 审计日志（可复现）
├── src/                      # 前端 · 黑暗博物馆（React + Vite + Tailwind）
│   ├── components/           # Landing / CaseDetail / AgentConsole / HealthCheck …
│   └── data/                 # 前端数据入口（import 上面的 exhibits.json + runs 索引）
├── exhibit_schema.json       # 展品 JSON 规范（前后端解耦的约定）
├── README.md  ·  FACT_CHECK.md  ·  GLM_INVESTIGATION_LOG.md   # 文档 / 核查 / 调查实录
└── .env.example              # 密钥模板
```

---

## 六、长程任务运行记录

每次调查的完整过程（任务拆解、每一次工具调用与返回、假设的提出与修正、最终交付）记录在 `runs/` 下，可复现、可审计。Demo 视频中也展示了 Agent 当场自主调查的实时过程。

示例运行：[`runs/run_20260612_081512_BB9bc244.jsonl`](runs/run_20260612_081512_BB9bc244.jsonl)（The DAO · 6 轮工具调用 · AI 模式全程审计日志）

---

## 七、Web3 证明

- **真实链上调查**：以下为已收录的 5 个真实案例，死因均由 Agent 从链上证据自主还原、可在 Etherscan 复核：

| # | 案例 | 死亡日期 | 死因（AI 自主判定） | 损失 | AI 置信 |
|:-:|---|---|---|--:|:-:|
| 1 | The DAO | 2016-06-17 | 重入攻击 | \$60M | 0.93 |
| 2 | Parity 多签钱包 | 2017-11-06 | 库合约自毁 → 资产冻结 | \$300M | 0.94 |
| 3 | Ronin 跨链桥 | 2022-03-23 | 验证节点私钥泄露 | \$625M | 0.75 |
| 4 | Beanstalk | 2022-04-17 | 闪贷治理攻击 | \$182M | 0.75 |
| 5 | Nomad 跨链桥 | 2022-08-01 | 初始化漏洞 → 消息验证绕过 | \$190M | 0.65 |
| | **合计 · 5 案** | 2016 – 2022 | **全部纯 AI 模式**（`hybrid_mode: false`）| **\$1.357B** | — |

合约地址（点开即可在 Etherscan 验证）：
| 案例 | 合约地址 |
|---|---|
| The DAO | `0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413` |
| Parity | `0x863DF6BFa4469f3ead0be8f9F2AAE51c91A907b4` |
| Ronin | `0x098b716b8aaf21512996dc57eb0615e2383e2f96` |
| Beanstalk | `0xC1E088fC1323b20BCBee9bd1B9fC9546db5624C5` |
| Nomad | `0x5d94309e5a0090b165fa4181519701637b6daeba` |

> 每件展品的完整双层档案（技术尸检 + 文学墓志铭 + 后果 + 防范建议 + 余波）见 [`data/<id>.json`](data/)，合并版见 [`data/exhibits.json`](data/exhibits.json)。

- **5 案全部纯 AI 模式结案**（`hybrid_mode: false`）：由 GLM-5.1 自主多轮工具调用独立定因，无人工兜底。
- **内容经外部逐条核查**：5 案的每一处数据、死因、墓志铭都对照外部公开资料（Wikipedia / Immunefi / Halborn / Proskauer 等）核实并改正，留档于 [`FACT_CHECK.md`](FACT_CHECK.md)——技术层零虚构，文学层不编造。
- **攻坚「翻新后的废墟」**：Beanstalk / Nomad 是最难的两例——攻击后协议被升级/迁移，链上现状是「翻新后的废墟」（实现合约已替换、存储槽被清零），直接读 `latest` 只会看到修复版而非案发现场。为此我们构建了**升级考古工具 `get_upgrade_history`**：回放代理的实现变更史，自动定位攻击当时在任的实现合约（Nomad 的攻击前 `Replica`）或携带恶意 init 合约的治理 cut（Beanstalk 的 BIP-18 攻击者合约 `0xe5ecf736…`，靠「未验证 init + 该 cut 交易日志数最高」的链上足迹自动锁定，不依赖外部已知日期）。正因如此，这两案才得以从 hybrid 升级为纯 AI 模式。
- **链上存证**：每件展品的报告哈希通过 OpenTimestamps 锚定比特币区块链，凭证文件见 [`data/*.json.ots`](data/)，可用 `ots verify` 独立验证。

---

## 八、安全 · 成本 · 权限边界

> 本节为赛道必填项。

- **权限边界**：全程**只读链上公开数据**，不写链、不持私钥、不连钱包、不发起任何交易。可选的上链存证仅写入内容哈希（OpenTimestamps，免费、无需钱包）。
- **失败处理 / 人工介入**：LLM 可能出错，因此**每条技术结论都附链上证据、可人工复核**；证据不足时 Agent 主动标注「存疑」而非臆测。
- **风险措辞**：本项目（及未来的「上线前死因体检」功能）输出的是**风险信号，而非安全保证**。不对任何项目作「安全 / 不会出事」的承诺。
- **成本**：主要成本为 GLM-5.1 API 调用与 Etherscan 免费额度；注意调查循环的 token 消耗，已设单次调查的工具调用上限（12 轮）。

---

## 九、商业与迭代路线

- **现在（黑客松 MVP）**：废墟博物馆 + 自主法医 Agent —— 品牌、公共物品与免费获客入口。
- **下一步**：把同一套法医能力**调转枪口做预防**——「上线前 / 上车前死因体检」，按历史死因库逐条比对新项目的猝死风险（高频、可付费）。
- **护城河**：每验一具尸，**死因库**就厚一层、体检就更准——一个会复利、抄不走的数据资产。
- **更远**：可分享的「链上人格镜像」做病毒漏斗导流；3D 展馆；社区共同策展。

---

## 十、团队

Riso · Clara

## Built with

GLM-5.1 (Z.AI) · Etherscan API · Python · React + Vite。
开发过程使用 Claude Code / Codex / Cursor 辅助编码。

## License

MIT
