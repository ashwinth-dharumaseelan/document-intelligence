"""Refresh the Vector Search index after the pipeline has added new document chunks."""
import sys

from databricks.sdk import WorkspaceClient

index_name = sys.argv[1] if len(sys.argv) > 1 else "document_intelligence.silver.document_chunks_index"
WorkspaceClient().vector_search_indexes.sync_index(index_name=index_name)
print(f"Sync started for {index_name}")
