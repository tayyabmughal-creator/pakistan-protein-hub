import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from users.models import User

if not User.objects.filter(email='testadmin@example.com').exists():
    User.objects.create_superuser(email='testadmin@example.com', password='admin123', username='testadmin', name='Super Admin')
    print('Superuser created.')
else:
    print('Superuser already exists.')
