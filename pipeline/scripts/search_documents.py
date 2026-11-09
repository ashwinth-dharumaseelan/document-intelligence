"""Search the document chunks index from your laptop.

    pip install databricks-sdk
    python scripts/search_documents.py "which invoices include titanium dioxide?"
    python scripts/search_documents.py "Net 14 payment terms" --type invoice --vendor "BioHue Chemicals" --hybrid

Auth comes from the DEFAULT profile in ~/.databrickscfg.
"""
import argparse
import json

from databricks.sdk import WorkspaceClient

INDEX = "document_intelligence.silver.document_chunks_index"
COLUMNS = ["chunk_id", "file_name", "document_type", "document_number", "document_date",
           "issuer_name", "total_amount", "currency", "chunk_to_retrieve"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("--type", help="document_type filter: invoice | contract | court_judgment | other")
    ap.add_argument("--vendor", help="exact issuer_name filter")
    ap.add_argument("-k", type=int, default=5, help="number of results")
    ap.add_argument("--hybrid", action="store_true", help="semantic + keyword (BM25) search")
    args = ap.parse_args()

    filters = {}
    if args.type:
        filters["document_type"] = args.type
    if args.vendor:
        filters["issuer_name"] = args.vendor

    w = WorkspaceClient(profile="DEFAULT")
    res = w.vector_search_indexes.query_index(
        index_name=INDEX,
        columns=COLUMNS,
        query_text=args.query,
        num_results=args.k,
        query_type="HYBRID" if args.hybrid else "ANN",
        filters_json=json.dumps(filters) if filters else None,
    )
    cols = [c.name for c in res.manifest.columns]
    for row in res.result.data_array or []:
        r = dict(zip(cols, row))
        print(f"\n[{r['score']:.3f}] {r['file_name']}  ({r['document_type']}, {r['issuer_name']}, "
              f"{r['document_number']}, {r['document_date']}, {r['total_amount']} {r['currency']})")
        print("   " + (r["chunk_to_retrieve"] or "")[:300].replace("\n", "\n   "))


if __name__ == "__main__":
    main()
