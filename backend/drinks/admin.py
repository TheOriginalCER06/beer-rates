from django.contrib import admin

from .models import Cheers, Drink, LookupCache, SiteSettings


@admin.register(Drink)
class DrinkAdmin(admin.ModelAdmin):
    list_display = ("name", "producer", "category", "rating", "date_tried", "created_by")
    list_filter = ("category", "container", "would_have_again")
    search_fields = ("name", "producer", "style", "comment", "barcode")
    date_hierarchy = "date_tried"
    readonly_fields = ("thumbnail", "photo_width", "photo_height", "client_id", "legacy_id", "created_at")


@admin.register(Cheers)
class CheersAdmin(admin.ModelAdmin):
    list_display = ("drink", "user", "created_at")


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    exclude = ("vapid_private_key",)

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(LookupCache)
class LookupCacheAdmin(admin.ModelAdmin):
    list_display = ("key", "expires_at")
    search_fields = ("key",)
