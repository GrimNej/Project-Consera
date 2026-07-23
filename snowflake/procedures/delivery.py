"""Snowflake verified-email delivery with ambiguity-safe state transitions."""

from __future__ import annotations

from typing import Any

from consera_core.runtime import row_value
from snowflake.snowpark import Row, Session

MAX_EMAILS_PER_RUN = 5


def _render(row: Row) -> tuple[str, str]:
    impact_type = str(row_value(row, "IMPACT_TYPE")).replace("_", " ").title()
    project = str(row_value(row, "DISPLAY_NAME"))
    headline = str(row_value(row, "HEADLINE"))
    subject = f"[Consera] {impact_type}: {headline} | {project}"[:256]
    body = "\n\n".join(
        (
            f"Project\n{project}",
            (
                f"Verdict\n{impact_type}\n"
                f"Confidence: {float(row_value(row, 'CONFIDENCE_SCORE')):.0%}\n"
                f"Materiality: {float(row_value(row, 'ALERT_WORTHINESS_SCORE')):.0%}"
            ),
            f"What happened\n{row_value(row, 'WHAT_HAPPENED')}",
            f"Why this matters\n{row_value(row, 'WHY_IT_MATTERS')}",
            f"What to do next\n{row_value(row, 'RECOMMENDATIONS')}",
            f"Protective factors\n{row_value(row, 'PROTECTIVE_FACTORS')}",
            f"Uncertainty\n{row_value(row, 'UNCERTAINTY')}",
            ("Evidence\nOpen the Consera consequence dossier for exact excerpts and source links."),
            (
                "Decision basis\n"
                f"Alert worthiness: {float(row_value(row, 'ALERT_WORTHINESS_SCORE')):.0%}. "
                "Consera alerts only after deterministic evidence, confidence, "
                "materiality, deduplication, cooldown, and daily-cap checks pass."
            ),
            f"Generated\n{row_value(row, 'PUBLISHED_AT')}",
        )
    )
    return subject, body


def _queued_alerts(session: Session) -> list[Row]:
    return session.sql(
        """
        SELECT
            alert.ALERT_ID,
            alert.RECIPIENT,
            project.DISPLAY_NAME,
            verdict.IMPACT_TYPE,
            verdict.HEADLINE,
            verdict.CONFIDENCE_SCORE,
            verdict.ALERT_WORTHINESS_SCORE,
            verdict.WHAT_HAPPENED,
            verdict.WHY_IT_MATTERS,
            verdict.UNCERTAINTY,
            verdict.PUBLISHED_AT,
            COALESCE(
                (
                    SELECT LISTAGG(TITLE || ': ' || RATIONALE, '\n')
                    FROM CONSERA.INTELLIGENCE.RECOMMENDATIONS
                    WHERE VERDICT_ID = verdict.VERDICT_ID
                ),
                'Continue monitoring.'
            ) AS RECOMMENDATIONS,
            COALESCE(
                (
                    SELECT LISTAGG(FACTOR, '\n')
                    FROM CONSERA.INTELLIGENCE.PROTECTIVE_FACTORS
                    WHERE VERDICT_ID = verdict.VERDICT_ID
                ),
                'No material protective factor was established.'
            ) AS PROTECTIVE_FACTORS
        FROM CONSERA.ALERTING.ALERT_DECISIONS AS alert
        INNER JOIN CONSERA.CORE.PROJECTS AS project
            ON alert.PROJECT_ID = project.PROJECT_ID
        INNER JOIN CONSERA.INTELLIGENCE.VERDICTS AS verdict
            ON alert.VERDICT_ID = verdict.VERDICT_ID
        WHERE alert.STATE = 'QUEUED'
          AND alert.RECIPIENT IS NOT NULL
        ORDER BY alert.CREATED_AT
        LIMIT ?
        """,
        params=[MAX_EMAILS_PER_RUN],
    ).collect()


def deliver_alert_queue(session: Session) -> dict[str, Any]:
    """Consume the alert stream and deliver bounded verified-user emails."""
    session.sql(
        """
        CREATE OR REPLACE TEMPORARY TABLE CONSERA_ALERT_STREAM_SLICE AS
        SELECT ALERT_ID
        FROM CONSERA.ALERTING.ALERT_DECISION_STREAM
        WHERE METADATA$ACTION = 'INSERT'
        """
    ).collect()
    sent = 0
    unknown = 0
    for row in _queued_alerts(session):
        alert_id = str(row_value(row, "ALERT_ID"))
        recipient = str(row_value(row, "RECIPIENT"))
        claim = session.sql(
            """
            UPDATE CONSERA.ALERTING.ALERT_DECISIONS
            SET STATE = 'SENDING'
            WHERE ALERT_ID = ?
              AND STATE = 'QUEUED'
            """,
            params=[alert_id],
        ).collect()
        if not claim or int(row_value(claim[0], "number of rows updated")) != 1:
            continue
        session.sql(
            """
            UPDATE CONSERA.ALERTING.NOTIFICATION_DELIVERIES
            SET STATE = 'SENDING',
                ATTEMPT_COUNT = ATTEMPT_COUNT + 1,
                UPDATED_AT = CURRENT_TIMESTAMP()
            WHERE ALERT_ID = ?
              AND STATE = 'QUEUED'
            """,
            params=[alert_id],
        ).collect()
        subject, body = _render(row)
        try:
            session.sql(
                """
                CALL SYSTEM$SEND_EMAIL(
                    'CONSERA_EMAIL_INT',
                    ?,
                    ?,
                    ?,
                    'text/plain'
                )
                """,
                params=[recipient, subject, body],
            ).collect()
        except Exception:
            session.sql(
                """
                UPDATE CONSERA.ALERTING.ALERT_DECISIONS
                SET STATE = 'DELIVERY_UNKNOWN'
                WHERE ALERT_ID = ?
                  AND STATE = 'SENDING'
                """,
                params=[alert_id],
            ).collect()
            session.sql(
                """
                UPDATE CONSERA.ALERTING.NOTIFICATION_DELIVERIES
                SET STATE = 'DELIVERY_UNKNOWN',
                    LAST_ERROR_CODE = 'EMAIL_OUTCOME_AMBIGUOUS',
                    UPDATED_AT = CURRENT_TIMESTAMP()
                WHERE ALERT_ID = ?
                  AND STATE = 'SENDING'
                """,
                params=[alert_id],
            ).collect()
            unknown += 1
            continue
        session.sql(
            """
            UPDATE CONSERA.ALERTING.ALERT_DECISIONS
            SET STATE = 'SENT',
                SENT_AT = CURRENT_TIMESTAMP()
            WHERE ALERT_ID = ?
              AND STATE = 'SENDING'
            """,
            params=[alert_id],
        ).collect()
        session.sql(
            """
            UPDATE CONSERA.ALERTING.NOTIFICATION_DELIVERIES
            SET STATE = 'SENT',
                UPDATED_AT = CURRENT_TIMESTAMP()
            WHERE ALERT_ID = ?
              AND STATE = 'SENDING'
            """,
            params=[alert_id],
        ).collect()
        sent += 1
    return {"deliveryUnknown": unknown, "sent": sent}
