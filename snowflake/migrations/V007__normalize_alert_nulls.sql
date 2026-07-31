USE ROLE CONSERA_ADMIN_ROLE;
USE WAREHOUSE CONSERA_PIPELINE_WH;
USE DATABASE CONSERA;

-- Normalize historical Python-style null text at the public contract boundary.
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
        'suppressionReason',
        IFF(
            alert.SUPPRESSION_REASON IS NULL
            OR LOWER(TRIM(alert.SUPPRESSION_REASON)) IN ('none', 'null'),
            NULL,
            alert.SUPPRESSION_REASON
        ),
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
