# Track 2 — Python SDK 详细设计

**日期：** 2026-04-01  
**状态：** 已批准  
**范围：** `alephant-python`（独立 Git 仓库）  
**关联：** `alephant-mcp/docs/2026-04-01-alephant-mcp-distribution-roadmap.md` Track 2

---

## 目标

为 Python AI 开发者提供两个轻量集成包，通过 Alephant AI Gateway 的虚拟密钥（VK）路由 LLM 调用，实现策略执行与 FinOps 消费归因，无需在 SDK 侧做任何日志或数据上报。

| 包名 | 目标框架 |
|---|---|
| `alephant-langchain` | LangChain (`langchain-openai`) |
| `alephant-llamaindex` | LlamaIndex (`llama-index-llms-openai`) |

---

## §1 — 仓库结构与包边界

**Git 仓库：** `alephant-python`（独立仓库，非 alephant-mcp 子目录）

```
alephant-python/
├── alephant_core/                 # 私有共用模块，不发布 PyPI
│   ├── __init__.py
│   ├── config.py                  # AlephantConfig
│   └── cockpit.py                 # CockpitClient (sync + async)
│
├── alephant_langchain/            # 发布为 alephant-langchain
│   ├── __init__.py                # 导出 ChatAlephant, AlephantBudgetCallback
│   ├── chat.py                    # ChatAlephant(ChatOpenAI)
│   └── callbacks.py               # AlephantBudgetCallback
│
├── alephant_llamaindex/           # 发布为 alephant-llamaindex
│   ├── __init__.py                # 导出 AlephantOpenAI, AlephantBudgetHandler
│   ├── llm.py                     # AlephantOpenAI(OpenAI)
│   └── callbacks.py               # AlephantBudgetHandler
│
├── tests/
│   ├── test_core.py
│   ├── test_langchain.py
│   └── test_llamaindex.py
│
├── pyproject.toml                 # hatch monorepo 根配置
└── README.md
```

**包依赖关系：**

```
alephant-langchain  ──depends on──► langchain-openai ≥ 0.1
                    ──bundles────► alephant_core (via hatch build include)

alephant-llamaindex ──depends on──► llama-index-llms-openai ≥ 0.1
                    ──bundles────► alephant_core (via hatch build include)
```

`alephant_core` 通过 hatch 的 `[tool.hatch.build.targets.wheel] packages` 配置打包进各自的 wheel，用户只看到 `alephant-langchain` 和 `alephant-llamaindex` 两个包，`alephant_core` 不单独发布 PyPI。

**Python 版本：** ≥ 3.9（与 LangChain、LlamaIndex 当前最低要求对齐）  
**打包工具：** `hatch`（现代 Python 打包标准，支持 monorepo + wheel 打包控制）

---

## §2 — `alephant_core`：AlephantConfig + CockpitClient

### 2.1 AlephantConfig（`config.py`）

负责读取配置、校验 VK 格式、解析 Gateway URL。

```python
GATEWAY_URL_DEFAULT = "https://gateway.alephant.ai"

class AlephantConfig:
    def __init__(
        self,
        virtual_key: str | None = None,
        gateway_url: str | None = None,
    ):
        # 优先用参数，fallback 到环境变量
        self.virtual_key = virtual_key or os.environ.get("ALEPHANT_VIRTUAL_KEY", "")
        self.gateway_url = (
            gateway_url
            or os.environ.get("ALEPHANT_GATEWAY_URL", GATEWAY_URL_DEFAULT)
        ).rstrip("/")

        if not self.virtual_key:
            raise ValueError(
                "virtual_key is required. Pass it directly or set "
                "ALEPHANT_VIRTUAL_KEY environment variable."
            )

    @property
    def openai_base_url(self) -> str:
        # OpenAI-compatible endpoint on Alephant Gateway
        return f"{self.gateway_url}/v1"

    @property
    def cockpit_base_url(self) -> str:
        return f"{self.gateway_url}/api/v1/cockpit"
```

**设计说明：**
- v1 只校验非空；v2 可扩展为 `vk-` 前缀 regex，不在 v1 中过度约束
- 环境变量 `ALEPHANT_VIRTUAL_KEY` / `ALEPHANT_GATEWAY_URL` 作为零配置路径

### 2.2 CockpitClient（`cockpit.py`）

负责查询预算状态，带 TTL 缓存避免每次 LLM 调用都发 HTTP 请求。

