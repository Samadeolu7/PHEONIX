"""
jobs/serializers.py
"""
from rest_framework import serializers


class LastTaskResultSerializer(serializers.Serializer):
    status = serializers.CharField()
    date_done = serializers.DateTimeField()
    traceback = serializers.CharField(allow_null=True, allow_blank=True)


class ScheduledJobSerializer(serializers.Serializer):
    """
    Serializes a django_celery_beat PeriodicTask, with its human-readable
    schedule and most recent django_celery_results TaskResult (attached by
    the view as `.last_result`, since it isn't a DB relation).
    """
    id = serializers.IntegerField()
    name = serializers.CharField()
    task = serializers.CharField()
    schedule = serializers.SerializerMethodField()
    enabled = serializers.BooleanField()
    last_result = serializers.SerializerMethodField()

    def get_schedule(self, obj):
        if obj.crontab:
            return str(obj.crontab)
        if obj.interval:
            return str(obj.interval)
        return '—'

    def get_last_result(self, obj):
        result = getattr(obj, 'last_result', None)
        if result is None:
            return None
        return LastTaskResultSerializer(result).data
