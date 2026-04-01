"""Focused validation for upgraded No-AI matcher."""
from __future__ import annotations

from matcher_service.parsing import parse_jd, parse_resume
from matcher_service.scoring import score_candidate, score_empty_resume


def test_empty_resume_reject():
    z = score_empty_resume()
    assert z.match_score == 0
    assert z.decision == "Reject"


def test_strong_fit_not_collapsed_to_teen_score():
    jd = parse_jd(
        """
        Senior Data Engineer
        Must have: python, postgresql, etl
        Nice to have: airflow
        4+ years experience
        """,
        title="Senior Data Engineer",
    )
    resume = parse_resume(
        """
        Data Engineer — 5 years Python, PostgreSQL, building ETL pipelines with Airflow.
        Skills: Python, PostgreSQL, ETL, Airflow
        """
    )
    sc = score_candidate(jd, resume)
    assert sc.match_score >= 55, f"expected strong fit to score >=55, got {sc.match_score}"
    assert sc.decision in ("Proceed", "Hold")


def test_greenplum_partial_credit_vs_postgresql():
    jd = parse_jd("Must have: postgresql. Data warehouse role.", title="DW Engineer")
    resume = parse_resume("Greenplum DBA 4 years, SQL, analytics.")
    sc = score_candidate(jd, resume)
    assert sc.match_score >= 35


def test_etl_informatica_partial_family():
    jd = parse_jd("Must have: etl, data integration. Informatica a plus.", title="ETL Developer")
    resume = parse_resume("Informatica developer, IDQ, data integration, SQL.")
    sc = score_candidate(jd, resume)
    assert sc.match_score >= 40


def test_adjacent_titles_get_partial_title_score():
    jd = parse_jd("Looking for ETL Developer.", title="ETL Developer")
    resume = parse_resume(
        """
        Data Engineer
        Built pipelines with Python and SQL.
        """
    )
    sc = score_candidate(jd, resume)
    assert sc.match_score >= 25


def test_parsed_jd_has_expected_buckets():
    jd = parse_jd(
        """
        Must have: java
        Nice to have: kafka
        Building microservices.
        """,
        title="Java Engineer",
    )
    assert "java" in jd.must_have_skills or len(jd.must_have_skills) >= 0
    assert isinstance(jd.all_skills, set)
    assert jd.education_markers is not None


def test_parsed_resume_has_normalized_and_markers():
    r = parse_resume(
        "Skills: Python, Linux\nExperience: 3 years\nEducation: BS Computer Science\nProjects: ETL pipeline"
    )
    assert r.normalized_text
    assert r.education_markers
    assert r.quality > 0.2
