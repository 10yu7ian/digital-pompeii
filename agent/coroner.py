"""
Digital Pompeii — Coroner Agent
链上验尸 Agent，tool-calling 循环框架。

推理模式通过模块顶部 HYBRID_MODE 控制：
  True  → 真实 Etherscan 工具调用 + 本地规则推理
  False → 调用 OpenAI 兼容接口，由 LLM 自主决定工具调用顺序
"""

import datetime
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from openai import OpenAI, RateLimitError, APIStatusError


# ---------------------------------------------------------------------------
# 全局常量
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUNS_DIR = PROJECT_ROOT / "runs"
ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api"
ETHEREUM_CHAIN_ID = 1
DEFAULT_TX_LIMIT = 10
MAX_ROUNDS = 5                          # 工具调用最大轮次，防止死循环和 API 限流
MAX_TX_DETAILS = 2                      # 每次调查最多深查几笔交易详情
LARGE_VALUE_THRESHOLD_WEI = 1 * 10**18 # 可疑大额阈值（默认 1 ETH）

# 调查推理模式。
SIMULATION_MODE: bool = False
HYBRID_MODE: bool = False   # False = 全量 GLM 推理

# GLM API 配置
GLM_MODEL = "glm-4.7-flash"
GLM_BASE_URL = "https://api.z.ai/api/paas/v4/"
GLM_TIMEOUT_SECONDS = 60
GLM_INTER_CALL_DELAY_SECONDS = 1        # 每次 GLM 调用后的固定间隔（防主动过快）
AI_JSON_REPAIR_ATTEMPTS = 1

# 限流重试配置（指数退避）
GLM_RETRY_MAX_ATTEMPTS = 5
GLM_RETRY_BASE_DELAY   = 8             # 初次限流等待秒数
GLM_RETRY_MAX_DELAY    = 90            # 单次最长等待上限

load_dotenv(PROJECT_ROOT / ".env")


# ---------------------------------------------------------------------------
# 自定义异常
# ---------------------------------------------------------------------------

class InvestigationError(RuntimeError):
    """调查过程中可预期的失败，携带 error_type 供调用方区分处理。"""

    def __init__(self, message: str, error_type: str = "unknown") -> None:
        super().__init__(message)
        self.error_type = error_type


def _log_status(message: str) -> None:
    """打印带时间戳的运行状态日志，不受 verbose 开关影响。"""
    timestamp = datetime.datetime.now().isoformat(timespec="seconds")
    print(f"[{timestamp}] {message}")