```python
from dataclasses import dataclass
import time, httpx, logging

logger = logging.getLogger(__name__)

@dataclass
class BudgetStatus:
    used_usd: float
    limit_usd: float
    used_ratio: float           # used_usd / limit_usd，0.0–1.0+
    virtual_key: str

@dataclass
class _CacheEntry:
    status: BudgetStatus
    expires_at: float           # time.monotonic() + TTL

class CockpitClient:
    def __init__(self, config: AlephantConfig, ttl_seconds: int = 30):
        self._config = config
        self._ttl = ttl_seconds
        self._cache: dict[str, _CacheEntry] = {}

    def _is_fresh(self, vk: str) -> bool:
        entry = self._cache.get(vk)
        return entry is not None and time.monotonic() < entry.expires_at

    # ── Sync ──────────────────────────────────────────────────────────────────
    def get_budget_status(self) -> BudgetStatus | None:
        vk = self._config.virtual_key
        if self._is_fresh(vk):
            return self._cache[vk].status
        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(
                    f"{self._config.cockpit_base_url}/budget-status",
                    headers={"Authorization": f"Bearer {vk}"},
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.debug("CockpitClient.get_budget_status failed: %s", e)
            return None
        status = _parse_budget_status(vk, data)
        self._cache[vk] = _CacheEntry(status, time.monotonic() + self._ttl)
        return status

    # ── Async ─────────────────────────────────────────────────────────────────
    async def aget_budget_status(self) -> BudgetStatus | None:
        vk = self._config.virtual_key
        if self._is_fresh(vk):
            return self._cache[vk].status
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self._config.cockpit_base_url}/budget-status",
                    headers={"Authorization": f"Bearer {vk}"},
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.debug("CockpitClient.aget_budget_status failed: %s", e)
            return None
        status = _parse_budget_status(vk, data)
        self._cache[vk] = _CacheEntry(status, time.monotonic() + self._ttl)
        return status
```

**设计要点：**

| 项 | 决策 |
|---|---|
| TTL 默认 30s | 每次 LLM 调用命中缓存时附加 < 1ms；30s 内 Cockpit 不会被轰炸 |
| 失败静默返回 `None` | Cockpit 不可达时不阻塞 LLM 调用，callback 收到 `None` 时跳过警告 |
| 缓存 key = VK | 同进程多 VK 互不干扰 |
| `httpx` 双模式 | 同一依赖同时满足 sync / async，不引入额外包 |
| 不做线程锁 | TTL cache 写操作极轻量，dict 操作在 CPython GIL 下天然安全 |

---

## §3 — LangChain 集成

### 3.1 ChatAlephant（`alephant_langchain/chat.py`）

继承 `ChatOpenAI`，仅覆盖初始化逻辑，将 `base_url` 和 `api_key` 指向 Alephant Gateway。

```python
from langchain_openai import ChatOpenAI
from alephant_core.config import AlephantConfig

class ChatAlephant(ChatOpenAI):
    """
    Drop-in replacement for ChatOpenAI that routes through Alephant AI Gateway.

    Usage:
        llm = ChatAlephant(virtual_key="vk-xxxx")
        llm = ChatAlephant(virtual_key="vk-xxxx", model="gpt-4o", temperature=0)
    """

    def __init__(
        self,
        virtual_key: str | None = None,
        gateway_url: str | None = None,
        **kwargs,
    ):
        config = AlephantConfig(virtual_key=virtual_key, gateway_url=gateway_url)

        # 防止调用方意外传入这两个字段，避免绕过 Gateway
        kwargs.pop("openai_api_base", None)
        kwargs.pop("base_url", None)
        kwargs.pop("api_key", None)
        kwargs.pop("openai_api_key", None)

        super().__init__(
            base_url=config.openai_base_url,
            api_key=config.virtual_key,   # Gateway 以 VK 作为 API Key
            **kwargs,
        )
```

**关键设计：**

| 项 | 决策 |
|---|---|
| 继承 `ChatOpenAI` 而非组合 | 用户可直接传 `model`、`temperature`、`callbacks` 等所有 LangChain 原生参数 |
| `base_url` + `api_key` 覆写 | Gateway 实现 OpenAI-compatible API，VK 即 API Key |
| 静默移除 `openai_api_base` 等 | 防止调用方误传导致路由绕过 Gateway |
| 不暴露 `AlephantConfig` 给外部 | 用户只需关心 `virtual_key`，内部细节隐藏 |

### 3.2 AlephantBudgetCallback（`alephant_langchain/callbacks.py`）

实现 LangChain `BaseCallbackHandler`，在每次 LLM 调用开始前查询预算状态，超阈值时打印警告（不阻断调用）。

