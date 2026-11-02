"""
Read-only: find logins linked to the WRONG Staff record by comparing names. Changes nothing.

Background: hr.signals.auto_create_staff_profile creates a stub Staff when a new login can't be
matched to an existing Staff record (email/name mismatch, or the login had no tenant yet). The
login then points at an empty stub while the real record - with the clients, targets, payroll -
sits unlinked. See relink_staff_login for the fix.

Usage:
    python manage.py find_staff_login_mismatches
    python manage.py find_staff_login_mismatches --min-score 0.75      # looser name matching
    python manage.py find_staff_login_mismatches --csv /tmp/staff_mismatches.csv

For every login it compares the login's name (first+last, username, email name) and its linked
Staff record's name against every Staff record:
  - names are normalised: lower-case, punctuation removed, word order ignored
    ("Odupitan Omotolani" == "omotolani  odupitan.")
  - close spellings score high too (difflib ratio), so typos still surface
It then reports:
  STUB      login linked to a record that is empty / tenantless / unused, while a better-used
            record with a matching name is unlinked  -> suggested relink command
  NO LINK   login linked to nothing, but an unlinked record with a matching name exists
  TENANT    linked record's tenant differs from the login's (invisible to normal screens)
  SHARED    two or more records match closely and are BOTH linked/used - needs a human look
Each Staff record is shown with how much it is used (clients, recovery targets, and every
other record pointing at it), so the real record is easy to tell from the stub.
"""
import csv
import re
import unicodedata
from difflib import SequenceMatcher

from django.core.management.base import BaseCommand


def norm(text):
    text = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode()
    words = re.sub(r'[^a-z0-9 ]+', ' ', text.lower()).split()
    return ' '.join(sorted(words))


def name_score(a, b):
    """1.0 = same words (any order); otherwise the best of whole-string and word-by-word similarity."""
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    whole = SequenceMatcher(None, a, b).ratio()
    wa, wb = a.split(), b.split()
    # Each word in the shorter name matched to its closest word in the longer one.
    short, long_ = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    per_word = sum(max(SequenceMatcher(None, w, x).ratio() for x in long_) for w in short) / len(short)
    # A one-word name (e.g. a username) matching one word of a full name is weaker evidence.
    if len(short) == 1 and len(long_) > 1:
        per_word *= 0.85
    return round(max(whole, per_word), 3)


