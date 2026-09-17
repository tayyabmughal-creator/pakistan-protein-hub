# Shared proxy headers. Included by every location that forwards to the backend,
# so one change applies everywhere rather than drifting between blocks.
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
# Django reads this via SECURE_PROXY_SSL_HEADER to know the original scheme.
# Without it, SECURE_SSL_REDIRECT sees "http" behind the TLS terminator and
# redirect-loops.
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Request-ID $request_id_final;
proxy_redirect off;

proxy_connect_timeout 5s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
