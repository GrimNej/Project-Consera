"""Normalize official Hacker News batches and create bounded project-signal jobs."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from consera_core.ids import canonical_json, sha256_text, stable_uuid
from consera_core.runtime import PipelineError, row_value, variant_dict
from consera_core.sanitization import sanitize_public_text
from pydantic import BaseModel, ConfigDict, Field
from snowflake.snowpark import Row, Session

PIPELINE_VERSION = "consera-pipeline-v1"
CANDIDATE_POLICY_VERSION = "candidate-policy-v1"
MAX_BATCHES_PER_RUN = 5

_TOKEN = re.compile(r"[a-z0-9][a-z0-9.+#-]{1,63}")
_STOPWORDS = {
    "about",
    "after",
    "also",
    "another",
    "build",
    "from",
    "have",
    "into",
    "more",
    "new",
    "project",
    "show",
    "that",
    "the",
    "their",
    "this",
    "tool",
    "using",
    "with",
}


class HnSourceItem(BaseModel):
    """Strict shape already admitted by the bridge contract."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: int = Field(gt=0)
    type: str
    by: str | None = None
    time: int = Field(ge=0)
    title: str | None = None
    url: str | None = None
    text: str | None = None
    parent: int | None = None
    poll: int | None = None
    kids: list[int] = Field(default_factory=list)
    parts: list[int] = Field(default_factory=list)
    descendants: int | None = None
    score: int | None = None
    deleted: bool = False
    dead: bool = False


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in _TOKEN.findall(value.casefold())
        if token not in _STOPWORDS and len(token) >= 3
    }


def lexical_relevance(project_terms: list[str], signal_text: str) -> float:
    """Score deterministic lexical overlap before any AI call."""
    signal_normalized = " ".join(signal_text.casefold().split())
    signal_tokens = _tokens(signal_normalized)
    if not project_terms or not signal_tokens:
        return 0.0
    term_tokens: set[str] = set()
    exact_phrases = 0
    for term in project_terms:
        normalized = " ".join(term.casefold().split())
        if len(normalized) >= 3 and normalized in signal_normalized:
            exact_phrases += 1
        term_tokens.update(_tokens(normalized))
    if not term_tokens:
        return 0.0
    overlap = len(term_tokens & signal_tokens)
    denominator = max(2, min(12, len(term_tokens)))
    return min(1.0, overlap / denominator + min(0.45, exact_phrases * 0.15))


def topic_labels(title: str, url: str | None) -> list[str]:
    """Derive stable human-readable topic labels without model cost."""
    labels: list[str] = []
    if url:
        hostname = (urlsplit(url).hostname or "").removeprefix("www.").lower()
        if hostname:
            labels.append(hostname[:120])
    candidates = sorted(_tokens(title), key=lambda token: (-len(token), token))
    labels.extend(token[:120] for token in candidates[:3])
    return labels[:4] or ["technology"]


def _as_list(value: object) -> list[str]:
    decoded = json.loads(value) if isinstance(value, str) else value
    if not isinstance(decoded, list):
        return []
    return [str(item) for item in decoded if isinstance(item, str)]


def _observed_at(item: HnSourceItem) -> datetime:
    return datetime.fromtimestamp(item.time, tz=UTC)


