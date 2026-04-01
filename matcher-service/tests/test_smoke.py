from matcher_service.parsing import parse_jd, parse_resume
from matcher_service.scoring import score_candidate, score_empty_resume


def test_empty_resume_returns_reject():
    z = score_empty_resume()
    assert z.match_score == 0
    assert z.decision == "Reject"


def test_simple_match():
    jd = parse_jd("Senior Python engineer. Must have Django, PostgreSQL. 3+ years.", title="Senior Python")
    r = parse_resume("3 years Python developer with Django and PostgreSQL.")
    sc = score_candidate(jd, r)
    assert 0 <= sc.match_score <= 100
    assert sc.decision in ("Proceed", "Hold", "Reject")

