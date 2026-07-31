USE ROLE CONSERA_ADMIN_ROLE;
USE WAREHOUSE CONSERA_PIPELINE_WH;
USE DATABASE CONSERA;

-- Register the current deterministic runtime bundle before changing task topology.
CREATE OR REPLACE PROCEDURE APP.PROCESS_PROFILE_QUEUE()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pydantic')
IMPORTS = ('@APP.CODE_STAGE/consera_runtime.zip')
HANDLER = 'project_profile.process_profile_queue'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE APP.PROCESS_LANDING_QUEUE()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pydantic')
IMPORTS = ('@APP.CODE_STAGE/consera_runtime.zip')
HANDLER = 'ingestion.process_landing_queue'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE APP.PROCESS_EVALUATION_QUEUE()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pydantic')
IMPORTS = ('@APP.CODE_STAGE/consera_runtime.zip')
HANDLER = 'intelligence.process_evaluation_queue'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE APP.PROCESS_ALERT_QUEUE()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
IMPORTS = ('@APP.CODE_STAGE/consera_runtime.zip')
HANDLER = 'delivery.deliver_alert_queue'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE APP_API.ASK_CONSERA(
    PROJECT_IDS ARRAY,
    QUESTION VARCHAR,
    IDEMPOTENCY_KEY VARCHAR
)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pydantic')
IMPORTS = ('@APP.CODE_STAGE/consera_runtime.zip')
HANDLER = 'intelligence.ask_consera'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE APP.ARCHIVE_OTHER_PROJECTS(
    KEEP_PROJECT_ID VARCHAR
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    ARCHIVED_COUNT NUMBER DEFAULT 0;
BEGIN
    SELECT COUNT(*)
    INTO :ARCHIVED_COUNT
    FROM CORE.PROJECTS
    WHERE PROJECT_ID <> :KEEP_PROJECT_ID
        AND ARCHIVED_AT IS NULL;

    UPDATE CORE.PROJECTS
    SET STATE = 'ARCHIVED',
        ARCHIVED_AT = CURRENT_TIMESTAMP(),
        UPDATED_AT = CURRENT_TIMESTAMP(),
        ROW_VERSION = ROW_VERSION + 1
    WHERE PROJECT_ID <> :KEEP_PROJECT_ID
        AND ARCHIVED_AT IS NULL;

    UPDATE INTELLIGENCE.VERDICTS
    SET STALE_AT = COALESCE(STALE_AT, CURRENT_TIMESTAMP()),
        STALE_REASON = COALESCE(
            STALE_REASON,
            'The owning project was archived.'
        )
    WHERE PROJECT_ID <> :KEEP_PROJECT_ID
        AND STALE_AT IS NULL;

    INSERT INTO OPS.ACTIVITY_LOG (
        ACTIVITY_ID,
        TITLE,
        DETAIL,
        STATE,
        OCCURRED_AT,
        ENTITY_TYPE,
        ENTITY_ID
    )
    SELECT
        UUID_STRING(),
        'Workspace focus updated',
        :ARCHIVED_COUNT || ' prior project records were archived without deleting history.',
        'SUCCESS',
        CURRENT_TIMESTAMP(),
        'PROJECT',
        :KEEP_PROJECT_ID
    WHERE :ARCHIVED_COUNT > 0;

    RETURN OBJECT_CONSTRUCT(
        'archivedProjectCount', :ARCHIVED_COUNT,
        'keptProjectId', :KEEP_PROJECT_ID
    );
END;
$$;

-- Stop the existing standalone tasks before replacing their dependency graph.
ALTER TASK IF EXISTS APP.PROCESS_LANDING_TASK SUSPEND;
ALTER TASK IF EXISTS APP.PROCESS_EVALUATION_TASK SUSPEND;
ALTER TASK IF EXISTS APP.PROCESS_ALERT_TASK SUSPEND;

-- These streams retain insert-only semantics if a future operator inspects or reuses them.
-- Task-owned updates can no longer become new trigger events.
CREATE OR REPLACE STREAM OPS.EVALUATION_JOB_STREAM
    ON TABLE OPS.EVALUATION_JOBS
    APPEND_ONLY = TRUE;

CREATE OR REPLACE STREAM ALERTING.ALERT_DECISION_STREAM
    ON TABLE ALERTING.ALERT_DECISIONS
    APPEND_ONLY = TRUE;

-- One triggered root wakes the pipeline warehouse. Its children reuse the same graph run,
-- cannot overlap the next run, and never watch tables that they mutate.
-- noqa: disable=PRS
CREATE OR REPLACE TASK APP.PROCESS_LANDING_TASK
    WAREHOUSE = CONSERA_PIPELINE_WH
    USER_TASK_TIMEOUT_MS = 900000
    SUSPEND_TASK_AFTER_NUM_FAILURES = 2
    TASK_AUTO_RETRY_ATTEMPTS = 0
    OVERLAP_POLICY = NO_OVERLAP
    WHEN SYSTEM$STREAM_HAS_DATA ('CONSERA.LANDING.INGEST_BATCH_STREAM')
    AS CALL APP.PROCESS_LANDING_QUEUE();

CREATE OR REPLACE TASK APP.PROCESS_EVALUATION_TASK
    WAREHOUSE = CONSERA_PIPELINE_WH
    USER_TASK_TIMEOUT_MS = 600000
    AFTER APP.PROCESS_LANDING_TASK
    AS CALL APP.PROCESS_EVALUATION_QUEUE();

CREATE OR REPLACE TASK APP.PROCESS_ALERT_TASK
    WAREHOUSE = CONSERA_PIPELINE_WH
    USER_TASK_TIMEOUT_MS = 180000
    AFTER APP.PROCESS_EVALUATION_TASK
    AS CALL APP.PROCESS_ALERT_QUEUE();
-- noqa: enable=PRS

CREATE OR REPLACE SECURE VIEW APP_API.ALERT_V AS
SELECT
    alert.ALERT_ID,
    alert.CREATED_AT,
    OBJECT_CONSTRUCT_KEEP_NULL(
        'createdAt', TO_VARCHAR(
            alert.CREATED_AT,
            'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
        ),
        'deliveryState',
        CASE alert.STATE
            WHEN 'ACKNOWLEDGED' THEN 'SENT'
            ELSE alert.STATE
        END,
        'id', alert.ALERT_ID,
        'projectId', alert.PROJECT_ID,
        'projectName', project.DISPLAY_NAME,
        'suppressionReason', alert.SUPPRESSION_REASON,
        'verdictHeadline', verdict.HEADLINE,
        'verdictId', alert.VERDICT_ID,
        'verdictType', verdict.IMPACT_TYPE
    ) AS ALERT
FROM ALERTING.ALERT_DECISIONS AS alert
INNER JOIN CORE.PROJECTS AS project
    ON alert.PROJECT_ID = project.PROJECT_ID
INNER JOIN INTELLIGENCE.VERDICTS AS verdict
    ON alert.VERDICT_ID = verdict.VERDICT_ID
WHERE project.ARCHIVED_AT IS NULL;

-- A once-daily ingestion is healthy for 30 hours. Cost and delivery states remain explicit.
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
        SELECT ACTIVITY_ID, DETAIL, OCCURRED_AT, STATE, TITLE
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
                AND evaluation_job.UPDATED_AT >= DATEADD('day', -7, CURRENT_TIMESTAMP())
                AND project.ARCHIVED_AT IS NULL
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

-- Enable the child tasks first, then the triggered root as one graph.
SELECT SYSTEM$TASK_DEPENDENTS_ENABLE ('CONSERA.APP.PROCESS_LANDING_TASK');
ALTER TASK APP.PROCESS_PROFILE_TASK RESUME;