def _insert_signal_version(
    session: Session,
    *,
    batch_id: str,
    item: HnSourceItem,
    payload_hash: str,
) -> tuple[str, str, str]:
    title = sanitize_public_text(item.title or "Untitled Hacker News item", 1000)
    story_text = sanitize_public_text(item.text, 20_000)
    normalized_text = sanitize_public_text(f"{title}\n{story_text}", 30_000)
    signal_id = stable_uuid("hn-signal", str(item.id))
    version_id = stable_uuid("hn-signal-version", str(item.id), payload_hash)
    labels = topic_labels(title, item.url)
    observed_at = _observed_at(item)
    domain = (urlsplit(item.url).hostname or "").lower() if item.url else None
    session.sql(
        """
        INSERT INTO CONSERA.CORE.SIGNAL_VERSIONS (
            SIGNAL_VERSION_ID,
            SIGNAL_ID,
            SOURCE_PAYLOAD_SHA256,
            TITLE,
            URL,
            STORY_TEXT,
            SCORE,
            COMMENT_COUNT,
            TOP_COMMENT_IDS,
            NORMALIZED_TEXT,
            NORMALIZED_TEXT_SHA256,
            OBSERVED_AT
        )
        SELECT
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            PARSE_JSON(?),
            ?,
            ?,
            ?
        WHERE NOT EXISTS (
            SELECT 1
            FROM CONSERA.CORE.SIGNAL_VERSIONS
            WHERE SIGNAL_VERSION_ID = ?
        )
        """,
        params=[
            version_id,
            signal_id,
            payload_hash,
            title,
            item.url,
            story_text,
            item.score,
            item.descendants,
            json.dumps(item.kids[:100]),
            normalized_text,
            sha256_text(normalized_text),
            observed_at,
            version_id,
        ],
    ).collect()
    session.sql(
        """
        MERGE INTO CONSERA.CORE.SIGNALS AS target
        USING (
            SELECT
                ? AS SIGNAL_ID,
                ? AS SOURCE_ITEM_ID,
                ? AS CURRENT_VERSION_ID,
                ? AS TITLE,
                ? AS CANONICAL_URL,
                ? AS AUTHOR,
                ? AS OBSERVED_AT,
                ? AS CURRENT_SCORE,
                ? AS CURRENT_COMMENT_COUNT,
                PARSE_JSON(?) AS TOPIC_LABELS,
                ? AS PRIMARY_DOMAIN,
                ? AS IS_DELETED,
                ? AS IS_DEAD
        ) AS source
            ON target.SIGNAL_ID = source.SIGNAL_ID
        WHEN MATCHED
            AND (
                source.OBSERVED_AT > target.LAST_SEEN_AT
                OR (
                    source.OBSERVED_AT = target.LAST_SEEN_AT
                    AND source.CURRENT_VERSION_ID > target.CURRENT_VERSION_ID
                )
            )
        THEN UPDATE SET
            CURRENT_VERSION_ID = source.CURRENT_VERSION_ID,
            TITLE = source.TITLE,
            CANONICAL_URL = source.CANONICAL_URL,
            AUTHOR = source.AUTHOR,
            LAST_SEEN_AT = source.OBSERVED_AT,
            CURRENT_SCORE = source.CURRENT_SCORE,
            CURRENT_COMMENT_COUNT = source.CURRENT_COMMENT_COUNT,
            SIGNAL_STATE = 'READY',
            TOPIC_LABELS = source.TOPIC_LABELS,
            PRIMARY_DOMAIN = source.PRIMARY_DOMAIN,
            IS_DELETED = source.IS_DELETED,
            IS_DEAD = source.IS_DEAD
        WHEN NOT MATCHED THEN
            INSERT (
                SIGNAL_ID,
                SOURCE,
                SOURCE_ITEM_ID,
                CURRENT_VERSION_ID,
                TITLE,
                CANONICAL_URL,
                HN_URL,
                AUTHOR,
                FIRST_SEEN_AT,
                LAST_SEEN_AT,
                CURRENT_SCORE,
                CURRENT_COMMENT_COUNT,
                SIGNAL_STATE,
                TOPIC_LABELS,
                PRIMARY_DOMAIN,
                IS_DELETED,
                IS_DEAD
            )
            VALUES (
                source.SIGNAL_ID,
                'hacker-news',
                source.SOURCE_ITEM_ID,
                source.CURRENT_VERSION_ID,
                source.TITLE,
                source.CANONICAL_URL,
                'https://news.ycombinator.com/item?id=' || source.SOURCE_ITEM_ID,
                source.AUTHOR,
                source.OBSERVED_AT,
                source.OBSERVED_AT,
                source.CURRENT_SCORE,
                source.CURRENT_COMMENT_COUNT,
                'READY',
                source.TOPIC_LABELS,
                source.PRIMARY_DOMAIN,
                source.IS_DELETED,
                source.IS_DEAD
            )
        """,
        params=[
            signal_id,
            str(item.id),
            version_id,
            title,
            item.url,
            item.by,
            observed_at,
            item.score,
            item.descendants,
            json.dumps(labels),
            domain,
            item.deleted,
            item.dead,
        ],
    ).collect()
    excerpt = sanitize_public_text(f"{title}. {story_text}", 1200)
    if excerpt:
        evidence_id = stable_uuid("evidence", signal_id, version_id, sha256_text(excerpt))
        session.sql(
            """
            INSERT INTO CONSERA.EVIDENCE.EVIDENCE_ITEMS
            SELECT
                ?,
                NULL,
                ?,
                ?,
                'HN_STORY',
                'https://news.ycombinator.com/item?id=' || ?,
                ?,
                ?,
                ?,
                'Hacker News story',
                ?,
                DATEADD('day', 90, CURRENT_TIMESTAMP()),
                NULL,
                NULL,
                CURRENT_TIMESTAMP()
            WHERE NOT EXISTS (
                SELECT 1
                FROM CONSERA.EVIDENCE.EVIDENCE_ITEMS
                WHERE EVIDENCE_ID = ?
            )
            """,
            params=[
                evidence_id,
                signal_id,
                version_id,
                str(item.id),
                str(item.id),
                excerpt,
                sha256_text(excerpt),
                observed_at,
                evidence_id,
            ],
        ).collect()
    return signal_id, version_id, normalized_text


