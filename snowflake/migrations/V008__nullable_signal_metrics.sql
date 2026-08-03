USE ROLE CONSERA_ADMIN_ROLE;
USE WAREHOUSE CONSERA_PIPELINE_WH;
USE DATABASE CONSERA;

-- Re-register the landing procedure from the newly uploaded immutable runtime bundle. Optional
-- Hacker News score and descendant counts are now serialized explicitly before numeric parsing.
CREATE OR REPLACE PROCEDURE APP.PROCESS_LANDING_QUEUE()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pydantic')
IMPORTS = ('@APP.CODE_STAGE/consera_runtime.zip')
HANDLER = 'ingestion.process_landing_queue'
EXECUTE AS OWNER;
