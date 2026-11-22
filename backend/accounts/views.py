from django.contrib import admin
from django.http import HttpResponse
from django.utils.html import format_html

from core.errors import AppError

from . import ratelimit


def admin_login(request, **kwargs):
    """
    Django admin's login with the app's attempt limits. Guesses here and on the app's own login
    share the same per-username and per-IP budgets.
    """
    if request.method != "POST":
        return admin.site.login(request, **kwargs)

    username = request.POST.get("username", "").strip()
    ip = ratelimit.client_ip(request)
    try:
        ratelimit.LOGIN_PER_USER.check(username)
        ratelimit.LOGIN_PER_IP.check(ip)
    except AppError as exc:
        return HttpResponse(
            format_html('<!doctype html><title>Too many attempts</title><p>{}</p><a href="">Back</a>', exc.message),
            status=429,
        )

    response = admin.site.login(request, **kwargs)
    if response.status_code == 302:  # logged in
        ratelimit.LOGIN_PER_USER.reset(username)
    else:
        ratelimit.LOGIN_PER_USER.hit(username)
        ratelimit.LOGIN_PER_IP.hit(ip)
    return response
