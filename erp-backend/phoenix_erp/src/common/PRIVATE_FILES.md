# Private files (HR documents, payslips, applicant documents)

Everything under `MEDIA_ROOT` is served publicly at `/media/` with no login
check. Sensitive files therefore live under `MEDIA_ROOT/private/`, on the same
persistent volume (`kti_media_files`). Their only way out is an authenticated,
permission-checked endpoint that streams the file.

| What | Stored at | Served by |
|---|---|---|
| Employee documents | `private/employee_documents/` | `GET /api/hr/employee-documents/<id>/download/` |
| Guarantor documents | `private/guarantor_documents/` | `GET /api/hr/guarantor-documents/<id>/download/` |
| Payslip PDFs | `private/hr/payslips/` | `GET /api/hr/payslips/<id>/pdf/` |
| Leave supporting documents | `private/hr/leave_documents/` | (not exposed yet) |
| Client documents (IDs, utility bills) | `private/clients/documents/` | `GET /api/clients/documents/<id>/download/` |
| Portal applicant documents | `private/portal/applications/` | `GET /api/portal/staff/applications/<id>/documents/<doc>/download/` |

Add `?inline=1` to view a PDF or image in the browser instead of downloading it.

## Deploying this change

Migrations `hr.0031_private_file_storage` and `clients.0017_private_client_documents` **move existing files** from
`media/<path>` to `media/private/<path>`, keeping the same relative names so no
database rows change. It is idempotent and reversible (`migrate hr 0030` moves
the files back). As with any migration that touches files, **back up the
`kti_media_files` volume first**.

Any old public links to these files (bookmarks, links pasted into chats) stop
working after the move. That's intended.

## Memory

- `FILE_UPLOAD_MAX_MEMORY_SIZE` is 2.5 MB. Larger uploads go to a temp file on
  disk instead of sitting in worker RAM.
- Content checks read only the first few bytes. Hashes are computed in chunks.
- Photos are decoded at reduced scale (JPEG `draft()`). Images over 50 MP are
  rejected from their header, before any decoding.
- Downloads use `FileResponse`, which streams in blocks. The frontend frees
  object URLs after use.

## Rules for new code

- Sensitive `FileField`: `storage=private_storage, upload_to=RandomFilename('<prefix>')`.
- Serializers: use `PrivateFileField(download_path=..., validators=[...])`.
  Declared fields do **not** inherit model-field validators, so list them.
- Views: authorise with `get_object()`, then `return private_file_response(...)`.
- Never call `.url` on a private file; it raises by design.
- Exclude private file fields from Django admin forms, since the admin widget calls `.url`.