class Command(BaseCommand):
    help = 'Read-only: list logins whose linked Staff record looks wrong, by comparing names.'

    def add_arguments(self, parser):
        parser.add_argument('--min-score', type=float, default=0.85,
                            help='Name similarity needed to call two names a match (0-1, default 0.85)')
        parser.add_argument('--csv', help='Also write the findings to this CSV file')

    def handle(self, *args, **opts):
        from users.models import User
        from hr.models import Staff

        min_score = opts['min_score']
        staff = list(Staff.all_objects.all_tenants().filter(is_deleted=False))
        usage = self._usage(Staff, staff)

        def label(s):
            u = usage[s.pk]
            name = f'{s.first_name} {s.last_name}'.strip()
            return (f'Staff #{s.pk} "{name}" tenant={s.tenant_id} '
                    f'branch={s.branch_id} clients={u["clients"]} targets={u["targets"]} other_links={u["other"]}')

        def used(s):
            u = usage[s.pk]
            return u['clients'] + u['targets'] + u['other']

        by_user = {s.user_id: s for s in staff if s.user_id}
        findings = []

        for user in User.objects.filter(is_active=True).order_by('pk'):
            linked = by_user.get(user.pk)
            names = {f'{user.first_name} {user.last_name}', user.username,
                     (user.email or '').split('@')[0].replace('.', ' ').replace('_', ' ')}
            if linked:
                names.add(f'{linked.first_name} {linked.last_name}')
            names = {n for n in names if norm(n)}

            matches = []
            for s in staff:
                if linked and s.pk == linked.pk:
                    continue
                if user.tenant_id and s.tenant_id and s.tenant_id != user.tenant_id:
                    continue
                score = max(name_score(n, f'{s.first_name} {s.last_name}') for n in names) if names else 0
                if score >= min_score:
                    matches.append((score, s))
            matches.sort(key=lambda m: (-m[0], -used(m[1])))

            issues = []
            if linked and user.tenant_id and linked.tenant_id != user.tenant_id:
                issues.append('TENANT')
            unlinked_better = [(sc, s) for sc, s in matches if s.user_id is None and used(s) > (used(linked) if linked else -1)]
            if linked and unlinked_better:
                issues.append('STUB')
            if not linked and [m for m in matches if m[1].user_id is None]:
                issues.append('NO LINK')
            if linked and used(linked) > 0 and [m for m in matches if m[1].user_id and used(m[1]) > 0]:
                issues.append('SHARED')
            if not issues:
                continue

            best = (unlinked_better or [m for m in matches if m[1].user_id is None] or matches or [(0, None)])[0]
            fix = (f'python manage.py relink_staff_login --user {user.pk} --staff {best[1].pk}'
                   if best[1] is not None and best[1].user_id is None else '(review by hand)')
            findings.append((user, linked, matches, issues, best, fix))

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'\n[{", ".join(issues)}] Login #{user.pk} {user.username} '
                f'"{user.first_name} {user.last_name}" <{user.email}> tenant={user.tenant_id}'))
            self.stdout.write(f'  linked : {label(linked) if linked else "nothing"}')
            for score, s in matches[:5]:
                who = 'unlinked' if s.user_id is None else f'linked to login #{s.user_id}'
                self.stdout.write(f'  match  : {score:.2f}  {label(s)}  ({who})')
            self.stdout.write(self.style.SUCCESS(f'  fix    : {fix}'))

        if not findings:
            self.stdout.write(self.style.SUCCESS('No suspicious login/staff links found.'))
        else:
            self.stdout.write(self.style.WARNING(
                f'\n{len(findings)} login(s) to review. Run each fix WITHOUT --apply first to preview it.'))

        if opts.get('csv'):
            with open(opts['csv'], 'w', newline='', encoding='utf-8') as fh:
                w = csv.writer(fh)
                w.writerow(['issues', 'user_id', 'username', 'user_name', 'linked_staff_id', 'linked_staff_name',
                            'linked_used', 'best_match_staff_id', 'best_match_name', 'best_match_score',
                            'best_match_used', 'fix'])
                for user, linked, matches, issues, best, fix in findings:
                    score, s = best
                    w.writerow([
                        ' '.join(issues), user.pk, user.username, f'{user.first_name} {user.last_name}'.strip(),
                        linked.pk if linked else '', f'{linked.first_name} {linked.last_name}'.strip() if linked else '',
                        used(linked) if linked else '', s.pk if s else '',
                        f'{s.first_name} {s.last_name}'.strip() if s else '', score or '', used(s) if s else '', fix,
                    ])
            self.stdout.write(f'CSV written to {opts["csv"]}')

    @staticmethod
    def _usage(Staff, staff):
        """Per Staff: assigned clients, recovery targets, and every other row pointing at it."""
        from django.db.models import Count

        ids = [s.pk for s in staff]
        usage = {pk: {'clients': 0, 'targets': 0, 'other': 0} for pk in ids}
        for rel in Staff._meta.related_objects:
            if rel.many_to_many or not rel.field.concrete:
                continue
            model, field = rel.related_model, rel.field.name
            key = ('clients' if model._meta.label == 'clients.Client' and field == 'assigned_officer'
                   else 'targets' if model._meta.label == 'analytics.OfficerRecoveryTarget'
                   else 'other')
            rows = (model._base_manager.filter(**{f'{field}__in': ids})
                    .values(field).annotate(n=Count('pk')))
            for r in rows:
                usage[r[field]][key] += r['n']
        return usage
