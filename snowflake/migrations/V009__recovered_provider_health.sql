USE ROLE CONSERA_ADMIN_ROLE;
USE WAREHOUSE CONSERA_PIPELINE_WH;
USE DATABASE CONSERA;

-- Health represents an active outage, not immutable evidence of a provider response that a later
-- job already proved was recovered. Deterministic stale-input rejection is not a provider failure.
CREATE OR REPLACE SECURE VIEW APP_API.DASHBOARD_V AS
WITH project_data AS (
    SELECT COALESCE(ARRAY_AGG(PROJECT), ARRAY_CONSTRUCT()) AS PROJECTS
    FROM APP_API.PROJECT_V
),

verdict_data AS (
    SELECT COALESCE(ARRAY_AGG(VERDICT), ARRAY_CONSTRUCT()) AS VERDICTS
    FROM (
        SELECT VERDICT
        FROM APP_API.VERDICT_V
        ORDER BY PUBLISHED_AT DESC
        LIMIT 5
    )
),

activity_data AS (
    SELECT COALESCE(
        ARRAY_AGG(
            OBJECT_CONSTRUCT(
                'detail', DETAIL,
                'id', ACTIVITY_ID,
                'occurredAt', TO_VARCHAR(
                    OCCURRED_AT,
                    'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
                ),
                'state', STATE,
                'title', TITLE
            )
        ) WITHIN GROUP (ORDER BY OCCURRED_AT DESC),
        ARRAY_CONSTRUCT()
    ) AS ACTIVITIES
    FROM (
        SELECT
            ACTIVITY_ID,
            DETAIL,
            OCCURRED_AT,
            STATE,
            TITLE
        FROM OPS.ACTIVITY_LOG
        ORDER BY OCCURRED_AT DESC
        LIMIT 20
    )
),

metric_data AS (
    SELECT
        (SELECT COUNT(*) FROM CORE.SIGNALS) AS SIGNALS_REVIEWED,
        (
            SELECT COUNT(*)
            FROM CORE.SIGNALS
            WHERE SIGNAL_STATE = 'ANALYZED'
        ) AS ANALYZED_DEEPLY,
        (
            SELECT COUNT(*)
            FROM ALERTING.ALERT_DECISIONS AS alert
            INNER JOIN CORE.PROJECTS AS project
                ON alert.PROJECT_ID = project.PROJECT_ID
            WHERE alert.STATE = 'SUPPRESSED'
                AND project.ARCHIVED_AT IS NULL
        ) AS SUPPRESSED,
        (
            SELECT COUNT(*)
            FROM ALERTING.ALERT_DECISIONS AS alert
            INNER JOIN CORE.PROJECTS AS project
                ON alert.PROJECT_ID = project.PROJECT_ID
            WHERE alert.STATE IN ('SENT', 'ACKNOWLEDGED')
                AND project.ARCHIVED_AT IS NULL
        ) AS ALERTS_SENT,
        (SELECT MAX(FETCH_COMPLETED_AT) FROM LANDING.INGEST_BATCHES) AS LATEST_INGESTION_AT,
        COALESCE(
            (
                SELECT SUM(ESTIMATED_CREDITS)
                FROM OPS.AI_USAGE_LEDGER
                WHERE USAGE_DATE = CURRENT_DATE()
                    AND STATE IN (
                        'RESERVED',
                        'IN_FLIGHT',
                        'RECONCILED',
                        'RECONCILED_PESSIMISTIC',
                        'FAILED_TERMINAL'
                    )
            ),
            0
        ) AS CREDITS_CONSUMED,
        COALESCE(
            (
                SELECT CONFIG_VALUE::FLOAT
                FROM OPS.PIPELINE_CONFIG
                WHERE CONFIG_KEY = 'daily_ai_credit_limit'
            ),
            0.3
        ) AS DAILY_AI_LIMIT,
        (
            SELECT COUNT(*)
            FROM OPS.AUDIT_FINDINGS
            WHERE SEVERITY = 'CRITICAL'
                AND RESOLVED_AT IS NULL
        ) AS CRITICAL_FINDINGS,
        (
            SELECT COUNT(*)
            FROM OPS.BATCH_WORK_QUEUE
            WHERE STATE IN ('FAILED_RETRYABLE', 'FAILED_TERMINAL')
        )
        + (
            SELECT COUNT(*)
            FROM OPS.PROFILE_WORK_QUEUE AS profile_job
            INNER JOIN CORE.PROJECTS AS project
                ON profile_job.PROJECT_ID = project.PROJECT_ID
            WHERE profile_job.STATE IN ('FAILED_RETRYABLE', 'FAILED_TERMINAL')
                AND project.ARCHIVED_AT IS NULL
        ) AS PIPELINE_INPUT_FAILURES,
        (
            SELECT COUNT(*)
            FROM OPS.EVALUATION_JOBS AS evaluation_job
            INNER JOIN CORE.PROJECTS AS project
                ON evaluation_job.PROJECT_ID = project.PROJECT_ID
            WHERE evaluation_job.STATE = 'FAILED_TERMINAL'
                AND evaluation_job.LAST_ERROR_CODE <> 'JOB_INPUT_STALE'
                AND evaluation_job.UPDATED_AT >= DATEADD('day', -7, CURRENT_TIMESTAMP())
                AND project.ARCHIVED_AT IS NULL
                AND NOT EXISTS (
                    SELECT 1
                    FROM OPS.EVALUATION_JOBS AS recovered_job
                    WHERE recovered_job.PROJECT_ID = evaluation_job.PROJECT_ID
                        AND recovered_job.STATE = 'SUCCEEDED'
                        AND recovered_job.UPDATED_AT > evaluation_job.UPDATED_AT
                )
        ) AS TERMINAL_AI_FAILURES,
        (
            SELECT COUNT(*)
            FROM ALERTING.NOTIFICATION_DELIVERIES AS delivery
            INNER JOIN ALERTING.ALERT_DECISIONS AS alert
                ON delivery.ALERT_ID = alert.ALERT_ID
            INNER JOIN CORE.PROJECTS AS project
                ON alert.PROJECT_ID = project.PROJECT_ID
            WHERE delivery.STATE IN ('FAILED_TERMINAL', 'DELIVERY_UNKNOWN')
                AND delivery.UPDATED_AT >= DATEADD('day', -7, CURRENT_TIMESTAMP())
                AND project.ARCHIVED_AT IS NULL
        ) AS DELIVERY_FAILURES
)

