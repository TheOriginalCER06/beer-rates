from django.conf import settings
from django.contrib import admin
from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.urls import path, re_path
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from django.views.static import serve
from strawberry.django.views import GraphQLView

from accounts.views import admin_login
from api.schema import schema
from drinks import views as drink_views


@require_GET
@ensure_csrf_cookie
def csrf(request):
    """The website calls this once on load so the `csrftoken` cookie is set before any mutation."""
    return HttpResponse(status=204)


@require_GET
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return JsonResponse({"status": "ok", "version": settings.APP_VERSION})


urlpatterns = [
    # Before admin.site.urls, so this rate-limited view handles the login.
    path("admin/login/", admin_login),
    path("admin/", admin.site.urls),
    path(
        "graphql/",
        GraphQLView.as_view(
            schema=schema,
            graphql_ide="graphiql" if settings.DEBUG else None,
            allow_queries_via_get=False,
        ),
    ),
    path("api/csrf/", csrf),
    path("api/health/", health),
    path("api/drinks/<int:drink_id>/photo/", drink_views.upload_photo),
    path("api/export/drinks.<str:fmt>", drink_views.export_drinks),
]

# In production nginx serves /media/ straight from the volume.
if settings.DEBUG:
    urlpatterns.append(re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}))
