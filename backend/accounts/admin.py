from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import ApiToken, RateLimit, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "role", "is_approved", "is_active", "date_joined")
    list_filter = ("role", "is_approved", "is_active", "is_superuser")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Beer Rates", {"fields": ("role", "is_approved", "approved_at", "language", "legacy_id")}),
        (
            "Notifications",
            {"fields": ("push_new_drinks", "push_cheers", "push_admin_new_signup", "email_admin_new_signup")},
        ),
    )
    readonly_fields = ("approved_at", "legacy_id")
    actions = ["approve_users"]

    @admin.action(description="Approve selected users")
    def approve_users(self, request, queryset):
        for user in queryset.filter(is_approved=False):
            user.approve()


@admin.register(RateLimit)
class RateLimitAdmin(admin.ModelAdmin):
    """Delete a row to lift a lockout early (e.g. a user who mistyped their password too often)."""

    list_display = ("key", "count", "window_started")
    search_fields = ("key",)
    readonly_fields = ("key", "count", "window_started")


@admin.register(ApiToken)
class ApiTokenAdmin(admin.ModelAdmin):
    """App logins. Delete one to log that phone out."""

    list_display = ("user", "name", "created_at", "last_used_at")
    search_fields = ("user__username", "name")
    readonly_fields = ("user", "name", "created_at", "last_used_at")
