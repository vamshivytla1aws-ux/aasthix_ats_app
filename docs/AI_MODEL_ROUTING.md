# AI model routing

## Recommended Railway variables

```env
RESUME_MATCH_MODEL=gpt-5.6-luna
INTERVIEW_QUESTION_MODEL=gpt-5.6-luna
INTERVIEW_EVALUATION_MODEL=gpt-5.6-luna
INTERVIEW_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
INTERVIEW_TRANSCRIPTION_MODE=missing_or_short
INTERVIEW_TRANSCRIPTION_MIN_CHARS=80
FALLBACK_REVIEW_MODEL=gpt-5.6-terra
FALLBACK_REVIEW_ENABLED=true
MAX_FALLBACK_REVIEWS_PER_REQUEST=1
```

Normal matching, interview question generation, and interview evaluation use Luna with `reasoning_effort=none`. This preserves the previous non-reasoning behavior and limits latency and output-token spend.

Terra is not called normally. One fallback call is permitted when the primary response is invalid, or when a low matching score contains at least two gaps contradicted by explicit resume evidence. Set `FALLBACK_REVIEW_ENABLED=false` or `MAX_FALLBACK_REVIEWS_PER_REQUEST=0` to eliminate Terra spend.

The default transcription mode is `missing_or_short`. Typed answers and usable browser speech transcripts are evaluated directly without an OpenAI transcription call. Temporary per-answer audio is deleted after interview processing. Set the mode to `off` to disable model transcription or `always` to transcribe every recorded answer.

Legacy `MATCH_OPENAI_MODEL`, `AI_INTERVIEW_MODEL`, `AI_INTERVIEW_EVALUATION_MODEL`, and `AI_INTERVIEW_TRANSCRIPTION_MODEL` values remain fallback aliases for safe rollback, but the preferred variables take precedence.
