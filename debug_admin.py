import requests
import json
import os
import sys

# Ensure requests is installed
try:
    import requests
except ImportError:
    print("Requests module not found. Please install it with 'pip install requests'")
    sys.exit(1)

BASE_URL = "http://127.0.0.1:8000/api"

def test_admin_access():
    print("--- Testing Admin Access ---")
    
    # 1. Login
    email = input("Enter email (refer to django admin or use 'admin@example.com'): ") or "admin@example.com"
    password = input("Enter password (default 'admin'): ") or "admin"
    
    login_url = f"{BASE_URL}/users/login/"
    print(f"Logging in as {email}...")
    try:
        response = requests.post(login_url, json={"email": email, "password": password})
        
        if response.status_code != 200:
            print(f"Login failed: {response.status_code} {response.text}")
            return

        data = response.json()
        token = data.get("access") or data.get("token")
        
        if not token:
            print("No token received.")
            return

        print("Login successful.")
        
        # 2. Check User Details (if endpoint exists)
        # We need to know if the user is staff. 
        # Let's try to hit a protected admin endpoint.
        
        print("\nAttempting to access Admin Categories...")
        cat_url = f"{BASE_URL}/admin/categories/"
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(cat_url, headers=headers)
        
        if response.status_code == 200:
            print("SUCCESS: User has admin access to categories.")
            print("Existing categories:", response.json())
        elif response.status_code == 403:
            print("FAILURE: User is NOT authorized (403 Forbidden). User is likely not staff/admin.")
        else:
            print(f"FAILURE: Unexpected status code {response.status_code}")
            print(response.text)

        # 3. Try Creating Category
        print("\nAttempting to create a test category...")
        create_url = f"{BASE_URL}/admin/categories/"
        new_cat = {"name": "Debug Category", "slug": "debug-category"}
        
        response = requests.post(create_url, json=new_cat, headers=headers)
        
        if response.status_code == 201:
            print("SUCCESS: Category created.")
            # Clean up
            cat_id = response.json().get('id')
            if cat_id:
                requests.delete(f"{create_url}{cat_id}/", headers=headers)
                print("Test category deleted.")
        elif response.status_code == 400:
             print("FAILURE: Validation Error (400)")
             print(response.text)
        elif response.status_code == 403:
             print("FAILURE: Permission Denied (403)")
        else:
             print(f"FAILURE: Status {response.status_code}")
             print(response.text)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_admin_access()
