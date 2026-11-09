-- Give every workspace user access to the Records app's data.
-- The app runs as each signed-in user (on-behalf-of-user), so these grants decide what people can
-- search, open, ask about and upload. Run in a SQL editor as the catalog owner.
-- `account users` = everyone in the account; new joiners get access automatically.
-- To restrict later (e.g. HR documents to HR only), grant to specific groups instead and/or add a
-- row filter on document_type to the gold tables and the chunks table.

-- Browse metadata, validation results, KPIs, Genie answers (read-only)
GRANT USE CATALOG ON CATALOG document_intelligence TO `account users`;
GRANT USE SCHEMA, SELECT ON SCHEMA document_intelligence.gold TO `account users`;

-- Search console and Assistant (vector search over document passages)
GRANT USE SCHEMA ON SCHEMA document_intelligence.silver TO `account users`;
GRANT SELECT ON TABLE document_intelligence.silver.document_chunks TO `account users`;
GRANT SELECT ON TABLE document_intelligence.silver.document_chunks_index TO `account users`;

-- Open / download originals, and upload new documents for digitisation
GRANT USE SCHEMA ON SCHEMA document_intelligence.default TO `account users`;
GRANT READ VOLUME, WRITE VOLUME ON VOLUME document_intelligence.default.document_intelligence_sample TO `account users`;

-- Workspace objects (run with the CLI, not SQL):
--   databricks permissions update warehouses <warehouse-id> --json '{"access_control_list":[{"group_name":"users","permission_level":"CAN_USE"}]}'
--   databricks permissions update genie <genie-space-id> --json '{"access_control_list":[{"group_name":"users","permission_level":"CAN_RUN"}]}'
--   databricks permissions update apps records-search --json '{"access_control_list":[{"group_name":"users","permission_level":"CAN_USE"}]}'