def _insert_comment(
    session: Session,
    *,
    signal_id: str,
    item: HnSourceItem,
    payload_hash: str,
) -> None:
    text = sanitize_public_text(item.text, 12_000)
    if not text:
        return
    comment_version_id = stable_uuid("hn-comment", str(item.id), payload_hash)
    session.sql(
        """
        INSERT INTO CONSERA.CORE.HN_COMMENTS
        SELECT
            ?,
            ?,
            ?,
            ?,
            ?,
            1,
            ?,
            ?,
            NULL,
            ?,
            ?,
            ?
        WHERE NOT EXISTS (
            SELECT 1
            FROM CONSERA.CORE.HN_COMMENTS
            WHERE COMMENT_VERSION_ID = ?
        )
        """,
        params=[
            comment_version_id,
            item.id,
            signal_id,
            item.parent,
            item.by,
            text,
            sha256_text(text),
            item.deleted,
            item.dead,
            _observed_at(item),
            comment_version_id,
        ],
    ).collect()
    excerpt = text[:1200]
    evidence_id = stable_uuid("evidence", signal_id, comment_version_id, sha256_text(excerpt))
    session.sql(
        """
        INSERT INTO CONSERA.EVIDENCE.EVIDENCE_ITEMS
        SELECT
            ?,
            NULL,
            ?,
            NULL,
            'HN_COMMENT',
            'https://news.ycombinator.com/item?id=' || ?,
            ?,
            ?,
            ?,
            'Hacker News comment',
            ?,
            DATEADD('day', 90, CURRENT_TIMESTAMP()),
            NULL,
            NULL,
            CURRENT_TIMESTAMP()
        WHERE NOT EXISTS (
            SELECT 1
            FROM CONSERA.EVIDENCE.EVIDENCE_ITEMS
            WHERE EVIDENCE_ID = ?
        )
        """,
        params=[
            evidence_id,
            signal_id,
            str(item.id),
            str(item.id),
            excerpt,
            sha256_text(excerpt),
            _observed_at(item),
            evidence_id,
        ],
    ).collect()


