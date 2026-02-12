import requests
import sys
import os
import django

# Setup Django to use models directly if needed, but we are testing API
sys.path.append('..') # context

BASE_URL = "http://127.0.0.1:8000/api"

def run():
    print("1. Logging in as testadmin@example.com...")
    # Assuming the user created earlier exists. If not, I'll create it via code first.
    
    # Let's use django models to ensure user exists
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        django.setup()
        from users.models import User
        if not User.objects.filter(email='testadmin@example.com').exists():
            User.objects.create_superuser('testadmin@example.com', 'adminpassword')
            print("Created testadmin user.")
        else:
            u = User.objects.get(email='testadmin@example.com')
            u.set_password('adminpassword')
            u.save()
            print("Reset testadmin password.")
    except Exception as e:
        print(f"Django setup failed: {e}")
        # Proceed anyway, maybe user exists.

    try:
        resp = requests.post(f"{BASE_URL}/users/login", json={'email': 'testadmin@example.com', 'password': 'adminpassword'})
        if resp.status_code != 200:
            print(f"Login failed: {resp.status_code} {resp.text}")
            return
        
        token = resp.json()['access']
        print("Login successful.")

        print("2. Creating Category...")
        headers = {'Authorization': f'Bearer {token}'}
        cat_data = {'name': 'Headless Test', 'slug': 'headless-test'}
        
        # Cleanup first
        # We can't easily cleanup via API without knowing ID, unless we list.
        
        resp = requests.post(f"{BASE_URL}/admin/categories/", json=cat_data, headers=headers)
        if resp.status_code == 201:
            print("SUCCESS: Category created.")
            print(resp.json())
        elif resp.status_code == 400:
            print("FAILED: Validation Error")
            print(resp.json())
        elif resp.status_code == 403:
            print("FAILED: Permission Denied")
        else:
            print(f"FAILED: {resp.status_code} {resp.text}")

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == '__main__':
    run()
