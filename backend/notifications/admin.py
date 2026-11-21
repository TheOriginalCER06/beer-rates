from django.contrib import admin

from .models import OutgoingEmail, PushMessage, PushSubscription


@admin.register(OutgoingEmail)
class OutgoingEmailAdmin(admin.ModelAdmin):
    list_display = ("kind", "to", "created_at", "sent_at", "attempts")
    list_filter = ("kind", "sent_at")
    search_fields = ("to", "subject")
    readonly_fields = [f.name for f in OutgoingEmail._meta.fields]


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "user_agent", "created_at", "last_success_at")
    list_filter = ("kind",)
    readonly_fields = ("user", "kind", "endpoint", "p256dh", "auth", "user_agent", "created_at", "last_success_at")


@admin.register(PushMessage)
class PushMessageAdmin(admin.ModelAdmin):
    list_display = ("tag", "subscription", "created_at", "sent_at", "attempts")
    readonly_fields = [f.name for f in PushMessage._meta.fields]
