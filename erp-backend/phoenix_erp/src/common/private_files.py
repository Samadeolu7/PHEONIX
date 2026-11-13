"""
Private (non-public) file storage, upload validation and streaming downloads.

WHY THIS EXISTS
---------------
Everything under MEDIA_ROOT is served by Django at /media/ to anyone who has
the URL — no login check (see phoenix/urls.py). That is fine for logos, but
not for staff IDs, contracts, payslips or a loan applicant's ID card.

Sensitive files are stored under MEDIA_ROOT/private/ instead:
  * still on the same persistent Docker volume (kti_media_files), so nothing
    is lost on redeploy;
  * the public /media/ route refuses every path under private/;
  * the storage has no base URL, so ``.url`` raises — a serializer can't
    accidentally publish a link; files are only reachable through an
    authenticated, permission-checked view that calls
    ``private_file_response()``.

MEMORY
------
* Validation only ever reads the first few KB of an upload.
* Downloads use FileResponse, which streams the file in small blocks rather
  than reading it into memory.
* FILE_UPLOAD_MAX_MEMORY_SIZE (settings) keeps large uploads on a temp file
  on disk instead of in worker RAM.
"""
import mimetypes
import posixpath
import uuid
import zipfile
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.http import FileResponse
from django.utils import timezone
from django.utils.deconstruct import deconstructible
from django.utils.functional import cached_property

PRIVATE_DIRNAME = 'private'


def private_root() -> Path:
    return Path(settings.MEDIA_ROOT) / PRIVATE_DIRNAME


class PrivateMediaStorage(FileSystemStorage):
    """FileSystemStorage under MEDIA_ROOT/private with no public URL."""

    def __init__(self, **kwargs):
        kwargs['base_url'] = None
        super().__init__(**kwargs)

    @cached_property
    def base_location(self):
        # Derived from MEDIA_ROOT each time Django clears its cached
        # properties (it does so whenever MEDIA_ROOT changes).
        return self._value_or_setting(self._location, str(private_root()))

    def url(self, name):
        raise ValueError(
            'Private files have no public URL. Serve them through an authenticated '
            'view with common.private_files.private_file_response().'
        )


_private_storage = None


def private_storage():
    """Callable for ``FileField(storage=private_storage)`` (keeps migrations path-free)."""
    global _private_storage
    if _private_storage is None:
        _private_storage = PrivateMediaStorage()
    return _private_storage


def is_private_media_path(path: str) -> bool:
    """True for any (normalised) /media/ sub-path that lives under private/."""
    norm = posixpath.normpath('/' + (path or '')).lstrip('/')
    return norm == PRIVATE_DIRNAME or norm.startswith(PRIVATE_DIRNAME + '/')


@deconstructible
class RandomFilename:
    """
    upload_to that stores ``<prefix>/<yyyy>/<mm>/<uuid>.<ext>``.

    The original filename is never used on disk: it can't leak personal data
    through the path, collide with another upload, or smuggle path tricks.
    """

    def __init__(self, prefix):
        self.prefix = prefix.strip('/')

    def __call__(self, instance, filename):
        ext = Path(filename or '').suffix.lower()[:10]
        now = timezone.now()
        return f'{self.prefix}/{now:%Y}/{now:%m}/{uuid.uuid4().hex}{ext}'

    def __eq__(self, other):
        return isinstance(other, RandomFilename) and other.prefix == self.prefix


# ─────────────────────────────────────────────────────────────────────────────
# Content validation — checks what the file IS, not what it's called.
# ─────────────────────────────────────────────────────────────────────────────

