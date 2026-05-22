"""
proxy_client.py — single AI-call entry point for all Python batch scripts.

Python equivalent of scripts/lib/proxy-client.cjs. Default route is the
Toranot proxy (https://toranot.netlify.app/api/claude). The proxy holds the
Anthropic API key server-side, enforces rate limits, tracks token usage in
toranot_config, and accepts only the canonical allowed-model list. This
means Python batch scripts never need ANTHROPIC_API_KEY and never leak it
to disk via .env or bash_history.

Direct-API fallback: pass direct=True, api_key='...' if the proxy is down
(Netlify outage, key rotation in progress) — per deploy-primitives §4
"Reach for direct Anthropic API unless the proxy genuinely flaps".

Allowed models (proxy-side, verified 2026-05-22):
  - claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5-20251001
  - aliases: sonnet, opus, haiku
  - 'claude-opus-4-7' must be used in DIRECT mode only (canonical Anthropic ID)

Returns just the response text (parallels proxy-client.cjs callClaude semantics).

Usage:
    from lib.proxy_client import call_claude
    text = call_claude("hello", model="sonnet")

    # direct-mode fallback (proxy down):
    text = call_claude("hello", model="claude-opus-4-7", direct=True,
                       api_key=os.environ["ANTHROPIC_API_KEY"])
"""

import json
import os
import urllib.request
import urllib.error

PROXY_URL = "https://toranot.netlify.app/api/claude"
PROXY_SECRET = "shlav-a-mega-1f97f311d307-2026"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


def call_claude(
    prompt: str,
    *,
    model: str = "sonnet",
    system: str | None = None,
    max_tokens: int = 4096,
    timeout_s: float = 60.0,
    direct: bool = False,
    api_key: str | None = None,
) -> str:
    """
    Call Claude. Returns response text (concatenated text blocks from response.content).

    Args:
        prompt:       The user message.
        model:        'sonnet' (default) | 'opus' | 'haiku' | full string. In direct
                      mode, must be a canonical Anthropic model ID (e.g.,
                      'claude-opus-4-7'), not a proxy alias.
        system:       Optional system prompt.
        max_tokens:   Max tokens in the response (default 4096).
        timeout_s:    HTTP timeout in seconds (default 60).
        direct:       If True, bypass proxy and hit api.anthropic.com directly.
                      Requires api_key.
        api_key:      Required when direct=True. The raw Anthropic API key.

    Returns:
        Response text (concatenated content[*].text from the response).

    Raises:
        ValueError: When direct=True without api_key.
        RuntimeError: On HTTP error or malformed response.
    """
    if direct and not api_key:
        raise ValueError("proxy_client: direct=True requires api_key (ANTHROPIC_API_KEY)")

    body: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if isinstance(system, str) and system:
        body["system"] = system

    url = ANTHROPIC_URL if direct else PROXY_URL
    headers = {"Content-Type": "application/json"}
    if direct:
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = ANTHROPIC_VERSION
    else:
        headers["x-api-secret"] = PROXY_SECRET

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as res:
            data = json.loads(res.read())
    except urllib.error.HTTPError as e:
        err_text = "<unreadable>"
        try:
            err_text = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        target = "Anthropic" if direct else "proxy"
        raise RuntimeError(
            f"proxy_client: HTTP {e.code} from {target}: {err_text[:300]}"
        ) from e

    content = data.get("content")
    if not isinstance(content, list):
        raise RuntimeError(
            f"proxy_client: malformed response — content array missing. "
            f"Got: {json.dumps(data)[:300]}"
        )
    text_parts = []
    for block in content:
        if isinstance(block, dict) and isinstance(block.get("text"), str):
            text_parts.append(block["text"])
    return "".join(text_parts)


def get_direct_key() -> str | None:
    """Resolve the direct-mode API key from env vars (in order of preference)."""
    return os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY")


# Backward-compat alias for scripts that prefer the original cjs naming
callClaude = call_claude
