"""The four create endpoints of the content tree.

Each endpoint is Publisher-only and creates exactly one level. The parent is
resolved from the URL rather than the body, so a node can never be created
under a parent other than the path names, and an unknown parent id is a 404
before any row is written. `position` is assigned by the server (the next free
slot under the parent); explicit ordering is Story 2.4's. The write itself -
row, actor stamp and all - belongs to `mutate`, so a view only validates and
resolves; it never persists a content row itself.
"""

from django.db.models import Max
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsPublisher

from .models import Chapter, Course, Lesson, Module
from .mutations import mutate
from .serializers import (
    ChapterSerializer,
    CourseSerializer,
    LessonSerializer,
    ModuleSerializer,
)

# The five-key envelope every rejection uses, described locally so each
# operation's contract is honest in the generated schema. Named for content
# rather than shared: the story that owns all seven statuses is where a single
# shared component belongs.
ENVELOPE_RESPONSE = inline_serializer(
    name='ContentErrorResponse',
    fields={
        'type': serializers.CharField(),
        'title': serializers.CharField(),
        'status': serializers.IntegerField(),
        'detail': serializers.CharField(),
        'errors': serializers.DictField(),
    },
)


def next_position(queryset):
    """The next free position among the rows `queryset` selects.

    The client never sends a position on create, and Story 2.4 owns explicit
    ordering, so appending at the end is the least surprising default. It also
    keeps the per-parent unique constraint satisfied without the caller having
    to count the siblings first.
    """
    current = queryset.aggregate(highest=Max('position'))['highest']
    return (current or 0) + 1


class CourseCreateView(APIView):
    """Create a Course. The top level has no parent to resolve."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=CourseSerializer,
        responses={
            201: CourseSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request):
        serializer = CourseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = mutate(
            actor=request.user,
            model=Course,
            data={
                **serializer.validated_data,
                'position': next_position(Course.objects.all()),
            },
        )
        return Response(
            CourseSerializer(course).data, status=status.HTTP_201_CREATED
        )


class ModuleCreateView(APIView):
    """Create a Module under the Course named by the URL."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=ModuleSerializer,
        responses={
            201: ModuleSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        serializer = ModuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        module = mutate(
            actor=request.user,
            model=Module,
            data={
                **serializer.validated_data,
                'course': course,
                'position': next_position(Module.objects.filter(course=course)),
            },
        )
        return Response(
            ModuleSerializer(module).data, status=status.HTTP_201_CREATED
        )


class ChapterCreateView(APIView):
    """Create a Chapter under the Module named by the URL."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=ChapterSerializer,
        responses={
            201: ChapterSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        serializer = ChapterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        chapter = mutate(
            actor=request.user,
            model=Chapter,
            data={
                **serializer.validated_data,
                'module': module,
                'position': next_position(
                    Chapter.objects.filter(module=module)
                ),
            },
        )
        return Response(
            ChapterSerializer(chapter).data, status=status.HTTP_201_CREATED
        )


class LessonCreateView(APIView):
    """Create a Lesson under the Chapter named by the URL."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=LessonSerializer,
        responses={
            201: LessonSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, chapter_id):
        chapter = get_object_or_404(Chapter, pk=chapter_id)
        serializer = LessonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lesson = mutate(
            actor=request.user,
            model=Lesson,
            data={
                **serializer.validated_data,
                'chapter': chapter,
                'position': next_position(
                    Lesson.objects.filter(chapter=chapter)
                ),
            },
        )
        return Response(
            LessonSerializer(lesson).data, status=status.HTTP_201_CREATED
        )
