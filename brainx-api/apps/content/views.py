"""The create, list, update, reorder and move endpoints of the content tree.

Each endpoint is Publisher-only and acts on exactly one level. The four
collection routes answer a `POST` with a create and a `GET` with the Publisher
listing, which reads through `manageable()` (AD-2) so it includes rows a Student
cannot see; the listing is page-number paginated by the project default. The
parent is resolved from the URL rather than the body, so a node can never be
created under a parent other than the path names, and an unknown parent id is a
404 before any row is written. `position` is assigned by the server on create
(the next free slot under the parent); explicit ordering is this story's,
through the reorder endpoints, which take a container's whole ordered child
list, and the Lesson move endpoint, which relocates a single Lesson to another
Chapter.
An update is a `PATCH` on the row's own UUID and writes only the fields the
body carries, so a descriptive edit never touches `position` and never moves
the row to a new parent. The write itself - row, actor stamp and all - belongs
to `mutate` (and the reorder/move helpers built on it), so a view only
validates, resolves and looks the row up; it never persists a content row
itself.
"""

from django.conf import settings
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    inline_serializer,
)
from rest_framework import serializers, status
from rest_framework.generics import GenericAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsPublisher, IsVerifiedAccount

from .delivery import build_signed_url, derive_content_type, derive_filename
from .models import Chapter, Course, Lesson, Module, Resource
from .mutations import (
    LEVEL_NAMES,
    move_lesson,
    mutate,
    next_position,
    removal_targets,
    remove,
    reorder_children,
    restore,
)
from .serializers import (
    ChapterSerializer,
    CourseSerializer,
    LessonMoveSerializer,
    LessonSerializer,
    ModuleSerializer,
    RemovalPreviewSerializer,
    ReorderSerializer,
    ResourceRetrievalSerializer,
    ResourceSerializer,
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


def is_exact_permutation(order, children):
    """True when `order` lists every `children` id exactly once."""
    ids = {child.pk for child in children}
    return len(order) == len(children) and set(order) == ids


def resource_write_parsers():
    """The parsers a Resource write action accepts.

    The project's default parser list stays JSON-only; only the two Resource
    write actions add a multipart form so a file can ride alongside the fields,
    and JSON keeps working there for the URL-bearing types.
    """
    return [JSONParser(), MultiPartParser(), FormParser()]


class MultipartWriteMixin:
    """Adds the multipart parsers to the named write actions only.

    `get_parsers` runs inside `initialize_request`, before DRF assigns
    `self.request`, so the method is stashed there - which also lets the schema
    generator, which builds a request the same way, see the right parsers per
    action. A GET or any action not named keeps the project's JSON-only default.
    """

    multipart_actions = ()

    def initialize_request(self, request, *args, **kwargs):
        self._http_method = request.method
        return super().initialize_request(request, *args, **kwargs)

    def get_parsers(self):
        if getattr(self, '_http_method', None) in self.multipart_actions:
            return resource_write_parsers()
        return super().get_parsers()


def build_removal_preview(node):
    """The rows removing `node` would newly hide, as counts plus named rows."""
    targets = removal_targets(node)
    would_remove = {name: 0 for name in LEVEL_NAMES.values()}
    items = []
    for row in targets:
        level = LEVEL_NAMES[type(row)]
        would_remove[level] += 1
        items.append(
            {
                'level': level,
                'id': row.pk,
                'name': row.name if hasattr(row, 'name') else row.title,
                'position': row.position,
            }
        )
    would_remove['total'] = len(targets)
    payload = {'would_remove': would_remove, 'items': items}
    return RemovalPreviewSerializer(payload).data


def list_response(view, queryset, serializer_class):
    """A Publisher listing read through `manageable()`, paged by the default.

    `queryset` is expected to be the output of `manageable()`, so soft-deleted
    rows are present. `view` supplies the project's page-number
    paginator (20 per page, no `page_size` parameter); the response carries the
    usual `count`/`next`/`previous`/`results` frame.
    """
    page = view.paginate_queryset(queryset)
    serializer = serializer_class(
        page, many=True, context={'request': view.request}
    )
    return view.get_paginated_response(serializer.data)


class CourseCreateView(GenericAPIView):
    """Create a Course, or list every Course. The top level has no parent."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: CourseSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            # The page parameter is the only 404 source here: there is no
            # parent to resolve, but an invalid or out-of-range page is not.
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request):
        """List every Course, soft-deleted rows included."""
        return list_response(
            self,
            Course.objects.manageable().select_related('last_modified_by'),
            CourseSerializer,
        )

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


class ModuleCreateView(GenericAPIView):
    """Create a Module under the Course named by the URL, or list them."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: ModuleSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, course_id):
        """List the Course's Modules, soft-deleted rows included."""
        course = get_object_or_404(Course.objects.manageable(), pk=course_id)
        return list_response(
            self,
            Module.objects.manageable()
            .select_related('last_modified_by')
            .filter(course=course),
            ModuleSerializer,
        )

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
                'position': next_position(
                    Module.objects.filter(course=course)
                ),
            },
        )
        return Response(
            ModuleSerializer(module).data, status=status.HTTP_201_CREATED
        )


