"""Load config/extraction_schemas.json into the Unity Catalog schema registry.

    python scripts/load_schema_registry.py [--profile DEFAULT] [--catalog document_intelligence]

Creates (if missing) <catalog>.config.extraction_schemas and <catalog>.config.core_fields and
MERGEs the JSON into them. A type's schema_version is bumped whenever its fields, instructions,
description or rules change. Types removed from the JSON are marked active = false (history kept).
Run the pipeline afterwards: new types get their own extraction flow and gold table automatically.
"""
import argparse
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent


def lit(s):
    """SQL string literal."""
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def run(sql, profile):
    out = subprocess.run(
        ["databricks", "experimental", "aitools", "tools", "query", sql, "--profile", profile],
        capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        raise SystemExit(f"FAILED:\n{sql[:500]}\n{out.stderr or out.stdout}")
    return out.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="DEFAULT")
    ap.add_argument("--catalog", default="document_intelligence")
    args = ap.parse_args()
    cfg = json.loads((ROOT / "config" / "extraction_schemas.json").read_text(encoding="utf-8"))
    c = args.catalog

    run(f"CREATE SCHEMA IF NOT EXISTS {c}.config COMMENT 'Pipeline configuration: document type registry'", args.profile)
    run(f"""CREATE TABLE IF NOT EXISTS {c}.config.extraction_schemas (
          document_type STRING NOT NULL COMMENT 'Classification label',
          description STRING COMMENT 'Label description given to ai_classify',
          gold_table STRING COMMENT 'Gold table generated for this type',
          instructions STRING COMMENT 'Extra instructions given to ai_extract',
          extraction_schema STRING COMMENT 'JSON field schema (CORE fields are added automatically)',
          validation_rules ARRAY<STRUCT<name: STRING, expression: STRING>> COMMENT 'SQL boolean checks over the gold table',
          schema_version INT,
          active BOOLEAN,
          updated_at TIMESTAMP)
        COMMENT 'Document type registry driving classification, extraction and validation'""", args.profile)
    for col, typ, comment in [("truth_type", "STRING", "Type name used in the answer key (truth.json)"),
                              ("ground_truth_map", "MAP<STRING, STRING>", "Answer-key field -> gold column")]:
        try:
            run(f"ALTER TABLE {c}.config.extraction_schemas ADD COLUMNS ({col} {typ} COMMENT {lit(comment)})", args.profile)
        except SystemExit as e:
            if "already exists" not in str(e).lower() and "FIELD_ALREADY_EXISTS" not in str(e):
                raise
    run(f"""CREATE TABLE IF NOT EXISTS {c}.config.ground_truth_supplement (
          file_name STRING, truth_field STRING, expected_json STRING)
        COMMENT 'Extra correct answers not present in truth.json (e.g. from HOW-TO-TEST.md)'""", args.profile)
    run(f"""CREATE TABLE IF NOT EXISTS {c}.config.core_fields (
          extraction_schema STRING, updated_at TIMESTAMP)
        COMMENT 'Fields extracted from every document regardless of type'""", args.profile)

    run(f"""MERGE INTO {c}.config.core_fields t
        USING (SELECT {lit(json.dumps(cfg['core_fields']))} AS extraction_schema) s ON true
        WHEN MATCHED THEN UPDATE SET t.extraction_schema = s.extraction_schema, t.updated_at = current_timestamp()
        WHEN NOT MATCHED THEN INSERT (extraction_schema, updated_at) VALUES (s.extraction_schema, current_timestamp())""",
        args.profile)

    supplement = [(f, k, json.dumps(v)) for f, fields in cfg.get("ground_truth_supplement", {}).items()
                  if not f.startswith("_") for k, v in fields.items()]
    run(f"DELETE FROM {c}.config.ground_truth_supplement", args.profile)
    if supplement:
        run(f"INSERT INTO {c}.config.ground_truth_supplement VALUES " +
            ", ".join(f"({lit(f)}, {lit(k)}, {lit(v)})" for f, k, v in supplement), args.profile)

    rows = []
    for t in cfg["document_types"]:
        rules = ", ".join(f"named_struct('name', {lit(r['name'])}, 'expression', {lit(r['expression'])})"
                          for r in t["validation_rules"])
        rules_sql = f"array({rules})" if rules else "CAST(array() AS ARRAY<STRUCT<name: STRING, expression: STRING>>)"
        gt = t.get("ground_truth", {})
        gt_map = gt.get("field_map", {})
        map_sql = (f"map({', '.join(f'{lit(k)}, {lit(v)}' for k, v in gt_map.items())})" if gt_map
                   else "CAST(map() AS MAP<STRING, STRING>)")
        rows.append(f"SELECT {lit(t['document_type'])} AS document_type, {lit(t['description'])} AS description, "
                    f"{lit(t['gold_table'])} AS gold_table, {lit(t.get('instructions', ''))} AS instructions, "
                    f"{lit(json.dumps(t['fields']))} AS extraction_schema, {rules_sql} AS validation_rules, "
                    f"{lit(gt.get('truth_type', ''))} AS truth_type, {map_sql} AS ground_truth_map")
    src = " UNION ALL ".join(rows)
    run(f"""MERGE INTO {c}.config.extraction_schemas t
        USING ({src}) s ON t.document_type = s.document_type
        WHEN MATCHED AND (t.extraction_schema <> s.extraction_schema OR t.instructions <> s.instructions
                          OR t.description <> s.description OR to_json(t.validation_rules) <> to_json(s.validation_rules)
                          OR t.gold_table <> s.gold_table OR NOT t.active)
          THEN UPDATE SET t.description = s.description, t.gold_table = s.gold_table, t.instructions = s.instructions,
                          t.extraction_schema = s.extraction_schema, t.validation_rules = s.validation_rules,
                          t.schema_version = t.schema_version + 1, t.active = true, t.updated_at = current_timestamp(),
                          t.truth_type = s.truth_type, t.ground_truth_map = s.ground_truth_map
        WHEN MATCHED AND (t.truth_type IS DISTINCT FROM s.truth_type
                          OR to_json(t.ground_truth_map) IS DISTINCT FROM to_json(s.ground_truth_map))
          THEN UPDATE SET t.truth_type = s.truth_type, t.ground_truth_map = s.ground_truth_map
        WHEN NOT MATCHED THEN INSERT (document_type, description, gold_table, instructions, extraction_schema,
                                      validation_rules, schema_version, active, updated_at, truth_type, ground_truth_map)
          VALUES (s.document_type, s.description, s.gold_table, s.instructions, s.extraction_schema,
                  s.validation_rules, 1, true, current_timestamp(), s.truth_type, s.ground_truth_map)
        WHEN NOT MATCHED BY SOURCE AND t.active THEN UPDATE SET t.active = false, t.updated_at = current_timestamp()""",
        args.profile)
    print(run(f"SELECT document_type, gold_table, schema_version, active, size(validation_rules) AS rules "
              f"FROM {c}.config.extraction_schemas ORDER BY document_type", args.profile))


if __name__ == "__main__":
    main()
