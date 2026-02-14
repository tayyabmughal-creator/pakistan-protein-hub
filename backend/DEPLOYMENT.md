# Deployment Checklist

1. **Environment Variables**:
   - Set `DEBUG=False`
   - Set `SECRET_KEY` to a strong, secret value.
   - Set `ALLOWED_HOSTS` to your domain name(s).
   - Set `DATABASE_URL` (if using dj-database-url) or configure `DATABASES` for PostgreSQL.

2. **Static Files**:
   - Run `python manage.py collectstatic`.
   - Configure web server (Nginx/Apache) to serve static files.

3. **Database**:
   - Run `python manage.py migrate`.

4. **WSGI Server**:
   - Use Gunicorn: `gunicorn config.wsgi:application`

5. **Security**:
   - Ensure HTTPS is enabled.
   - Set `SECURE_SSL_REDIRECT = True` in settings.
   - Set `SESSION_COOKIE_SECURE = True`
   - Set `CSRF_COOKIE_SECURE = True`

6. **Admin**:
   - Change admin URL from default `/admin/` to something secretive.
