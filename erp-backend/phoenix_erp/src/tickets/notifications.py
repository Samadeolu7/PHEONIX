from django.core.mail import send_mail
from django.conf import settings

from .models import Ticket


from_email = ''
def send_sla_escalation_email(run):
    ticket_id = run.parameters.get('ticket_id')
    ticket = Ticket.objects.get(pk=ticket_id)
    subject = f"SLA Alert: Ticket #{ticket.id} Still Open"
    body = f"Ticket “{ticket.title}” has been open since {ticket.created_at}."
    recipient = ticket.assigned_to.email if ticket.assigned_to else ticket.created_by.email
    send_mail(subject, body, from_email, [recipient])
