USE ROLE CONSERA_ADMIN_ROLE;
USE WAREHOUSE CONSERA_PIPELINE_WH;
USE DATABASE CONSERA;

-- Preserve the complete model output in the authoritative tables while keeping the public read
-- model inside the shared API contract. This prevents one unusually verbose valid verdict from
-- invalidating the entire cached workspace response.
CREATE OR REPLACE SECURE VIEW APP_API.VERDICT_EVIDENCE_AGG_V AS
SELECT
    link.VERDICT_ID,
    ARRAY_AGG(
        OBJECT_CONSTRUCT_KEEP_NULL(
            'excerpt', LEFT(evidence.EXCERPT_TEXT, 1200),
            'id', evidence.EVIDENCE_ID,
            'label', LEFT(
                COALESCE(evidence.CONTEXT_LABEL, INITCAP(evidence.KIND)),
                140
            ),
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
            'component', LEFT(contribution.COMPONENT_TYPE, 80),
            'explanation', LEFT(component.EXPLANATION, 600),
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
        LEFT(recommendation.TITLE || ': ' || recommendation.RATIONALE, 600)
    ) WITHIN GROUP (ORDER BY recommendation.ORDINAL) AS RECOMMENDATIONS
FROM INTELLIGENCE.RECOMMENDATIONS AS recommendation
GROUP BY recommendation.VERDICT_ID;

CREATE OR REPLACE SECURE VIEW APP_API.VERDICT_PROTECTION_AGG_V AS
SELECT
    factor.VERDICT_ID,
    ARRAY_AGG(LEFT(factor.FACTOR, 600))
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
        'headline', LEFT(verdict.HEADLINE, 220),
        'id', verdict.VERDICT_ID,
        'impactPeak', verdict.IMPACT_PEAK_SCORE,
        'impactType', verdict.IMPACT_TYPE,
        'opportunity', verdict.OPPORTUNITY_SCORE,
        'projectId', verdict.PROJECT_ID,
        'projectName', LEFT(project.DISPLAY_NAME, 100),
        'protectiveFactors', COALESCE(protection.PROTECTIVE_FACTORS, ARRAY_CONSTRUCT()),
        'publishedAt', TO_VARCHAR(
            verdict.PUBLISHED_AT,
            'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM'
        ),
        'recommendations', COALESCE(recommendation.RECOMMENDATIONS, ARRAY_CONSTRUCT()),
        'relevance', verdict.RELEVANCE_SCORE,
        'replacementPressure', verdict.REPLACEMENT_PRESSURE_SCORE,
        'signalId', LEFT(verdict.SIGNAL_ID, 120),
        'summary', LEFT(verdict.VERDICT_SUMMARY, 2000),
        'threat', verdict.THREAT_SCORE,
        'uncertainty', LEFT(verdict.UNCERTAINTY, 1200),
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