```python
import logging
from langchain_core.callbacks import BaseCallbackHandler
from alephant_core.cockpit import CockpitClient
from alephant_core.config import AlephantConfig

logger = logging.getLogger(__name__)

class AlephantBudgetCallback(BaseCallbackHandler):
    """
    LangChain callback that warns when virtual key budget usage exceeds threshold.

    Usage:
        callback = AlephantBudgetCallback(virtual_key="vk-xxxx", warn_threshold=0.8)
        llm = ChatAlephant(virtual_key="vk-xxxx", callbacks=[callback])
    """

    def __init__(
        self,
        virtual_key: str | None = None,
        gateway_url: str | None = None,
        warn_threshold: float = 0.8,   # 80% 触发 WARN
        ttl_seconds: int = 30,
    ):
        self._client = CockpitClient(
            AlephantConfig(virtual_key=virtual_key, gateway_url=gateway_url),
            ttl_seconds=ttl_seconds,
        )
        self._threshold = warn_threshold

    # ── Sync hook ─────────────────────────────────────────────────────────────
    def on_llm_start(self, serialized, prompts, **kwargs):
        status = self._client.get_budget_status()
        self._maybe_warn(status)

    # ── Async hook ────────────────────────────────────────────────────────────
    async def on_llm_start_async(self, serialized, prompts, **kwargs):
        status = await self._client.aget_budget_status()
        self._maybe_warn(status)

    def _maybe_warn(self, status):
        if status is None:
            return
        if status.used_ratio >= self._threshold:
            logger.warning(
                "[Alephant] Budget warning: %.1f%% used ($%.2f / $%.2f) for key ...%s",
                status.used_ratio * 100,
                status.used_usd,
                status.limit_usd,
                status.virtual_key[-6:],
            )
```

### 3.3 公开导出（`alephant_langchain/__init__.py`）

```python
from alephant_langchain.chat import ChatAlephant
from alephant_langchain.callbacks import AlephantBudgetCallback

__all__ = ["ChatAlephant", "AlephantBudgetCallback"]
```

### 3.4 目标用法（验收标准）

```python
from alephant_langchain import ChatAlephant, AlephantBudgetCallback

budget_cb = AlephantBudgetCallback(virtual_key="vk-xxxx", warn_threshold=0.8)

llm = ChatAlephant(
    virtual_key="vk-xxxx",
    model="gpt-4o",
    temperature=0,
    callbacks=[budget_cb],
)

# 同步
response = llm.invoke("Hello!")

# 异步（LangGraph / async chain）
response = await llm.ainvoke("Hello!")
```

### 3.5 依赖声明（`alephant_langchain/pyproject.toml`）

```toml
[project]
name = "alephant-langchain"
version = "0.1.0"
requires-python = ">=3.9"
dependencies = [
    "langchain-openai>=0.1",
    "httpx>=0.25",
]

[tool.hatch.build.targets.wheel]
packages = ["alephant_langchain", "alephant_core"]
```

---

## §4 — LlamaIndex 集成

### 4.1 AlephantOpenAI（`alephant_llamaindex/llm.py`）

继承 LlamaIndex 的 `OpenAI` LLM 类，覆盖初始化，将请求路由到 Alephant Gateway。

```python
from llama_index.llms.openai import OpenAI
from alephant_core.config import AlephantConfig

class AlephantOpenAI(OpenAI):
    """
    Drop-in replacement for LlamaIndex OpenAI that routes through Alephant AI Gateway.

    Usage:
        llm = AlephantOpenAI(virtual_key="vk-xxxx")
        llm = AlephantOpenAI(virtual_key="vk-xxxx", model="gpt-4o", temperature=0)
    """

    def __init__(
        self,
        virtual_key: str | None = None,
        gateway_url: str | None = None,
        **kwargs,
    ):
        config = AlephantConfig(virtual_key=virtual_key, gateway_url=gateway_url)

        # 防止调用方绕过 Gateway（LlamaIndex 用 api_base，不是 base_url）
        kwargs.pop("api_base", None)
        kwargs.pop("api_key", None)

        super().__init__(
            api_base=config.openai_base_url,
            api_key=config.virtual_key,
            **kwargs,
        )
```

> LlamaIndex `OpenAI` 类的入参是 `api_base`（不是 `base_url`），与 LangChain 存在差异。

### 4.2 AlephantBudgetHandler（`alephant_llamaindex/callbacks.py`）

LlamaIndex 的回调体系使用 `CallbackManager` + `BaseCallbackHandler`（接口与 LangChain 不同）。