def _glm_call_with_retry(fn, label: str = "GLM"):
    """
    执行一次 GLM API 调用（fn 为无参 callable），遇到限流时指数退避重试。
    其他异常直接抛出。
    """
    delay = GLM_RETRY_BASE_DELAY
    for attempt in range(1, GLM_RETRY_MAX_ATTEMPTS + 1):
        try:
            _log_status(f"{label} 调用开始（第 {attempt} 次）")
            result = fn()
            time.sleep(GLM_INTER_CALL_DELAY_SECONDS)   # 调用成功后固定间隔
            _log_status(f"{label} 调用完成")
            return result
        except RateLimitError as exc:
            if attempt >= GLM_RETRY_MAX_ATTEMPTS:
                _log_status(f"{label} 限流重试耗尽（{GLM_RETRY_MAX_ATTEMPTS} 次），放弃")
                raise
            _log_status(f"{label} 限流（429），等待 {delay}s 后重试（第 {attempt}/{GLM_RETRY_MAX_ATTEMPTS} 次）")
            time.sleep(delay)
            delay = min(delay * 2, GLM_RETRY_MAX_DELAY)
        except APIStatusError as exc:
            # 非 429 的 API 错误（5xx 等）也重试一次
            if attempt >= GLM_RETRY_MAX_ATTEMPTS or exc.status_code < 500:
                raise
            _log_status(f"{label} API 错误 {exc.status_code}，等待 {delay}s 后重试")
            time.sleep(delay)
            delay = min(delay * 2, GLM_RETRY_MAX_DELAY)


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
                "从 Etherscan 获取合约的最近普通交易列表（外部调用），按时间倒序排列。"
                "用于查看调用模式和基线行为。注意：重入攻击的资金流在内部交易中，"
                "需配合 get_large_outflows 使用。"
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
            "name": "get_large_outflows",
            "description": (
                "搜索合约的异常大额 ETH 流出，使用内部交易列表（txlistinternal）。"
                "内部交易是合约代码执行时产生的 ETH 转账，是重入攻击、闪贷攻击等"
                "资金盗取事件的关键证据来源。优先在普通交易未见资金流时使用此工具。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "contract_address": {
                        "type": "string",
                        "description": "以 0x 开头的以太坊合约地址",
                    },
                    "min_eth": {
                        "type": "number",
                        "description": "最小 ETH 阈值，低于此值的转账忽略，默认 10 ETH",
                        "default": 10,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回的最大内部交易数，默认 50",
                        "default": 50,
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
    action = params.get("action", "unknown")
    _log_status(f"Etherscan API 调用开始：action={action}")
    try:
        response = requests.get(
            ETHERSCAN_API_URL,
            params={**params, "apikey": _get_etherscan_api_key(), "chainid": ETHEREUM_CHAIN_ID},
            timeout=20,
        )
        response.raise_for_status()
    except requests.Timeout as exc:
        _log_status(f"Etherscan API 调用失败：action={action}, error=timeout")
        raise InvestigationError(
            f"Etherscan API 请求超时（20s）：{params.get('action', '')}",
            error_type="api_timeout",
        ) from exc
    except requests.ConnectionError as exc:
        _log_status(f"Etherscan API 调用失败：action={action}, error=connection")
        raise InvestigationError(
            f"网络连接失败，请检查网络后重试：{exc}",
            error_type="network_error",
        ) from exc
    except requests.HTTPError as exc:
        _log_status(f"Etherscan API 调用失败：action={action}, error=http")
        raise InvestigationError(
            f"Etherscan HTTP 错误：{exc}",
            error_type="api_http_error",
        ) from exc

    payload = response.json()
    status = payload.get("status")
    message = payload.get("message")
    result = payload.get("result")
    if status == "0" and isinstance(result, str) and "No transactions found" not in result:
        _log_status(f"Etherscan API 调用失败：action={action}, message={message}")
        raise InvestigationError(
            f"Etherscan API 业务错误：{message} — {result}",
            error_type="api_error",
        )
    _log_status(f"Etherscan API 调用完成：action={action}, status={status}, message={message}")
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


def get_large_outflows(
    contract_address: str,
    min_eth: float = 10.0,
    limit: int = 50,
) -> Dict[str, Any]:
    """工具：从 Etherscan 查询合约的大额 ETH 内部转账（txlistinternal）。

    内部交易是合约代码执行时产生的 ETH 转账，重入攻击、闪贷攻击等
    的资金盗取痕迹均在此处，普通 txlist 看不到。
    """
    def _fetch(sort_dir: str) -> list:
        r = _request_etherscan({
            "module": "account",
            "action": "txlistinternal",
            "address": contract_address,
            "startblock": 0,
            "endblock": 99999999,
            "page": 1,
            "offset": min(max(1, limit), 200),
            "sort": sort_dir,
        })
        if isinstance(r, str) and "No transactions found" in r:
            return []
        return r if isinstance(r, list) else []

    # 先查最新，再查最旧（捕获老合约历史攻击交易）
    result_desc = _fetch("desc")
    result_asc  = _fetch("asc")
    # 合并去重（按 hash+from+to）
    seen: set = set()
    result: list = []
    for tx in result_desc + result_asc:
        key = (tx.get("hash",""), tx.get("from",""), tx.get("to",""), tx.get("value",""))
        if key not in seen:
            seen.add(key)
            result.append(tx)

    if not result:
        return {"large_outflows": [], "total_scanned": 0, "min_eth_threshold": min_eth}

    min_wei = int(min_eth * 1e18)
    large = []
    for tx in result:
        raw = int(tx.get("value", "0"))
        if raw < min_wei:
            continue
        large.append({
            "hash": tx.get("hash"),
            "from": tx.get("from"),
            "to": tx.get("to"),
            "value_eth": round(raw / 1e18, 4),
            "value_wei": raw,
            "timeStamp": tx.get("timeStamp"),
            "type": tx.get("type", "call"),
            "errCode": tx.get("errCode", ""),
        })

    # 按金额降序
    large.sort(key=lambda x: x["value_wei"], reverse=True)

    # 攻击者聚类：统计同一 to 地址累计流出
    acc: Dict[str, float] = {}
    for item in large:
        to = item.get("to") or ""
        acc[to] = acc.get(to, 0.0) + item["value_eth"]
    top_recipients = sorted(
        [{"address": addr, "total_eth": round(total, 4)} for addr, total in acc.items()],
        key=lambda x: x["total_eth"],
        reverse=True,
    )[:5]

    return {
        "large_outflows": large[:20],
        "large_outflow_count": len(large),
        "total_scanned": len(result),
        "min_eth_threshold": min_eth,
        "top_recipients": top_recipients,
    }


# ---------------------------------------------------------------------------
# Tool dispatcher
# ---------------------------------------------------------------------------

_TOOL_REGISTRY: Dict[str, Any] = {
    "get_contract_source": lambda a: get_contract_source(a["contract_address"]),
    "get_transactions": lambda a: get_transactions(
        a["contract_address"], a.get("limit", DEFAULT_TX_LIMIT)
    ),
    "get_large_outflows": lambda a: get_large_outflows(
        a["contract_address"],
        a.get("min_eth", 10.0),
        a.get("limit", 50),
    ),
    "get_tx_detail": lambda a: get_tx_detail(a["tx_hash"]),
}


def execute_tool(tool_name: str, tool_args: Dict[str, Any]) -> Any:
    fn = _TOOL_REGISTRY.get(tool_name)
    if fn is None:
        return {"error": f"未知工具：{tool_name}"}
    try:
        return fn(tool_args)
    except InvestigationError:
        raise   # 透传给 run_investigation_safe 统一处理
    except Exception as exc:
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Analysis helpers（本地规则引擎，HYBRID_MODE/SIMULATION_MODE 使用）
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
# AI 推理接口（HYBRID_MODE=False 且 SIMULATION_MODE=False 时调用）
# ---------------------------------------------------------------------------

def _get_glm_client() -> OpenAI:
    """构造 GLM API 客户端，读取 ZAI_API_KEY 环境变量。"""
    api_key = os.getenv("ZAI_API_KEY")
    if not api_key:
        raise RuntimeError("SIMULATION_MODE=False 时需要设置 ZAI_API_KEY 环境变量。")
    return OpenAI(api_key=api_key, base_url=GLM_BASE_URL, timeout=GLM_TIMEOUT_SECONDS)


def _ai_call(system_prompt: str, user_prompt: str) -> str:
    """调用 GLM API，返回模型回复文本。遇到限流自动指数退避重试。"""
    client = _get_glm_client()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    response = _glm_call_with_retry(
        lambda: client.chat.completions.create(
            model=GLM_MODEL,
            messages=messages,
            temperature=0.2,
        ),
        label=f"GLM completion",
    )
    return response.choices[0].message.content or ""


def _extract_json_fragment(text: str) -> str:
    """从模型回复中提取第一个 JSON 对象或数组，兼容 Markdown 代码块。"""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()

    decoder = json.JSONDecoder()
    for idx, char in enumerate(stripped):
        if char not in "[{":
            continue
        try:
            _, end = decoder.raw_decode(stripped[idx:])
        except json.JSONDecodeError:
            continue
        return stripped[idx:idx + end]
    return stripped


def _ai_json_call(system_prompt: str, user_prompt: str, expected_shape: str) -> Any:
    """调用 GLM 并解析 JSON；失败时让模型自我纠错一次。"""
    reply = _ai_call(system_prompt, user_prompt)
    last_error = ""
    for attempt in range(AI_JSON_REPAIR_ATTEMPTS + 1):
        try:
            return json.loads(_extract_json_fragment(reply))
        except json.JSONDecodeError as exc:
            last_error = str(exc)
            if attempt >= AI_JSON_REPAIR_ATTEMPTS:
                raise
            reply = _ai_call(
                system_prompt=(
                    "你是严格的 JSON 修复器。只输出合法 JSON，不要输出解释、Markdown 或代码块。"
                ),
                user_prompt=(
                    f"目标结构：{expected_shape}\n"
                    f"解析错误：{last_error}\n"
                    f"请修复下面内容为合法 JSON：\n{reply}"
                ),
            )

    raise json.JSONDecodeError(last_error, reply, 0)


def _ai_synthesize_all(
    source_code: str,
    contract_name: str,
    transactions: List[Dict[str, Any]],
    large_outflows: Dict[str, Any],
    tx_detail_findings: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """一次 GLM 调用完成全部综合分析，返回 code_signals / hypotheses / counter_evidence。"""
    system_prompt = (
        "你是 Digital Pompeii 链上验尸专家，一次性完成以下三项分析并以 JSON 对象返回，"
        "不要输出任何解释或 Markdown，只输出合法 JSON。\n\n"
        "返回格式：\n"
        "{\n"
        '  "code_signals": [{\"type\": str, \"severity\": "critical|high|medium|low", \"description\": str}],\n'
        '  "hypotheses": [{\"cause\": str, \"confidence\": float(0-1), \"severity\": str, \"evidence\": [str]}],\n'
        '  "counter_evidence": [str]\n'
        "}\n\n"
        "分析要求：\n"
        "1. code_signals：扫描 Solidity 源码的安全风险信号\n"
        "2. hypotheses：综合代码信号 + 资金流 + 交易详情，给出死因假设，按置信度降序\n"
        "3. counter_evidence：能削弱或推翻最高置信假设的反证\n\n"
        "重要提示：如果 large_outflows 中存在大额内部 ETH 转出，且源码有重入漏洞信号，"
        "则重入攻击假设置信度应 >= 0.80。"
    )
    context = json.dumps({
        "contract_name": contract_name,
        "source_code_preview": source_code[:6000],
        "recent_transactions_count": len(transactions),
        "large_outflows": large_outflows,
        "tx_detail_findings": tx_detail_findings,
    }, ensure_ascii=False)
    user_prompt = f"请分析合约 {contract_name}：\n\n{context}"

    try:
        data = _ai_json_call(system_prompt, user_prompt, "{code_signals, hypotheses, counter_evidence}")
        if not isinstance(data, dict):
            raise ValueError("返回值不是 dict")
        return {
            "code_signals": data.get("code_signals") or [],
            "hypotheses": data.get("hypotheses") or [],
            "counter_evidence": data.get("counter_evidence") or [],
        }
    except (json.JSONDecodeError, ValueError):
        # 降级：用规则引擎兜底
        _log_status("AI synthesis 解析失败，降级为规则引擎")
        code_signals = _sim_code_signals(source_code)
        fund_result = _sim_fund_signals(transactions)
        hypotheses = _sim_generate_hypotheses(code_signals, fund_result, tx_detail_findings)
        counter = _sim_counter_evidence(
            bool(source_code), len(transactions), code_signals
        )
        return {
            "code_signals": code_signals,
            "hypotheses": hypotheses,
            "counter_evidence": counter,
        }


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

    def log_error(self, error_type: str, message: str, round_num: int = 0) -> None:
        self._write({
            "type": "error",
            "round": round_num,
            "timestamp": datetime.datetime.now().isoformat(),
            "error_type": error_type,
            "message": message,
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
                "reasoning": "第二步：拉取最近普通交易，建立调用模式基线。",
            }

        if self._action_phase == 2:
            self._action_phase = 3
            return {
                "type": "tool_call",
                "tool": "get_large_outflows",
                "args": {"contract_address": self._address, "min_eth": 10.0, "limit": 50},
                "reasoning": (
                    "第三步：搜索内部交易中的大额 ETH 流出。"
                    "重入攻击、闪贷攻击的资金盗取均体现在内部交易中，"
                    "普通 txlist 无法捕获。"
                ),
            }

        if self._action_phase == 3:
            # 优先从 large_outflows 里取可疑 tx hash，其次从 transactions
            large = state.get("large_outflows") or {}
            outflow_hashes = [
                item["hash"] for item in (large.get("large_outflows") or [])
                if item.get("hash")
            ][:MAX_TX_DETAILS]
            txs: List[Dict[str, Any]] = state.get("transactions") or []
            tx_hashes = [
                tx["hash"] for tx in txs
                if int(tx.get("value", "0")) >= LARGE_VALUE_THRESHOLD_WEI
            ][:MAX_TX_DETAILS]
            # 合并去重，large_outflows 优先
            seen: set = set()
            combined = []
            for h in outflow_hashes + tx_hashes:
                if h not in seen:
                    seen.add(h)
                    combined.append(h)
            self._pending_hashes = combined[:MAX_TX_DETAILS]
            self._action_phase = 4

        if self._action_phase == 4:
            if self._detail_index < len(self._pending_hashes):
                h = self._pending_hashes[self._detail_index]
                self._detail_index += 1
                return {
                    "type": "tool_call",
                    "tool": "get_tx_detail",
                    "args": {"tx_hash": h},
                    "reasoning": (
                        f"该交易涉及大额 ETH 转出，"
                        "深入查看执行状态和 logs，进一步确认假设。"
                    ),
                }
            self._action_phase = 5

        return {
            "type": "final_output",
            "reasoning": "已收集合约源码、交易列表、大额资金流及可疑交易详情，进入综合分析阶段。",
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

        elif self._evidence_phase == 2 and state.get("large_outflows") is not None:
            events = self._revise_from_large_outflows(state["large_outflows"], round_num)
            self._evidence_phase = 3

        elif self._evidence_phase == 3 and state.get("tx_details"):
            events = self._revise_from_tx_details(state.get("tx_details", {}), round_num)
            self._evidence_phase = 4

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
                # 普通交易无 ETH 转出，但这是正常的——重入资金流在内部交易中
                # 此阶段仅轻微下调，等待 get_large_outflows 结果再判断
                old_conf = current["confidence"]
                current["confidence"] = max(0.0, round(old_conf - 0.05, 2))
                reason = (
                    f"普通交易样本（{len(transactions)} 笔）中未见 ETH 转出，"
                    "但重入攻击资金流通常体现在内部交易中，需进一步查询大额出账。"
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
    # 内部：基于大额内部出账确认/修正假设
    # ──────────────────────────────────────────────────────────────────

    def _revise_from_large_outflows(
        self, large_outflows: Dict[str, Any], round_num: int
    ) -> List[Dict[str, Any]]:
        if not self.active_hypotheses:
            return []

        current = self.active_hypotheses[0]
        events: List[Dict[str, Any]] = []
        outflows = large_outflows.get("large_outflows") or []
        count = large_outflows.get("large_outflow_count", 0)
        top = large_outflows.get("top_recipients") or []

        if not outflows:
            # 无大额内部出账 → 重入假设证据不足，修正
            if "重入攻击" in current["cause"]:
                refutation = (
                    f"内部交易中未发现超过 {large_outflows.get('min_eth_threshold', 10)} ETH "
                    "的大额流出，重入攻击的连续抽资特征不成立。"
                )
                new_cause = "权限漏洞或治理攻击（无链上大额资金流出）"
                new_confidence = 0.45
                new_evidence = current["evidence"] + [refutation]

                old = current.copy()
                old["status"] = "revised"
                old["refutation_evidence"] = [refutation]
                old["replaced_by"] = new_cause
                old["round_revised"] = round_num
                self.alternative_hypotheses.append(old)

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
            return events

        # 找到大额内部出账
        total_eth = sum(item.get("value_eth", 0) for item in outflows)
        top_addr = top[0]["address"] if top else "未知"
        top_eth = top[0]["total_eth"] if top else 0

        if "重入攻击" in current["cause"]:
            # 确认重入假设
            old_conf = current["confidence"]
            current["confidence"] = min(0.92, round(old_conf + 0.20, 2))
            confirm_reason = (
                f"内部交易发现 {count} 笔大额 ETH 流出，合计约 {round(total_eth, 1)} ETH。"
                f"最大受益地址 {top_addr[:16]}... 累计获得 {top_eth} ETH，"
                "与重入攻击反复调用 withdraw 抽取资金的链上特征高度吻合。"
            )
            current["evidence"].append(confirm_reason)
            current["status"] = "confirmed"
            events.append({
                "event": "confirmed",
                "round": round_num,
                "hypothesis": current["cause"],
                "confidence_before": old_conf,
                "confidence_after": current["confidence"],
                "reason": confirm_reason,
            })
        else:
            # 非重入假设但发现大额出账 → 修正为资金盗取
            new_cause = f"大额资金盗取（内部交易发现 {round(total_eth, 1)} ETH 异常流出）"
            new_confidence = 0.70
            evidence_str = (
                f"内部交易中检测到 {count} 笔超阈值 ETH 流出，"
                f"集中流向地址 {top_addr[:16]}...，疑似攻击者地址。"
            )
            old = current.copy()
            old["status"] = "revised"
            old["replaced_by"] = new_cause
            old["round_revised"] = round_num
            self.alternative_hypotheses.append(old)

            new_h = self._make_hypothesis(
                new_cause, new_confidence, "high", [evidence_str], round_num
            )
            self.active_hypotheses = [new_h]
            events.append({
                "event": "revised",
                "round": round_num,
                "old_hypothesis": current["cause"],
                "new_hypothesis": new_cause,
                "confidence_before": current["confidence"],
                "confidence_after": new_confidence,
                "reason": evidence_str,
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
        hybrid_mode: bool = HYBRID_MODE,
        verbose: bool = False,
    ) -> None:
        self.simulation_mode = simulation_mode
        self.hybrid_mode = hybrid_mode
        self.verbose = verbose
        # 累积调查状态（被工具结果持续填充）
        self.state: Dict[str, Any] = {
            "contract_address": None,
            "contract_source": None,
            "transactions": [],
            "large_outflows": None,  # get_large_outflows 结果
            "tx_details": {},        # hash → detail dict
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

        if self.hybrid_mode:
            mode_label = "HYBRID（真实 Etherscan + 本地规则）"
        elif self.simulation_mode:
            mode_label = "SIMULATION（规则引擎）"
        else:
            mode_label = f"AI（{GLM_MODEL}）"
        self._banner(f"Digital Pompeii — Coroner Agent\n  合约：{contract_address}\n  模式：{mode_label}")

        local_reasoning = self.hybrid_mode or self.simulation_mode
        planner = SimulationPlanner(contract_address) if local_reasoning else None
        self._planner = planner
        logger = RunLogger(contract_address)

        # ── Tool-calling 主循环 ──────────────────────────────────────
        _log_status(f"开始调查：contract_address={contract_address}, mode={mode_label}")
        for round_num in range(1, MAX_ROUNDS + 1):
            _log_status(f"第 {round_num} 轮循环开始")
            self._print_round(round_num)

            if local_reasoning:
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
            _log_status(
                f"准备调用工具：{tool_name} 参数={json.dumps(tool_args, ensure_ascii=False)}"
            )
            result = execute_tool(tool_name, tool_args)
            self._update_state(tool_name, tool_args, result)
            self._print_tool_result(tool_name, result)

            logger.log_tool_call(round_num, tool_name, tool_args, result, reasoning)

            # ── 假设评估（本地规则模式下，每轮工具调用后评估证据）──
            if local_reasoning and planner is not None:
                hyp_events = planner.evaluate_evidence(self.state, round_num)
                if hyp_events:
                    logger.log_hypothesis_events(round_num, hyp_events)
                    self._print_hypothesis_events(hyp_events)

            if not local_reasoning:
                self._add_tool_result_to_messages(action, result)
        else:
            self._log("警告", f"已达到最大轮次上限（{MAX_ROUNDS}），强制进入综合分析")

        # ── 综合分析 ─────────────────────────────────────────────────
        self._banner("综合分析（Synthesis）")
        if not (self.hybrid_mode or self.simulation_mode):
            _log_status("等待 75s 让 GLM 限流窗口刷新，然后进行综合分析……")
            time.sleep(75)
        _log_status("正在生成报告")
        exhibit = self.synthesize_exhibit()
        logger.log_synthesis(exhibit)

        # ── 可选写文件 ────────────────────────────────────────────────
        if output_path:
            out = Path(output_path)
            out.parent.mkdir(parents=True, exist_ok=True)
            _log_status(f"写入 JSON 报告：{out}")
            out.write_text(json.dumps(exhibit, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"\n[OK] 展品已保存：{out.resolve()}")

        print(f"[OK] 运行日志：{logger.path.resolve()}")
        return exhibit

    # ------------------------------------------------------------------
    # 安全入口：捕获所有异常，返回"调查未完成"展品
    # ------------------------------------------------------------------

    def run_investigation_safe(
        self,
        contract_address: str,
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        run_investigation 的容错版本。
        任何 InvestigationError 或意外异常都会被捕获，
        返回包含 status='incomplete' 的标准 JSON 而不是抛出异常。
        """
        try:
            return self.run_investigation(contract_address, output_path=output_path)
        except InvestigationError as exc:
            exhibit = self._incomplete_exhibit(contract_address, exc.error_type, str(exc))
            self._save_and_log_incomplete(exhibit, output_path, exc.error_type, str(exc))
            return exhibit
        except Exception as exc:  # noqa: BLE001
            exhibit = self._incomplete_exhibit(contract_address, "unknown", str(exc))
            self._save_and_log_incomplete(exhibit, output_path, "unknown", str(exc))
            return exhibit

    def _incomplete_exhibit(
        self, contract_address: str, error_type: str, error_message: str
    ) -> Dict[str, Any]:
        """生成"调查未完成"的标准展品 JSON。"""
        return {
            "contract_address": contract_address,
            "status": "incomplete",
            "error_type": error_type,
            "error_message": error_message,
            "timestamp": datetime.datetime.now().isoformat(),
            "contract_name": None,
            "simulation_mode": self.simulation_mode,
            "hybrid_mode": self.hybrid_mode,
            "death_cause": None,
            "confidence": None,
            "severity": None,
            "evidence": [],
            "technical_findings": [],
            "counter_evidence": [],
            "all_hypotheses": [],
            "alternative_hypotheses": [],
            "code_signals": [],
            "suspicious_outflows": [],
            "suspicious_tx_details": [],
            "timeline": [],
        }

    def _save_and_log_incomplete(
        self,
        exhibit: Dict[str, Any],
        output_path: Optional[str],
        error_type: str,
        error_message: str,
    ) -> None:
        print(f"\n[ERROR] 调查未完成 [{error_type}]: {error_message}")
        if output_path:
            out = Path(output_path)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(exhibit, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[INCOMPLETE] 部分结果已保存：{out.resolve()}")
        # 尝试写错误日志（logger 可能尚未初始化，故用独立路径）
        try:
            RUNS_DIR.mkdir(parents=True, exist_ok=True)
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            addr_short = exhibit["contract_address"][2:10]
            err_log = RUNS_DIR / f"error_{ts}_{addr_short}.jsonl"
            with err_log.open("w", encoding="utf-8") as f:
                f.write(json.dumps({
                    "type": "error",
                    "timestamp": exhibit["timestamp"],
                    "contract_address": exhibit["contract_address"],
                    "error_type": error_type,
                    "message": error_message,
                }, ensure_ascii=False) + "\n")
            print(f"[INCOMPLETE] 错误日志：{err_log.resolve()}")
        except Exception:  # noqa: BLE001
            pass

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

        # ① 资金流分析（合并普通交易 + 内部交易大额出账）
        self._log("分析", "识别资金流异常")
        fund_result = _sim_fund_signals(transactions)
        large_outflows_data = self.state.get("large_outflows") or {}
        for item in large_outflows_data.get("large_outflows") or []:
            fund_result["suspicious_outflows"].append({
                **item,
                "flag": (
                    f"内部交易大额流出 {item.get('value_eth', 0)} ETH"
                    f" → {(item.get('to') or '')[:20]}..."
                ),
                "source": "internal_tx",
            })
        self._log("带 value 交易数", fund_result["value_transfer_count"])
        self._log("可疑流出数（含内部交易）", len(fund_result["suspicious_outflows"]))

        # ② 交易详情异常
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

        # ③ 综合分析：AI 模式一次调用，规则模式分步执行
        self._log("分析", "综合代码 + 资金流 + 交易，生成死因结论")

        planner_active = self._planner.active_hypotheses if self._planner else []
        planner_alternatives = self._planner.alternative_hypotheses if self._planner else []

        if self.hybrid_mode or self.simulation_mode:
            # 规则模式：先扫代码信号，再用 planner 结果
            code_signals = _sim_code_signals(source_code)
            for sig in code_signals:
                self._log(f"  [{sig['severity'].upper()}] {sig['type']}", sig["description"])

            if planner_active:
                hypotheses = planner_active
                alternative_hypotheses = planner_alternatives
                self._log("来源", "Planner 动态假设追踪")
            else:
                hypotheses = _sim_generate_hypotheses(code_signals, fund_result, tx_detail_findings)
                alternative_hypotheses = []
                self._log("来源", "规则引擎一次性生成")

            counter_evidence = _sim_counter_evidence(verified, len(transactions), code_signals)

        else:
            # AI 模式：一次 GLM 调用搞定代码信号 + 假设 + 反证
            _log_status("AI synthesis：单次 GLM 调用生成全部分析结果")
            ai_result = _ai_synthesize_all(
                source_code, contract_name, transactions,
                large_outflows_data, tx_detail_findings,
            )
            code_signals = ai_result["code_signals"]
            hypotheses = ai_result["hypotheses"]
            counter_evidence = ai_result["counter_evidence"]
            alternative_hypotheses = []
            self._log("来源", "AI 单次综合调用")
            for sig in code_signals:
                self._log(f"  [{sig.get('severity','?').upper()}] {sig.get('type','?')}", sig.get("description",""))

        for i, h in enumerate(hypotheses, 1):
            self._log(
                f"  假设 {i} [{h.get('severity','?').upper()}]",
                f"confidence={h.get('confidence')}  {h.get('cause')}",
            )
        if alternative_hypotheses:
            self._log(f"被替换的旧假设（{len(alternative_hypotheses)} 条）")

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

        # ⑦ 构建结构化取证发现（technical_findings）
        technical_findings = self._build_technical_findings(
            code_signals, fund_result, tx_detail_findings,
            contract_source, transactions
        )

        exhibit = {
            "contract_address": self.state["contract_address"],
            "contract_name": contract_name,
            "simulation_mode": self.simulation_mode,
            "hybrid_mode": self.hybrid_mode,
            "death_cause": primary["cause"] if primary else "无法确定",
            "confidence": primary["confidence"] if primary else 0.0,
            "severity": primary.get("severity") if primary else None,
            "evidence": primary.get("evidence", []) if primary else [],
            "technical_findings": technical_findings,
            "counter_evidence": primary.get("counter_evidence", []) if primary else [],
            "all_hypotheses": revised,
            "alternative_hypotheses": alternative_hypotheses,
            "code_signals": code_signals,
            "suspicious_outflows": fund_result.get("suspicious_outflows", []),
            "suspicious_tx_details": tx_detail_findings,
            "timeline": fund_result.get("value_transfers", []),
        }

        self._log("death_cause", exhibit["death_cause"])
        self._log("confidence", exhibit["confidence"])
        self._log("severity", exhibit["severity"])
        self._log("technical_findings 条数", len(technical_findings))
        self._log("alternative_hypotheses 数量", len(alternative_hypotheses))
        return exhibit

    @staticmethod
    def _build_technical_findings(
        code_signals: List[Dict[str, Any]],
        fund_result: Dict[str, Any],
        tx_detail_findings: List[Dict[str, Any]],
        contract_source: Dict[str, Any],
        transactions: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """将各维度分析结果转换为统一的结构化取证条目（technical_findings 格式）。"""
        findings: List[Dict[str, Any]] = []
        address = contract_source.get("address", "")

        # 代码漏洞信号 → code_vulnerability 条目
        for sig in code_signals:
            findings.append({
                "evidence_type": "code_vulnerability",
                "tx_hash": None,
                "involved_addresses": [address] if address else [],
                "reasoning": sig["description"],
                "confidence": {
                    "critical": 0.90, "high": 0.80, "medium": 0.60, "low": 0.35,
                }.get(sig.get("severity", "low"), 0.50),
            })

        # 可疑大额资金流出 → fund_flow 条目
        for outflow in fund_result.get("suspicious_outflows", []):
            findings.append({
                "evidence_type": "fund_flow",
                "tx_hash": outflow.get("hash"),
                "involved_addresses": list(filter(None, [
                    outflow.get("from"), outflow.get("to")
                ])),
                "reasoning": outflow.get("flag", "检测到可疑大额资金转出。"),
                "confidence": 0.80,
            })

        # 交易详情异常 → on_chain_transaction 条目
        for detail in tx_detail_findings:
            findings.append({
                "evidence_type": "on_chain_transaction",
                "tx_hash": detail.get("hash"),
                "involved_addresses": [address] if address else [],
                "reasoning": detail.get("note", "交易执行结果异常。"),
                "confidence": 0.75,
            })

        # 合约基本信息核实 → historical_record 条目
        if contract_source.get("verified"):
            findings.append({
                "evidence_type": "historical_record",
                "tx_hash": None,
                "involved_addresses": [address] if address else [],
                "reasoning": (
                    f"合约 {contract_source.get('contract_name', 'Unknown')} 源码已在 Etherscan 验证，"
                    f"编译器版本 {contract_source.get('compiler_version', '未知')}，"
                    f"源码大小 {len(contract_source.get('source_code', ''))} bytes，"
                    f"满足取证基本要求。"
                ),
                "confidence": 0.99,
            })

        return findings

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
        elif tool_name == "get_large_outflows":
            self.state["large_outflows"] = result
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
                    "  1. get_contract_source  — 获取合约源码和 ABI\n"
                    "  2. get_transactions     — 获取最近普通交易（调用模式基线）\n"
                    "  3. get_large_outflows   — 搜索内部交易大额 ETH 流出（重要！重入/闪贷攻击的资金流在这里）\n"
                    "  4. get_tx_detail        — 对可疑大额交易深入查看（可选）\n"
                    "  5. 信息充分后停止工具调用，直接输出结案分析\n\n"
                    "重要提示：普通交易（txlist）看不到合约内部 ETH 转账，"
                    "重入攻击、闪贷攻击的资金盗取均体现在内部交易中，必须调用 get_large_outflows。\n"
                    "你的输出将被后端综合分析模块处理，请尽量收集完整信息后再停止。"
                ),
            },
            {
                "role": "user",
                "content": f"请调查以太坊合约：{contract_address}",
            },
        ]

    def _ai_get_next_action(self) -> Dict[str, Any]:
        """调用 GLM API（带 tool_schemas），解析返回的工具调用或结案决定。遇到限流自动重试。"""
        client = _get_glm_client()
        messages_snapshot = list(self._messages)   # 快照，防重试时消息被修改
        response = _glm_call_with_retry(
            lambda: client.chat.completions.create(
                model=GLM_MODEL,
                messages=messages_snapshot,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
                temperature=0.1,
            ),
            label="GLM tool_calling",
        )
        choice = response.choices[0]
        _log_status(f"GLM tool_calling finish_reason={choice.finish_reason}")
        message = choice.message
        # 将 assistant 消息追加到对话历史（转为 dict 以便序列化）
        self._messages.append(message.model_dump(exclude_unset=False))

        if choice.finish_reason == "tool_calls" and message.tool_calls:
            tc = message.tool_calls[0]
            try:
                tool_args = json.loads(tc.function.arguments)
            except json.JSONDecodeError as exc:
                raise InvestigationError(
                    f"GLM 返回的工具参数不是合法 JSON：{tc.function.arguments}",
                    error_type="llm_tool_args_error",
                ) from exc
            return {
                "type": "tool_call",
                "tool": tc.function.name,
                "args": tool_args,
                "tool_call_id": tc.id,
            }
        return {"type": "final_output", "content": message.content or ""}

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

def _parse_args(argv: List[str]) -> Dict[str, Any]:
    """
    解析 CLI 参数，返回配置字典。

    单地址模式（默认）：
      coroner.py <address> [-o output.json]
      coroner.py --address <address> [--mode ai|hybrid|simulation]

    批量模式：
      coroner.py --batch <addr1> <addr2> ... [-o output_dir/]
      coroner.py --batch-file addresses.txt  [-o output_dir/]

    通用选项：
      --quiet / -q     关闭 verbose 输出（批量模式默认安静）
      --output / -o    单地址时为文件路径；批量时为输出目录
      --mode           推理模式：ai（默认）、hybrid、simulation
    """
    cfg: Dict[str, Any] = {
        "mode": "single",
        "addresses": [],
        "output": None,
        "verbose": True,
        "batch_file": None,
        "run_mode": "ai",   # ai | hybrid | simulation
    }

    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--batch":
            cfg["mode"] = "batch"
            cfg["verbose"] = False
            i += 1
            while i < len(argv) and not argv[i].startswith("-"):
                cfg["addresses"].append(argv[i])
                i += 1
        elif arg == "--batch-file":
            cfg["mode"] = "batch"
            cfg["verbose"] = False
            cfg["batch_file"] = argv[i + 1]
            i += 2
        elif arg in ("--output", "-o") and i + 1 < len(argv):
            cfg["output"] = argv[i + 1]
            i += 2
        elif arg in ("--quiet", "-q"):
            cfg["verbose"] = False
            i += 1
        elif arg in ("--address", "-a") and i + 1 < len(argv):
            cfg["addresses"].append(argv[i + 1])
            i += 2
        elif arg == "--mode" and i + 1 < len(argv):
            cfg["run_mode"] = argv[i + 1].lower()
            i += 2
        elif not arg.startswith("-"):
            cfg["addresses"].append(arg)
            i += 1
        else:
            i += 1

    return cfg


def _run_batch(
    addresses: List[str],
    output_dir: Optional[str],
    verbose: bool,
) -> None:
    """批量调查多个合约地址，汇总结果并打印摘要。"""
    if not addresses:
        print("[ERROR] 批量模式：未提供任何合约地址。")
        return

    out_dir = Path(output_dir) if output_dir else RUNS_DIR / "batch"
    out_dir.mkdir(parents=True, exist_ok=True)

    results: List[Dict[str, Any]] = []
    successes: List[str] = []
    failures: List[Dict[str, str]] = []

    total = len(addresses)
    for idx, address in enumerate(addresses, 1):
        print(f"\n[{idx}/{total}] 调查：{address}")
        agent = CoronerAgent(verbose=verbose)
        addr_slug = address[2:10].lower() if address.startswith("0x") else address[:8]
        out_file = out_dir / f"{addr_slug}.json"

        exhibit = agent.run_investigation_safe(address, output_path=str(out_file))
        results.append(exhibit)

        if exhibit.get("status") == "incomplete":
            failures.append({
                "address": address,
                "error_type": exhibit.get("error_type", "unknown"),
                "error_message": exhibit.get("error_message", ""),
            })
            print(f"  [FAIL] {exhibit.get('error_type')}: {exhibit.get('error_message', '')[:80]}")
        else:
            successes.append(address)
            print(
                f"  [OK]   {exhibit.get('contract_name', 'Unknown'):20s}"
                f" confidence={exhibit.get('confidence', 0):.2f}"
                f" findings={len(exhibit.get('technical_findings', []))}"
            )

    # 写汇总文件
    summary = {
        "timestamp": datetime.datetime.now().isoformat(),
        "total": total,
        "succeeded": len(successes),
        "failed": len(failures),
        "success_addresses": successes,
        "failures": failures,
        "exhibits": results,
    }
    summary_path = out_dir / "batch_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{'=' * 62}")
    print(f"  批量调查完成  {len(successes)}/{total} 成功，{len(failures)} 失败")
    print(f"  汇总文件：{summary_path.resolve()}")
    print(f"  展品目录：{out_dir.resolve()}")
    if failures:
        print(f"\n  失败列表：")
        for f in failures:
            print(f"    [{f['error_type']}] {f['address']} — {f['error_message'][:60]}")
    print(f"{'=' * 62}\n")


def main() -> None:
    import sys

    cfg = _parse_args(sys.argv[1:])

    # 从 batch-file 加载地址
    if cfg["batch_file"]:
        bf = Path(cfg["batch_file"])
        if not bf.exists():
            print(f"[ERROR] 地址文件不存在：{bf}")
            sys.exit(1)
        lines = bf.read_text(encoding="utf-8").splitlines()
        cfg["addresses"] = [
            ln.split()[0] for ln in lines
            if ln.strip() and not ln.strip().startswith("#")
        ]

    if cfg["mode"] == "batch":
        _run_batch(cfg["addresses"], cfg["output"], cfg["verbose"])
        return

    # ── 单地址模式 ──────────────────────────────────────────────────
    address = cfg["addresses"][0] if cfg["addresses"] else "0x0000000000000000000000000000000000000000"
    output_path: Optional[str] = cfg["output"]
    verbose: bool = cfg["verbose"]
    run_mode: str = cfg["run_mode"]

    hybrid = run_mode == "hybrid"
    simulation = run_mode == "simulation"
    agent = CoronerAgent(verbose=verbose, hybrid_mode=hybrid, simulation_mode=simulation)
    exhibit = agent.run_investigation_safe(address, output_path=output_path)

    print("\n" + "=" * 62)
    print("  最终结案展品 (Exhibit JSON)")
    print("=" * 62)
    print(json.dumps(exhibit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
