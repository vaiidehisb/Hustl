from datetime import datetime, timedelta, timezone

from app.modules.creator_scoring.base import CreatorScoringInput, ScoringModel
from app.modules.creator_scoring.formula_v1 import FormulaV1Model
from app.modules.creator_scoring.service import aggregate_engagement, extract_audience_interests


def _now():
    return datetime.now(timezone.utc)


def test_model_implements_interface():
    assert isinstance(FormulaV1Model(), ScoringModel)
    assert FormulaV1Model().version == "v1-formula"


def test_new_creator_uses_neutral_priors_and_marks_insufficient_data():
    r = FormulaV1Model().score(CreatorScoringInput(creator_id="c1", account_created_at=_now()))
    rel = r.signals["reliability"]["components"]
    assert all(c["status"] == "insufficient_data" for c in rel.values())
    assert r.reliability_score == 50  # all neutral priors
    assert r.signals["reliability"]["data_coverage"] == 0
    trust = r.signals["trust"]["components"]
    assert trust["avg_brand_rating"]["status"] == "insufficient_data"
    assert "value" not in trust["avg_brand_rating"]  # nothing invented
    assert trust["completed_deals"]["status"] == "ok" and trust["completed_deals"]["value"] == 0
    niche = r.signals["niche_authority"]["components"]
    assert niche["engagement_vs_benchmark"]["status"] == "insufficient_data"


def test_proven_creator_scores_higher_than_poor_one():
    strong = CreatorScoringInput(
        creator_id="s", niches=["beauty"], completed_deals=20, funded_deals=20, avg_brand_rating=4.8,
        review_count=15, account_created_at=_now() - timedelta(days=500), kyc_status="VERIFIED",
        followers=80_000, engagement_rate=0.06, audience_interests={"Beauty": 40, "Travel": 10},
        completed_collab_niches=["beauty", "skincare"], milestones_due_submitted=30, milestones_on_time=29,
        milestones_submitted=30, revisions_total=3, avg_response_hours=4, engaged_deals=22, creator_cancellations=0,
    )
    weak = CreatorScoringInput(
        creator_id="w", niches=["beauty"], completed_deals=1, funded_deals=4, avg_brand_rating=2.0, review_count=2,
        dispute_count=2, disputes_lost=1, account_created_at=_now() - timedelta(days=10), kyc_status="NONE",
        followers=80_000, engagement_rate=0.01, audience_interests={"Gaming": 50, "Beauty": 2},
        completed_collab_niches=["finance"], milestones_due_submitted=4, milestones_on_time=1,
        milestones_overdue_unsubmitted=2, milestones_submitted=4, revisions_total=6, avg_response_hours=60,
        engaged_deals=4, creator_cancellations=2,
    )
    m = FormulaV1Model()
    s, w = m.score(strong), m.score(weak)
    for field in ("trust_score", "niche_authority", "reliability_score"):
        assert 0 <= getattr(w, field) < getattr(s, field) <= 100
    assert s.reliability_score >= 85
    assert s.signals["niche_authority"]["data_coverage"] == 1.0


def test_on_time_counts_overdue_unsubmitted_milestones_as_late():
    d = CreatorScoringInput(creator_id="c", milestones_due_submitted=2, milestones_on_time=2,
                            milestones_overdue_unsubmitted=2)
    comp = FormulaV1Model().score(d).signals["reliability"]["components"]["on_time_delivery"]
    assert comp["value"] == 0.5 and comp["normalized"] == 0.0


def test_audience_interest_extraction_and_engagement_aggregation():
    assert extract_audience_interests({"interests": [{"name": "Beauty", "value": 30}, {"name": "Food", "percentage": 5}]}) == {
        "Beauty": 30.0, "Food": 5.0}
    assert extract_audience_interests({"countries": []}) is None
    followers, er, src = aggregate_engagement(
        {"engagement_rate": None},
        [{"status": "CONNECTED", "followers": 100_000, "engagement_rate": 0.02, "source": "PHYLLO"},
         {"status": "CONNECTED", "followers": 300_000, "engagement_rate": 0.04, "source": "PHYLLO"},
         {"status": "DISCONNECTED", "followers": 999_999, "engagement_rate": 0.9, "source": "PHYLLO"}],
    )
    assert followers == 400_000 and abs(er - 0.035) < 1e-9 and src == "PHYLLO"
    assert aggregate_engagement({"engagement_rate": None, "followers_total": 0}, []) == (None, None, None)
