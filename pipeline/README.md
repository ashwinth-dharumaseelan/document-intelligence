# Document Intelligence medallion pipeline

Serverless Lakeflow Declarative Pipeline that ingests **every file** in
`/Volumes/document_intelligence/default/document_intelligence_sample/`, parses it, classifies it,
extracts fields with a **schema chosen per document type**, validates it with **per-type rules**,
and feeds a Vector Search index. Document types, fields and rules live in a registry, not in code.

```
Volume (any file)
 └─ bronze.raw_documents            Auto Loader; routes by extension: ai_parse | text | excluded | unsupported
     └─ silver.parsed_documents     ai_parse_document (PDF, images, Office) or UTF-8 decode (text) → text_clean
         └─ silver.documents_classified   ai_classify with labels from the registry + ai_summarize
             └─ silver.documents_extracted  one flow per type: ai_extract(CORE + type fields)
                 ├─ silver.document_chunks         ai_prep_search / paragraph split → vector index
                 ├─ gold.<type table> × N          typed columns + check_* per rule + validation_status
                 ├─ gold.document_validations      all rule results, all types
                 ├─ gold.document_fields           every field of every document as key/value rows
                 ├─ gold.document_catalog          one row per file: everything above + processing_status
                 ├─ gold.invoice_line_items, gold.vendor_spend_monthly
                 └─ gold.data_quality_summary      pass rate per pipeline stage and per rule
```

## Schema registry (config/extraction_schemas.json → document_intelligence.config.*)

| Piece | Used for |
|---|---|
| `core_fields` | Extracted from **every** document → typed columns everywhere (number, date, issuer, recipient, parties, currency, total, language) |
| `document_type` + `description` | Classification label and the hint ai_classify sees |
| `fields` | Type-specific fields for ai_extract; `"format": "date"` → DATE column in gold |
| `instructions` | Extra guidance for ai_extract for that type |
| `validation_rules` | SQL boolean expressions → `check_<name>` columns, expectations, `validation_status` |
| `gold_table` | Name of the generated gold table |

### Add or change a document type

1. Edit `config/extraction_schemas.json` (add an entry, or change fields / rules).
2. `python scripts/load_schema_registry.py` (bumps `schema_version` of changed types).
3. `databricks bundle run doc_intelligence_medallion -t dev --profile DEFAULT`
   - a new type gets its own extract flow and gold table automatically;
   - documents already extracted keep their old `schema_version`. To re-extract one type with the new
     schema: `databricks pipelines start-update <pipeline_id> --full-refresh-selection document_intelligence.silver.documents_extracted`
     (re-runs extraction for all types, not parsing).

### File formats (pipeline settings in resources/doc_intelligence.pipeline.yml)

* `doc.parse_extensions` – sent to ai_parse_document: pdf, png, jpg, jpeg, tif, tiff, doc, docx, ppt, pptx
* `doc.text_extensions` – read as text: txt, md, csv, json, xml, html, htm, eml, log
* `doc.exclude_files` – files that are not documents (truth.json, HOW-TO-TEST.md)
* anything else → `UNSUPPORTED_FORMAT` in `gold.document_catalog` (kept in bronze, not processed)

## Accuracy against the answer key

The answer key and test notes live in the private volume `/Volumes/document_intelligence/config/reference_files/`
(not shared with app users). `gold.extraction_accuracy` compares every field in `truth.json` (plus `ground_truth_supplement` in the
registry JSON) with the extracted value, using each type's `ground_truth.field_map` to translate names.
Statuses: MATCH, PARTIAL, MISMATCH, MISSING, NOT_EXPECTED (value given where the key says none),
CORRECT_EMPTY. `gold.extraction_accuracy_summary` has one row per document, including whether the
document type was classified correctly.

## Run

```bash
databricks bundle deploy -t dev --profile DEFAULT
databricks bundle run doc_intelligence_medallion -t dev --profile DEFAULT
databricks vector-search-indexes sync-index document_intelligence.silver.document_chunks_index --profile DEFAULT
```

Only new files are processed on each run (AI calls are paid per document).

## Search

`python scripts/search_documents.py "your question" [--type invoice] [--vendor "BioHue Chemicals"] [--hybrid]`

```sql
SELECT file_name, document_type, issuer_name, chunk_to_retrieve, search_score
FROM vector_search(index => 'document_intelligence.silver.document_chunks_index',
                   query_text => 'records management agreement notice period', num_results => 5);
```
