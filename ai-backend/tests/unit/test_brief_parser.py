import json
from datetime import date
from types import SimpleNamespace

import pytest

from app.modules.brief_parser import claude as claude_parser
from app.modules.brief_parser import service as parser_service
from app.modules.brief_parser.rules import parse_with_rules
from app.modules.brief_parser.schema import CONFIDENCE_FIELDS
from app.modules.brief_parser.validation import BriefValidationError, validate_parsed
from app.schemas.requests import BriefFields, ParseBriefRequest

TODAY = date(2026, 9, 16)

VALID = {
    "title": "Diwali skincare push", "niche": ["beauty"], "platforms": ["INSTAGRAM"],
    "deliverables": [{"type": "Reel", "quantity": 2}], "audience": ["women 18-30"],
    "budget": {"per_creator": 40000, "currency": "INR", "total": None}, "creators_needed": 4,
    "deadline": "2026-10-20", "timeline": "before Diwali", "requirements": ["Show packaging"],
    "location": ["Delhi"], "min_followers": 25000,
    "confidence": {f: "high" for f in CONFIDENCE_FIELDS},
}


class FakeMessages:
    def __init__(self, response=None, exc=None):
        self.response, self.exc, self.calls = response, exc, []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.exc:
            raise self.exc
        return self.response


def fake_client(payload, stop_reason="end_turn"):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    resp = SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=text)])
    return SimpleNamespace(messages=FakeMessages(resp))


# ── rules ────────────────────────────────────────────────────────────────────

def test_rules_parse_full_brief():
    text = ("Need 3 fitness creators on YouTube and Instagram. 1 dedicated video and 2 shorts each. "
            "Total budget 3 lakh. At least 100k subscribers. Based in Pune. Deliver by March 5.")
    p, warnings = validate_parsed(parse_with_rules(text, TODAY), TODAY)
    assert p.niche == ["fitness"]
    assert set(p.platforms) == {"YOUTUBE", "INSTAGRAM"}
    assert {d.type: d.quantity for d in p.deliverables} == {"YouTube video": 1, "Short": 2}
    assert p.budget.total == 300_000 and p.budget.per_creator == 100_000 and p.confidence["budget"] == "medium"
    assert p.creators_needed == 3 and p.min_followers == 100_000
    assert p.deadline == date(2027, 3, 5) and p.confidence["deadline"] == "medium"  # no year → next occurrence
    assert "Pune" in p.location


def test_rules_do_not_invent_values():
    p, _ = validate_parsed(parse_with_rules("Looking for a collaboration.", TODAY), TODAY)
    assert p.budget.per_creator is None and p.budget.total is None
    assert p.min_followers is None and p.creators_needed is None and p.deadline is None
    assert p.niche == [] and p.platforms == []
    assert p.confidence["budget"] == "low" and p.confidence["niche"] == "low"


# ── validation of untrusted LLM JSON ─────────────────────────────────────────

def test_validation_rejects_negative_budget_and_bad_types():
    with pytest.raises(BriefValidationError):
        validate_parsed({**VALID, "budget": {"per_creator": -5, "currency": "INR", "total": None}}, TODAY)
    with pytest.raises(BriefValidationError):
        validate_parsed({**VALID, "deliverables": [{"type": "Reel", "quantity": 0}]}, TODAY)
    with pytest.raises(BriefValidationError):
        validate_parsed({**VALID, "deadline": "next tuesday"}, TODAY)
    with pytest.raises(BriefValidationError):
        validate_parsed({**VALID, "surprise": True}, TODAY)
    with pytest.raises(BriefValidationError):
        validate_parsed(["not", "an", "object"], TODAY)  # type: ignore[arg-type]


def test_validation_normalises_enums_and_flags_soft_issues():
    raw = {**VALID, "platforms": ["instagram", "Twitter", "Snapchat"], "niche": ["Skincare", "astrology"],
           "deadline": "2026-01-01", "budget": {"per_creator": 40000, "currency": "inr", "total": 10000}}
    p, warnings = validate_parsed(raw, TODAY)
    assert p.platforms == ["INSTAGRAM", "X"] and p.confidence["platforms"] == "low"
    assert p.niche == ["beauty"] and p.confidence["niche"] == "low"
    assert p.budget.currency == "INR"
    assert p.confidence["deadline"] == "low" and p.confidence["budget"] == "low"
    assert any("Snapchat" in w for w in warnings) and any("past" in w for w in warnings)


