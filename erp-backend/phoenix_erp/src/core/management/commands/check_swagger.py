from textwrap import dedent
import traceback

from django.core.management.base import BaseCommand, CommandError
from django.utils import translation
from django.utils.module_loading import import_string

from drf_spectacular.drainage import GENERATOR_STATS
from drf_spectacular.renderers import OpenApiJsonRenderer, OpenApiYamlRenderer
from drf_spectacular.settings import patched_settings, spectacular_settings
from drf_spectacular.validation import validate_schema


class Command(BaseCommand):
    help = dedent("""
        Debug OpenAPI/Swagger schema generation for this project.

        This command wraps drf_spectacular's generator but prints the full
        traceback on errors and always emits generator statistics (including
        lineno traces when available) to help pinpoint the failing view/field.

        Usage examples:
          python manage.py check_swagger --validate --fail-on-warn --color
          python manage.py check_swagger --file schema.yml
    """)

    def add_arguments(self, parser):
        parser.add_argument('--format', dest="format", choices=['openapi', 'openapi-json'], default='openapi', type=str)
        parser.add_argument('--urlconf', dest="urlconf", default=None, type=str)
        parser.add_argument('--generator-class', dest="generator_class", default=None, type=str)
        parser.add_argument('--file', dest="file", default=None, type=str)
        parser.add_argument('--fail-on-warn', dest="fail_on_warn", default=False, action='store_true')
        parser.add_argument('--validate', dest="validate", default=False, action='store_true')
        parser.add_argument('--api-version', dest="api_version", default=None, type=str)
        parser.add_argument('--lang', dest="lang", default=None, type=str)
        parser.add_argument('--color', dest="color", default=False, action='store_true')
        parser.add_argument('--custom-settings', dest="custom_settings", default=None, type=str)

    def handle(self, *args, **options):
        # choose generator class
        if options['generator_class']:
            generator_class = import_string(options['generator_class'])
        else:
            generator_class = spectacular_settings.DEFAULT_GENERATOR_CLASS

        # enable detailed tracing
        GENERATOR_STATS.enable_trace_lineno()
        if options['color']:
            GENERATOR_STATS.enable_color()

        try:
            generator = generator_class(
                urlconf=options['urlconf'],
                api_version=options['api_version'],
            )

            if options['custom_settings']:
                custom_settings = import_string(options['custom_settings'])
            else:
                custom_settings = None

            with patched_settings(custom_settings):
                if options['lang']:
                    with translation.override(options['lang']):
                        schema = generator.get_schema(request=None, public=True)
                else:
                    schema = generator.get_schema(request=None, public=True)

            GENERATOR_STATS.emit_summary()

            if options['fail_on_warn'] and GENERATOR_STATS:
                raise CommandError('Failing as requested due to warnings')

            if options['validate']:
                try:
                    validate_schema(schema)
                except Exception as e:
                    raise CommandError(f"Schema validation failed: {e}")

            renderer = {
                'openapi': OpenApiYamlRenderer,
                'openapi-json': OpenApiJsonRenderer,
            }[options['format']]()

            output = renderer.render(schema, renderer_context={})

            if options['file']:
                with open(options['file'], 'wb') as f:
                    f.write(output)
                self.stdout.write(self.style.SUCCESS(f"Wrote schema to {options['file']}"))
            else:
                self.stdout.write(output.decode())

        except Exception:
            # Print full traceback to stderr to help debugging
            self.stderr.write("Schema generation failed with exception:\n")
            traceback.print_exc(file=self.stderr)
            # emit stats again in case partial information is available
            try:
                GENERATOR_STATS.emit_summary()
            except Exception:
                pass
            raise
