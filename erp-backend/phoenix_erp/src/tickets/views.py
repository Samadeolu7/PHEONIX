from common.views import ScopedModelViewSet

from .models import Ticket, TicketComment
from .serializers import TicketSerializer, TicketCommentSerializer

class TicketViewSet(ScopedModelViewSet):
    permission_module = 'tickets'
    permission_page = 'tickets'
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer

class TicketCommentViewSet(ScopedModelViewSet):
    permission_module = 'tickets'
    permission_page = 'ticket-comments'
    queryset = TicketComment.objects.all()
    serializer_class = TicketCommentSerializer