# ── Claude client (mocked) ───────────────────────────────────────────────────

async def test_claude_request_shape_and_valid_output():
    client = fake_client(VALID)
    parsed, warnings = await claude_parser.parse_with_claude(client, "claude-sonnet-4-6", "brief text", TODAY)
    call = client.messages.calls[0]
    assert call["model"] == "claude-sonnet-4-6" and call["temperature"] == 0
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["output_config"]["format"]["schema"]["additionalProperties"] is False
    assert parsed.budget.per_creator == 40000 and warnings == []


@pytest.mark.parametrize(
    "payload,stop_reason,reason",
    [
        (VALID, "max_tokens", "unexpected_stop_reason"),
        (VALID, "refusal", "unexpected_stop_reason"),
        ("{not json", "end_turn", "invalid_json"),
        ({**VALID, "budget": {"per_creator": -1, "currency": "INR", "total": None}}, "end_turn", "validation_failed"),
        ({**VALID, "creators_needed": "many"}, "end_turn", "validation_failed"),
    ],
)
async def test_claude_malformed_output_raises(payload, stop_reason, reason):
    with pytest.raises(claude_parser.ClaudeParseError) as exc:
        await claude_parser.parse_with_claude(fake_client(payload, stop_reason), "m", "brief", TODAY)
    assert exc.value.reason == reason


async def test_service_uses_claude_when_configured(monkeypatch):
    monkeypatch.setattr(parser_service, "_get_client", lambda: fake_client(VALID))
    monkeypatch.setattr(parser_service, "engine", lambda: ("claude", "claude-sonnet-4-6"))
    out = await parser_service.parse_brief(None, ParseBriefRequest(text="Diwali skincare push"), TODAY)
    assert out["source"] == "claude" and out["model"] == "claude-sonnet-4-6" and out["cached"] is False


async def test_service_falls_back_to_rules_on_bad_llm_json(monkeypatch):
    monkeypatch.setattr(parser_service, "_get_client", lambda: fake_client("garbage"))
    monkeypatch.setattr(parser_service, "engine", lambda: ("claude", "claude-sonnet-4-6"))
    out = await parser_service.parse_brief(
        None, ParseBriefRequest(text="2 instagram reels, budget ₹20k per creator"), TODAY)
    assert out["source"] == "rules" and out["model"] is None
    assert out["fallback_reason"]["reason"] == "invalid_json"
    assert out["budget"]["per_creator"] == 20_000


async def test_service_without_api_key_uses_rules_and_explicit_fields_win():
    req = ParseBriefRequest(fields=BriefFields(
        title="Protein bar launch", description="Gym creators for 3 reels. Budget 15k.",
        platforms=["instagram"], niche="fitness", budget=25_000, deadline=date(2026, 11, 1)))
    out = await parser_service.parse_brief(None, req, TODAY)
    assert out["source"] == "rules"
    assert out["title"] == "Protein bar launch" and out["confidence"]["title"] == "high"
    assert out["budget"]["per_creator"] == 25_000 and out["confidence"]["budget"] == "high"
    assert out["platforms"] == ["INSTAGRAM"] and out["niche"] == ["fitness"]
    assert out["deadline"] == "2026-11-01"
    assert out["deliverables"] == [{"type": "Reel", "quantity": 3}]


async def test_service_rejects_invalid_explicit_fields():
    from app.utils.errors import AppError

    with pytest.raises(AppError) as exc:
        await parser_service.parse_brief(None, ParseBriefRequest(fields=BriefFields(platforms=["myspace"])), TODAY)
    assert exc.value.status_code == 422 and exc.value.code == "VALIDATION_ERROR"


def test_cache_key_normalises_whitespace_and_depends_on_engine(monkeypatch):
    a = parser_service.input_hash(ParseBriefRequest(text="two  reels\n budget 10k"))
    b = parser_service.input_hash(ParseBriefRequest(text="two reels budget 10k"))
    assert a == b and len(a) == 64
    monkeypatch.setattr(parser_service, "engine", lambda: ("claude", "claude-sonnet-4-6"))
    assert parser_service.input_hash(ParseBriefRequest(text="two reels budget 10k")) != a
