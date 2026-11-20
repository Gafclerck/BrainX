from django.urls import path
from .views import (
    FeedbackAdminDetailView,
    FeedbackAdminListView,
    FeedbackAdminStatsView,
    FeedbackCreateView,
)

urlpatterns = [
    # Public anonymous submission
    path('feedback/', FeedbackCreateView.as_view(), name='feedback-create'),

    # Superadmin management
    path('admin/feedback/', FeedbackAdminListView.as_view(), name='admin-feedback-list'),
    path('admin/feedback/stats/', FeedbackAdminStatsView.as_view(), name='admin-feedback-stats'),
    path('admin/feedback/<uuid:pk>/', FeedbackAdminDetailView.as_view(), name='admin-feedback-detail'),
]
