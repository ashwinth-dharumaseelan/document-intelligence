# Records: automatic processing, email intake and Teams

## 1. Automatic processing (live)

Job **`doc_intelligence_auto_process`** watches the documents volume
`/Volumes/document_intelligence/default/document_intelligence_sample/` (including sub-folders such as `inbox/email/`).

When files arrive it waits 60 s for uploads to settle, then:

1. runs the pipeline `doc_intelligence_medallion` (only new files are read, classified, extracted and checked);
2. refreshes the search index `document_intelligence.silver.document_chunks_index`.

New documents appear in the Records app (Search, Library, Key dates, Assistant) within a few minutes
(tested: file dropped 07:25 → picked up 07:28 → searchable 07:31).

File names starting with `_` or `.` are treated as hidden and skipped. The email flow below prefixes a timestamp,
so attachments are never affected.
Any upload path works the same way: the app's **Add document** button, email intake, or a manual copy.

Defined in `doc_intelligence_pipeline/resources/auto_process.job.yml`. Monitor in Databricks → **Jobs & Pipelines**.

---

## 2. Upload by email (needs IT: ~1 hour)

**Goal:** staff forward a document to `records@<company>` and it is digitised automatically.

```
Outlook shared mailbox ──► Power Automate flow ──► Databricks volume inbox/email/ ──► automatic processing
```

### Already done on Databricks
* Service principal **`records-email-intake`** (application ID `<service-principal-app-id>`).
  Permissions: read + write files in the documents volume only. No access to any tables.

### Steps for IT

1. **Mailbox:** create a shared mailbox, e.g. `records@<company>` (Exchange admin).
2. **Secret:** a Databricks workspace admin opens *Settings → Identity and access → Service principals →
   records-email-intake → Secrets → Generate secret*. Store the client ID and secret in Azure Key Vault or as
   a secure Power Automate input. Never in the flow in plain text.
3. **Power Automate flow** (needs the premium *HTTP* connector):
   1. Trigger: **When a new email arrives in a shared mailbox (V2)**, mailbox `records@…`,
      *Include attachments = Yes*, *Only with attachments = Yes*.
   2. **HTTP** (get token):
      * `POST https://<your-workspace>.cloud.databricks.com/oidc/v1/token`
      * Authentication: *Basic*, user = client ID, password = secret
      * Header `Content-Type: application/x-www-form-urlencoded`
      * Body `grant_type=client_credentials&scope=all-apis`
   3. **Apply to each** attachment, with a **Condition**: skip inline images and files under 20 KB
      (email signatures and logos), and keep only `.pdf .png .jpg .jpeg .tif .tiff .docx .pptx .txt`.
   4. **HTTP** (upload):
      * `PUT https://<your-workspace>.cloud.databricks.com/api/2.0/fs/files/Volumes/document_intelligence/default/document_intelligence_sample/inbox/email/@{formatDateTime(utcNow(),'yyyyMMdd-HHmmss')}_@{items('Apply_to_each')?['name']}?overwrite=false`
      * Header `Authorization: Bearer @{body('Get_token')?['access_token']}`
      * Header `Content-Type: application/octet-stream`
      * Body: `@{base64ToBinary(items('Apply_to_each')?['contentBytes'])}`
   5. Optional: **Reply to email**: "Received N document(s). They will be searchable in Records within a few minutes."
4. **Test:** forward an invoice to the mailbox. Within ~5 minutes it appears in the Records app Library.

---

## 3. Records Assistant in Microsoft Teams (needs IT: Teams admin)

### Option A: Records as a Teams tab (quick, ~15 minutes)
Add the app as a **Website** tab in the relevant Teams channels (or publish it as a Teams app via the Teams
admin centre): `https://records-search-<workspace-id>.aws.databricksapps.com`.
Staff use Search, Library, Key dates and the Assistant inside Teams. They sign in with their Databricks account
on first use. If the sign-in page does not load inside the tab, use the tab's *open in browser* option.

### Option B: chat bot in Teams (full integration, a few days)
Build a **Copilot Studio** agent (or Azure Bot) published to Teams that forwards each question to the
Records Assistant and returns its answer with sources.

* Endpoint: `POST https://records-search-<workspace-id>.aws.databricksapps.com/invocations`
  (OpenAI Responses-style body: `{"input":[{"role":"user","content":"<question>"}]}`).
* Authentication: a Databricks OAuth token. For each user's own permissions, Databricks single sign-on must use
  Microsoft Entra ID so the bot can exchange the Teams user's token for a Databricks token. Otherwise the bot
  runs as one service principal and every Teams user sees the same records. Not recommended for HR or legal data.
* Needs: Teams admin approval to publish the app, Entra app registration, and the Databricks account admin
  to confirm the single sign-on setup.

**Recommendation:** start with Option A for the pilot; plan Option B once Entra-based single sign-on to Databricks
is confirmed.