```python
import logging
from llama_index.core.callbacks import BaseCallbackHandler, CBEventType
from alephant_core.cockpit import CockpitClient
from alephant_core.config import AlephantConfig

logger = logging.getLogger(__name__)

class AlephantBudgetHandler(BaseCallbackHandler):
    """
    LlamaIndex callback handler that warns when virtual key budget usage exceeds threshold.

    Usage:
        from llama_index.core.callbacks import CallbackManager

        handler = AlephantBudgetHandler(virtual_key="vk-xxxx", warn_threshold=0.8)
        callback_manager = CallbackManager([handler])
        llm = AlephantOpenAI(virtual_key="vk-xxxx", callback_manager=callback_manager)
    """

    def __init__(
        self,
        virtual_key: str | None = None,
        gateway_url: str | None = None,
        warn_threshold: float = 0.8,
        ttl_seconds: int = 30,
    ):
        super().__init__(
            event_starts_to_ignore=[],
            event_ends_to_ignore=[],
        )
        self._client = CockpitClient(
            AlephantConfig(virtual_key=virtual_key, gateway_url=gateway_url),
            ttl_seconds=ttl_seconds,
        )
        self._threshold = warn_threshold

    def on_event_start(
        self,
        event_type: CBEventType,
        payload=None,
        event_id: str = "",
        **kwargs,
    ) -> str:
        if event_type == CBEventType.LLM:
            status = self._client.get_budget_status()
            self._maybe_warn(status)
        return event_id

    def on_event_end(self, event_type, payload=None, event_id="", **kwargs):
        pass

    def start_trace(self, trace_id=None):
        pass

    def end_trace(self, trace_id=None, trace_map=None):
        pass

    def _maybe_warn(self, status):
        if status is None:
            return
        if status.used_ratio >= self._threshold:
            logger.warning(
                "[Alephant] Budget warning: %.1f%% used ($%.2f / $%.2f) for key ...%s",
                status.used_ratio * 100,
                status.used_usd,
                status.limit_usd,
                status.virtual_key[-6:],
            )
```

### 4.3 与 LangChain 版本的差异对比

| 维度 | LangChain | LlamaIndex |
|---|---|---|
| 继承基类 | `ChatOpenAI` | `OpenAI` |
| base_url 参数名 | `base_url` | `api_base` |
| callback 基类 | `BaseCallbackHandler` (langchain_core) | `BaseCallbackHandler` (llama_index.core.callbacks) |
| 挂载方式 | `callbacks=[cb]` 传入 LLM | `CallbackManager([h])` → LLM `callback_manager` |
| LLM 开始 hook | `on_llm_start` / `on_llm_start_async` | `on_event_start(CBEventType.LLM, ...)` |
| 异步预算查询 | `on_llm_start_async` 直接实现 | LlamaIndex callback 当前无官方 async hook，同步即可（LLM 实际调用仍可 async） |

### 4.4 公开导出（`alephant_llamaindex/__init__.py`）

```python
from alephant_llamaindex.llm import AlephantOpenAI
from alephant_llamaindex.callbacks import AlephantBudgetHandler

__all__ = ["AlephantOpenAI", "AlephantBudgetHandler"]
```

### 4.5 目标用法（验收标准）

```python
from llama_index.core.callbacks import CallbackManager
from alephant_llamaindex import AlephantOpenAI, AlephantBudgetHandler

handler = AlephantBudgetHandler(virtual_key="vk-xxxx", warn_threshold=0.8)
callback_manager = CallbackManager([handler])

llm = AlephantOpenAI(
    virtual_key="vk-xxxx",
    model="gpt-4o",
    callback_manager=callback_manager,
)

# 同步
response = llm.complete("Hello!")

# 异步
response = await llm.acomplete("Hello!")
```

### 4.6 依赖声明（`alephant_llamaindex/pyproject.toml`）

```toml
[project]
name = "alephant-llamaindex"
version = "0.1.0"
requires-python = ">=3.9"
dependencies = [
    "llama-index-llms-openai>=0.1",
    "httpx>=0.25",
]

[tool.hatch.build.targets.wheel]
packages = ["alephant_llamaindex", "alephant_core"]
```

---

## §5 — 测试策略 + 发布流程

### 5.1 测试分层

```
tests/
├── test_core.py          # AlephantConfig + CockpitClient 单元测试
├── test_langchain.py     # ChatAlephant + AlephantBudgetCallback 单元测试
└── test_llamaindex.py    # AlephantOpenAI + AlephantBudgetHandler 单元测试
```

