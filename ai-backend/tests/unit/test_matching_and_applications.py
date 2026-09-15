from app.models.features import BriefCriteria, CandidateCreator
from app.modules.application_scoring.scorer import score_application
from app.modules.matching.rerank import WEIGHTS, rerank, score_candidate

BRIEF = BriefCriteria(brief_id="b1", niche="beauty", platforms=["INSTAGRAM"], min_followers=20_000,
                      min_engagement=0.02, locations=["Mumbai"], budget_per_creator=30_000)


def creator(cid, **kw):
    base = dict(creator_id=cid, similarity=0.5, followers=60_000, engagement_rate=0.05, reliability_score=90,
                authenticity_score=90, available=True, platforms=["INSTAGRAM"], niches=["beauty"], location="Mumbai")
    base.update(kw)
    return CandidateCreator(**base)


def test_weights_follow_spec():
    assert WEIGHTS == {"semantic": 0.40, "engagement_fit": 0.20, "follower_fit": 0.15, "reliability": 0.15,
                       "availability": 0.10}


def test_rerank_orders_by_fit_and_puts_disqualified_last():
    good = creator("good")
    mid = creator("mid", similarity=0.2, engagement_rate=0.025, reliability_score=60, niches=["lifestyle"])
    small = creator("small", followers=5_000, similarity=0.9)  # great content but below minimum followers
    offline = creator("offline", available=False)
    ranked = rerank([small, mid, offline, good], BRIEF, limit=10)
    assert [r["creator_id"] for r in ranked][:2] == ["good", "mid"]
    assert all(r["disqualifiers"] for r in ranked[2:])
    assert any("Below minimum followers" in d for d in ranked[2]["disqualifiers"] + ranked[3]["disqualifiers"])
    for r in ranked:
        assert 0 <= r["match_score"] <= 100 and len(r["match_reasons"]) <= 3
        assert set(r["components"]) == set(WEIGHTS)


def test_rerank_limit_and_empty_input():
    assert rerank([], BRIEF) == []
    assert len(rerank([creator(str(i)) for i in range(30)], BRIEF, limit=20)) == 20


def test_missing_data_is_neutral_and_labelled():
    r = score_candidate(creator("x", engagement_rate=None, reliability_score=None, followers=None), BriefCriteria("b"))
    assert r["components"]["engagement_fit"]["status"] == "insufficient_data"
    assert r["components"]["reliability"]["score"] == 0.5
    assert "value" not in r["components"]["reliability"]


def test_application_hard_requirements_produce_disqualifiers():
    bad = creator("bad", followers=10_000, engagement_rate=None, platforms=["YOUTUBE"])
    r = score_application(bad, BRIEF, proposed_rate=50_000)
    joined = " ".join(r["disqualifiers"])
    assert "minimum followers" in joined and "engagement" in joined and "required platform" in joined

    good = score_application(creator("good"), BRIEF, pitch_similarity=0.5, proposed_rate=25_000)
    assert good["disqualifiers"] == [] and good["match_score"] > r["match_score"]
    assert good["components"]["structured"]["value"]["rate_within_budget"] == 1.0
    assert set(good["components"]) == {"semantic", "structured", "reliability"}
    assert good["model_version"] == "v1-formula"


def test_application_availability_is_not_a_hard_requirement():
    r = score_application(creator("busy", available=False), BRIEF)
    assert r["disqualifiers"] == []


def test_min_engagement_as_percent_is_normalised():
    b = BriefCriteria.from_row({"id": "b", "min_engagement": 3.0, "platforms": ["INSTAGRAM"]})
    assert b.min_engagement == 0.03
