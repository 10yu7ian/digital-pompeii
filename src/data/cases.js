// ────────────────────────────────────────────────────────────────────────────
// Exhibit Output Schema (已迁移 / migrated to new forensic format):
//   id, title, year, category, chain, loss   ← 前端元数据
//   death_cause                               ← 死亡原因（中文）
//   confidence                                ← 置信度 0–1
//   timeline[]  { timestamp, event }          ← 攻击时间线（中文）
//   technical_findings[]                      ← 结构化取证证据
//     ├ evidence_type  string                 ← "code_vulnerability" | "on_chain_transaction" | "fund_flow" | "historical_record"
//     ├ tx_hash        string | null          ← 关联交易哈希（可选）
//     ├ involved_addresses  string[]          ← 相关地址列表
//     ├ reasoning      string                 ← 推理说明（中文）
//     └ confidence     number (0–1)           ← 该条证据的置信度
//   alternative_hypotheses[]                  ← 替代假设（中文）
//   epitaph                                   ← 墓志铭（英文）
// ────────────────────────────────────────────────────────────────────────────

export const cases = [
  // ── 已迁移至新格式 ─────────────────────────────────────────────────────────
  {
    id: "the-dao",
    title: "The DAO Hack",
    year: 2016,
    category: "智能合约漏洞利用",
    chain: "Ethereum",
    loss: "$60M+",

    death_cause: "重入攻击：攻击者利用 splitDAO() 函数在余额更新前反复递归提款，将约 360 万 ETH 抽入子 DAO。",
    confidence: 0.96,

    timeline: [
      {
        timestamp: "2016-06-17T03:34 UTC",
        event: "攻击者首次调用 splitDAO()，触发重入循环，开始从主 DAO 合约递归提取 ETH。",
      },
      {
        timestamp: "2016-06-17T03:34–07:00 UTC",
        event: "攻击持续数小时，共递归循环数千次，累计转出约 360 万 ETH（约 6000 万美元）至攻击者控制的子 DAO。",
      },
      {
        timestamp: "2016-06-17T上午",
        event: "以太坊社区与开发者察觉异常，在论坛和 Reddit 发出警报，讨论紧急应对措施。",
      },
      {
        timestamp: "2016-06-17（当天）",
        event: "以太坊基金会宣布将通过软分叉冻结攻击者资金；因存在 DoS 风险，该方案随后被放弃。",
      },
      {
        timestamp: "2016-07-20",
        event: "以太坊在区块 1,920,000 执行硬分叉，回滚被盗资金；拒绝分叉的节点形成以太坊经典（ETC）链。",
      },
    ],

    technical_findings: [
      {
        evidence_type: "code_vulnerability",
        tx_hash: null,
        involved_addresses: ["0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413"],
        reasoning:
          "splitDAO() 函数在扣减发起者余额之前便向外部合约发起 ETH 转账，违反检查-效果-交互（CEI）模式，构成经典重入漏洞；攻击者可在状态更新前反复触发回调函数递归提款。",
        confidence: 0.99,
      },
      {
        evidence_type: "on_chain_transaction",
        tx_hash: "0x0ec3f2488a93839524add10ea229e773f6bc891b4eb4794c3337d4495263790b",
        involved_addresses: [
          "0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413",
          "0x304a554a310C7e546dfe434669C62820b7D83490",
        ],
        reasoning:
          "攻击交易（区块 1,718,497）的调用栈显示 withdrawRewardFor() 在同一笔交易内被递归调用逾千次，是重入攻击的直接链上证据，交易 gas 消耗远超正常水平。",
        confidence: 0.98,
      },
      {
        evidence_type: "fund_flow",
        tx_hash: null,
        involved_addresses: [
          "0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413",
          "0x304a554a310C7e546dfe434669C62820b7D83490",
        ],
        reasoning:
          "攻击结束时，攻击者控制的子 DAO 地址（0x304a...）累计余额约 360 万 ETH，与 The DAO 主合约同期余额减少量完全吻合，资金流向清晰可溯。",
        confidence: 0.97,
      },
      {
        evidence_type: "code_vulnerability",
        tx_hash: null,
        involved_addresses: ["0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413"],
        reasoning:
          "The DAO 合约未设置重入锁（reentrancy guard），且在漏洞被利用前未通过任何正式第三方安全审计，缺乏基本的防御性编程措施与访问控制机制。",
        confidence: 0.99,
      },
      {
        evidence_type: "historical_record",
        tx_hash: null,
        involved_addresses: [],
        reasoning:
          "以太坊在区块 1,920,000 执行硬分叉，回滚被盗资金；拒绝分叉的节点形成以太坊经典（ETC）。链上状态不可篡改地保存了分叉前后的完整历史，为取证分析提供了充分的客观依据。",
        confidence: 0.99,
      },
    ],

    alternative_hypotheses: [
      {
        hypothesis: "内部人员攻击：The DAO 团队成员或早期知情者实施了攻击。",
        verdict: "已否定",
        reason: "攻击手法完全依赖公开可见的合约代码逻辑；任何具备 Solidity 知识的人均可独立发现并利用该漏洞，无需内部信息。",
      },
      {
        hypothesis: "协议级别漏洞：问题存在于以太坊虚拟机（EVM）本身，而非 The DAO 合约。",
        verdict: "已否定",
        reason: "EVM 按合约代码的既定逻辑正确执行；根本原因在于合约开发者的编码错误，而非 EVM 的缺陷。",
      },
      {
        hypothesis: "协调攻击：多名攻击者协同实施了此次攻击。",
        verdict: "证据不足",
        reason: "链上记录显示攻击主要由单一地址发起；虽存在关联地址，但尚无充分证据证明存在有组织的协调行为。",
      },
    ],

    epitaph:
      "The wound that split Ethereum into two histories.",
  },

  // ── 待迁移至新格式（暂保留旧结构）────────────────────────────────────────
  /*
  {
    id: "terra-luna",
    title: "Terra Luna Collapse",
    year: 2022,
    category: "Algorithmic Stablecoin Collapse",
    epitaph: "An algorithmic empire buried under its own promise of stability.",
    loss: "$40B+",
    chain: "Terra",
    summary:
      "In May 2022, TerraUSD (UST) — an algorithmic stablecoin pegged to $1 via a mint-burn mechanism with LUNA — lost its peg and triggered a hyperinflationary death spiral. As UST depegged, the protocol minted exponentially more LUNA to restore the peg, destroying LUNA's value in days. Over $40 billion in market cap evaporated, wiping out retail investors and shaking the entire crypto market. The collapse exposed the fundamental fragility of endogenous collateral systems.",
    evidence: [
      "UST relied solely on LUNA as collateral — a reflexive system with no external backing.",
      "Anchor Protocol offered 20% APY on UST, attracting unsustainable capital inflows.",
      "Large coordinated UST sell-offs on May 7–8 triggered the initial depeg.",
      "The mint-burn mechanism went into hyperinflationary overdrive: LUNA supply went from 350M to 6.5 trillion tokens in days.",
      "LUNA price collapsed from ~$80 to fractions of a cent within 72 hours.",
      "Do Kwon's Luna Foundation Guard deployed $3B in BTC reserves — insufficient to stop the spiral.",
    ],
    lessons: [
      "Algorithmic stablecoins backed by endogenous assets are inherently fragile under coordinated attacks.",
      "Artificially high yields (Anchor's 20% APY) mask systemic risk and attract speculative rather than stable capital.",
      "Reflexive collateral systems can unwind faster than any intervention can operate.",
      "Regulators and investors must distinguish between collateralized and algorithmic stablecoins.",
    ],
  },
  */

  /*
  {
    id: "ftx",
    title: "FTX Collapse",
    year: 2022,
    category: "Centralized Exchange Collapse",
    epitaph: "A centralized throne disguised as a decentralized dream.",
    loss: "$8B+",
    chain: "Multiple",
    summary:
      "In November 2022, FTX — once the world's third-largest crypto exchange — collapsed in under a week after a leaked balance sheet revealed that Alameda Research, FTX's sister trading firm, held a balance sheet dominated by FTT (FTX's own exchange token). A cascade of withdrawal requests exposed a $8B+ shortfall: customer funds had been secretly lent to Alameda for high-risk investments. CEO Sam Bankman-Fried was arrested and later convicted on multiple counts of fraud and conspiracy, marking the largest financial fraud in crypto history.",
    evidence: [
      "Leaked Alameda balance sheet showed ~$5.8B of $14.6B in assets were FTT — illiquid and self-issued.",
      "Binance's CZ announced he would liquidate all FTT holdings, triggering a bank run.",
      "FTX processed $6B in withdrawals in 72 hours before freezing all outflows.",
      "On-chain analysis revealed ~$8B in customer funds were transferred to Alameda.",
      "FTX filed for Chapter 11 bankruptcy on November 11, 2022.",
      "SBF was arrested in the Bahamas on December 12, 2022; convicted on all 7 counts in November 2023.",
    ],
    lessons: [
      "Centralized exchanges must undergo mandatory proof-of-reserves audits with third-party verification.",
      "Commingling customer funds with proprietary trading operations is fraud, regardless of intent.",
      "Celebrity endorsements and effective altruism branding are not substitutes for financial transparency.",
      "Self-issued exchange tokens as primary collateral are a critical red flag.",
      "The collapse accelerated global regulatory pressure on centralized crypto exchanges.",
    ],
  },
  */
];
