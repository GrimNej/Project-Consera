USE ROLE CONSERA_ADMIN_ROLE;
USE WAREHOUSE CONSERA_PIPELINE_WH;
USE DATABASE CONSERA;

CREATE OR REPLACE SECURE VIEW APP_API.PROFILE_OBJECT_V AS
SELECT
    profile.PROJECT_ID,
    profile.PROFILE_VERSION_ID,
    profile.CREATED_AT,
    profile.STATE,
    OBJECT_CONSTRUCT_KEEP_NULL(
        'capabilities', profile.CORE_CAPABILITIES,
        'completeness', profile.COMPLETENESS_SCORE,
        'constraints', profile.CONSTRAINTS,
        'dependencies', profile.DEPENDENCIES,
        'differentiators', profile.DIFFERENTIATORS,
        'monitoredTopics', profile.MONITORED_TOPICS,
        'projectId', profile.PROJECT_ID,
        'providers', profile.PROVIDERS,
        'summary', profile.PRODUCT_SUMMARY,
        'targetUsers', profile.TARGET_USERS,
        'version', profile.PROFILE_NUMBER
    ) AS PROFILE
FROM CORE.PROJECT_PROFILE_VERSIONS AS profile;

CREATE OR REPLACE SECURE VIEW APP_API.PROJECT_V AS
SELECT
    project.PROJECT_ID,
    project.UPDATED_AT,
    OBJECT_CONSTRUCT_KEEP_NULL(
        'activeProfile', profile.PROFILE,
        'alertsEnabled', project.ALERTS_ENABLED,
        'createdAt', TO_VARCHAR(
            project.CREATED_AT,
            'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
        ),
        'id', project.PROJECT_ID,
        'name', project.DISPLAY_NAME,
        'profileState',
        CASE project.STATE
            WHEN 'DRAFT' THEN 'EXTRACTING'
            WHEN 'EXTRACTED' THEN 'REVIEW'
            WHEN 'REVIEW_REQUIRED' THEN 'REVIEW'
            WHEN 'ACTIVE' THEN 'ACTIVE'
            ELSE 'FAILED'
        END,
        'updatedAt', TO_VARCHAR(
            project.UPDATED_AT,
            'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
        ),
        'version', project.ROW_VERSION
    ) AS PROJECT
FROM CORE.PROJECTS AS project
LEFT JOIN APP_API.PROFILE_OBJECT_V AS profile
    ON project.ACTIVE_PROFILE_VERSION_ID = profile.PROFILE_VERSION_ID
WHERE project.ARCHIVED_AT IS NULL;

CREATE OR REPLACE SECURE VIEW APP_API.PROFILE_DRAFT_V AS
SELECT
    profile.PROJECT_ID,
    profile.CREATED_AT,
    OBJECT_CONSTRUCT(
        'evidence', OBJECT_CONSTRUCT_KEEP_NULL(
            'excerpt', LEFT(document.SANITIZED_CONTENT, 1200),
            'id', evidence.EVIDENCE_ID,
            'label', 'Reviewed project README',
            'publishedAt', TO_VARCHAR(
                evidence.OBSERVED_AT,
                'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
            ),
            'sourceKind', 'PROJECT',
            'sourceUrl', NULL
        ),
        'profile', profile.PROFILE,
        'projectVersion', project.ROW_VERSION
    ) AS DRAFT
FROM APP_API.PROFILE_OBJECT_V AS profile
INNER JOIN CORE.PROJECTS AS project
    ON profile.PROJECT_ID = project.PROJECT_ID
INNER JOIN CORE.PROJECT_PROFILE_VERSIONS AS profile_version
    ON profile.PROFILE_VERSION_ID = profile_version.PROFILE_VERSION_ID
INNER JOIN CORE.PROJECT_DOCUMENTS AS document
    ON profile_version.SOURCE_DOCUMENT_ID = document.DOCUMENT_ID
LEFT JOIN EVIDENCE.EVIDENCE_ITEMS AS evidence
    ON profile.PROJECT_ID = evidence.PROJECT_ID
    AND document.DOCUMENT_ID = evidence.SOURCE_ITEM_ID
    AND evidence.KIND = 'PROJECT_README'
WHERE profile.STATE = 'REVIEW_REQUIRED'
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY profile.PROJECT_ID
    ORDER BY profile.CREATED_AT DESC
) = 1;

