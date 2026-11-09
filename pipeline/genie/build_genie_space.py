"""Build the Genie space definition for the Records / document intelligence data.

    python genie/build_genie_space.py            -> writes genie/genie_space_request.json
    databricks genie create-space --json @genie/genie_space_request.json --profile DEFAULT
    (or update-space <space_id> --json ... to change an existing one)
"""
import hashlib
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
G = "document_intelligence.gold"
WAREHOUSE_ID = "<warehouse-id>"


def sid(text):
    """Stable 32-hex id so re-running the builder produces the same ids."""
    return hashlib.md5(text.encode()).hexdigest()


TABLES = {
    "document_catalog": "Start here. One row per file: type, summary, core fields, processing_status, failed_checks.",
    "invoices": "Validated supplier invoices; issuer_name = vendor, document_number = invoice number, document_date = invoice date.",
    "invoice_line_items": "One row per invoice line.",
    "vendor_spend_monthly": "Invoice spend aggregated by vendor and month.",
    "receipts": "Till receipts.",
    "contracts": "Contracts: document_date = effective date, end_date, notice_period_days, auto_renewal, total_amount = contract value.",
    "legal_notices": "Legal notices / demand letters: total_amount = amount claimed.",
    "court_judgments": "Court judgments: document_number = case number, total_amount = amount awarded.",
    "powers_of_attorney": "Powers of attorney: grantor, attorney, valid_from, valid_to, revocable.",
    "trade_licences": "Trade licences: document_number = licence number, expiry_date, activities, partners_and_managers.",
    "id_documents": "ID documents: full_name, date_of_birth, date_of_expiry.",
    "letters": "Letters / correspondence: subject, deadline_date, signed_by.",
    "business_cards": "Business cards: contact_name, job_title, company_name, phones, emails.",
    "asset_undertakings": "HR asset undertaking forms: employee_name, asset_category, asset_make, asset_model, serial_number, document_date = date received, approver_name.",
    "key_dates": "Every date to act on: expiries, contract renewal-notice deadlines, court hearings, notice and letter deadlines, with days_left, urgency and responsible team.",
    "data_quality_summary": "Pass/fail counts for every pipeline stage and validation rule.",
    "extraction_accuracy_summary": "Per-document accuracy of AI extraction against the answer key.",
}

INSTRUCTIONS = [
    "This space covers the Records domain of the Legal / Operations document digitisation programme. Documents are "
    "scanned or digital files (PDF, images, Office) that were OCR'd, classified and had fields extracted by AI.",
    "For questions about 'documents' in general (counts, types, status, what exists) use document_catalog. "
    "For type-specific questions use the table for that type (invoices, contracts, trade_licences, ...).",
    "Every type table shares core columns: document_number, document_date, issuer_name, recipient_name, parties, "
    "currency, total_amount, language, summary, file_name. issuer_name means vendor for invoices, merchant for receipts, "
    "court for judgments, issuing authority for licences and IDs, sender for letters and notices.",
    "'Digitised' or 'processed' means processing_status IN ('PASSED', 'NEEDS_REVIEW'). 'Needs review' means "
    "processing_status = 'NEEDS_REVIEW' (or validation_status = 'NEEDS_REVIEW' in type tables); failed_checks says why. "
    "Files with processing_status EXCLUDED are answer keys / readme files, not documents: always exclude them from counts.",
    "For anything expiring, due, overdue or upcoming (expiries, renewal-notice deadlines, hearings, deadlines) use key_dates: "
    "it already has days_left (negative = overdue), urgency (Overdue, Within 30 days, Within 90 days, Within 12 months, Later) and team.",
    "For company assets issued to employees (laptops, phones, SIM cards, vehicles, keys) use asset_undertakings.",
    "Amounts: always show currency next to amounts and never sum across different currencies.",
    "Record accuracy = extraction_accuracy_summary.accuracy_pct (exact) or accuracy_incl_partial_pct (incl. partial matches).",
]

SAMPLE_QUESTIONS = [
    "How many documents have been digitised, by document type?",
    "Which documents need review and why?",
    "What is our total invoice spend by vendor?",
    "What is overdue or due in the next 90 days?",
    "Which assets are issued to which employees?",
    "What is the extraction accuracy per document type?",
    "Which contracts auto-renew and what notice period do they need?",
]

