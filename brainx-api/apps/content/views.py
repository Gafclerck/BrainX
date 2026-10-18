"""The create, list, update, reorder and move endpoints of the content tree.

Publisher endpoints act on exactly one level (create/list under parent for
containers and lessons, detail update, reorder, remove/restore, publish
actions). Student browse endpoints are the four per-level listings and the
Lesson detail under `browse/` and require only `IsAuthenticated`. The four
Publisher collection routes answer a `POST` with a create and a `GET` with the
Publisher listing, which reads through `manageable()` (AD-2) so it includes
rows a Student cannot see; all listings are page-number paginated at the
project default. The parent is resolved from the URL rather than the body, so a
node can never be created under a parent other than the path names, and an
unknown parent id is a 404 before any row is written. `position` is assigned by
the server on create (the next free slot under the parent); explicit ordering
is via the reorder endpoints, which take a container's whole ordered child
list, and the Lesson move endpoint, which relocates a single Lesson to another
Chapter. An update is a `PATCH` on the row's own UUID and writes only the
fields the body carries, so a descriptive edit never touches `position` and
never moves the row to a new parent. The write itself - row, actor stamp and
all - belongs to `mutate` (and the reorder/move helpers built on it), so a view
only validates, resolves and looks the row up; it never persists a content row
itself.
"""

from django.conf import settings
from django.db.models import Prefetch
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
    bulk_publish,
    move_lesson,
    mutate,
    next_position,
    removal_targets,
    remove,
    reorder_children,
    restore,
)
from .ordering import order_containers, order_lessons, order_resources
from .publication import lesson_missing_metadata
from .serializers import (
    BrowseContainerSerializer,
    BrowseLessonSerializer,
    BulkPublishCommitSerializer,
    BulkPublishPreviewSerializer,
    BulkPublishResultSerializer,
    ChapterSerializer,
    CourseSerializer,
    LessonDetailSerializer,
    LessonMoveSerializer,
    LessonSerializer,
    ModuleSerializer,
    RemovalPreviewSerializer,
    ReorderSerializer,
    ResourceRetrievalSerializer,
    ResourceSerializer,
)
from .visibility import visible_content

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


def build_bulk_publish_preview(lessons):
    """What a bulk publish would flip and what it would skip, as a dry run.

    `lessons` is the candidate set - every live descendant Lesson of the
    addressed container. A Lesson that fails the publishable rule is named under
    `blocked` with its missing fields; a Lesson that passes but is already
    published changes nothing and is counted in neither figure. Only an
    unpublished, complete Lesson is counted in `would_change`, so the count is
    what the commit would actually write rather than the size of the subtree.
    The computation only reads: no row is written and `mutate` is not called.
    """
    would_change = 0
    blocked = []
    for lesson in lessons:
        # `lesson_missing_metadata` returns fields in the canonical required
        # order, so the missing list stays stable and matches the rule.
        missing = list(lesson_missing_metadata(lesson))
        if missing:
            blocked.append({'id': lesson.pk, 'missing': missing})
        elif not lesson.is_published:
            would_change += 1
    payload = {'would_change': would_change, 'blocked': blocked}
    return BulkPublishPreviewSerializer(payload).data


