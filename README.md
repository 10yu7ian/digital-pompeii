

# 数字庞贝 · Digital Pompeii

> 一座记录链上失败、解释风险模式的去中心化灾难博物馆。
> An AI-powered on-chain disaster museum and forensic archive for Web3 failures.
>
> > 🏆 AI x Web3 Agentic Buiders Hackathon Z.AI赛道 冠军作品

**一句话**：输入一个链上项目或合约地址，Digital Pompeii 会让自主 Agent 从公开链上证据中还原事故原因，生成一份可复核、可读懂的「死亡报告」，并把它整理成一件面向后来者的链上安全展品。

- 🏛️ 博物馆入口：https://digital-pompeii.vercel.app
- 🎬 Demo 视频：https://drive.google.com/file/d/16mdazptZU9Pu-qo6AefLwiYlUcboSeHj/view?usp=sharing
- 📖 PPT 链接：https://notebooklm.google.com/notebook/ee168320-dad2-4ec7-868c-a88131fa971c/artifact/4dea903e-3454-4370-bb27-647b9c22bdfd?utm_source=nlm_web_share&utm_medium=google_oo&utm_campaign=art_share_2&utm_content=&utm_smc=nlm_web_share_google_oo_art_share_2_
- 🏆 赛道：Z.AI · Web3 × Long-Horizon Task

---

## 一、它解决什么问题（现实意义）

Web3 的失败往往很昂贵，但复盘却并不容易。黑客攻击、跑路、清算、治理事故和误签名常常散落在交易哈希、合约源码、论坛帖子和安全报告里。对普通用户来说，链上证据是公开的，却很难读懂；对后来者来说，同样的失败模式会一次又一次重演。

**数字庞贝**试图把这些碎片化的失败经验整理成可访问、可复核、可持续积累的公共知识：

- **公共物品（Public Goods）**：每一件展品都是一份可追溯、可复核的事故档案，让用户和 builder 能从真实失败中学习，而不是只在事后看到一个损失数字。
- **去中心化的现实意义**：链上数据天然公开、难以篡改，但需要被解释和组织。数字庞贝不是替代区块浏览器，而是在区块浏览器之上提供一层面向人的风险解释。

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
        │  以太坊链上数据  │     OpenTimestamps：
        │  (Etherscan API)│    将报告哈希锚定上链，永久防篡改
        └────────────────┘
```

- **数据接口**：后端输出结构化 JSON，前端直接读取 `data/exhibits.json`；参考格式见 [`data/the-dao.json`](data/the-dao.json)。

技术栈：Python · GLM-5.1（Z.AI API，OpenAI 兼容）· Etherscan API · React + Vite + Tailwind CSS。

---

## 四、GLM-5.1 调用位置与关键流程


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


- **权限边界**：全程**只读链上公开数据**，不写链、不持私钥、不连钱包、不发起任何交易。上链存证仅写入内容哈希（OpenTimestamps，免费、无需钱包）。
- **失败处理 / 人工介入**：LLM 可能出错，因此**每条技术结论都附链上证据、可人工复核**；证据不足时 Agent 主动标注「存疑」而非臆测。
- **风险措辞**：本项目（及未来的「上线前死因体检」功能）输出的是**风险信号，而非安全保证**。不对任何项目作「安全 / 不会出事」的承诺。
- **成本**：主要成本为 GLM-5.1 API 调用与 Etherscan 免费额度；注意调查循环的 token 消耗，已设单次调查的工具调用上限（12 轮）。

---

## 九、商业与迭代路线

**当前版本 · 可演示原型：链上灾难博物馆 + 免费合约体检**

当前版本以免费入口为主：链上灾难博物馆负责沉淀真实事故案例，「入坑前，先体检」负责让用户在接触新项目之前快速理解合约风险。用户只需要粘贴合约地址，AI 验尸官会用自然语言解释潜在异常、需要进一步确认的问题，以及和历史失败案例相似的风险信号。

这个阶段不设置付费门槛，目标是先建立品牌认知和公共物品价值：让链上失败被看见、被读懂，也让新用户在进入 Web3 前多一层低门槛的风险提醒。

**下一步 · 防猝死指数（Anti-Sudden-Death Index）**

下一阶段，Digital Pompeii 会把事故复盘能力前置到新项目上线前，形成结构化的风险评分产品。Agent 会基于历史失败模式，对项目进行多维度检查，输出「防猝死指数」：

- 合约与代码风险
- 治理与权限风险
- 资金流与代币分布风险
- 外部攻击面与交互风险

这个能力不替代专业审计，而是提供更早期、更高频、更容易理解的风险信号层。它可以服务于项目方自查、安全审计公司、VC 尽调、Launchpad 初筛、Grant / 黑客松项目筛选和社区投研。

**护城河 · 死因库（Failure Archive）**

Digital Pompeii 的核心护城河不是单次 AI 分析，而是持续积累的 **Failure Archive（死因库）**。每新增一个事故案例，系统都会沉淀更多失败模式：攻击路径、权限配置、资金流异常、治理漏洞、用户误操作、项目崩盘信号和事后影响。

随着案例数量增加，体检和评分会越来越准确，形成一个由真实链上事故驱动的数据飞轮。这类资产很难被单纯复制，因为它依赖长期案例积累、结构化标注、社区贡献和持续复盘。

**潜在商业化方向**

- **风险 API / 数据授权**：将 Failure Archive、风险标签和相似案例能力提供给钱包、交易聚合器、链上数据平台、安全工具和投研团队。
- **钱包与 dApp 签名前提醒**：在用户授权、mint、swap、bridge 前，提供一句可读的风险提示，帮助用户理解自己正在签什么。
- **项目风险透明页**：为项目方生成持续更新的公开风险 Profile，展示合约风险、权限风险、资金流风险和治理风险，帮助社区和投资人快速判断。
- **平台级项目筛选**：为 Launchpad、Grant、黑客松和孵化器提供项目初筛工具，降低人工评估成本。
- **事故复盘即服务**：当项目发生攻击、清算、治理争议或资金异常时，生成面向社区的链上时间线、关键交易解释和透明复盘报告。

**更远**

长期来看，Digital Pompeii 可以发展为一个开放的链上安全知识网络。未来版本会支持社区共同策展，让研究者、安全审计员、受害者和 builder 共同补充事故档案；也可以扩展为 3D 沉浸式展馆，用更直观的方式展示链上灾难的发生过程、资金流路径和安全教训。

最终目标不是制造恐惧，而是把 Web3 中昂贵的失败转化为公共知识，让后来者少踩同样的坑。

---

## 十、团队

Riso   liermi1996@gmail.com
Clara  f2621264671@gmail.com

## Built with

GLM-5.1 (Z.AI) · Etherscan API · Python · React + Vite。
开发过程使用 Claude Code / Codex / Cursor 辅助编码。

## License

MIT
