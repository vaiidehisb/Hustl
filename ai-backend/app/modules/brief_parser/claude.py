"""Claude structured-output brief parsing (Anthropic Python SDK)."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

import anthropic

from app.modules.brief_parser.schema import CLAUDE_OUTPUT_SCHEMA, ParsedBrief
from app.modules.brief_parser.validation import BriefValidationError, validate_parsed

SYSTEM_PROMPT = (
    "You extract structured campaign parameters from an influencer-marketing brief written by a brand on hustl., "
    "an Indian creator marketplace. Amounts are in Indian rupees unless another currency is stated "
    "(₹30K = 30000, 1L = 1 lakh = 100000, 1Cr = 10000000). Distinguish budget per creator from total campaign "
    "budget. Only extract what the brief states or clearly implies: use null or an empty list when a field is "
    "absent, never guess numbers. Resolve relative or partial dates against today's date given in the message. "
    "Per-field confidence: 'high' when stated explicitly, 'medium' when clearly implied, 'low' when inferred or absent."
)


class ClaudeParseError(Exception):
    """Claude returned something we cannot use; callers fall back to the rule parser."""

    def __init__(self, reason: str, details: Any = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.details = details


def make_client(api_key: str, timeout: float) -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=2)


async def parse_with_claude(
    client: anthropic.AsyncAnthropic, model: str, text: str, today: date | None = None
) -> tuple[ParsedBrief, list[str]]:
    today = today or date.today()
    try:
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            temperature=0,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Today's date: {today.isoformat()}\n\nBrief:\n{text}"}],
            output_config={"format": {"type": "json_schema", "schema": CLAUDE_OUTPUT_SCHEMA}},
        )
    except anthropic.RateLimitError as exc:
        raise ClaudeParseError("rate_limited", str(exc)) from exc
    except anthropic.APIStatusError as exc:
        raise ClaudeParseError("api_error", {"status": exc.status_code, "message": str(exc)}) from exc
    except anthropic.APIConnectionError as exc:
        raise ClaudeParseError("connection_error", str(exc)) from exc

    if response.stop_reason != "end_turn":
        raise ClaudeParseError("unexpected_stop_reason", {"stop_reason": response.stop_reason})
    block = next((b for b in response.content if getattr(b, "type", None) == "text"), None)
    if block is None:
        raise ClaudeParseError("no_text_block")
    try:
        payload = json.loads(block.text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ClaudeParseError("invalid_json", str(exc)) from exc
    try:
        return validate_parsed(payload, today)
    except BriefValidationError as exc:
        raise ClaudeParseError("validation_failed", exc.errors) from exc