**test_core.py：**

| 测试用例 | 验证点 |
|---|---|
| `test_config_from_param` | 直接传入 `virtual_key` 和 `gateway_url` |
| `test_config_from_env` | 从环境变量读取 `ALEPHANT_VIRTUAL_KEY` |
| `test_config_missing_key_raises` | 未提供 VK 时抛出 `ValueError` |
| `test_config_urls` | `openai_base_url` / `cockpit_base_url` 格式正确 |
| `test_cockpit_cache_hit` | TTL 内第二次调用不发 HTTP（mock httpx） |
| `test_cockpit_returns_none_on_error` | HTTP 500 / 超时 → 返回 `None`，不抛出 |
| `test_cockpit_async` | `aget_budget_status` 返回正确 `BudgetStatus` |

**test_langchain.py：**

| 测试用例 | 验证点 |
|---|---|
| `test_chat_alephant_base_url` | `llm.openai_api_base` 指向 Gateway |
| `test_chat_alephant_api_key` | `llm.openai_api_key` 等于 VK |
| `test_chat_alephant_model_passthrough` | `model="gpt-4o"` 等 kwargs 正常透传 |
| `test_budget_callback_warn` | used_ratio ≥ 0.8 时触发 `logger.warning` |
| `test_budget_callback_no_warn` | used_ratio < 0.8 时不触发 warning |
| `test_budget_callback_none_status` | Cockpit 返回 `None` 时不崩溃 |
| `test_budget_callback_async` | `on_llm_start_async` 调用 `aget_budget_status` |

**test_llamaindex.py：**

| 测试用例 | 验证点 |
|---|---|
| `test_alephant_openai_api_base` | `llm.api_base` 指向 Gateway |
| `test_alephant_openai_api_key` | `llm.api_key` 等于 VK |
| `test_budget_handler_warn` | `on_event_start(CBEventType.LLM)` → 触发 warning |
| `test_budget_handler_non_llm_event` | 非 LLM 事件不查询 Cockpit |
| `test_budget_handler_none_status` | Cockpit 返回 `None` 时不崩溃 |

**测试工具：** `pytest` + `pytest-asyncio`（async 测试）+ `respx`（httpx mock）+ `unittest.mock`

### 5.2 CI 配置（GitHub Actions）

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.9", "3.11", "3.12"]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
      - run: pip install hatch
      - run: hatch run test:all
```

### 5.3 PyPI 发布流程

```
开发 → PR → CI 通过
  │
  ▼
在 main 分支打版本 tag：git tag v0.1.0
  │
  ▼
GitHub Actions Release workflow 触发
  │
  ├─ hatch build -t wheel alephant_langchain   → alephant_langchain-0.1.0-py3-none-any.whl
  └─ hatch build -t wheel alephant_llamaindex  → alephant_llamaindex-0.1.0-py3-none-any.whl
  │
  ▼
twine upload dist/*.whl（使用 PyPI API Token，存于 GitHub Secrets）
```

**版本策略：** `alephant-langchain` 和 `alephant-llamaindex` 使用相同版本号，同步发布，避免兼容性混乱。`alephant_core` 不单独发版。

---

## 设计汇总

| 节 | 内容 |
|---|---|
| §1 | 仓库结构：`alephant-python` 独立仓库，`alephant_core`（私有）+ 两个可发布包，hatch 打包 |
| §2 | `alephant_core`：`AlephantConfig`（VK + Gateway URL）+ `CockpitClient`（sync/async + TTL cache） |
| §3 | LangChain：`ChatAlephant(ChatOpenAI)` + `AlephantBudgetCallback(BaseCallbackHandler)` |
| §4 | LlamaIndex：`AlephantOpenAI(OpenAI)` + `AlephantBudgetHandler(BaseCallbackHandler)` |
| §5 | 测试：pytest + respx；CI：矩阵 3.9/3.11/3.12；发布：tag → hatch build → PyPI |

### 核心原则

- **SDK 不做数据上报**：所有消费数据由 Gateway → MQ → ClickHouse 自动采集，SDK 仅配置路由
- **Gateway 处理提供商路由**：SDK 只设置 `base_url` 和 VK，不感知底层 LLM 提供商
- **预算查询为警告非阻断**：`CockpitClient` 失败静默返回 `None`，不阻塞 LLM 调用
- **最小化依赖**：每个包仅依赖对应框架 + `httpx`，无冗余引入

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-04-01 | 初稿：完整 §1–§5 设计，经逐节审阅确认后落笔。 |
