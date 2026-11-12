"""
Private file storage, upload validation, streaming and memory bounds.
Covers HR documents/payslips (common layer + HR endpoints).
"""
import io
import shutil
import tempfile
import zipfile
from pathlib import Path
from unittest import mock

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile, TemporaryUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from branches.models import Branch
from common.managers import set_current_tenant
from common.private_files import (
    check_file_signature, is_private_media_path, move_to_private, private_storage,
)
from users.models import Tenant, User

PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'


def png_bytes(size=(40, 30)):
    buf = io.BytesIO()
    Image.new('RGB', size, (200, 10, 10)).save(buf, format='PNG')
    return buf.getvalue()


def docx_bytes(with_macro=False):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('[Content_Types].xml', '<Types/>')
        z.writestr('word/document.xml', '<w:document/>')
        if with_macro:
            z.writestr('word/vbaProject.bin', b'\x00' * 10)
    return buf.getvalue()


class _TempMedia(TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self._ov = override_settings(MEDIA_ROOT=self.media)
        self._ov.enable()

    def tearDown(self):
        self._ov.disable()
        shutil.rmtree(self.media, ignore_errors=True)
        set_current_tenant(None)


class SignatureTests(TestCase):
    ALLOWED = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'doc']

    def test_genuine_files_pass(self):
        check_file_signature(SimpleUploadedFile('a.pdf', PDF), self.ALLOWED)
        check_file_signature(SimpleUploadedFile('a.png', png_bytes()), self.ALLOWED)
        check_file_signature(SimpleUploadedFile('a.docx', docx_bytes()), self.ALLOWED)

    def test_renamed_executable_and_html_rejected(self):
        for name, data in [('cv.pdf', b'MZ\x90\x00' + b'\x00' * 50),
                           ('photo.jpg', b'<html><script>alert(1)</script>'),
                           ('id.png', PDF)]:
            with self.assertRaises(ValidationError, msg=name):
                check_file_signature(SimpleUploadedFile(name, data), self.ALLOWED)

    def test_macro_docx_and_disallowed_extension_rejected(self):
        with self.assertRaises(ValidationError):
            check_file_signature(SimpleUploadedFile('a.docx', docx_bytes(with_macro=True)), self.ALLOWED)
        with self.assertRaises(ValidationError):
            check_file_signature(SimpleUploadedFile('a.svg', b'<svg/>'), self.ALLOWED)

    def test_reads_only_the_head(self):
        f = SimpleUploadedFile('a.pdf', PDF + b'x' * 1_000_000)
        with mock.patch.object(f.file, 'read', wraps=f.file.read) as r:
            check_file_signature(f, self.ALLOWED)
        self.assertTrue(all(call.args and call.args[0] <= 16 for call in r.call_args_list))


class PrivatePathTests(TestCase):
    def test_private_paths_detected_including_traversal(self):
        for p in ['private/x.pdf', 'private', '/private/a', 'public/../private/a.pdf', './private/a', 'a/./../private/b']:
            self.assertTrue(is_private_media_path(p), p)
        for p in ['clients/images/a.jpg', 'privatexyz/a', 'logo.png']:
            self.assertFalse(is_private_media_path(p), p)


class PublicMediaRouteTests(_TempMedia):
    def test_private_files_not_served_publicly(self):
        priv = Path(self.media) / 'private' / 'employee_documents'
        priv.mkdir(parents=True)
        (priv / 'contract.pdf').write_bytes(PDF)
        (Path(self.media) / 'logo.txt').write_text('public')
        from django.http import Http404
        from django.test import RequestFactory
        from phoenix.urls import serve_public_media
        rf = RequestFactory()

        def get(path):
            try:
                return serve_public_media(rf.get('/media/' + path), path, document_root=self.media).status_code
            except Http404:
                return 404
        self.assertEqual(get('private/employee_documents/contract.pdf'), 404)
        self.assertEqual(get('x/../private/employee_documents/contract.pdf'), 404)
        self.assertEqual(get('logo.txt'), 200)
        # And through the real URL route.
        self.assertEqual(APIClient().get('/media/private/employee_documents/contract.pdf').status_code, 404)

    def test_private_storage_has_no_url_and_lives_under_media_private(self):
        name = private_storage().save('t/a.pdf', SimpleUploadedFile('a.pdf', PDF))
        self.assertTrue((Path(self.media) / 'private' / name).is_file())
        with self.assertRaises(ValueError):
            private_storage().url(name)

    def test_move_to_private_is_idempotent_and_contained(self):
        (Path(self.media) / 'employee_documents').mkdir()
        (Path(self.media) / 'employee_documents' / 'old.pdf').write_bytes(PDF)
        self.assertTrue(move_to_private('employee_documents/old.pdf'))
        self.assertFalse(move_to_private('employee_documents/old.pdf'))
        self.assertTrue((Path(self.media) / 'private/employee_documents/old.pdf').is_file())
        self.assertFalse(move_to_private('../../etc/passwd'))