def _project_rows(session: Session) -> list[Row]:
    return session.sql(
        """
        SELECT
            project.PROJECT_ID,
            profile.PROFILE_VERSION_ID,
            profile.PROFILE_HASH,
            profile.CORE_CAPABILITIES,
            profile.DEPENDENCIES,
            profile.PROVIDERS,
            profile.MODELS,
            profile.FRAMEWORKS,
            profile.COMPETITORS,
            profile.PRIORITIES,
            profile.MONITORED_TOPICS
        FROM CONSERA.CORE.PROJECTS AS project
        INNER JOIN CONSERA.CORE.PROJECT_PROFILE_VERSIONS AS profile
            ON project.ACTIVE_PROFILE_VERSION_ID = profile.PROFILE_VERSION_ID
        WHERE project.STATE = 'ACTIVE'
          AND profile.STATE = 'ACTIVE'
        """
    ).collect()


def _create_candidate_jobs(
    session: Session,
    *,
    signal_id: str,
    version_id: str,
    normalized_text: str,
    project_rows: list[Row],
) -> int:
    created = 0
    for project in project_rows:
        project_id = str(row_value(project, "PROJECT_ID"))
        profile_id = str(row_value(project, "PROFILE_VERSION_ID"))
        fields = (
            "CORE_CAPABILITIES",
            "DEPENDENCIES",
            "PROVIDERS",
            "MODELS",
            "FRAMEWORKS",
            "COMPETITORS",
            "PRIORITIES",
            "MONITORED_TOPICS",
        )
        terms = [term for field in fields for term in _as_list(row_value(project, field))]
        score = lexical_relevance(terms, normalized_text)
        if score < 0.18:
            continue
        input_hash = sha256_text(
            canonical_json(
                {
                    "candidate_policy": CANDIDATE_POLICY_VERSION,
                    "profile_hash": str(row_value(project, "PROFILE_HASH")),
                    "signal_version_id": version_id,
                }
            )
        )
        job_id = stable_uuid("evaluation-job", profile_id, version_id, PIPELINE_VERSION)
        result = session.sql(
            """
            INSERT INTO CONSERA.OPS.EVALUATION_JOBS (
                JOB_ID,
                PROJECT_ID,
                PROFILE_VERSION_ID,
                SIGNAL_ID,
                SIGNAL_VERSION_ID,
                PIPELINE_VERSION,
                INPUT_HASH,
                STATE,
                NEXT_ATTEMPT_AT,
                CREATED_AT,
                UPDATED_AT
            )
            SELECT
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'PENDING',
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP()
            WHERE NOT EXISTS (
                SELECT 1
                FROM CONSERA.OPS.EVALUATION_JOBS
                WHERE JOB_ID = ?
            )
            """,
            params=[
                job_id,
                project_id,
                profile_id,
                signal_id,
                version_id,
                PIPELINE_VERSION,
                input_hash,
                job_id,
            ],
        ).collect()
        if result and int(row_value(result[0], "number of rows inserted")) == 1:
            created += 1
    return created


