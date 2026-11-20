from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Feedback
from .permissions import IsSuperAdminOrStaff
from .serializers import (
    FeedbackAdminSerializer,
    FeedbackCreateSerializer,
    FeedbackStatusUpdateSerializer,
)
from .throttling import FeedbackAnonRateThrottle


class FeedbackCreateView(generics.CreateAPIView):
    """Anonymous endpoint to submit feedback, bugs, and recommendations.

    Strictly anonymous: no user reference is attached to the record.
    """

    permission_classes = [AllowAny]
    throttle_classes = [FeedbackAnonRateThrottle]
    serializer_class = FeedbackCreateSerializer

    @extend_schema(
        operation_id='create_feedback',
        responses={
            201: FeedbackCreateSerializer,
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class FeedbackAdminListView(generics.ListAPIView):
    """Lists feedback submissions for superadmins/staff with filtering and pagination."""

    permission_classes = [IsAuthenticated, IsSuperAdminOrStaff]
    serializer_class = FeedbackAdminSerializer

    @extend_schema(
        operation_id='list_feedback_admin',
        parameters=[
            OpenApiParameter('status', str, description="Filter by status ('new', 'read', 'processed')"),
            OpenApiParameter('category', str, description="Filter by category ('bug', 'suggestion', etc.)"),
            OpenApiParameter('search', str, description='Search in subject or message'),
        ],
    )
    def get_queryset(self):
        qs = Feedback.objects.all().order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param)

        category_param = self.request.query_params.get('category')
        if category_param and category_param != 'all':
            qs = qs.filter(category=category_param)

        search_param = self.request.query_params.get('search')
        if search_param:
            qs = qs.filter(
                Q(subject__icontains=search_param) | Q(message__icontains=search_param)
            )

        return qs


class FeedbackAdminStatsView(APIView):
    """Returns quick aggregate statistics on feedback entries (total, new, read, processed)."""

    permission_classes = [IsAuthenticated, IsSuperAdminOrStaff]

    @extend_schema(
        operation_id='get_feedback_stats',
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'total': {'type': 'integer'},
                    'new': {'type': 'integer'},
                    'read': {'type': 'integer'},
                    'processed': {'type': 'integer'},
                },
            }
        },
    )
    def get(self, request):
        stats = Feedback.objects.aggregate(
            total=Count('id'),
            new_count=Count('id', filter=Q(status=Feedback.Status.NEW)),
            read_count=Count('id', filter=Q(status=Feedback.Status.READ)),
            processed_count=Count('id', filter=Q(status=Feedback.Status.PROCESSED)),
        )
        return Response({
            'total': stats['total'] or 0,
            'new': stats['new_count'] or 0,
            'read': stats['read_count'] or 0,
            'processed': stats['processed_count'] or 0,
        })


class FeedbackAdminDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update status/notes, or delete a feedback submission."""

    permission_classes = [IsAuthenticated, IsSuperAdminOrStaff]
    queryset = Feedback.objects.all()

    def get_serializer_class(self):
        if self.request.method in ('PATCH', 'PUT'):
            return FeedbackStatusUpdateSerializer
        return FeedbackAdminSerializer
