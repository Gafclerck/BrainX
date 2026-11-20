from rest_framework import serializers
from .models import Feedback


class FeedbackCreateSerializer(serializers.ModelSerializer):
    """Anonymous feedback creation serializer.

    Intentionally does not accept or link any user identity.
    Includes an optional honeypot field `hp_code` to catch spam bots.
    """

    hp_code = serializers.CharField(
        required=False,
        write_only=True,
        allow_blank=True,
        default='',
    )

    class Meta:
        model = Feedback
        fields = (
            'id',
            'category',
            'subject',
            'message',
            'page_url',
            'status',
            'created_at',
            'hp_code',
        )
        read_only_fields = ('id', 'status', 'created_at')

    def validate_message(self, value):
        text = (value or '').strip()
        if len(text) < 3:
            raise serializers.ValidationError('Le message doit contenir au moins 3 caractères.')
        return text

    def validate(self, attrs):
        # Anti-spam honeypot: bots fill visible/hidden text inputs
        hp = attrs.pop('hp_code', '')
        if hp:
            raise serializers.ValidationError({'message': 'Requête invalide.'})
        return attrs


class FeedbackAdminSerializer(serializers.ModelSerializer):
    """Admin-facing feedback representation with full details and status management."""

    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Feedback
        fields = (
            'id',
            'category',
            'category_display',
            'subject',
            'message',
            'page_url',
            'status',
            'status_display',
            'admin_notes',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at', 'category_display', 'status_display')


class FeedbackStatusUpdateSerializer(serializers.ModelSerializer):
    """Allows superadmins to mark feedback status (read, processed) and add admin notes."""

    class Meta:
        model = Feedback
        fields = ('status', 'admin_notes')