EXAMPLES = [
    ("How many documents have been digitised by type?",
     f"SELECT document_type, count(*) AS documents FROM {G}.document_catalog "
     f"WHERE processing_status IN ('PASSED', 'NEEDS_REVIEW') GROUP BY document_type ORDER BY documents DESC"),
    ("Which documents need review?",
     f"SELECT file_name, document_type, issuer_name, document_date, failed_checks FROM {G}.document_catalog "
     f"WHERE processing_status = 'NEEDS_REVIEW' ORDER BY document_date DESC"),
    ("Total invoice spend by vendor",
     f"SELECT vendor_name, currency, sum(invoice_count) AS invoices, round(sum(total_amount), 2) AS total_spend "
     f"FROM {G}.vendor_spend_monthly GROUP BY vendor_name, currency ORDER BY total_spend DESC"),
    ("What is overdue or due in the next 90 days?",
     f"SELECT urgency, key_date, days_left, date_type, subject, team, file_name FROM {G}.key_dates "
     f"WHERE urgency IN ('Overdue', 'Within 30 days', 'Within 90 days') ORDER BY key_date"),
    ("Which assets are issued to which employees?",
     f"SELECT employee_name, asset_category, asset_make, asset_model, serial_number, document_date AS received, "
     f"approver_name, validation_status FROM {G}.asset_undertakings ORDER BY employee_name"),
    ("What is the extraction accuracy per document type?",
     f"SELECT document_type, count(*) AS documents, round(avg(accuracy_pct), 1) AS exact_accuracy_pct, "
     f"round(avg(accuracy_incl_partial_pct), 1) AS accuracy_incl_partial_pct FROM {G}.extraction_accuracy_summary "
     f"GROUP BY document_type ORDER BY document_type"),
]

COLUMN_CONFIGS = {
    "document_catalog": [
        {"column_name": "document_type", "enable_entity_matching": True, "enable_format_assistance": True,
         "synonyms": ["type", "kind of document", "category"]},
        {"column_name": "processing_status", "enable_entity_matching": True, "enable_format_assistance": True,
         "synonyms": ["status", "review status"]},
        {"column_name": "issuer_name", "enable_entity_matching": True, "synonyms": ["vendor", "sender", "issuer", "supplier"]},
        {"column_name": "fields", "exclude": True},
        {"column_name": "content_sha256", "exclude": True},
    ],
    "invoices": [
        {"column_name": "issuer_name", "enable_entity_matching": True, "synonyms": ["vendor", "supplier"]},
        {"column_name": "validation_status", "enable_entity_matching": True},
    ],
    "vendor_spend_monthly": [
        {"column_name": "vendor_name", "enable_entity_matching": True, "synonyms": ["supplier", "vendor"]},
    ],
}


def main():
    tables = []
    for name in sorted(TABLES):
        t = {"identifier": f"{G}.{name}"}
        if name in COLUMN_CONFIGS:
            t["column_configs"] = sorted(COLUMN_CONFIGS[name], key=lambda c: c["column_name"])
        tables.append(t)
    space = {
        "version": 2,
        "config": {"sample_questions": sorted(
            [{"id": sid("q:" + q), "question": [q]} for q in SAMPLE_QUESTIONS], key=lambda x: x["id"])},
        "data_sources": {"tables": sorted(tables, key=lambda t: t["identifier"])},
        "instructions": {
            "text_instructions": [{"id": sid("instructions"), "content": INSTRUCTIONS + [
                "Tables: " + " ".join(f"{n}: {d}" for n, d in sorted(TABLES.items()))]}],
            "example_question_sqls": sorted(
                [{"id": sid("ex:" + q), "question": [q], "sql": [s]} for q, s in EXAMPLES], key=lambda x: x["id"]),
        },
    }
    request = {
        "warehouse_id": WAREHOUSE_ID,
        "title": "Records Document Intelligence",
        "description": "Ask questions about digitised legal and operations documents: invoices, contracts, licences, "
                       "IDs, notices, judgments, powers of attorney, letters. Built on document_intelligence.gold.",
        "serialized_space": json.dumps(space),
    }
    out = HERE / "genie_space_request.json"
    out.write_text(json.dumps(request, indent=2), encoding="utf-8")
    print(f"wrote {out.name}: {len(tables)} tables, {len(SAMPLE_QUESTIONS)} sample questions, {len(EXAMPLES)} example SQLs")
    for q, s in EXAMPLES:
        print("--", q)


if __name__ == "__main__":
    main()