CREATE OR REPLACE SECURE VIEW APP_API.SIGNAL_V AS
SELECT
    signal.SIGNAL_ID,
    signal.FIRST_SEEN_AT AS DISCOVERED_AT,
    OBJECT_CONSTRUCT_KEEP_NULL(
        'deepAnalysisCount',
        (
            SELECT COUNT(*)
            FROM INTELLIGENCE.VERDICTS AS verdict
            WHERE verdict.SIGNAL_ID = signal.SIGNAL_ID
        ),
        'discoveredAt', TO_VARCHAR(
            signal.FIRST_SEEN_AT,
            'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
        ),
        'discussionUrl', signal.HN_URL,
        'id', signal.SIGNAL_ID,
        'points', COALESCE(signal.CURRENT_SCORE, 0),
        'sourceUrl',
        IFF(
            REGEXP_LIKE(
                signal.CANONICAL_URL,
                '^https?://[^[:space:]]+$',
                'i'
            ),
            signal.CANONICAL_URL,
            NULL
        ),
        'state',
        CASE signal.SIGNAL_STATE
            WHEN 'INGESTED' THEN 'INGESTED'
            WHEN 'FILTERED_IRRELEVANT' THEN 'SUPPRESSED'
            WHEN 'ANALYZED' THEN 'ANALYZED'
            WHEN 'QUARANTINED' THEN 'QUARANTINED'
            ELSE 'CANDIDATE'
        END,
        'title', signal.TITLE,
        'topic', COALESCE(GET(signal.TOPIC_LABELS, 0)::VARCHAR, 'Unclassified')
    ) AS SIGNAL
FROM CORE.SIGNALS AS signal
WHERE NOT signal.IS_DELETED;

CREATE OR REPLACE SECURE VIEW APP_API.VERDICT_EVIDENCE_AGG_V AS
SELECT
    link.VERDICT_ID,
    ARRAY_AGG(
        OBJECT_CONSTRUCT_KEEP_NULL(
            'excerpt', evidence.EXCERPT_TEXT,
            'id', evidence.EVIDENCE_ID,
            'label', COALESCE(evidence.CONTEXT_LABEL, INITCAP(evidence.KIND)),
            'publishedAt', TO_VARCHAR(
                evidence.OBSERVED_AT,
                'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
            ),
            'sourceKind',
            CASE evidence.KIND
                WHEN 'ARTICLE_EXCERPT' THEN 'ARTICLE'
                WHEN 'PROJECT_README' THEN 'PROJECT'
                WHEN 'PROJECT_PROFILE' THEN 'PROJECT'
                WHEN 'USER_CORRECTION' THEN 'PROJECT'
                ELSE evidence.KIND
            END,
            'sourceUrl', evidence.SOURCE_URI
        )
    ) WITHIN GROUP (ORDER BY link.CREATED_AT, evidence.EVIDENCE_ID) AS EVIDENCE
FROM INTELLIGENCE.VERDICT_EVIDENCE_LINKS AS link
INNER JOIN EVIDENCE.EVIDENCE_ITEMS AS evidence
    ON link.EVIDENCE_ID = evidence.EVIDENCE_ID
WHERE evidence.RETRACTED_AT IS NULL
GROUP BY link.VERDICT_ID;

CREATE OR REPLACE SECURE VIEW APP_API.VERDICT_CONTRIBUTION_AGG_V AS
SELECT
    contribution.VERDICT_ID,
    ARRAY_AGG(
        OBJECT_CONSTRUCT(
            'component', contribution.COMPONENT_TYPE,
            'explanation', component.EXPLANATION,
            'rawValue', component.RAW_SCORE,
            'weight', contribution.WEIGHT,
            'weightedValue', contribution.CONTRIBUTION
        )
    ) WITHIN GROUP (
        ORDER BY contribution.SCORE_TYPE, contribution.COMPONENT_TYPE
    ) AS CONTRIBUTIONS
FROM INTELLIGENCE.SCORE_CONTRIBUTIONS AS contribution
INNER JOIN INTELLIGENCE.VERDICT_COMPONENTS AS component
    ON contribution.VERDICT_ID = component.VERDICT_ID
    AND contribution.COMPONENT_TYPE = component.COMPONENT_TYPE
WHERE contribution.SCORE_TYPE = 'relevance'
GROUP BY contribution.VERDICT_ID;

CREATE OR REPLACE SECURE VIEW APP_API.VERDICT_RECOMMENDATION_AGG_V AS
SELECT
    recommendation.VERDICT_ID,
    ARRAY_AGG(
        recommendation.TITLE || ': ' || recommendation.RATIONALE
    ) WITHIN GROUP (ORDER BY recommendation.ORDINAL) AS RECOMMENDATIONS
FROM INTELLIGENCE.RECOMMENDATIONS AS recommendation
GROUP BY recommendation.VERDICT_ID;

CREATE OR REPLACE SECURE VIEW APP_API.VERDICT_PROTECTION_AGG_V AS
SELECT
    factor.VERDICT_ID,
    ARRAY_AGG(factor.FACTOR)
        WITHIN GROUP (ORDER BY factor.ORDINAL) AS PROTECTIVE_FACTORS
FROM INTELLIGENCE.PROTECTIVE_FACTORS AS factor
GROUP BY factor.VERDICT_ID;