def list_response(view, queryset, serializer_class):
    """A paginated listing shared by the Publisher and Student read views.

    The caller hands in the queryset already scoped to the right read surface:
    Publisher collection listings pass a queryset filtered by the parent that
    uses the Publisher port (`manageable()`), and container browse listings pass
    `visible_content()` querysets intersected with the parent. The lesson browse
    listing passes `Lesson.objects.visible().select_related(...).filter(chapter=chapter)`
    (ordered by `order_lessons`). In all cases the queryset is already the
    correct, final set, so the helper does not re-apply visibility. `view`
    supplies the project's page-number paginator (20 per page, no `page_size`
    parameter); the response carries the usual `count`/`next`/`previous`/`results`
    frame.
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
    naming `file`. The write goes through `mutate`, never a direct save. The
    same route removes the Resource: `delete` soft-sets `is_deleted` through the
    write port, and nothing is deleted from storage.
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

    @extend_schema(
        request=None,
        responses={
            200: ResourceSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def delete(self, request, resource_id):
        """Soft-remove the Resource; nothing is deleted from storage."""
        resource = get_object_or_404(Resource, pk=resource_id)
        removed = remove(actor=request.user, model=Resource, node=resource)
        return Response(ResourceSerializer(removed).data)


class ResourceRestoreView(APIView):
    """Restore a soft-deleted Resource, and only it.

    A Resource is a leaf, so restoring it clears exactly its own flag. The
    write port re-reads the row through its `with_deleted()` selector, and a
    Resource that is already live is returned unchanged.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=None,
        responses={
            200: ResourceSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, pk=resource_id)
        restored = restore(actor=request.user, model=Resource, node=resource)
        return Response(ResourceSerializer(restored).data)


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
    400, naming it under `errors`. On an already-published Lesson the
    publishable rule applies too: a write that would leave any required
    metadata blank - notably `description`, which is optional on a draft - is
    rejected 400 by the same rule the publish action uses, so an ordinary edit
    cannot strip a published Lesson of what made it publishable.
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
        if lesson.is_published:
            missing = lesson_missing_metadata(
                lesson, serializer.validated_data
            )
            if missing:
                raise serializers.ValidationError(missing)
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


class LessonPublishView(APIView):
    """Publish a complete Lesson, addressed by its own UUID.

    Publication requires the Lesson's metadata to be complete: `title`,
    `description`, `teacher` and `course_date`. A missing field is a 400 whose
    `errors` names every one, not only the first. Publishing a Lesson that is
    already published is idempotent - the row is returned unchanged and is not
    re-stamped. The write goes through `mutate`, so `last_modified_by` is the
    acting Publisher and `is_published` stays server-owned.

    Publication is orthogonal to removal: there is no special case for a
    soft-deleted Lesson, and the action resolves it with the raw manager as the
    update view does, so all four flag combinations stay reachable.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=None,
        responses={
            200: LessonSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        missing = lesson_missing_metadata(lesson)
        if missing:
            raise serializers.ValidationError(missing)
        if lesson.is_published:
            return Response(LessonSerializer(lesson).data)
        published = mutate(
            actor=request.user,
            model=Lesson,
            instance=lesson,
            data={'is_published': True},
        )
        return Response(LessonSerializer(published).data)


class LessonUnpublishView(APIView):
    """Withdraw a Lesson from every Student read path, addressed by its UUID.

    Unpublishing clears `is_published`, which `visible()` filters, so the
    Lesson and its Resources leave every Student read path at once. It is never
    gated on metadata completeness: an urgent withdrawal of a Lesson missing
    required metadata must still succeed, so the publishable rule is not
    consulted. Unpublishing a Lesson that is already unpublished is idempotent -
    the row is returned unchanged and is not re-stamped. The write goes through
    `mutate`, so `last_modified_by` is the acting Publisher and `is_published`
    stays server-owned.

    Unpublishing is orthogonal to removal: there is no special case for a
    soft-deleted Lesson, and the action resolves it with the raw manager as the
    publish view does, so a removed published Lesson reaches
    `(is_published=False, is_deleted=True)`.
    """

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
        if not lesson.is_published:
            return Response(LessonSerializer(lesson).data)
        unpublished = mutate(
            actor=request.user,
            model=Lesson,
            instance=lesson,
            data={'is_published': False},
        )
        return Response(LessonSerializer(unpublished).data)


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


class ChapterBulkPublishPreviewView(APIView):
    """Preview the bulk publish of a Chapter's live Lessons. Writes nothing.

    Every live Lesson of the Chapter is a candidate; a Lesson already published
    or missing required metadata changes nothing and the rest are counted in
    `would_change`. The Chapter is resolved with the raw manager because
    publication is orthogonal to removal, and an unknown id is a 404.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: BulkPublishPreviewSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, chapter_id):
        chapter = get_object_or_404(Chapter, pk=chapter_id)
        lessons = Lesson.objects.filter(chapter=chapter, is_deleted=False)
        return Response(build_bulk_publish_preview(lessons))


