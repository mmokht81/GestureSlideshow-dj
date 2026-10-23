
from django.urls import path
from . import views

app_name = "slideshow"

urlpatterns = [
    path("", views.home, name="home"),
]
