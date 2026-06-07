"""
Digital Pompeii — Coroner Agent
链上验尸 Agent，tool-calling 循环框架。

推理模式通过模块顶部 SIMULATION_MODE 控制：
  True  → SimulationPlanner 按确定性顺序决策，推理用规则引擎
  False → 调用 OpenAI 兼容接口，由 LLM 自主决定工具调用顺序
"""

import datetime
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv


# ---------------------------------------------------------------------------
# 全局常量
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUNS_DIR = PROJECT_ROOT / "runs"
ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api"
ETHEREUM_CHAIN_ID = 1
DEFAULT_TX_LIMIT = 10
MAX_ROUNDS = 10                         # 工具调用最大轮次，防止死循环
MAX_TX_DETAILS = 2                      # 每次调查最多深查几笔交易详情
LARGE_VALUE_THRESHOLD_WEI = 1 * 10**18 # 可疑大额阈值（默认 1 ETH）

# 调查推理模式
SIMULATION_MODE: bool = True

load_dotenv(PROJECT_ROOT / ".env")


# ---------------------------------------------------------------------------
# Tool Schemas（OpenAI function-calling 格式）
# ---------------------------------------------------------------------------

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_contract_source",
            "description": (
                "从 Etherscan 获取已验证合约的 Solidity 源码、ABI 和编译信息。"
                "若合约未验证则返回空源码及说明。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "contract_address": {
                        "type": "string",
                        "description": "以 0x 开头的以太坊合约地址",
                    }
                },
                "required": ["contract_address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_transactions",
            "description": (
                "从 Etherscan 获取合约的最近普通交易列表，按时间倒序排列。"
                "用于资金流追踪和异常交易识别。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "contract_address": {
                        "type": "string",
                        "description": "以 0x 开头的以太坊合约地址",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回的最大交易数，默认 10，最大 100",
                        "default": 10,
                    },
                },
                "required": ["contract_address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_tx_detail",
            "description": (
                "从 Etherscan 获取单笔交易的详细信息，包含 input data 签名、"
                "Gas 消耗、执行状态、日志数量等。用于深入分析可疑交易。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "tx_hash": {
                        "type": "string",
                        "description": "以 0x 开头的交易哈希（64 位十六进制）",
                    }
                },
                "required": ["tx_hash"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Etherscan API 数据获取
# ---------------------------------------------------------------------------

def _get_etherscan_api_key() -> str:
    api_key = os.getenv("ETHERSCAN_API_KEY")
    if not api_key:
        raise RuntimeError("缺少 ETHERSCAN_API_KEY，请在项目根目录 .env 中配置。")
    return api_key


def _request_etherscan(params: Dict[str, Any]) -> Any:
    response = requests.get(
        ETHERSCAN_API_URL,
        params={**params, "apikey": _get_etherscan_api_key(), "chainid": ETHEREUM_CHAIN_ID},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    status = payload.get("status")
    message = payload.get("message")
    result = payload.get("result")
    if status == "0" and isinstance(result, str) and "No transactions found" not in result:
        raise RuntimeError(f"Etherscan API 错误：{message} — {result}")
    return result


def get_contract_source(contract_address: str) -> Dict[str, Any]:
    """工具：从 Etherscan 拉取已验证合约源码和 ABI。"""
    result = _request_etherscan({
        "module": "contract",
        "action": "getsourcecode",
        "address": contract_address,
    })
    if not isinstance(result, list) or not result:
        raise RuntimeError("Etherscan 未返回合约源码信息。")
    info = result[0]
    source_code = info.get("SourceCode", "")
    abi_raw = info.get("ABI", "")
    verified = bool(source_code) and abi_raw != "Contract source code not verified"
    try:
        abi = json.loads(abi_raw) if verified and abi_raw else []
    except json.JSONDecodeError:
        abi = abi_raw
    return {
        "address": contract_address,
        "verified": verified,
        "contract_name": info.get("ContractName"),
        "compiler_version": info.get("CompilerVersion"),
        "optimization_used": info.get("OptimizationUsed"),
        "source_code": source_code,
        "abi": abi,
    }


def get_transactions(
    contract_address: str, limit: int = DEFAULT_TX_LIMIT
) -> List[Dict[str, Any]]:
    """工具：从 Etherscan 拉取合约最近交易列表（按时间倒序）。"""
    result = _request_etherscan({
        "module": "account",
        "action": "txlist",
        "address": contract_address,
        "startblock": 0,
        "endblock": 99999999,
        "page": 1,
        "offset": min(max(1, limit), 100),
        "sort": "desc",
    })
    if isinstance(result, str) and "No transactions found" in result:
        return []
    if not isinstance(result, list):
        raise RuntimeError("Etherscan 未返回交易列表。")
    return result


def get_tx_detail(tx_hash: str) -> Dict[str, Any]:
    """工具：从 Etherscan 拉取单笔交易详情（tx + receipt）。"""
    tx = _request_etherscan({
        "module": "proxy",
        "action": "eth_getTransactionByHash",
        "txhash": tx_hash,
    })
    if tx is None:
        return {"error": f"交易 {tx_hash} 未找到或尚未确认"}

    receipt = _request_etherscan({
        "module": "proxy",
        "action": "eth_getTransactionReceipt",
        "txhash": tx_hash,
    })

    def h2i(h: Any) -> Optional[int]:
        try:
            return int(h, 16)
        except (TypeError, ValueError):
            return None

    value_wei = h2i(tx.get("value")) or 0
    gas_price_wei = h2i(tx.get("gasPrice"))
    status_int = h2i(receipt.get("status")) if receipt else None

    input_data: str = tx.get("input", "0x")
    return {
        "hash": tx_hash,
        "from": tx.get("from"),
        "to": tx.get("to"),
        "value_wei": value_wei,
        "value_eth": round(value_wei / 1e18, 8),
        "input_4byte_sig": input_data[:10] if len(input_data) >= 10 else input_data,
        "input_preview": input_data[:120] + ("..." if len(input_data) > 120 else ""),
        "block_number": h2i(tx.get("blockNumber")),
        "gas_limit": h2i(tx.get("gas")),
        "gas_price_gwei": round(gas_price_wei / 1e9, 4) if gas_price_wei else None,
        "gas_used": h2i(receipt.get("gasUsed")) if receipt else None,
        "status": (
            "success" if status_int == 1
            else "failed" if status_int == 0
            else "unknown"
        ),
        "logs_count": len(receipt.get("logs", [])) if receipt else None,
    }


# ---------------------------------------------------------------------------
# Tool dispatcher
# ---------------------------------------------------------------------------

_TOOL_REGISTRY: Dict[str, Any] = {
    "get_contract_source": lambda a: get_contract_source(a["contract_address"]),
    "get_transactions": lambda a: get_transactions(
        a["contract_address"], a.get("limit", DEFAULT_TX_LIMIT)
    ),
    "get_tx_detail": lambda a: get_tx_detail(a["tx_hash"]),
}


def execute_tool(tool_name: str, tool_args: Dict[str, Any]) -> Any:
    fn = _TOOL_REGISTRY.get(tool_name)
    if fn is None:
        return {"error": f"未知工具：{tool_name}"}
    try:
        return fn(tool_args)
    except Exception as exc:
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Analysis helpers（规则引擎，SIMULATION_MODE=True 时使用）
# ---------------------------------------------------------------------------

def _sim_code_signals(source_code: str) -> List[Dict[str, Any]]:
    """关键词规则扫描，返回结构化代码风险信号列表。"""
    low = source_code.lower()
    signals: List[Dict[str, Any]] = []

    # 同时覆盖新版 Solidity (.call{ .call() ) 与旧版 (.call.value .call.gas) 的重入写法
    _reentrancy_patterns = (".call{", ".call(", ".call.value", ".call.gas")
    if any(pat in low for pat in _reentrancy_patterns):
        signals.append({
            "type": "reentrancy",
            "severity": "high",
            "description": (
                "检测到外部 .call 调用（含 .call.value / .call.gas 等旧版写法），"
                "若在转账后修改状态变量则存在重入漏洞（reentrancy）风险。"
            ),
        })
    if "delegatecall" in low:
        signals.append({
            "type": "delegatecall",
            "severity": "high",
            "description": "检测到 delegatecall，代理合约可能存在存储槽冲突或执行上下文劫持。",
        })
    if "selfdestruct" in low:
        signals.append({
            "type": "selfdestruct",
            "severity": "critical",
            "description": "检测到 selfdestruct，合约可被永久销毁并将余额清零转出。",
        })
    if "onlyowner" in low or "owner" in low:
        signals.append({
            "type": "centralization",
            "severity": "medium",
            "description": "检测到 owner/onlyOwner 模式，单一权限账户若被盗控可直接操控核心功能。",
        })
    if "upgrade" in low or "proxy" in low:
        signals.append({
            "type": "upgradeable",
            "severity": "medium",
            "description": "检测到 upgrade/proxy 逻辑，合约实现可被替换，升级权限失控则整体逻辑可被篡改。",
        })
    if "unchecked" in low:
        signals.append({
            "type": "unchecked_math",
            "severity": "medium",
            "description": "检测到 unchecked 块，算术溢出保护被显式关闭，需人工确认安全边界。",
        })
    if "tx.origin" in low:
        signals.append({
            "type": "tx_origin",
            "severity": "medium",
            "description": "检测到 tx.origin 用于身份校验，可被钓鱼合约绕过。",
        })
    return signals


def _sim_fund_signals(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """扫描交易列表，识别大额单笔转出和累计可疑流向。"""
    transfers: List[Dict[str, Any]] = []
    suspicious: List[Dict[str, Any]] = []
    acc: Dict[str, int] = {}

    for tx in transactions:
        raw = int(tx.get("value", "0"))
        if raw <= 0:
            continue
        to = tx.get("to", "")
        entry = {
            "hash": tx.get("hash"),
            "from": tx.get("from"),
            "to": to,
            "value_wei": raw,
            "value_eth": round(raw / 1e18, 6),
            "timeStamp": tx.get("timeStamp"),
        }
        transfers.append(entry)
        if raw >= LARGE_VALUE_THRESHOLD_WEI:
            suspicious.append({
                **entry,
                "flag": (
                    f"单笔转出 {entry['value_eth']} ETH，"
                    f"超过警戒阈值（{LARGE_VALUE_THRESHOLD_WEI / 1e18} ETH）。"
                ),
            })
        acc[to] = acc.get(to, 0) + raw

    for to, cumulative in acc.items():
        already = any(s["to"] == to for s in suspicious)
        if cumulative >= LARGE_VALUE_THRESHOLD_WEI and not already:
            suspicious.append({
                "to": to,
                "cumulative_wei": cumulative,
                "cumulative_eth": round(cumulative / 1e18, 6),
                "flag": (
                    f"同一地址累计流入 {round(cumulative / 1e18, 6)} ETH，"
                    "需重点追踪是否为异常资金归集。"
                ),
            })

    return {
        "value_transfers": transfers,
        "value_transfer_count": len(transfers),
        "suspicious_outflows": suspicious,
    }


def _sim_generate_hypotheses(
    code_signals: List[Dict[str, Any]],
    fund_result: Dict[str, Any],
    tx_detail_findings: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """基于规则信号生成候选死因假设，按严重程度排列。"""
    hypotheses: List[Dict[str, Any]] = []

    critical = [s for s in code_signals if s["severity"] == "critical"]
    high = [s for s in code_signals if s["severity"] == "high"]
    medium = [s for s in code_signals if s["severity"] == "medium"]

    if critical:
        hypotheses.append({
            "cause": "合约存在销毁/清空路径（selfdestruct），可能死于主动清盘",
            "confidence": 0.75, "severity": "critical",
            "evidence": [s["description"] for s in critical],
        })
    if high:
        hypotheses.append({
            "cause": "合约存在高风险外部调用，疑似死于重入攻击或代理劫持",
            "confidence": 0.65, "severity": "high",
            "evidence": [s["description"] for s in high],
        })
    if fund_result.get("suspicious_outflows"):
        hypotheses.append({
            "cause": "链上存在可疑大额资金流出，疑似死于盗取或流动性抽逃（Rug Pull）",
            "confidence": 0.60, "severity": "high",
            "evidence": [o["flag"] for o in fund_result["suspicious_outflows"]],
        })
    if tx_detail_findings:
        hypotheses.append({
            "cause": "存在异常交易执行记录（失败或高日志量），疑似攻击交易痕迹",
            "confidence": 0.55, "severity": "high",
            "evidence": [f["note"] for f in tx_detail_findings],
        })
    if medium and not hypotheses:
        hypotheses.append({
            "cause": "合约存在中风险特征，死因不明，需人工深度审计",
            "confidence": 0.40, "severity": "medium",
            "evidence": [s["description"] for s in medium],
        })
    if not hypotheses:
        hypotheses.append({
            "cause": "样本中未发现明显代码或资金异常，死因待查",
            "confidence": 0.20, "severity": "low",
            "evidence": ["当前样本窗口内未触发任何高风险规则，建议扩大调查范围。"],
        })
    return hypotheses


def _sim_counter_evidence(
    verified: bool,
    tx_count: int,
    code_signals: List[Dict[str, Any]],
) -> List[str]:
    """基于规则生成反证列表。"""
    counter: List[str] = []
    if not verified:
        counter.append("合约源码未在 Etherscan 验证，代码层面推断证据不足。")
    if tx_count < DEFAULT_TX_LIMIT:
        counter.append(f"交易样本量仅 {tx_count} 笔，样本不足可能导致误判。")
    if not code_signals:
        counter.append("未检测到已知高风险代码模式，死因可能来自链下操作或业务逻辑漏洞。")
    return counter


# ---------------------------------------------------------------------------
# AI 推理接口（SIMULATION_MODE=False 时调用）
# ---------------------------------------------------------------------------

def _ai_call(system_prompt: str, user_prompt: str) -> str:
    """调用 OpenAI 兼容接口，返回模型回复文本。"""
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_API_KEY")
    if not api_key:
        raise RuntimeError("SIMULATION_MODE=False 时需要设置 OPENAI_API_KEY 或 AI_API_KEY。")
    base_url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    model = os.getenv("AI_MODEL", "gpt-4o")
    response = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        },
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def _ai_code_signals(source_code: str, contract_name: str) -> List[Dict[str, Any]]:
    reply = _ai_call(
        system_prompt=(
            "你是智能合约安全审计专家。分析 Solidity 源码，"
            "以 JSON 数组形式返回风险信号，每项含 type/severity/description。"
            "severity 只能是 critical/high/medium/low。仅返回 JSON 数组。"
        ),
        user_prompt=f"合约：{contract_name}\n\n```solidity\n{source_code[:8000]}\n```",
    )
    try:
        return json.loads(reply)
    except json.JSONDecodeError:
        return [{"type": "ai_raw", "severity": "unknown", "description": reply}]


def _ai_generate_hypotheses(
    code_signals: List[Dict[str, Any]],
    fund_result: Dict[str, Any],
    tx_detail_findings: List[Dict[str, Any]],
    contract_name: str,
) -> List[Dict[str, Any]]:
    context = json.dumps(
        {"code_signals": code_signals, "fund_flow": fund_result, "tx_details": tx_detail_findings},
        ensure_ascii=False,
    )
    reply = _ai_call(
        system_prompt=(
            "你是链上事故调查专家。根据提供的数据以 JSON 数组形式返回候选死因假设，"
            "每项含 cause/confidence/severity/evidence。仅返回 JSON 数组。"
        ),
        user_prompt=f"合约：{contract_name}\n\n数据：{context}",
    )
    try:
        return json.loads(reply)
    except json.JSONDecodeError:
        return [{"cause": reply, "confidence": 0.5, "severity": "unknown", "evidence": []}]


def _ai_counter_evidence(
    hypotheses: List[Dict[str, Any]],
    code_signals: List[Dict[str, Any]],
    transactions: List[Dict[str, Any]],
    contract_name: str,
) -> List[str]:
    context = json.dumps(
        {"hypotheses": hypotheses, "code_signals": code_signals,
         "recent_tx_count": len(transactions)},
        ensure_ascii=False,
    )
    reply = _ai_call(
        system_prompt=(
            "你是链上事故调查专家。寻找能推翻或削弱当前假设的反证，"
            "以 JSON 字符串数组形式返回。仅返回 JSON 数组。"
        ),
        user_prompt=f"合约：{contract_name}\n\n数据：{context}",
    )
    try:
        return json.loads(reply)
    except json.JSONDecodeError:
        return [reply]


# ---------------------------------------------------------------------------
# RunLogger — 运行日志记录器
# ---------------------------------------------------------------------------

class RunLogger:
    """将每次工具调用写入 runs/ 目录下的 JSONL 日志文件。"""

    def __init__(self, contract_address: str) -> None:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        addr_short = contract_address[2:10] if contract_address.startswith("0x") else contract_address[:8]
        self.path = RUNS_DIR / f"run_{ts}_{addr_short}.jsonl"
        self._write({"type": "run_start", "contract_address": contract_address,
                     "timestamp": datetime.datetime.now().isoformat()})

    def log_tool_call(
        self,
        round_num: int,
        tool_name: str,
        tool_args: Dict[str, Any],
        result: Any,
        reasoning: str = "",
    ) -> None:
        entry = {
            "type": "tool_call",
            "round": round_num,
            "timestamp": datetime.datetime.now().isoformat(),
            "tool": tool_name,
            "args": tool_args,
            "reasoning": reasoning,
            "result_summary": self._summarize(tool_name, result),
        }
        self._write(entry)

    def log_hypothesis_events(
        self, round_num: int, events: List[Dict[str, Any]]
    ) -> None:
        """将本轮假设事件逐条写入日志。"""
        for event in events:
            self._write({
                "type": "hypothesis_event",
                "round": round_num,
                "timestamp": datetime.datetime.now().isoformat(),
                **event,
            })

    def log_synthesis(self, exhibit: Dict[str, Any]) -> None:
        self._write({
            "type": "synthesis",
            "timestamp": datetime.datetime.now().isoformat(),
            "exhibit": exhibit,
        })

    def _write(self, obj: Dict[str, Any]) -> None:
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    @staticmethod
    def _summarize(tool_name: str, result: Any) -> Any:
        """对大体积结果做摘要，避免日志文件过大。"""
        if isinstance(result, dict) and "error" in result:
            return result
        if tool_name == "get_contract_source" and isinstance(result, dict):
            return {
                "contract_name": result.get("contract_name"),
                "verified": result.get("verified"),
                "compiler_version": result.get("compiler_version"),
                "source_size_bytes": len(result.get("source_code", "")),
                "abi_function_count": (
                    sum(1 for i in result.get("abi", [])
                        if isinstance(i, dict) and i.get("type") == "function")
                    if isinstance(result.get("abi"), list) else None
                ),
            }
        if tool_name == "get_transactions" and isinstance(result, list):
            return {
                "count": len(result),
                "sample": [
                    {
                        "hash": tx.get("hash", "")[:20] + "...",
                        "from": tx.get("from", "")[:14] + "...",
                        "value_eth": round(int(tx.get("value", "0")) / 1e18, 6),
                    }
                    for tx in result[:5]
                ],
            }
        return result


# ---------------------------------------------------------------------------
# SimulationPlanner — 模拟 AI 的确定性决策规划器（含假设生命周期追踪）
# ---------------------------------------------------------------------------

class SimulationPlanner:
    """
    按预设顺序模拟 AI 的工具调用决策，并在每步工具调用后评估证据，
    动态提出/修正/推翻假设。

    工具调用顺序：
      Phase 0 → get_contract_source  → 提出初始假设
      Phase 1 → get_transactions     → 验证/修正假设
      Phase 2 → get_tx_detail (可选) → 进一步确认或添加证据
      Phase 3 → final_output

    假设状态机：proposed → confirmed | revised | refuted
    """

    # ──────────────────────────────────────────────────────────────────
    # 初始化
    # ──────────────────────────────────────────────────────────────────

    def __init__(self, contract_address: str) -> None:
        self._address = contract_address
        self._action_phase = 0        # 控制 next_action 的阶段
        self._evidence_phase = 0      # 控制 evaluate_evidence 的阶段
        self._pending_hashes: List[str] = []
        self._detail_index = 0

        # 假设生命周期存储
        self.active_hypotheses: List[Dict[str, Any]] = []
        self.alternative_hypotheses: List[Dict[str, Any]] = []  # 被替换/推翻的旧假设

    # ──────────────────────────────────────────────────────────────────
    # 工具调用决策
    # ──────────────────────────────────────────────────────────────────

    def next_action(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """返回下一个 action dict，type 为 'tool_call' 或 'final_output'。"""
        if self._action_phase == 0:
            self._action_phase = 1
            return {
                "type": "tool_call",
                "tool": "get_contract_source",
                "args": {"contract_address": self._address},
                "reasoning": "第一步：拉取合约源码和 ABI，基于代码特征提出初始死因假设。",
            }

        if self._action_phase == 1:
            self._action_phase = 2
            return {
                "type": "tool_call",
                "tool": "get_transactions",
                "args": {"contract_address": self._address, "limit": DEFAULT_TX_LIMIT},
                "reasoning": "第二步：拉取最近交易列表，用链上资金流证据验证或修正初始假设。",
            }

        if self._action_phase == 2:
            txs: List[Dict[str, Any]] = state.get("transactions") or []
            self._pending_hashes = [
                tx["hash"] for tx in txs
                if int(tx.get("value", "0")) >= LARGE_VALUE_THRESHOLD_WEI
            ][:MAX_TX_DETAILS]
            self._action_phase = 3

        if self._action_phase == 3:
            if self._detail_index < len(self._pending_hashes):
                h = self._pending_hashes[self._detail_index]
                self._detail_index += 1
                return {
                    "type": "tool_call",
                    "tool": "get_tx_detail",
                    "args": {"tx_hash": h},
                    "reasoning": (
                        f"该交易金额超过警戒阈值（{LARGE_VALUE_THRESHOLD_WEI / 1e18} ETH），"
                        "深入查看执行状态和 logs，进一步确认假设。"
                    ),
                }
            self._action_phase = 4

        return {
            "type": "final_output",
            "reasoning": "已收集合约源码、交易列表及可疑交易详情，进入综合分析阶段。",
        }

    # ──────────────────────────────────────────────────────────────────
    # 假设评估（每次工具调用返回后触发）
    # ──────────────────────────────────────────────────────────────────

    def evaluate_evidence(
        self, state: Dict[str, Any], round_num: int
    ) -> List[Dict[str, Any]]:
        """
        根据当前 state 评估证据，更新 active_hypotheses / alternative_hypotheses。
        返回本轮产生的假设事件列表（用于打印和日志）。
        """
        events: List[Dict[str, Any]] = []

        if self._evidence_phase == 0 and state.get("contract_source"):
            events = self._propose_from_source(state["contract_source"], round_num)
            self._evidence_phase = 1

        elif self._evidence_phase == 1 and state.get("transactions") is not None:
            events = self._revise_from_transactions(state.get("transactions", []), round_num)
            self._evidence_phase = 2

        elif self._evidence_phase == 2 and state.get("tx_details"):
            events = self._revise_from_tx_details(state.get("tx_details", {}), round_num)
            self._evidence_phase = 3

        return events

    # ──────────────────────────────────────────────────────────────────
    # 内部：假设构造
    # ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _make_hypothesis(
        cause: str,
        confidence: float,
        severity: str,
        evidence: List[str],
        round_num: int,
        status: str = "proposed",
    ) -> Dict[str, Any]:
        return {
            "cause": cause,
            "confidence": confidence,
            "severity": severity,
            "evidence": list(evidence),
            "status": status,
            "refutation_evidence": [],
            "replaced_by": None,
            "round_proposed": round_num,
            "round_revised": None,
        }

    # ──────────────────────────────────────────────────────────────────
    # 内部：基于源码提出初始假设
    # ──────────────────────────────────────────────────────────────────

    def _propose_from_source(
        self, contract_source: Dict[str, Any], round_num: int
    ) -> List[Dict[str, Any]]:
        source_code = contract_source.get("source_code", "")
        signals = _sim_code_signals(source_code)

        high = [s for s in signals if s["severity"] == "high"]
        critical = [s for s in signals if s["severity"] == "critical"]
        medium = [s for s in signals if s["severity"] == "medium"]

        reentrancy_sigs = [s for s in high if s["type"] in ("reentrancy", "delegatecall")]

        if reentrancy_sigs:
            cause = "重入攻击（Reentrancy Attack）"
            confidence = 0.65
            severity = "high"
            evidence = [s["description"] for s in reentrancy_sigs]
            reason = (
                f"源码中检测到 {len(reentrancy_sigs)} 条高危外部调用信号"
                "（.call / delegatecall），优先假设重入攻击。"
            )
        elif critical:
            cause = "主动清盘（合约自毁路径 selfdestruct）"
            confidence = 0.75
            severity = "critical"
            evidence = [s["description"] for s in critical]
            reason = "源码存在 selfdestruct，假设死于主动清盘或被攻击者触发销毁。"
        elif medium:
            cause = "权限漏洞或治理操控"
            confidence = 0.45
            severity = "medium"
            evidence = [s["description"] for s in medium]
            reason = "源码存在中等风险权限集中或可升级性，初步假设权限被盗或治理被攻击。"
        else:
            cause = "死因未知，需进一步链上数据核实"
            confidence = 0.20
            severity = "low"
            evidence = ["源码中未发现已知高风险代码模式，需依赖交易数据推断。"]
            reason = "代码扫描未触发任何高风险信号，假设置信度较低。"

        h = self._make_hypothesis(cause, confidence, severity, evidence, round_num)
        self.active_hypotheses = [h]

        return [{
            "event": "proposed",
            "round": round_num,
            "hypothesis": cause,
            "confidence": confidence,
            "severity": severity,
            "reason": reason,
        }]

    # ──────────────────────────────────────────────────────────────────
    # 内部：基于交易列表修正假设
    # ──────────────────────────────────────────────────────────────────

    def _revise_from_transactions(
        self, transactions: List[Dict[str, Any]], round_num: int
    ) -> List[Dict[str, Any]]:
        if not self.active_hypotheses:
            return []

        current = self.active_hypotheses[0]
        fund = _sim_fund_signals(transactions)
        value_count = fund["value_transfer_count"]
        suspicious = fund["suspicious_outflows"]
        events: List[Dict[str, Any]] = []

        if "重入攻击" in current["cause"]:
            if value_count == 0:
                # 关键反证：无 ETH 转出 → 不符合重入攻击特征 → 修正
                refutation = (
                    f"交易样本（{len(transactions)} 笔）中 ETH 转账为零，"
                    "与重入攻击连续小额快速抽资的典型资金流特征不符。"
                )
                new_cause = "权限漏洞导致合约被暗中操控（无重入特征性资金流）"
                new_confidence = 0.50
                new_evidence = current["evidence"] + [
                    "结合源码权限集中信号，更可能是治理层面被操控而非直接链上资金抽取。"
                ]

                # 归档旧假设
                old = current.copy()
                old["status"] = "revised"
                old["refutation_evidence"] = [refutation]
                old["replaced_by"] = new_cause
                old["round_revised"] = round_num
                self.alternative_hypotheses.append(old)

                # 激活新假设
                new_h = self._make_hypothesis(
                    new_cause, new_confidence, "medium", new_evidence, round_num
                )
                self.active_hypotheses = [new_h]

                events.append({
                    "event": "revised",
                    "round": round_num,
                    "old_hypothesis": current["cause"],
                    "new_hypothesis": new_cause,
                    "confidence_before": current["confidence"],
                    "confidence_after": new_confidence,
                    "reason": refutation,
                })

            elif suspicious:
                # 大额资金流出 → 支持重入假设，确认并提升置信度
                confirm_reason = (
                    f"发现 {len(suspicious)} 笔大额资金转出，"
                    "与重入攻击反复抽取资金的链上资金流模式吻合。"
                )
                old_conf = current["confidence"]
                current["status"] = "confirmed"
                current["confidence"] = min(0.90, round(old_conf + 0.15, 2))
                current["evidence"].append(confirm_reason)

                events.append({
                    "event": "confirmed",
                    "round": round_num,
                    "hypothesis": current["cause"],
                    "confidence_before": old_conf,
                    "confidence_after": current["confidence"],
                    "reason": confirm_reason,
                })

            else:
                # 有少量转账但无大额可疑 → 轻微下调
                old_conf = current["confidence"]
                current["confidence"] = max(0.0, round(old_conf - 0.05, 2))
                reason = (
                    f"交易中存在 {value_count} 笔转账但均未超过警戒阈值，"
                    "无法明确支持或反驳重入假设，轻微下调置信度。"
                )
                events.append({
                    "event": "updated",
                    "round": round_num,
                    "hypothesis": current["cause"],
                    "confidence_before": old_conf,
                    "confidence_after": current["confidence"],
                    "reason": reason,
                })

        elif suspicious:
            # 非重入假设 + 发现大额资金流出 → 修正为 Rug Pull
            refutation = (
                "发现大额链上资金流出记录，"
                "与原假设（非资金直接流失模式）不完全吻合，修正为盗取/抽逃假设。"
            )
            new_cause = "大额资金盗取或流动性抽逃（Rug Pull）"
            new_confidence = 0.65

            old = current.copy()
            old["status"] = "revised"
            old["refutation_evidence"] = [refutation]
            old["replaced_by"] = new_cause
            old["round_revised"] = round_num
            self.alternative_hypotheses.append(old)

            new_h = self._make_hypothesis(
                new_cause, new_confidence, "high",
                [o["flag"] for o in suspicious], round_num
            )
            self.active_hypotheses = [new_h]

            events.append({
                "event": "revised",
                "round": round_num,
                "old_hypothesis": current["cause"],
                "new_hypothesis": new_cause,
                "confidence_before": current["confidence"],
                "confidence_after": new_confidence,
                "reason": refutation,
            })

        else:
            # 无需修正：记录结果
            reason = (
                f"交易数据（{len(transactions)} 笔，"
                f"{value_count} 笔含 value）未提供修正当前假设的充分依据。"
            )
            events.append({
                "event": "unchanged",
                "round": round_num,
                "hypothesis": current["cause"],
                "confidence": current["confidence"],
                "reason": reason,
            })

        return events

    # ──────────────────────────────────────────────────────────────────
    # 内部：基于交易详情进一步确认
    # ──────────────────────────────────────────────────────────────────

    def _revise_from_tx_details(
        self, tx_details: Dict[str, Any], round_num: int
    ) -> List[Dict[str, Any]]:
        if not self.active_hypotheses or not tx_details:
            return []

        current = self.active_hypotheses[0]
        events: List[Dict[str, Any]] = []

        for tx_hash, detail in tx_details.items():
            if not isinstance(detail, dict) or detail.get("error"):
                continue

            status = detail.get("status")
            logs = detail.get("logs_count") or 0

            if status == "failed":
                note = (
                    f"交易 {tx_hash[:16]}... 执行失败，"
                    "可能是攻击探测或被链上防护机制拦截。"
                )
                current["evidence"].append(note)
                events.append({
                    "event": "evidence_added",
                    "round": round_num,
                    "hypothesis": current["cause"],
                    "reason": note,
                })

            if logs > 5:
                old_conf = current["confidence"]
                current["confidence"] = min(0.95, round(old_conf + 0.10, 2))
                note = (
                    f"交易产生 {logs} 个事件日志，"
                    "复杂合约内部调用与攻击场景特征吻合。"
                )
                current["evidence"].append(note)
                events.append({
                    "event": "confirmed",
                    "round": round_num,
                    "hypothesis": current["cause"],
                    "confidence_before": old_conf,
                    "confidence_after": current["confidence"],
                    "reason": note,
                })

        return events


# ---------------------------------------------------------------------------
# CoronerAgent — tool-calling 循环主体
# ---------------------------------------------------------------------------

class CoronerAgent:
    """
    链上验尸 Agent 主体。
    run_investigation() 启动工具调用循环，循环结束后调用 synthesize_exhibit() 生成展品。
    """

    def __init__(
        self,
        simulation_mode: bool = SIMULATION_MODE,
        verbose: bool = False,
    ) -> None:
        self.simulation_mode = simulation_mode
        self.verbose = verbose
        # 累积调查状态（被工具结果持续填充）
        self.state: Dict[str, Any] = {
            "contract_address": None,
            "contract_source": None,
            "transactions": [],
            "tx_details": {},  # hash → detail dict
        }
        # 当前运行的规划器（综合分析阶段读取假设历史）
        self._planner: Optional[SimulationPlanner] = None
        # AI 模式对话历史
        self._messages: List[Dict[str, Any]] = []

    # ------------------------------------------------------------------
    # 公开入口
    # ------------------------------------------------------------------

    def run_investigation(
        self,
        contract_address: str,
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """完整调查流程：tool-calling 循环 + 综合分析 + 可选写文件。"""
        self.state["contract_address"] = contract_address
        self._setup_messages(contract_address)

        mode_label = "SIMULATION（规则引擎）" if self.simulation_mode else "AI（OpenAI 兼容）"
        self._banner(f"Digital Pompeii — Coroner Agent\n  合约：{contract_address}\n  模式：{mode_label}")

        planner = SimulationPlanner(contract_address) if self.simulation_mode else None
        self._planner = planner
        logger = RunLogger(contract_address)

        # ── Tool-calling 主循环 ──────────────────────────────────────
        for round_num in range(1, MAX_ROUNDS + 1):
            self._print_round(round_num)

            if self.simulation_mode:
                action = planner.next_action(self.state)  # type: ignore[union-attr]
            else:
                action = self._ai_get_next_action()

            reasoning = action.get("reasoning", "")
            if reasoning:
                self._log("推理", reasoning)

            if action["type"] == "final_output":
                self._log("决策", "信息已充分，进入综合分析阶段")
                break

            tool_name: str = action["tool"]
            tool_args: Dict[str, Any] = action["args"]

            self._log("工具调用", f"{tool_name}({json.dumps(tool_args, ensure_ascii=False)})")
            result = execute_tool(tool_name, tool_args)
            self._update_state(tool_name, tool_args, result)
            self._print_tool_result(tool_name, result)

            logger.log_tool_call(round_num, tool_name, tool_args, result, reasoning)

            # ── 假设评估（SIMULATION_MODE 下，每轮工具调用后评估证据）──
            if self.simulation_mode and planner is not None:
                hyp_events = planner.evaluate_evidence(self.state, round_num)
                if hyp_events:
                    logger.log_hypothesis_events(round_num, hyp_events)
                    self._print_hypothesis_events(hyp_events)

            if not self.simulation_mode:
                self._add_tool_result_to_messages(action, result)
        else:
            self._log("警告", f"已达到最大轮次上限（{MAX_ROUNDS}），强制进入综合分析")

        # ── 综合分析 ─────────────────────────────────────────────────
        self._banner("综合分析（Synthesis）")
        exhibit = self.synthesize_exhibit()
        logger.log_synthesis(exhibit)

        # ── 可选写文件 ────────────────────────────────────────────────
        if output_path:
            out = Path(output_path)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(exhibit, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"\n[OK] 展品已保存：{out.resolve()}")

        print(f"[OK] 运行日志：{logger.path.resolve()}")
        return exhibit

    # ------------------------------------------------------------------
    # 综合分析（循环结束后调用）
    # ------------------------------------------------------------------

    def synthesize_exhibit(self) -> Dict[str, Any]:
        """对工具调用收集的数据进行全面分析，生成结案展品。"""
        contract_source = self.state.get("contract_source") or {}
        transactions: List[Dict[str, Any]] = self.state.get("transactions") or []
        tx_details: Dict[str, Any] = self.state.get("tx_details") or {}

        source_code: str = contract_source.get("source_code", "")
        contract_name: str = contract_source.get("contract_name") or "Unknown"
        verified: bool = contract_source.get("verified", False)

        # ① 代码信号
        self._log("分析", "扫描代码风险信号")
        if self.simulation_mode:
            code_signals = _sim_code_signals(source_code)
        else:
            code_signals = _ai_code_signals(source_code, contract_name)
        for sig in code_signals:
            self._log(f"  [{sig['severity'].upper()}] {sig['type']}", sig["description"])

        # ② 资金流分析
        self._log("分析", "识别资金流异常")
        fund_result = _sim_fund_signals(transactions)
        self._log("带 value 交易数", fund_result["value_transfer_count"])
        self._log("可疑流出数", len(fund_result["suspicious_outflows"]))

        # ③ 交易详情异常
        tx_detail_findings: List[Dict[str, Any]] = []
        for tx_hash, detail in tx_details.items():
            if isinstance(detail, dict) and not detail.get("error"):
                if detail.get("status") == "failed" or (detail.get("logs_count") or 0) > 5:
                    tx_detail_findings.append({
                        "hash": tx_hash,
                        "note": (
                            f"状态={detail.get('status')}, "
                            f"logs={detail.get('logs_count')}, "
                            f"value={detail.get('value_eth')} ETH"
                        ),
                    })

        # ④ 假设生成
        #    SIMULATION_MODE: 优先使用 planner 在工具调用过程中已动态维护的假设；
        #    AI MODE / 无 planner: 在综合阶段一次性生成。
        self._log("分析", "整合候选死因假设")

        planner_active = (
            self._planner.active_hypotheses if self._planner else []
        )
        planner_alternatives = (
            self._planner.alternative_hypotheses if self._planner else []
        )

        if self.simulation_mode and planner_active:
            # 直接使用 planner 动态维护的假设（已在工具调用过程中持续修正）
            hypotheses = planner_active
            alternative_hypotheses = planner_alternatives
            self._log("来源", "来自 SimulationPlanner 动态假设追踪")
        else:
            # AI 模式或 planner 为空：综合阶段一次性生成
            if self.simulation_mode:
                hypotheses = _sim_generate_hypotheses(code_signals, fund_result, tx_detail_findings)
            else:
                hypotheses = _ai_generate_hypotheses(code_signals, fund_result, tx_detail_findings, contract_name)
            alternative_hypotheses = []
            self._log("来源", "综合阶段规则/AI 一次性生成")

        for i, h in enumerate(hypotheses, 1):
            self._log(
                f"  假设 {i} [{h.get('severity','?').upper()}] status={h.get('status','?')}",
                f"confidence={h['confidence']}  {h['cause']}",
            )
        if alternative_hypotheses:
            self._log(f"被替换的旧假设（{len(alternative_hypotheses)} 条）")
            for alt in alternative_hypotheses:
                self._log(
                    f"  [REPLACED] {alt['cause'][:50]}...",
                    f"→ {alt.get('replaced_by', '?')[:40]}",
                )

        # ⑤ 反证搜索
        self._log("分析", "搜索反证")
        if self.simulation_mode:
            counter_evidence = _sim_counter_evidence(verified, len(transactions), code_signals)
        else:
            counter_evidence = _ai_counter_evidence(hypotheses, code_signals, transactions, contract_name)
        for c in counter_evidence:
            self._log("  [-]", c)

        # ⑥ 修正置信度（在已有动态修正的基础上叠加反证惩罚）
        penalty = min(0.20, 0.05 * len(counter_evidence))
        self._log("置信度惩罚", f"-{penalty:.2f}（反证 {len(counter_evidence)} 条）")
        revised: List[Dict[str, Any]] = []
        for h in hypotheses:
            item = h.copy()
            item["confidence"] = max(0.0, round(h["confidence"] - penalty, 2))
            item["counter_evidence"] = counter_evidence
            revised.append(item)
        revised.sort(key=lambda x: x["confidence"], reverse=True)

        primary = revised[0] if revised else None

        exhibit = {
            "contract_address": self.state["contract_address"],
            "contract_name": contract_name,
            "simulation_mode": self.simulation_mode,
            "death_cause": primary["cause"] if primary else "无法确定",
            "confidence": primary["confidence"] if primary else 0.0,
            "severity": primary.get("severity") if primary else None,
            "evidence": primary.get("evidence", []) if primary else [],
            "counter_evidence": primary.get("counter_evidence", []) if primary else [],
            "all_hypotheses": revised,
            # 被修正/推翻的历史假设（本次新增字段）
            "alternative_hypotheses": alternative_hypotheses,
            "code_signals": code_signals,
            "suspicious_outflows": fund_result.get("suspicious_outflows", []),
            "suspicious_tx_details": tx_detail_findings,
            "timeline": fund_result.get("value_transfers", []),
        }

        self._log("death_cause", exhibit["death_cause"])
        self._log("confidence", exhibit["confidence"])
        self._log("severity", exhibit["severity"])
        self._log("alternative_hypotheses 数量", len(alternative_hypotheses))
        return exhibit

    # ------------------------------------------------------------------
    # 状态更新
    # ------------------------------------------------------------------

    def _update_state(self, tool_name: str, args: Dict[str, Any], result: Any) -> None:
        if isinstance(result, dict) and result.get("error"):
            return
        if tool_name == "get_contract_source":
            self.state["contract_source"] = result
        elif tool_name == "get_transactions":
            self.state["transactions"] = result if isinstance(result, list) else []
        elif tool_name == "get_tx_detail":
            self.state["tx_details"][args.get("tx_hash", "")] = result

    # ------------------------------------------------------------------
    # AI 模式：OpenAI tool-calling
    # ------------------------------------------------------------------

    def _setup_messages(self, contract_address: str) -> None:
        self._messages = [
            {
                "role": "system",
                "content": (
                    "你是 Digital Pompeii 链上验尸 Agent，专门调查已死亡的以太坊 DeFi 协议。\n"
                    "调查流程：\n"
                    "  1. get_contract_source — 获取合约源码和 ABI\n"
                    "  2. get_transactions   — 获取最近交易列表\n"
                    "  3. get_tx_detail      — 对可疑大额交易深入查看（可选）\n"
                    "  4. 信息充分后停止工具调用，直接输出结案分析\n\n"
                    "你的输出将被后端综合分析模块处理，请尽量收集完整信息后再停止。"
                ),
            },
            {
                "role": "user",
                "content": f"请调查以太坊合约：{contract_address}",
            },
        ]

    def _ai_get_next_action(self) -> Dict[str, Any]:
        """调用 OpenAI 兼容接口（带 tool_schemas），解析返回的工具调用或结案决定。"""
        api_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_API_KEY")
        if not api_key:
            raise RuntimeError("SIMULATION_MODE=False 时需要设置 OPENAI_API_KEY 或 AI_API_KEY。")
        base_url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        model = os.getenv("AI_MODEL", "gpt-4o")

        response = requests.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": self._messages,
                "tools": TOOL_SCHEMAS,
                "tool_choice": "auto",
                "temperature": 0.1,
            },
            timeout=60,
        )
        response.raise_for_status()
        resp_json = response.json()
        choice = resp_json["choices"][0]
        message = choice["message"]
        self._messages.append(message)

        if choice.get("finish_reason") == "tool_calls" and message.get("tool_calls"):
            tc = message["tool_calls"][0]
            return {
                "type": "tool_call",
                "tool": tc["function"]["name"],
                "args": json.loads(tc["function"]["arguments"]),
                "tool_call_id": tc["id"],
            }
        return {"type": "final_output", "content": message.get("content", "")}

    def _add_tool_result_to_messages(self, action: Dict[str, Any], result: Any) -> None:
        result_str = json.dumps(result, ensure_ascii=False)
        if len(result_str) > 8000:
            result_str = result_str[:8000] + "... [truncated]"
        self._messages.append({
            "role": "tool",
            "tool_call_id": action.get("tool_call_id", "call_0"),
            "content": result_str,
        })

    # ------------------------------------------------------------------
    # 打印辅助
    # ------------------------------------------------------------------

    def _banner(self, text: str) -> None:
        if not self.verbose:
            return
        line = "=" * 62
        print(f"\n{line}")
        for t in text.split("\n"):
            print(f"  {t}")
        print(line)

    def _print_round(self, n: int) -> None:
        if not self.verbose:
            return
        print(f"\n{'─' * 62}")
        print(f"  Round {n} / {MAX_ROUNDS}")
        print(f"{'─' * 62}")

    def _log(self, label: str, value: Any = None) -> None:
        if not self.verbose:
            return
        if value is None:
            print(f"  >> {label}")
        else:
            print(f"  >> {label}: {value}")

    def _print_hypothesis_events(self, events: List[Dict[str, Any]]) -> None:
        if not self.verbose:
            return
        _EVENT_LABEL = {
            "proposed": "[假设提出]",
            "confirmed": "[假设确认]",
            "revised":   "[假设修正]",
            "refuted":   "[假设推翻]",
            "updated":   "[置信度更新]",
            "unchanged": "[假设维持]",
            "evidence_added": "[证据补充]",
        }
        for ev in events:
            tag = _EVENT_LABEL.get(ev.get("event", ""), f"[{ev.get('event')}]")
            if ev.get("event") == "proposed":
                print(
                    f"\n  {tag} 初始假设：{ev['hypothesis']}"
                    f"  confidence={ev['confidence']}  severity={ev['severity']}"
                )
            elif ev.get("event") in ("revised", "refuted"):
                print(f"\n  {tag}")
                print(f"    旧假设：{ev.get('old_hypothesis', ev.get('hypothesis', ''))}")
                if ev.get("new_hypothesis"):
                    print(f"    新假设：{ev['new_hypothesis']}")
                print(
                    f"    置信度：{ev.get('confidence_before')} → {ev.get('confidence_after')}"
                )
                print(f"    原因：{ev.get('reason', '')}")
            elif ev.get("event") in ("confirmed", "updated"):
                print(
                    f"\n  {tag} {ev.get('hypothesis', '')[:50]}..."
                    f"  {ev.get('confidence_before')} → {ev.get('confidence_after')}"
                )
                print(f"    原因：{ev.get('reason', '')}")
            else:
                print(f"\n  {tag} {ev.get('hypothesis', ev.get('reason', ''))[:80]}")

    def _print_tool_result(self, tool_name: str, result: Any) -> None:
        if not self.verbose:
            return
        print(f"  << 结果 [{tool_name}]")
        summary = RunLogger._summarize(tool_name, result)
        if isinstance(summary, (dict, list)):
            lines = json.dumps(summary, ensure_ascii=False, indent=2).split("\n")
            for line in lines[:20]:
                print(f"     {line}")
            if len(lines) > 20:
                print(f"     ... ({len(lines) - 20} 行已省略)")
        else:
            print(f"     {summary}")


# ---------------------------------------------------------------------------
# CLI 入口
# ---------------------------------------------------------------------------

def main() -> None:
    import sys

    args = sys.argv[1:]
    address = "0x0000000000000000000000000000000000000000"
    output_path: Optional[str] = None

    i = 0
    while i < len(args):
        if args[i] in ("--output", "-o") and i + 1 < len(args):
            output_path = args[i + 1]
            i += 2
        elif not args[i].startswith("-"):
            address = args[i]
            i += 1
        else:
            i += 1

    agent = CoronerAgent(verbose=True)
    exhibit = agent.run_investigation(address, output_path=output_path)

    print("\n" + "=" * 62)
    print("  最终结案展品 (Exhibit JSON)")
    print("=" * 62)
    print(json.dumps(exhibit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