class ModuleBulkPublishPreviewView(APIView):
    """Preview the bulk publish of a Module's whole subtree. Writes nothing.

    The candidate set spans every Chapter beneath the Module, not only its
    direct children, and excludes removed Lessons: bulk publication acts on the
    live tree and never resurrects removed content.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        responses={
            200: BulkPublishPreviewSerializer,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        lessons = Lesson.objects.filter(
            chapter__module=module, is_deleted=False
        )
        return Response(build_bulk_publish_preview(lessons))


class ChapterBulkPublishView(APIView):
    """Commit the bulk publish of a Chapter's live Lessons.

    The body echoes Story 4.3's preview (`would_change` and `blocked`). The
    commit re-derives the Chapter's live descendant Lessons and recomputes the
    enumeration under the Chapter row lock; when it differs from the echoed one,
    nothing is written and the answer is 409. Otherwise every ready Lesson is
    published through the write port, one row at a time, and the response
    carries the count actually written and the blocked work list under
    `errors`. `changed` is the count written, not the previewed count.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=BulkPublishCommitSerializer,
        responses={
            200: BulkPublishResultSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
            409: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, chapter_id):
        chapter = get_object_or_404(Chapter, pk=chapter_id)
        serializer = BulkPublishCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = bulk_publish(
            actor=request.user,
            container=chapter,
            previewed=serializer.validated_data,
        )
        return Response(
            BulkPublishResultSerializer(
                {
                    'changed': result['changed'],
                    'errors': {'blocked': result['blocked']},
                }
            ).data
        )


class ModuleBulkPublishView(APIView):
    """Commit the bulk publish of a Module's whole live subtree.

    The candidate set spans every Chapter beneath the Module, exactly as the
    Module preview computes it. The commit re-derives that set and recomputes
    the enumeration under the Module row lock; when it differs from the echoed
    Story 4.3 preview it writes nothing and answers 409. Otherwise every ready
    Lesson under every Chapter is published through the write port, one row at
    a time, and the response carries the count written and the blocked list.
    """

    permission_classes = [IsAuthenticated, IsPublisher]

    @extend_schema(
        request=BulkPublishCommitSerializer,
        responses={
            200: BulkPublishResultSerializer,
            400: ENVELOPE_RESPONSE,
            401: ENVELOPE_RESPONSE,
            403: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
            409: ENVELOPE_RESPONSE,
        },
    )
    def post(self, request, module_id):
        module = get_object_or_404(Module, pk=module_id)
        serializer = BulkPublishCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = bulk_publish(
            actor=request.user,
            container=module,
            previewed=serializer.validated_data,
        )
        return Response(
            BulkPublishResultSerializer(
                {
                    'changed': result['changed'],
                    'errors': {'blocked': result['blocked']},
                }
            ).data
        )


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

        # The parent Lesson is resolved through its own Student port inside the
        # same lookup, so a soft-deleted or unpublished Lesson hides its
        # Resources with the byte-identical 404 of a nonexistent id - a
        # separate lookup would name the Lesson in `detail` and leak that the
        # Resource row exists.
        resource = get_object_or_404(
            Resource.objects.visible().filter(
                lesson_id__in=Lesson.objects.visible().values('pk')
            ),
            pk=resource_id,
        )

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


