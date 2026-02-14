import requests

try:
    response = requests.get('http://127.0.0.1:8080/')
    print(f"Frontend Status (127.0.0.1): {response.status_code}")
    print(f"Frontend Title in HTML: {'<title>' in response.text}")
except Exception as e:
    print(f"Frontend failed: {e}")