CREATE OR REPLACE SECURE VIEW APP_API.VERDICT_V AS
SELECT
    verdict.VERDICT_ID,
    verdict.PUBLISHED_AT,
    OBJECT_CONSTRUCT_KEEP_NULL(
        'alertWorthiness', verdict.ALERT_WORTHINESS_SCORE,
        'confidence', verdict.CONFIDENCE_SCORE,
        'contributions', COALESCE(contribution.CONTRIBUTIONS, ARRAY_CONSTRUCT()),
        'createdAt', TO_VARCHAR(
            verdict.CREATED_AT,
            'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
        ),
        'evidence', COALESCE(evidence.EVIDENCE, ARRAY_CONSTRUCT()),
        'headline', verdict.HEADLINE,
        'id', verdict.VERDICT_ID,
        'impactPeak', verdict.IMPACT_PEAK_SCORE,
        'impactType', verdict.IMPACT_TYPE,
        'opportunity', verdict.OPPORTUNITY_SCORE,
        'projectId', verdict.PROJECT_ID,
        'projectName', project.DISPLAY_NAME,
        'protectiveFactors', COALESCE(protection.PROTECTIVE_FACTORS, ARRAY_CONSTRUCT()),
        'publishedAt', TO_VARCHAR(
            verdict.PUBLISHED_AT,
            'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
        ),
        'recommendations', COALESCE(recommendation.RECOMMENDATIONS, ARRAY_CONSTRUCT()),
        'relevance', verdict.RELEVANCE_SCORE,
        'replacementPressure', verdict.REPLACEMENT_PRESSURE_SCORE,
        'signalId', verdict.SIGNAL_ID,
        'summary', verdict.VERDICT_SUMMARY,
        'threat', verdict.THREAT_SCORE,
        'uncertainty', verdict.UNCERTAINTY,
        'urgency', verdict.URGENCY_SCORE
    ) AS VERDICT
FROM INTELLIGENCE.VERDICTS AS verdict
INNER JOIN CORE.PROJECTS AS project
    ON verdict.PROJECT_ID = project.PROJECT_ID
LEFT JOIN APP_API.VERDICT_EVIDENCE_AGG_V AS evidence
    ON verdict.VERDICT_ID = evidence.VERDICT_ID
LEFT JOIN APP_API.VERDICT_CONTRIBUTION_AGG_V AS contribution
    ON verdict.VERDICT_ID = contribution.VERDICT_ID
LEFT JOIN APP_API.VERDICT_RECOMMENDATION_AGG_V AS recommendation
    ON verdict.VERDICT_ID = recommendation.VERDICT_ID
LEFT JOIN APP_API.VERDICT_PROTECTION_AGG_V AS protection
    ON verdict.VERDICT_ID = protection.VERDICT_ID
WHERE verdict.STATUS = 'PUBLISHED'
    AND verdict.STALE_AT IS NULL;

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
    ON alert.VERDICT_ID = verdict.VERDICT_ID;

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
            FROM ALERTING.ALERT_DECISIONS
            WHERE STATE = 'SUPPRESSED'
        ) AS SUPPRESSED,
        (
            SELECT COUNT(*)
            FROM ALERTING.ALERT_DECISIONS
            WHERE STATE IN ('SENT', 'ACKNOWLEDGED')
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
        (
            SELECT COUNT(*)
            FROM OPS.AUDIT_FINDINGS
            WHERE SEVERITY = 'CRITICAL'
                AND RESOLVED_AT IS NULL
        ) AS CRITICAL_FINDINGS
)

