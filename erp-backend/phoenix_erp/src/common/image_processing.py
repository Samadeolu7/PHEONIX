"""
Shared helpers for compressing uploaded images before they hit storage.

Every ImageField in the app (client/guarantor photos, signatures, staff and
asset photos, expense receipts, thread attachments) was previously saved
byte-for-byte as uploaded — often multi-MB phone camera photos — with no
resizing or re-encoding. These helpers downscale + re-encode as JPEG at
upload time, applied in serializer validate_<field>() hooks so only new
uploads are touched.
"""
import io

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import InMemoryUploadedFile
from PIL import Image, ImageOps


def _to_rgb(img):
    """Flatten transparency onto white (JPEG has no alpha channel)."""
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        img = img.convert('RGBA')
        background = Image.new('RGB', img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        return background
    if img.mode != 'RGB':
        return img.convert('RGB')
    return img


def _open_normalized(uploaded_file):
    """Open + auto-rotate (per EXIF) + flatten to RGB. Raises on unreadable input."""
    uploaded_file.seek(0)
    img = Image.open(uploaded_file)
    img.load()
    img = ImageOps.exif_transpose(img)
    return _to_rgb(img)


def _encode_jpeg(img, max_dimension, quality):
    resized = img.copy()
    resized.thumbnail((max_dimension, max_dimension), Image.LANCZOS)
    buffer = io.BytesIO()
    resized.save(buffer, format='JPEG', quality=quality, optimize=True)
    buffer.seek(0)
    return buffer


def _base_name(uploaded_file):
    name = getattr(uploaded_file, 'name', None) or 'image'
    return name.rsplit('.', 1)[0]


def compress_image(uploaded_file, max_dimension=1600, quality=82):
    """
    Downscale + re-encode an uploaded image as JPEG, stripping EXIF.
    Returns a new in-memory file, or the original untouched if PIL can't
    read it (e.g. already tiny, corrupt, or an unsupported format).
    """
    if not uploaded_file:
        return uploaded_file
    try:
        img = _open_normalized(uploaded_file)
    except Exception:
        uploaded_file.seek(0)
        return uploaded_file

    buffer = _encode_jpeg(img, max_dimension, quality)
    name = f'{_base_name(uploaded_file)}.jpg'
    return InMemoryUploadedFile(
        buffer, None, name, 'image/jpeg', buffer.getbuffer().nbytes, None,
    )


def compress_and_thumbnail(uploaded_file, max_dimension=1600, quality=82,
                            thumb_size=320, thumb_quality=75):
    """
    Same as compress_image(), but also returns a small bounded-box JPEG
    thumbnail (for chat-style previews). Decodes the source image once.
    Returns (compressed_file, thumbnail_contentfile_or_None).
    """
    if not uploaded_file:
        return uploaded_file, None
    try:
        img = _open_normalized(uploaded_file)
    except Exception:
        uploaded_file.seek(0)
        return uploaded_file, None

    base_name = _base_name(uploaded_file)

    buffer = _encode_jpeg(img, max_dimension, quality)
    compressed = InMemoryUploadedFile(
        buffer, None, f'{base_name}.jpg', 'image/jpeg', buffer.getbuffer().nbytes, None,
    )

    thumb_buffer = _encode_jpeg(img, thumb_size, thumb_quality)
    thumbnail = ContentFile(thumb_buffer.read(), name=f'{base_name}_thumb.jpg')

    return compressed, thumbnail
