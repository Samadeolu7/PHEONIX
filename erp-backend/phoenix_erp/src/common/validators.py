"""
Shared validators for user-uploaded documents.

This deployment stores media on a local Docker volume on the VPS itself
(no S3/object-storage offload — see docker-compose.yml's kti_media_files
volume), so every document uploaded through the app consumes disk on that
one box directly. These validators keep individual uploads bounded so a
handful of oversized files can't quietly eat the available space.
"""
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

MAX_DOCUMENT_SIZE_MB = 8

ALLOWED_DOCUMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']


def validate_document_file_size(value):
    limit = MAX_DOCUMENT_SIZE_MB * 1024 * 1024
    if value.size > limit:
        raise ValidationError(
            f'File too large ({value.size / 1024 / 1024:.1f}MB). '
            f'Maximum allowed size is {MAX_DOCUMENT_SIZE_MB}MB.'
        )


validate_document_extension = FileExtensionValidator(allowed_extensions=ALLOWED_DOCUMENT_EXTENSIONS)
