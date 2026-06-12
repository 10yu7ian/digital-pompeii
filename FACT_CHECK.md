# 事实核查记录 · Fact-Check Log（2026-06-12）

对全部 5 件展品的**所有对外内容**（数据、简介、墓志铭、取证、后果、防范、余波）逐条对照外部公开资料核查，修正了所有与客观事实不符之处。本文件留档核查发现、改正与来源。

> 原则：技术层零虚构，文学层只为已查实的事实赋形。本次核查即对此原则的一次全面落实。

---

## 一、修正清单

### The DAO（2016-06-17 · 重入攻击 · $60M）
| 字段 | 原（错） | 改为（对） | 依据 |
|---|---|---|---|
| 简介 | 递归"**362 次**" | "**两百多次**" | 公开资料为"over 200 attacks"；362 无法核实，疑似从"360万ETH"凑出 |
| 简介 | 卷走"约 **15%** 的以太坊流通量" | "掏走约 360 万 ETH，近 DAO 资产的 1/3（DAO 本身持全网约 **14%** 的 ETH）" | 把"DAO 持有 14%"误写成"偷走 15%"；攻击者实际仅取走 DAO 的约 1/3 |
| 墓志铭 | "三百六十二次递归" | "两百多次递归" | 同上 |

### Parity（2017-11-06 · 库合约自毁冻结 · $300M）
| 字段 | 原（错） | 改为（对） | 依据 |
|---|---|---|---|
| 简介 + 墓志铭 | "**513** 个钱包" | "**587** 个钱包" | "513"系把 513,774 ETH 的前三位误当钱包数；实际冻结 587 个钱包 |

### Beanstalk（2022-04-17 · 闪贷治理攻击 · $182M）
| 字段 | 原（错） | 改为（对） | 依据 |
|---|---|---|---|
| 简介 + 墓志铭 | 闪贷借入"**3.5 亿美元**" | "**约 10 亿美元**"（Aave+Uniswap+SushiSwap） | 总闪贷约 $1B |
| 简介 + 墓志铭 + 余波 | "**BIP-18**：捐给乌克兰" | **BIP-18 = 把国库掏给攻击者自己；BIP-19 = 捐乌克兰 25 万美元（烟雾弹）** | 两份提案被写反 |
| 简介 + 墓志铭 | "**同一笔交易里提交**提案并通过" | "提案**前一天（4-16）已提交**，次日借 emergencyCommit 通过执行" | emergencyCommit 要求满 24h，故提案必须提前一天 |
| 余波 | （无） | 补充"攻击者净赚约 **7600 万美元**（24,930 ETH）" | 还清闪贷后净利 |

### Ronin（2022-03-23 · 验证节点私钥泄露 · $625M）
| 字段 | 原（错） | 改为（对） | 依据 |
|---|---|---|---|
| 死因 | "私钥泄露 / **内部管理员作恶**" | "**验证节点私钥泄露**" | Ronin 是外部黑客（Lazarus/朝鲜）钓鱼盗私钥，非内鬼；"链上无法区分内外"的 nuance 移入证据层 |
| 墓志铭 | 触发败露"提款 **500 万美元**" | "提取 **5,000 枚 ETH**" | 触发点是一笔 5,000 ETH 提款失败 |

### Nomad（2022-08-01 · 消息验证绕过 · $190M）
| 字段 | 原（错） | 改为（对） | 依据 |
|---|---|---|---|
| 数据 + 墓志铭 + 余波 | 日期 "**2022-08-02**" | "**2022-08-01**" | 攻击发生于 8 月 1 日 |

### 开屏页（全站）
| 字段 | 原（错） | 改为（对） |
|---|---|---|
| "链上总损失" | 写死 **$2.1B**（且因缓动 bug 实际只显示一半 $10.5亿）| **从 5 案金额动态求和 = $1.36B / $13.6亿**；并修复 count-up 缓动公式 |

---

## 二、已核实准确（无需改动）
- **The DAO**：3.6M ETH、$60M、众筹约 $1.5 亿、2016-07-20 硬分叉、ETH/ETC 分裂、白帽（Robin Hood Group）救回约 700 万 ETH
- **Parity**：513,774 ETH 冻结、devops199、initWallet+kill 自毁、EIP-999 被否决、"当时价值约 $1.5 亿"（头部 $300M 为后续更高币价的常引数字，墓志铭已用"当时"限定，不冲突）
- **Beanstalk**：$182M 损失、67% 投票权、捐乌克兰 $25 万、BEAN 脱锚归零
- **Ronin**：$625M、9 验证者 5 签、假招聘 PDF 钓鱼→4 私钥、Axie DAO 休眠节点凑第 5 票、173,600 ETH + 2550 万 USDC、潜伏 6 天、Lazarus/FBI 归因、Binance/a16z 募资 1.5 亿赔付、OFAC 制裁
- **Nomad**：300+ 地址参与、$190M、白帽退还约 $3600 万、零根（0x00）初始化漏洞、复制粘贴式抢劫

---

## 三、核查来源
- The DAO — [Wikipedia](https://en.wikipedia.org/wiki/The_DAO)、[Gemini Cryptopedia](https://www.gemini.com/cryptopedia/the-dao-hack-makerdao)
- Parity — [Proskauer](https://www.proskauer.com/blog/when-smart-contracts-are-outsmarted-the-parity-wallet-freeze-and-software-liability-in-the-internet-of-value)、[CoinCodex](https://coincodex.com/article/1054/no-solution-found-for-parity-wallet-bug-that-froze-500000-eth-worth-150m/)
- Beanstalk — [Immunefi 复盘](https://medium.com/immunefi/hack-analysis-beanstalk-governance-attack-april-2022-f42788fc821e)、[Merkle Science](https://www.merklescience.com/blog/hack-track-analysis-of-beanstalk-flash-loan-attack)
- Ronin — FBI/OFAC 公告、Sky Mavis 募资公告（公开报道）
- Nomad — [Halborn](https://www.halborn.com/blog/post/explained-the-nomad-hack-august-2022)、[The Block](https://www.theblock.co/post/160851/nomads-190-million-bridge-exploit-drew-hacking-feeding-frenzy-of-300-addresses)

---

*核查范围：5 件展品 × （数据 / 简介 / 墓志铭 / 取证 / 后果 / 防范 / 余波）+ 开屏页统计。结论：修正后全部内容与客观外部数据一致，技术层与文学层均无编造。*