_SIGNATURES = {
    'pdf': (b'%PDF-',),
    'jpg': (b'\xff\xd8\xff',),
    'jpeg': (b'\xff\xd8\xff',),
    'png': (b'\x89PNG\r\n\x1a\n',),
    'webp': (b'RIFF',),  # + 'WEBP' at offset 8, checked below
    'docx': (b'PK\x03\x04',),
    'doc': (b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',),
}


def _read_head(f, n=16):
    pos = f.tell() if hasattr(f, 'tell') else 0
    try:
        f.seek(0)
        return f.read(n)
    finally:
        f.seek(pos)


def check_file_signature(f, allowed_extensions):
    """
    Raise ValidationError unless the file's extension is allowed AND its
    first bytes match that type. Reads only a few bytes (docx: the zip
    central directory), never the whole file.
    """
    name = getattr(f, 'name', '') or ''
    ext = Path(name).suffix.lower().lstrip('.')
    if ext not in allowed_extensions:
        raise ValidationError(
            f'Unsupported file type. Allowed: {", ".join(sorted(set(allowed_extensions)))}.'
        )
    head = _read_head(f)
    sigs = _SIGNATURES.get(ext)
    if not sigs or not any(head.startswith(sig) for sig in sigs):
        raise ValidationError('The file content does not match its type. Please upload a genuine document.')
    if ext == 'webp' and head[8:12] != b'WEBP':
        raise ValidationError('The file content does not match its type.')
    if ext == 'docx':
        try:
            f.seek(0)
            with zipfile.ZipFile(f) as z:
                names = set(z.namelist())
        except zipfile.BadZipFile:
            raise ValidationError('This Word document is damaged.')
        finally:
            f.seek(0)
        if 'word/document.xml' not in names:
            raise ValidationError('This is not a Word document.')
        if any(n.lower().endswith('vbaproject.bin') for n in names):
            raise ValidationError('Documents containing macros are not accepted.')


def max_size_validator(max_mb):
    limit = int(max_mb * 1024 * 1024)

    def _validate(f):
        if getattr(f, 'size', 0) > limit:
            raise ValidationError(
                f'File too large ({f.size / 1024 / 1024:.1f}MB). Maximum is {max_mb:g}MB.'
            )
    return _validate


# ─────────────────────────────────────────────────────────────────────────────
# Downloads
# ─────────────────────────────────────────────────────────────────────────────

INLINE_TYPES = {'application/pdf', 'image/jpeg', 'image/png', 'image/webp'}


def safe_download_name(base: str, stored_name: str) -> str:
    ext = Path(stored_name or '').suffix.lower()
    keep = ''.join(c if c.isalnum() or c in ' -_.()' else '_' for c in (base or 'document')).strip()
    keep = keep[:80] or 'document'
    return keep if keep.lower().endswith(ext) else f'{keep}{ext}'


def private_file_response(fieldfile, *, download_name: str, inline: bool = False):
    """
    Stream a stored file to an already-authorised user.

    FileResponse sends the file in small blocks (no full read into memory)
    and closes it afterwards. Active content can't run from it: nosniff,
    a locked-down CSP, and anything other than PDF/images is forced to
    download.
    """
    if not fieldfile:
        from django.http import Http404
        raise Http404()
    try:
        handle = fieldfile.open('rb')
    except FileNotFoundError:
        from django.http import Http404
        raise Http404()
    content_type = mimetypes.guess_type(fieldfile.name)[0] or 'application/octet-stream'
    as_attachment = not (inline and content_type in INLINE_TYPES)
    response = FileResponse(
        handle, as_attachment=as_attachment, filename=download_name, content_type=content_type,
    )
    response['X-Content-Type-Options'] = 'nosniff'
    response['Cache-Control'] = 'private, no-store'
    response['Content-Security-Policy'] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    response['Cross-Origin-Resource-Policy'] = 'same-site'
    return response


def move_to_private(relative_name: str) -> bool:
    """
    Move an existing file from public MEDIA_ROOT/<name> to MEDIA_ROOT/private/<name>,
    keeping the same relative name (so the DB value doesn't change).
    Idempotent: returns True if moved, False if nothing to do.
    """
    if not relative_name:
        return False
    media = Path(settings.MEDIA_ROOT).resolve()
    src = (media / relative_name).resolve()
    dst = (private_root() / relative_name).resolve()
    # Never touch anything outside MEDIA_ROOT.
    if media not in src.parents or private_root().resolve() not in dst.parents:
        return False
    if not src.is_file() or dst.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.replace(dst)  # same volume → atomic rename, no copy in memory
    return True


# ─────────────────────────────────────────────────────────────────────────────
# DRF field
# ─────────────────────────────────────────────────────────────────────────────

from rest_framework import serializers as _drf_serializers  # noqa: E402


class PrivateFileField(_drf_serializers.FileField):
    """
    Accepts an upload like a normal FileField, but never outputs a storage
    URL. It returns the authenticated API path that streams the file, e.g.
    ``/hr/employee-documents/12/download/`` (relative to /api), or None.

    ``download_path`` is a format string filled from the model instance.
    """

    def __init__(self, *args, download_path, **kwargs):
        self.download_path = download_path
        super().__init__(*args, **kwargs)

    def to_representation(self, value):
        if not value:
            return None
        return self.download_path.format(obj=value.instance)