SELECT OBJECT_CONSTRUCT_KEEP_NULL(
    'activities', activity_data.ACTIVITIES,
    'alertsSent', metric_data.ALERTS_SENT,
    'analyzedDeeply', metric_data.ANALYZED_DEEPLY,
    'credits', OBJECT_CONSTRUCT(
        'consumed', metric_data.CREDITS_CONSUMED,
        'reserve', 0.1,
        'totalEnvelope', metric_data.DAILY_AI_LIMIT
    ),
    'health',
    CASE
        WHEN metric_data.CRITICAL_FINDINGS > 0 THEN 'BLOCKED_SECURITY'
        WHEN metric_data.CREDITS_CONSUMED >= metric_data.DAILY_AI_LIMIT
            THEN 'DEGRADED_AI_BUDGET'
        WHEN metric_data.PIPELINE_INPUT_FAILURES > 0
            THEN 'DEGRADED_INGESTION'
        WHEN metric_data.TERMINAL_AI_FAILURES > 0
            THEN 'DEGRADED_AI_PROVIDER'
        WHEN metric_data.DELIVERY_FAILURES > 0
            THEN 'DEGRADED_EMAIL'
        WHEN metric_data.LATEST_INGESTION_AT IS NULL
            OR metric_data.LATEST_INGESTION_AT < DATEADD('hour', -30, CURRENT_TIMESTAMP())
            THEN 'DEGRADED_INGESTION'
        ELSE 'HEALTHY'
    END,
    'latestIngestionAt',
    IFF(
        metric_data.LATEST_INGESTION_AT IS NULL,
        NULL,
        TO_VARCHAR(
            metric_data.LATEST_INGESTION_AT,
            'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
        )
    ),
    'projects', project_data.PROJECTS,
    'signalsReviewed', metric_data.SIGNALS_REVIEWED,
    'suppressed', metric_data.SUPPRESSED,
    'topVerdicts', verdict_data.VERDICTS
) AS DASHBOARD
FROM project_data
CROSS JOIN verdict_data
CROSS JOIN activity_data
CROSS JOIN metric_data;