SELECT OBJECT_CONSTRUCT_KEEP_NULL(
    'activities', activity_data.ACTIVITIES,
    'alertsSent', metric_data.ALERTS_SENT,
    'analyzedDeeply', metric_data.ANALYZED_DEEPLY,
    'credits', OBJECT_CONSTRUCT(
        'consumed', metric_data.CREDITS_CONSUMED,
        'reserve', 0.1,
        'totalEnvelope', 0.3
    ),
    'health',
    CASE
        WHEN metric_data.CRITICAL_FINDINGS > 0 THEN 'BLOCKED_SECURITY'
        WHEN metric_data.LATEST_INGESTION_AT < DATEADD('hour', -2, CURRENT_TIMESTAMP())
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

CREATE OR REPLACE PROCEDURE APP_API.HEALTH()
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
BEGIN
    RETURN OBJECT_CONSTRUCT('status', 'ok');
END;
$$;

CREATE OR REPLACE PROCEDURE APP_API.CREATE_PROJECT(
    DISPLAY_NAME VARCHAR,
    README_TEXT VARCHAR,
    ALERTS_ENABLED BOOLEAN,
    IDEMPOTENCY_KEY VARCHAR
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    PROJECT_INPUT_INVALID EXCEPTION (-20001, 'PROJECT_INPUT_INVALID');
    PROJECT_SECRET_SCAN_REJECTED EXCEPTION (-20002, 'PROJECT_SECRET_SCAN_REJECTED');
    IDEMPOTENCY_KEY_REUSED EXCEPTION (-20003, 'IDEMPOTENCY_KEY_REUSED');
    PROJECT_ID VARCHAR DEFAULT UUID_STRING(
        'f03bd056-7ca7-4619-8751-67066985f804',
        'project|' || :IDEMPOTENCY_KEY
    );
    DOCUMENT_ID VARCHAR DEFAULT UUID_STRING(
        'f03bd056-7ca7-4619-8751-67066985f804',
        'document|' || :IDEMPOTENCY_KEY
    );
    REQUEST_HASH VARCHAR DEFAULT SHA2_HEX(
        :DISPLAY_NAME || '|' || :README_TEXT || '|' || :ALERTS_ENABLED::VARCHAR,
        256
    );
    NORMALIZED_NAME VARCHAR DEFAULT TRIM(:DISPLAY_NAME);
    README_HASH VARCHAR DEFAULT SHA2_HEX(:README_TEXT, 256);
    README_BYTES NUMBER DEFAULT OCTET_LENGTH(:README_TEXT);
    ACTIVITY_ID VARCHAR DEFAULT UUID_STRING();
    SLUG VARCHAR;
    RESPONSE VARIANT;
    EXISTING_HASH VARCHAR;
    ALERT_EMAIL VARCHAR;
BEGIN
    IF (
        LENGTH(TRIM(:DISPLAY_NAME)) < 2
        OR LENGTH(TRIM(:DISPLAY_NAME)) > 100
        OR OCTET_LENGTH(:README_TEXT) > 200000
        OR LENGTH(:README_TEXT) < 20
    ) THEN
        RAISE PROJECT_INPUT_INVALID;
    END IF;

    IF (
        REGEXP_LIKE(
            :README_TEXT,
            '.*-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----.*',
            'ims'
        )
        OR REGEXP_LIKE(
            :README_TEXT,
            '.*(api[_ -]?key|password|secret|token)[[:space:]]*[:=]'
                || '[[:space:]]*[''"]?[A-Za-z0-9_./+=-]{16,}.*',
            'ims'
        )
    ) THEN
        RAISE PROJECT_SECRET_SCAN_REJECTED;
    END IF;

    SELECT MAX(REQUEST_HASH)
    INTO :EXISTING_HASH
    FROM OPS.IDEMPOTENCY_KEYS
    WHERE OPERATION = 'CREATE_PROJECT'
        AND IDEMPOTENCY_KEY = :IDEMPOTENCY_KEY;

    IF (:EXISTING_HASH IS NOT NULL AND :EXISTING_HASH <> :REQUEST_HASH) THEN
        RAISE IDEMPOTENCY_KEY_REUSED;
    END IF;

    IF (:EXISTING_HASH IS NULL) THEN
        SLUG := RTRIM(
            REGEXP_REPLACE(LOWER(TRIM(:DISPLAY_NAME)), '[^a-z0-9]+', '-'),
            '-'
        ) || '-' || LEFT(REPLACE(:PROJECT_ID, '-', ''), 8);

        SELECT NULLIF(CONFIG_VALUE::VARCHAR, 'null')
        INTO :ALERT_EMAIL
        FROM OPS.PIPELINE_CONFIG
        WHERE CONFIG_KEY = 'alert_email';

        BEGIN
            BEGIN TRANSACTION;

            INSERT INTO OPS.IDEMPOTENCY_KEYS (
                OPERATION,
                IDEMPOTENCY_KEY,
                REQUEST_HASH,
                STATE,
                CREATED_AT
            )
            VALUES (
                'CREATE_PROJECT',
                :IDEMPOTENCY_KEY,
                :REQUEST_HASH,
                'IN_PROGRESS',
                CURRENT_TIMESTAMP()
            );

            INSERT INTO CORE.PROJECTS (
                PROJECT_ID,
                OWNER_USER_NAME,
                DISPLAY_NAME,
                SLUG,
                STATE,
                ALERT_EMAIL,
                ALERTS_ENABLED,
                ROW_VERSION,
                CREATED_AT,
                UPDATED_AT
            )
            VALUES (
                :PROJECT_ID,
                CURRENT_USER(),
                :NORMALIZED_NAME,
                :SLUG,
                'DRAFT',
                :ALERT_EMAIL,
                :ALERTS_ENABLED,
                1,
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP()
            );

            INSERT INTO CORE.PROJECT_DOCUMENTS (
                DOCUMENT_ID,
                PROJECT_ID,
                DOCUMENT_TYPE,
                SOURCE_NAME,
                CONTENT_SHA256,
                SANITIZED_CONTENT,
                BYTE_LENGTH,
                SECRET_SCAN_STATUS,
                INGESTED_AT,
                RETAIN_UNTIL,
                IS_ACTIVE
            )
            VALUES (
                :DOCUMENT_ID,
                :PROJECT_ID,
                'README',
                'README.md',
                :README_HASH,
                :README_TEXT,
                :README_BYTES,
                'PASSED',
                CURRENT_TIMESTAMP(),
                DATEADD('day', 30, CURRENT_TIMESTAMP()),
                TRUE
            );

            INSERT INTO OPS.ACTIVITY_LOG (
                ACTIVITY_ID,
                TITLE,
                DETAIL,
                STATE,
                OCCURRED_AT,
                ENTITY_TYPE,
                ENTITY_ID
            )
            VALUES (
                :ACTIVITY_ID,
                'Project admitted',
                'README accepted and profile extraction queued.',
                'RUNNING',
                CURRENT_TIMESTAMP(),
                'PROJECT',
                :PROJECT_ID
            );

            COMMIT;
        EXCEPTION
            WHEN OTHER THEN
                ROLLBACK;
                RAISE;
        END;
    END IF;

    SELECT PROJECT
    INTO :RESPONSE
    FROM APP_API.PROJECT_V
    WHERE PROJECT_ID = :PROJECT_ID;

    UPDATE OPS.IDEMPOTENCY_KEYS
    SET RESPONSE = :RESPONSE,
        STATE = 'COMPLETED',
        COMPLETED_AT = CURRENT_TIMESTAMP()
    WHERE OPERATION = 'CREATE_PROJECT'
        AND IDEMPOTENCY_KEY = :IDEMPOTENCY_KEY
        AND REQUEST_HASH = :REQUEST_HASH;

    RETURN RESPONSE;
END;
$$;

CREATE OR REPLACE PROCEDURE APP_API.ACTIVATE_PROFILE(
    PROJECT_ID VARCHAR,
    PROFILE VARIANT,
    EXPECTED_PROJECT_VERSION NUMBER,
    IDEMPOTENCY_KEY VARCHAR
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    PROJECT_VERSION_CONFLICT EXCEPTION (-20004, 'PROJECT_VERSION_CONFLICT');
    PROFILE_CONTRACT_INVALID EXCEPTION (-20005, 'PROFILE_CONTRACT_INVALID');
    IDEMPOTENCY_KEY_REUSED EXCEPTION (-20006, 'IDEMPOTENCY_KEY_REUSED');
    CURRENT_VERSION NUMBER;
    DRAFT_PROFILE_ID VARCHAR;
    SOURCE_DOCUMENT_ID VARCHAR;
    NEW_PROFILE_ID VARCHAR DEFAULT UUID_STRING(
        'f03bd056-7ca7-4619-8751-67066985f804',
        'profile|' || :IDEMPOTENCY_KEY
    );
    PROFILE_NUMBER NUMBER;
    COMPLETENESS NUMBER(6, 5);
    EVIDENCE_PRESENT BOOLEAN DEFAULT FALSE;
    HAS_TECHNOLOGY_CONTEXT BOOLEAN DEFAULT FALSE;
    HAS_PRIORITY_CONTEXT BOOLEAN DEFAULT FALSE;
    ALERTS_ENABLED BOOLEAN DEFAULT FALSE;
    ALERT_EMAIL VARCHAR;
    ACTIVE_PROFILE_HASH VARCHAR;
    NEW_PROFILE_HASH VARCHAR;
    REVIEWED_PROFILE VARIANT;
    REQUEST_HASH VARCHAR DEFAULT SHA2_HEX(
        :PROJECT_ID || '|'
        || TO_JSON(:PROFILE) || '|'
        || :EXPECTED_PROJECT_VERSION::VARCHAR,
        256
    );
    EXISTING_REQUEST_HASH VARCHAR;
    RESPONSE VARIANT;
    ACTIVITY_ID VARCHAR DEFAULT UUID_STRING();
BEGIN
    SELECT
        MAX(REQUEST_HASH),
        MAX(RESPONSE)
    INTO
        :EXISTING_REQUEST_HASH,
        :RESPONSE
    FROM OPS.IDEMPOTENCY_KEYS
    WHERE OPERATION = 'ACTIVATE_PROFILE'
        AND IDEMPOTENCY_KEY = :IDEMPOTENCY_KEY;

    IF (
        :EXISTING_REQUEST_HASH IS NOT NULL
        AND :EXISTING_REQUEST_HASH <> :REQUEST_HASH
    ) THEN
        RAISE IDEMPOTENCY_KEY_REUSED;
    END IF;

    IF (:RESPONSE IS NOT NULL) THEN
        RETURN RESPONSE;
    END IF;

    SELECT
        project.ROW_VERSION,
        draft.PROFILE_VERSION_ID,
        draft.SOURCE_DOCUMENT_ID,
        draft.PROFILE_NUMBER,
        (
            ARRAY_SIZE(draft.MODELS) > 0
            OR ARRAY_SIZE(draft.FRAMEWORKS) > 0
        ),
        (
            ARRAY_SIZE(draft.PRIORITIES) > 0
            OR ARRAY_SIZE(draft.RISK_SENSITIVITIES) > 0
        ),
        project.ALERTS_ENABLED,
        project.ALERT_EMAIL,
        active.PROFILE_HASH
    INTO
        :CURRENT_VERSION,
        :DRAFT_PROFILE_ID,
        :SOURCE_DOCUMENT_ID,
        :PROFILE_NUMBER,
        :HAS_TECHNOLOGY_CONTEXT,
        :HAS_PRIORITY_CONTEXT,
        :ALERTS_ENABLED,
        :ALERT_EMAIL,
        :ACTIVE_PROFILE_HASH
    FROM CORE.PROJECTS AS project
    INNER JOIN CORE.PROJECT_PROFILE_VERSIONS AS draft
        ON project.PROJECT_ID = draft.PROJECT_ID
        AND draft.STATE = 'REVIEW_REQUIRED'
    LEFT JOIN CORE.PROJECT_PROFILE_VERSIONS AS active
        ON project.ACTIVE_PROFILE_VERSION_ID = active.PROFILE_VERSION_ID
    WHERE project.PROJECT_ID = :PROJECT_ID
    QUALIFY ROW_NUMBER() OVER (ORDER BY draft.CREATED_AT DESC) = 1;

    IF (:CURRENT_VERSION <> :EXPECTED_PROJECT_VERSION) THEN
        RAISE PROJECT_VERSION_CONFLICT;
    END IF;

    IF (
        :PROFILE:projectId::VARCHAR <> :PROJECT_ID
        OR :PROFILE:summary::VARCHAR IS NULL
        OR ARRAY_SIZE(:PROFILE:capabilities) = 0
    ) THEN
        RAISE PROFILE_CONTRACT_INVALID;
    END IF;

    SELECT COUNT(*) > 0
    INTO :EVIDENCE_PRESENT
    FROM EVIDENCE.EVIDENCE_ITEMS
    WHERE PROJECT_ID = :PROJECT_ID
        AND SOURCE_ITEM_ID = :SOURCE_DOCUMENT_ID
        AND KIND = 'PROJECT_README';

    COMPLETENESS := LEAST(
        1.0,
        IFF(LENGTH(TRIM(:PROFILE:summary::VARCHAR)) > 0, 0.10, 0)
        + IFF(ARRAY_SIZE(:PROFILE:targetUsers) > 0, 0.10, 0)
        + IFF(ARRAY_SIZE(:PROFILE:capabilities) >= 2, 0.20, 0)
        + IFF(ARRAY_SIZE(:PROFILE:dependencies) > 0, 0.15, 0)
        + IFF(
            ARRAY_SIZE(:PROFILE:providers) > 0
            OR :HAS_TECHNOLOGY_CONTEXT,
            0.10,
            0
        )
        + IFF(ARRAY_SIZE(:PROFILE:differentiators) > 0, 0.10, 0)
        + IFF(ARRAY_SIZE(:PROFILE:constraints) > 0, 0.10, 0)
        + IFF(:HAS_PRIORITY_CONTEXT, 0.10, 0)
        + IFF(:EVIDENCE_PRESENT, 0.05, 0)
    );

    REVIEWED_PROFILE := OBJECT_CONSTRUCT_KEEP_NULL(
        'capabilities', :PROFILE:capabilities::ARRAY,
        'completeness', :COMPLETENESS,
        'constraints', :PROFILE:constraints::ARRAY,
        'dependencies', :PROFILE:dependencies::ARRAY,
        'differentiators', :PROFILE:differentiators::ARRAY,
        'monitoredTopics', :PROFILE:monitoredTopics::ARRAY,
        'projectId', :PROJECT_ID,
        'providers', :PROFILE:providers::ARRAY,
        'summary', :PROFILE:summary::VARCHAR,
        'targetUsers', :PROFILE:targetUsers::ARRAY,
        'version', :PROFILE_NUMBER + 1
    );
    NEW_PROFILE_HASH := SHA2_HEX(TO_JSON(:REVIEWED_PROFILE), 256);

    IF (
        :COMPLETENESS < 0.65
        OR (:ALERTS_ENABLED AND :ALERT_EMAIL IS NULL)
    ) THEN
        RAISE PROFILE_CONTRACT_INVALID;
    END IF;

    BEGIN
        BEGIN TRANSACTION;

        INSERT INTO OPS.IDEMPOTENCY_KEYS (
        OPERATION,
        IDEMPOTENCY_KEY,
        REQUEST_HASH,
        STATE,
        CREATED_AT
    )
        SELECT
        'ACTIVATE_PROFILE',
        :IDEMPOTENCY_KEY,
        :REQUEST_HASH,
        'IN_PROGRESS',
        CURRENT_TIMESTAMP()
    WHERE NOT EXISTS (
        SELECT 1
        FROM OPS.IDEMPOTENCY_KEYS
        WHERE OPERATION = 'ACTIVATE_PROFILE'
            AND IDEMPOTENCY_KEY = :IDEMPOTENCY_KEY
    );

        INSERT INTO CORE.PROJECT_PROFILE_CORRECTIONS (
        CORRECTION_ID,
        PROFILE_VERSION_ID,
        FIELD_PATH,
        BEFORE_VALUE,
        AFTER_VALUE,
        REASON,
        ACTOR_USER_NAME,
        CREATED_AT
    )
        SELECT
        UUID_STRING(
            'f03bd056-7ca7-4619-8751-67066985f804',
            'profile-correction|' || :NEW_PROFILE_ID
        ),
        :NEW_PROFILE_ID,
        '$',
        OBJECT_CONSTRUCT_KEEP_NULL(
            'capabilities', draft.CORE_CAPABILITIES,
            'constraints', draft.CONSTRAINTS,
            'dependencies', draft.DEPENDENCIES,
            'differentiators', draft.DIFFERENTIATORS,
            'monitoredTopics', draft.MONITORED_TOPICS,
            'providers', draft.PROVIDERS,
            'summary', draft.PRODUCT_SUMMARY,
            'targetUsers', draft.TARGET_USERS
        ),
        :REVIEWED_PROFILE,
        'Human-reviewed activation',
        CURRENT_USER(),
        CURRENT_TIMESTAMP()
    FROM CORE.PROJECT_PROFILE_VERSIONS AS draft
    WHERE draft.PROFILE_VERSION_ID = :DRAFT_PROFILE_ID
        AND draft.PROFILE_HASH <> :NEW_PROFILE_HASH;

        INSERT INTO CORE.PROJECT_PROFILE_VERSIONS (
        PROFILE_VERSION_ID,
        PROJECT_ID,
        SOURCE_DOCUMENT_ID,
        EXTRACTOR_VERSION,
        PROFILE_SCHEMA_VERSION,
        PROFILE_NUMBER,
        STATE,
        PRODUCT_SUMMARY,
        TARGET_USERS,
        CORE_CAPABILITIES,
        DEPENDENCIES,
        PROVIDERS,
        MODELS,
        FRAMEWORKS,
        COMPETITORS,
        DIFFERENTIATORS,
        CONSTRAINTS,
        BUSINESS_MODEL,
        PRIORITIES,
        RISK_SENSITIVITIES,
        MONITORED_TOPICS,
        UNRESOLVED_QUESTIONS,
        COMPLETENESS_SCORE,
        CONFIDENCE_SCORE,
        PROFILE_HASH,
        CREATED_AT,
        REVIEWED_AT,
        ACTIVATED_AT,
        REVIEWED_BY
    )
        SELECT
        :NEW_PROFILE_ID,
        :PROJECT_ID,
        :SOURCE_DOCUMENT_ID,
        'human-review-v1',
        1,
        :PROFILE_NUMBER + 1,
        'ACTIVE',
        :PROFILE:summary::VARCHAR,
        :PROFILE:targetUsers::ARRAY,
        :PROFILE:capabilities::ARRAY,
        :PROFILE:dependencies::ARRAY,
        :PROFILE:providers::ARRAY,
        draft.MODELS,
        draft.FRAMEWORKS,
        draft.COMPETITORS,
        :PROFILE:differentiators::ARRAY,
        :PROFILE:constraints::ARRAY,
        draft.BUSINESS_MODEL,
        draft.PRIORITIES,
        draft.RISK_SENSITIVITIES,
        :PROFILE:monitoredTopics::ARRAY,
        draft.UNRESOLVED_QUESTIONS,
        :COMPLETENESS,
        1.0,
        :NEW_PROFILE_HASH,
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP(),
        CURRENT_USER()
    FROM CORE.PROJECT_PROFILE_VERSIONS AS draft
    WHERE draft.PROFILE_VERSION_ID = :DRAFT_PROFILE_ID;

        UPDATE CORE.PROJECTS
    SET ACTIVE_PROFILE_VERSION_ID = :NEW_PROFILE_ID,
        STATE = 'ACTIVE',
        ROW_VERSION = ROW_VERSION + 1,
        UPDATED_AT = CURRENT_TIMESTAMP()
    WHERE PROJECT_ID = :PROJECT_ID
        AND ROW_VERSION = :EXPECTED_PROJECT_VERSION;

        IF (SQLROWCOUNT <> 1) THEN
            RAISE PROJECT_VERSION_CONFLICT;
        END IF;

        UPDATE INTELLIGENCE.VERDICTS
    SET STALE_AT = CURRENT_TIMESTAMP(),
        STALE_REASON = 'The active reviewed project profile changed.'
    WHERE PROJECT_ID = :PROJECT_ID
        AND STALE_AT IS NULL
        AND (
            :ACTIVE_PROFILE_HASH IS NULL
            OR :ACTIVE_PROFILE_HASH <> :NEW_PROFILE_HASH
        );

        INSERT INTO OPS.ACTIVITY_LOG (
        ACTIVITY_ID,
        TITLE,
        DETAIL,
        STATE,
        OCCURRED_AT,
        ENTITY_TYPE,
        ENTITY_ID
    )
        VALUES (
        :ACTIVITY_ID,
        'Profile activated',
        'A human-reviewed profile now controls consequence analysis.',
        'SUCCESS',
        CURRENT_TIMESTAMP(),
        'PROJECT',
        :PROJECT_ID
    );

        SELECT PROJECT
    INTO :RESPONSE
    FROM APP_API.PROJECT_V
    WHERE PROJECT_ID = :PROJECT_ID;

        UPDATE OPS.IDEMPOTENCY_KEYS
    SET RESPONSE = :RESPONSE,
        STATE = 'COMPLETED',
        COMPLETED_AT = CURRENT_TIMESTAMP()
    WHERE OPERATION = 'ACTIVATE_PROFILE'
        AND IDEMPOTENCY_KEY = :IDEMPOTENCY_KEY
        AND REQUEST_HASH = :REQUEST_HASH;

        COMMIT;
    EXCEPTION
        WHEN OTHER THEN
            ROLLBACK;
            RAISE;
    END;

    RETURN RESPONSE;
END;
$$;

CREATE OR REPLACE PROCEDURE APP_API.REQUEST_INGESTION(
    IDEMPOTENCY_KEY VARCHAR
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    RUN_ID VARCHAR DEFAULT UUID_STRING(
        'f03bd056-7ca7-4619-8751-67066985f804',
        'manual-ingestion|' || :IDEMPOTENCY_KEY
    );
    CURRENT_STATE VARCHAR;
    ACTIVITY_ID VARCHAR DEFAULT UUID_STRING();
    DISPATCH_REQUIRED BOOLEAN DEFAULT FALSE;
BEGIN
    SELECT MAX(STATE)
    INTO :CURRENT_STATE
    FROM OPS.MANUAL_INGESTION_REQUESTS
    WHERE IDEMPOTENCY_KEY = :IDEMPOTENCY_KEY;

    IF (:CURRENT_STATE IS NULL) THEN
        INSERT INTO OPS.MANUAL_INGESTION_REQUESTS (
            RUN_ID,
            IDEMPOTENCY_KEY,
            STATE,
            REQUESTED_AT
        )
        VALUES (
            :RUN_ID,
            :IDEMPOTENCY_KEY,
            'QUEUED',
            CURRENT_TIMESTAMP()
        );

        INSERT INTO OPS.ACTIVITY_LOG (
            ACTIVITY_ID,
            TITLE,
            DETAIL,
            STATE,
            OCCURRED_AT,
            ENTITY_TYPE,
            ENTITY_ID
        )
        VALUES (
            :ACTIVITY_ID,
            'Signal check requested',
            'The official Hacker News bridge will claim this request.',
            'RUNNING',
            CURRENT_TIMESTAMP(),
            'PIPELINE_RUN',
            :RUN_ID
        );
        CURRENT_STATE := 'QUEUED';
        DISPATCH_REQUIRED := TRUE;
    END IF;

    RETURN OBJECT_CONSTRUCT(
        'dispatchRequired', :DISPATCH_REQUIRED,
        'runId', :RUN_ID,
        'state',
        CASE :CURRENT_STATE
            WHEN 'SUCCEEDED' THEN 'COMPLETED'
            WHEN 'FAILED' THEN 'COMPLETED'
            ELSE :CURRENT_STATE
        END
    );
END;
$$;

GRANT USAGE ON PROCEDURE APP_API.HEALTH() TO ROLE CONSERA_APP_ROLE;
GRANT USAGE ON PROCEDURE APP_API.CREATE_PROJECT(
    VARCHAR,
    VARCHAR,
    BOOLEAN,
    VARCHAR
) TO ROLE CONSERA_APP_ROLE;
GRANT USAGE ON PROCEDURE APP_API.ACTIVATE_PROFILE(
    VARCHAR,
    VARIANT,
    NUMBER,
    VARCHAR
) TO ROLE CONSERA_APP_ROLE;
GRANT USAGE ON PROCEDURE APP_API.REQUEST_INGESTION(VARCHAR) TO ROLE CONSERA_APP_ROLE;