class BrowseCourseListView(GenericAPIView):
    """List the Courses that hold at least one visible Lesson (Story 5.2).

    This is the Student port by construction: `IsAuthenticated` is the whole
    gate, so an authenticated Publisher sees the same published tree and no
    caller sees an unpublished or soft-deleted Course. Rows are `{id, name}` in
    the shared container order, page-number paginated at the project default,
    and the listing reads through `visible_content()` rather than a view-local
    filter on the removal or publication flags.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: BrowseContainerSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            # The `page` parameter is the only 404 source: there is no parent.
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request):
        return list_response(
            self,
            order_containers(visible_content().courses),
            BrowseContainerSerializer,
        )


class BrowseModuleListView(GenericAPIView):
    """List the visible Modules under one visible Course (Story 5.2).

    The parent Course is resolved through `visible_content()` - a single lookup
    that already requires a visible descendant Lesson - so a hidden Course and
    a nonexistent one both raise the same 404, byte for byte. The Modules listed
    are the visible ones scoped to that Course.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: BrowseContainerSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, course_id):
        visible = visible_content()
        course = get_object_or_404(visible.courses, pk=course_id)
        return list_response(
            self,
            order_containers(visible.modules.filter(course=course)),
            BrowseContainerSerializer,
        )


class BrowseChapterListView(GenericAPIView):
    """List the visible Chapters under one visible Module (Story 5.2).

    As with the Module listing, the parent is resolved through
    `visible_content()` so a hidden or nonexistent Module id gives the same 404,
    and the Chapters listed are the visible ones scoped to that Module.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: BrowseContainerSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, module_id):
        visible = visible_content()
        module = get_object_or_404(visible.modules, pk=module_id)
        return list_response(
            self,
            order_containers(visible.chapters.filter(module=module)),
            BrowseContainerSerializer,
        )


class BrowseLessonListView(GenericAPIView):
    """List the visible Lessons under one visible Chapter (Story 5.2).

    The parent Chapter is resolved through `visible_content()`, so a Chapter
    whose Lessons are all unpublished is as hidden as a nonexistent id and both
    answer the same 404. The Lessons are read through the Student port and the
    shared total order, with the ancestor names joined so each row can carry the
    five context fields without a query per row.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: BrowseLessonSerializer(many=True),
            401: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, chapter_id):
        visible = visible_content()
        chapter = get_object_or_404(visible.chapters, pk=chapter_id)
        lessons = (
            Lesson.objects.visible()
            .select_related('chapter__module__course')
            .filter(chapter=chapter)
        )
        return list_response(
            self,
            order_lessons(lessons),
            BrowseLessonSerializer,
        )


class LessonDetailView(GenericAPIView):
    """Open one published, live Lesson with its context and material
    (Story 5.3).

    The Lesson is resolved through the Student port, and its Chapter must be in
    `visible_content()` - the same ancestor walk browse uses - so an
    unpublished or soft-deleted Lesson, and a live Lesson under a hidden
    container, both answer the byte-identical 404 of a nonexistent id. The walk
    is needed because the write path can still create or move a Lesson under an
    already-removed container, which leaves the Lesson's own flags agreeing
    with a tree browse hides. The ancestor names are joined so the five context
    fields cost no extra query, and the visible Resources are prefetched in the
    shared Resource order, so a Lesson with many attachments still answers in a
    fixed number of queries. The nested Resource list is a bounded part of the
    detail body, not a paginated listing of its own. No signed URL is minted
    here: document and image bytes stay behind the authenticated retrieval
    endpoint with its own verified-account gate.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: LessonDetailSerializer,
            401: ENVELOPE_RESPONSE,
            404: ENVELOPE_RESPONSE,
        },
    )
    def get(self, request, lesson_id):
        visible = visible_content()
        lesson = get_object_or_404(
            Lesson.objects.visible()
            .select_related('chapter__module__course')
            .filter(chapter__in=visible.chapters)
            .prefetch_related(
                Prefetch(
                    'resources',
                    queryset=order_resources(Resource.objects.visible()),
                )
            ),
            pk=lesson_id,
        )
        serializer = LessonDetailSerializer(lesson)
        return Response(serializer.data)