class ChapterCreateView(GenericAPIView):
    """Create a Chapter under the Module named by the URL, or list them."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: ChapterSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, module_id):
        """List the Module's Chapters, soft-deleted rows included."""
        module = get_object_or_404(Module.objects.manageable(), pk=module_id)
        return list_response(
            self,
            Chapter.objects.manageable()
            .select_related('last_modified_by')
            .filter(module=module),
            ChapterSerializer,
        )

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


class LessonCreateView(GenericAPIView):
    """Create a Lesson under the Chapter named by the URL, or list them."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: LessonSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, chapter_id):
        """List the Chapter's Lessons, soft-deleted rows included."""
        chapter = get_object_or_404(
            Chapter.objects.manageable(), pk=chapter_id
        )
        return list_response(
            self,
            Lesson.objects.manageable()
            .select_related('last_modified_by')
            .filter(chapter=chapter),
            LessonSerializer,
        )

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


class LessonResourcesView(MultipartWriteMixin, GenericAPIView):
    """Attach a Resource to the Lesson named by the URL, or list its Resources.

    The parent is resolved from the URL, so a Resource can never be attached
    under another Lesson than the path names, and an unknown Lesson id is a
    404 before any row is written. Both payload shapes are accepted here: a
    `video` or `external_link` arrives as JSON with a `url`, a `document` or
    `image` arrives as multipart with a `file` that the serializer checks
    against the settings ceiling and allowlist. The write goes through `mutate`
    like every other content row, so the acting Publisher is stamped and
    `is_deleted` stays server-owned. The listing reads through `manageable()`
    like every other Publisher listing, and Resources order by `id`.
    """

    permission_classes = [IsAuthenticated, IsPublisher]
    multipart_actions = ('POST',)

    @extend_schema(
        responses={
            200: ResourceSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, lesson_id):
        """List the Lesson's Resources, soft-deleted rows included."""
        lesson = get_object_or_404(Lesson.objects.manageable(), pk=lesson_id)
        return list_response(
            self,
            Resource.objects.manageable()
            .select_related('last_modified_by')
            .filter(lesson=lesson),
            ResourceSerializer,
        )

    @extend_schema(
        request=ResourceSerializer,
        responses={
            201: ResourceSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        serializer = ResourceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resource = mutate(
            actor=request.user,
            model=Resource,
            data={**serializer.validated_data, 'lesson': lesson},
        )
        return Response(
            ResourceSerializer(resource).data, status=status.HTTP_201_CREATED
        )


class ResourceUpdateView(MultipartWriteMixin, APIView):
    """Edit a Resource's metadata, addressed by its own UUID.

    A partial update leaves an omitted field alone. `title`, `note` and `url`
    are editable here, and `url` still has to be an http(s) address, because
    the database CHECK constraints make a payload that contradicts its type an
    error however the row was written. The update is metadata-only: unlike the
    create action it accepts no new file, and a body carrying one is a 400
    naming `file`. The write goes through `mutate`, never a direct save.
    """

    permission_classes = [IsAuthenticated, IsPublisher]
    multipart_actions = ('PATCH',)

    @extend_schema(
        request=ResourceSerializer,
        responses={
            200: ResourceSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def patch(self, request, resource_id):
        resource = get_object_or_404(Resource, pk=resource_id)
        serializer = ResourceSerializer(
            resource, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        resource = mutate(
            actor=request.user,
            model=Resource,
            instance=resource,
            data=serializer.validated_data,
        )
        return Response(ResourceSerializer(resource).data)


class CourseUpdateView(APIView):
    """Edit or rename a Course, addressed by its own UUID.

    Only the fields in the body change; the serializer arrives `partial`, so
    an absent field is left alone. `position`, `is_deleted`, `last_modified_by`
    and `id` are read-only and ignored if a body supplies them.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=CourseSerializer,
        responses={
            200: CourseSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def patch(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        serializer = CourseSerializer(course, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        course = mutate(
            actor=request.user,
            model=Course,
            instance=course,
            data=serializer.validated_data,
        )
        return Response(CourseSerializer(course).data)

    @extend_schema(
        request=None,
        responses={
            200: CourseSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def delete(self, request, course_id):
        """Soft-remove the Course and every live descendant beneath it."""
        course = get_object_or_404(Course, pk=course_id)
        removed = remove(actor=request.user, model=Course, node=course)
        return Response(CourseSerializer(removed).data)


class ModuleUpdateView(APIView):
    """Edit or rename a Module, addressed by its own UUID."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=ModuleSerializer,
        responses={
            200: ModuleSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def patch(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        serializer = ModuleSerializer(module, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        module = mutate(
            actor=request.user,
            model=Module,
            instance=module,
            data=serializer.validated_data,
        )
        return Response(ModuleSerializer(module).data)

    @extend_schema(
        request=None,
        responses={
            200: ModuleSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def delete(self, request, module_id):
        """Soft-remove the Module and every live descendant beneath it."""
        module = get_object_or_404(Module, pk=module_id)
        removed = remove(actor=request.user, model=Module, node=module)
        return Response(ModuleSerializer(removed).data)


class ChapterUpdateView(APIView):
    """Edit or rename a Chapter, addressed by its own UUID."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=ChapterSerializer,
        responses={
            200: ChapterSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def patch(self, request, chapter_id):
        chapter = get_object_or_404(Chapter, pk=chapter_id)
        serializer = ChapterSerializer(
            chapter, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        chapter = mutate(
            actor=request.user,
            model=Chapter,
            instance=chapter,
            data=serializer.validated_data,
        )
        return Response(ChapterSerializer(chapter).data)

    @extend_schema(
        request=None,
        responses={
            200: ChapterSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def delete(self, request, chapter_id):
        """Soft-remove the Chapter and every live descendant beneath it."""
        chapter = get_object_or_404(Chapter, pk=chapter_id)
        removed = remove(actor=request.user, model=Chapter, node=chapter)
        return Response(ChapterSerializer(removed).data)


class LessonUpdateView(APIView):
    """Edit a Lesson, addressed by its own UUID.

    A partial update leaves an omitted field alone, but a required field
    (`title`, `teacher`, `course_date`) that is present and blank is rejected
    400, naming it under `errors`.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=LessonSerializer,
        responses={
            200: LessonSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def patch(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        serializer = LessonSerializer(lesson, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        lesson = mutate(
            actor=request.user,
            model=Lesson,
            instance=lesson,
            data=serializer.validated_data,
        )
        return Response(LessonSerializer(lesson).data)

    @extend_schema(
        request=None,
        responses={
            200: LessonSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def delete(self, request, lesson_id):
        """Soft-remove the Lesson."""
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        removed = remove(actor=request.user, model=Lesson, node=lesson)
        return Response(LessonSerializer(removed).data)


class CourseModulesReorderView(APIView):
    """Set the order of a Course's Modules by listing them in order.

    The body must name every Module of the Course exactly once; anything else
    is a 400 naming `order`. The container is locked and the Modules are
    renumbered to 1..N in one transaction through `mutate`; the response lists
    the Modules in the new order.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=ReorderSerializer,
        responses={
            200: ModuleSerializer(many=True),
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def put(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.validated_data['order']
        children = list(Module.objects.filter(course=course, is_deleted=False))
        if not is_exact_permutation(order, children):
            raise serializers.ValidationError(
                {'order': ['must list every Module of the Course exactly once']}
            )
        reordered = reorder_children(
            actor=request.user,
            container=course,
            children=children,
            order=order,
        )
        return Response(ModuleSerializer(reordered, many=True).data)


class ModuleChaptersReorderView(APIView):
    """Set the order of a Module's Chapters by listing them in order."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=ReorderSerializer,
        responses={
            200: ChapterSerializer(many=True),
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def put(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.validated_data['order']
        children = list(Chapter.objects.filter(module=module, is_deleted=False))
        if not is_exact_permutation(order, children):
            raise serializers.ValidationError(
                {'order': ['must list every Chapter of the Module exactly once']}
            )
        reordered = reorder_children(
            actor=request.user,
            container=module,
            children=children,
            order=order,
        )
        return Response(ChapterSerializer(reordered, many=True).data)


class ChapterLessonsReorderView(APIView):
    """Set the order of a Chapter's Lessons by listing them in order."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=ReorderSerializer,
        responses={
            200: LessonSerializer(many=True),
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def put(self, request, chapter_id):
        chapter = get_object_or_404(Chapter, pk=chapter_id)
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.validated_data['order']
        children = list(Lesson.objects.filter(chapter=chapter, is_deleted=False))
        if not is_exact_permutation(order, children):
            raise serializers.ValidationError(
                {'order': ['must list every Lesson of the Chapter exactly once']}
            )
        reordered = reorder_children(
            actor=request.user,
            container=chapter,
            children=children,
            order=order,
        )
        return Response(LessonSerializer(reordered, many=True).data)


class LessonMoveView(APIView):
    """Move a Lesson to a different Chapter, appended at its end.

    The target Chapter comes from the body; it must exist (404 otherwise) and
    differ from the Lesson's current Chapter (400 otherwise). The move keeps
    the Lesson's UUID, appends it at the target Chapter's next position in one
    locked transaction, and leaves the source Chapter sparse.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=LessonMoveSerializer,
        responses={
            200: LessonSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def patch(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        serializer = LessonMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_id = serializer.validated_data['chapter']
        if target_id == lesson.chapter_id:
            raise serializers.ValidationError(
                {'chapter': ['must name a different Chapter']}
            )
        target = get_object_or_404(Chapter, pk=target_id)
        moved = move_lesson(
            actor=request.user, lesson=lesson, target_chapter=target
        )
        return Response(LessonSerializer(moved).data)


class CourseRemovalPreviewView(APIView):
    """Preview what removing a Course would hide. Writes nothing."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: RemovalPreviewSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        return Response(build_removal_preview(course))


class ModuleRemovalPreviewView(APIView):
    """Preview what removing a Module would hide. Writes nothing."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: RemovalPreviewSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        return Response(build_removal_preview(module))


class ChapterRemovalPreviewView(APIView):
    """Preview what removing a Chapter would hide. Writes nothing."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: RemovalPreviewSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, chapter_id):
        chapter = get_object_or_404(Chapter, pk=chapter_id)
        return Response(build_removal_preview(chapter))


class LessonRemovalPreviewView(APIView):
    """Preview what removing a Lesson would hide. Writes nothing."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: RemovalPreviewSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        return Response(build_removal_preview(lesson))


class CourseRestoreView(APIView):
    """Restore a soft-deleted Course, and only it."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=None,
        responses={
            200: CourseSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, course_id):
        course = get_object_or_404(Course, pk=course_id)
        restored = restore(actor=request.user, model=Course, node=course)
        return Response(CourseSerializer(restored).data)


class ModuleRestoreView(APIView):
    """Restore a soft-deleted Module, and only it."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=None,
        responses={
            200: ModuleSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        restored = restore(actor=request.user, model=Module, node=module)
        return Response(ModuleSerializer(restored).data)


class ChapterRestoreView(APIView):
    """Restore a soft-deleted Chapter, and only it."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=None,
        responses={
            200: ChapterSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, chapter_id):
        chapter = get_object_or_404(Chapter, pk=chapter_id)
        restored = restore(actor=request.user, model=Chapter, node=chapter)
        return Response(ChapterSerializer(restored).data)


class LessonRestoreView(APIView):
    """Restore a soft-deleted Lesson, and only it."""

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=None,
        responses={
            200: LessonSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        restored = restore(actor=request.user, model=Lesson, node=lesson)
        return Response(LessonSerializer(restored).data)


class ResourceRetrievalView(APIView):
    """Retrieve a signed URL for a document or image Resource.

    The read gate is `[IsAuthenticated, IsVerifiedAccount]`. The Resource and
    its parent Lesson are resolved through `visible()` so a hidden or missing
    row is 404 (never an existence oracle). Only `document` and `image` types
    are served; video/external_link are treated as nonexistent (404).
    """

    permission_classes = [IsAuthenticated, IsVerifiedAccount]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name='disposition',
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                enum=['inline', 'attachment'],
                default='inline',
            )
        ],
        responses={
            200: ResourceRetrievalSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, resource_id):
        disposition = request.query_params.get('disposition', 'inline')
        if disposition not in ('inline', 'attachment'):
            raise serializers.ValidationError(
                {'disposition': ['disposition must be inline or attachment']}
            )

        resource = get_object_or_404(Resource.objects.visible(), pk=resource_id)
        # The parent Lesson is resolved through its own Student port too, so a
        # soft-deleted (and, once Epic 4 widens `visible()`, an unpublished)
        # Lesson hides its Resources with the same 404 as a nonexistent id.
        get_object_or_404(Lesson.objects.visible(), pk=resource.lesson_id)

        if resource.type not in ('document', 'image') or not resource.file:
            raise Http404

        payload = {
            'url': build_signed_url(resource, disposition=disposition),
            'expires_in': settings.RESOURCE_URL_TTL_SECONDS,
            'content_type': derive_content_type(resource),
            'disposition': disposition,
            'filename': derive_filename(resource),
        }
        # The signed URL is a short-lived credential; keep it out of caches.
        return Response(payload, headers={'Cache-Control': 'no-store'})