def process_batch(session: Session, batch_id: str) -> dict[str, Any]:
    """Normalize one replay-safe admitted batch."""
    raw_rows = session.sql(
        """
        SELECT HN_ITEM_ID, ITEM_TYPE, PAYLOAD, PAYLOAD_SHA256
        FROM CONSERA.LANDING.HN_ITEMS_RAW
        WHERE BATCH_ID = ?
        ORDER BY IFF(ITEM_TYPE = 'story', 0, 1), HN_ITEM_ID
        """,
        params=[batch_id],
    ).collect()
    if not raw_rows:
        raise PipelineError("BATCH_EMPTY")
    stories: list[tuple[HnSourceItem, str]] = []
    comments: list[tuple[HnSourceItem, str]] = []
    for row in raw_rows:
        item = HnSourceItem.model_validate(variant_dict(row_value(row, "PAYLOAD")))
        value = (item, str(row_value(row, "PAYLOAD_SHA256")))
        if item.type in ("story", "job", "poll"):
            stories.append(value)
        elif item.type == "comment":
            comments.append(value)

    projects = _project_rows(session)
    story_signals: dict[int, str] = {}
    jobs = 0
    session.sql("BEGIN").collect()
    try:
        for item, payload_hash in stories:
            signal_id, version_id, normalized = _insert_signal_version(
                session,
                batch_id=batch_id,
                item=item,
                payload_hash=payload_hash,
            )
            story_signals[item.id] = signal_id
            jobs += _create_candidate_jobs(
                session,
                signal_id=signal_id,
                version_id=version_id,
                normalized_text=normalized,
                project_rows=projects,
            )
        for item, payload_hash in comments:
            parent_signal_id = next(
                (
                    signal_id
                    for story_id, signal_id in story_signals.items()
                    if item.parent == story_id
                ),
                None,
            )
            if parent_signal_id:
                _insert_comment(
                    session,
                    signal_id=parent_signal_id,
                    item=item,
                    payload_hash=payload_hash,
                )
        session.sql(
            """
            UPDATE CONSERA.OPS.BATCH_WORK_QUEUE
            SET STATE = 'SUCCEEDED',
                COMPLETED_AT = CURRENT_TIMESTAMP()
            WHERE BATCH_ID = ?
              AND STATE = 'RUNNING'
            """,
            params=[batch_id],
        ).collect()
        session.sql("COMMIT").collect()
    except Exception:
        session.sql("ROLLBACK").collect()
        raise
    return {
        "batchId": batch_id,
        "jobsCreated": jobs,
        "signalsNormalized": len(stories),
        "state": "SUCCEEDED",
    }


def process_landing_queue(session: Session) -> dict[str, Any]:
    """Consume the landing stream and process a bounded set of new batches."""
    session.sql(
        """
        CREATE OR REPLACE TEMPORARY TABLE CONSERA_BATCH_STREAM_SLICE AS
        SELECT BATCH_ID
        FROM CONSERA.LANDING.INGEST_BATCH_STREAM
        WHERE METADATA$ACTION = 'INSERT'
        QUALIFY ROW_NUMBER() OVER (
            PARTITION BY BATCH_ID
            ORDER BY INGESTED_AT DESC
        ) = 1
        """
    ).collect()
    session.sql(
        """
        MERGE INTO CONSERA.OPS.BATCH_WORK_QUEUE AS target
        USING CONSERA_BATCH_STREAM_SLICE AS source
            ON target.BATCH_ID = source.BATCH_ID
        WHEN NOT MATCHED THEN
            INSERT (BATCH_ID, STATE, ENQUEUED_AT)
            VALUES (source.BATCH_ID, 'PENDING', CURRENT_TIMESTAMP())
        """
    ).collect()
    queued = session.sql(
        """
        SELECT BATCH_ID
        FROM CONSERA.OPS.BATCH_WORK_QUEUE
        WHERE STATE IN ('PENDING', 'FAILED_RETRYABLE')
        ORDER BY ENQUEUED_AT
        LIMIT ?
        """,
        params=[MAX_BATCHES_PER_RUN],
    ).collect()
    results: list[dict[str, Any]] = []
    for row in queued:
        batch_id = str(row_value(row, "BATCH_ID"))
        session.sql(
            """
            UPDATE CONSERA.OPS.BATCH_WORK_QUEUE
            SET STATE = 'RUNNING',
                STARTED_AT = CURRENT_TIMESTAMP(),
                LAST_ERROR_CODE = NULL
            WHERE BATCH_ID = ?
              AND STATE IN ('PENDING', 'FAILED_RETRYABLE')
            """,
            params=[batch_id],
        ).collect()
        try:
            results.append(process_batch(session, batch_id))
        except PipelineError as error:
            session.sql(
                """
                UPDATE CONSERA.OPS.BATCH_WORK_QUEUE
                SET STATE = ?,
                    LAST_ERROR_CODE = ?
                WHERE BATCH_ID = ?
                """,
                params=[
                    "FAILED_RETRYABLE" if error.retryable else "FAILED_TERMINAL",
                    error.code,
                    batch_id,
                ],
            ).collect()
    return {"batches": results, "processed": len(results)}