class MemoryBoundsTests(TestCase):
    def test_large_uploads_spool_to_disk_not_ram(self):
        from django.conf import settings
        self.assertLessEqual(settings.FILE_UPLOAD_MAX_MEMORY_SIZE, int(2.5 * 1024 * 1024))

    def test_huge_image_rejected_before_decode(self):
        from common import image_processing
        f = SimpleUploadedFile('big.png', png_bytes((400, 300)), content_type='image/png')
        with mock.patch.object(image_processing, 'MAX_DECODE_PIXELS', 1000), \
             mock.patch.object(Image.Image, 'load', side_effect=AssertionError('decoded!')):
            with self.assertRaises(image_processing.ImageTooLarge):
                image_processing.compress_image(f)

    def test_jpeg_decoded_at_reduced_scale(self):
        from common.image_processing import compress_image
        buf = io.BytesIO()
        Image.new('RGB', (4000, 3000), (1, 2, 3)).save(buf, format='JPEG')
        f = SimpleUploadedFile('p.jpg', buf.getvalue(), content_type='image/jpeg')
        seen = {}
        real_load = Image.Image.load

        def spy(img):
            seen.setdefault('size', img.size)
            return real_load(img)
        with mock.patch.object(Image.Image, 'load', spy):
            out = compress_image(f, max_dimension=800)
        # draft() made libjpeg decode at <= 1/2 scale instead of the full 12MP.
        self.assertLessEqual(seen['size'][0] * seen['size'][1], 2000 * 1500)
        self.assertLessEqual(max(Image.open(out).size), 800)


class HRDocumentEndpointTests(_TempMedia):
    def setUp(self):
        super().setUp()
        from hr.models import Staff
        self.owner = User.objects.create_user(username='hrown', password='x' * 12)
        self.tenant = Tenant.objects.create(name='HR Org', slug='hr-org', owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()
        self.branch = Branch.objects.create(name='HQ', code='HRQ', tenant=self.tenant, owner=self.owner)
        self.owner.branch = self.branch
        self.owner.save()
        set_current_tenant(self.tenant)
        self.staff = Staff.objects.create(first_name='Bola', last_name='Ade', tenant=self.tenant,
                                          branch=self.branch, owner=self.owner)
        set_current_tenant(None)
        self.c = APIClient()
        self.c.force_authenticate(self.owner)

    def upload(self, name='contract.pdf', data=PDF, ctype='application/pdf'):
        return self.c.post('/api/hr/employee-documents/', {
            'staff': self.staff.pk, 'title': 'Employment contract', 'category': 'contract',
            'file': SimpleUploadedFile(name, data, content_type=ctype),
        }, format='multipart', HTTP_X_BRANCH_ID=str(self.branch.pk))

    def test_upload_is_private_and_downloadable_by_authorised_staff(self):
        from hr.models import EmployeeDocument
        res = self.upload()
        self.assertEqual(res.status_code, 201, res.content)
        doc = EmployeeDocument.objects.get()
        self.assertEqual(res.json()['file'], f'/hr/employee-documents/{doc.pk}/download/')
        # Stored under media/private with a random name, not the original.
        self.assertTrue((Path(self.media) / 'private' / doc.file.name).is_file())
        self.assertNotIn('contract', doc.file.name)
        self.assertEqual(APIClient().get(f'/media/private/{doc.file.name}').status_code, 404)
        dl = self.c.get(f'/api/hr/employee-documents/{doc.pk}/download/')
        self.assertEqual(dl.status_code, 200)
        self.assertEqual(b''.join(dl.streaming_content), PDF)
        self.assertEqual(dl['X-Content-Type-Options'], 'nosniff')
        self.assertIn('no-store', dl['Cache-Control'])
        self.assertEqual(APIClient().get(f'/api/hr/employee-documents/{doc.pk}/download/').status_code, 401)

    def test_spoofed_document_rejected(self):
        res = self.upload(name='contract.pdf', data=b'MZ\x90\x00binary', ctype='application/pdf')
        self.assertEqual(res.status_code, 400)

    def test_other_tenant_cannot_download(self):
        from hr.models import EmployeeDocument
        self.upload()
        doc = EmployeeDocument.objects.get()
        other = User.objects.create_user(username='eve', password='x' * 12)
        t2 = Tenant.objects.create(name='Other', slug='other-org', owner=other)
        other.tenant = t2
        other.save()
        c2 = APIClient()
        c2.force_authenticate(other)
        self.assertEqual(c2.get(f'/api/hr/employee-documents/{doc.pk}/download/').status_code, 404)

    def test_large_upload_streams_via_temp_file(self):
        # > FILE_UPLOAD_MAX_MEMORY_SIZE: Django must hand us a TemporaryUploadedFile (on disk).
        seen = {}
        from hr import serializers as hr_serializers
        real = hr_serializers.EmployeeDocumentSerializer.validate_file

        def spy(self_, value):
            seen['type'] = type(value)
            return real(self_, value)
        big = PDF + b'0' * (3 * 1024 * 1024)
        with mock.patch.object(hr_serializers.EmployeeDocumentSerializer, 'validate_file', spy):
            res = self.upload(data=big)
        self.assertEqual(res.status_code, 201, res.content[:300])
        self.assertIs(seen['type'], TemporaryUploadedFile)
