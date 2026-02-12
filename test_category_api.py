import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"

def test_category_creation():
    # 1. Login
    print("Attempting login...")
    login_url = f"{BASE_URL}/users/login/"
    try:
        response = requests.post(login_url, json={"email": "admin@example.com", "password": "admin"}, timeout=5)
        # Try different admin creds if this fails? I'll assume I need to create one if this fails.
        # Actually, let's try creating a superuser via shell first if login fails?
        # But I don't know the existing users.
        # Let's hope there is an admin user.
        
        if response.status_code != 200:
            print(f"Login failed: {response.status_code} {response.text}")
            # Try plain admin/admin
            response = requests.post(login_url, json={"email": "admin", "password": "admin"}, timeout=5)
            if response.status_code != 200:
                print(f"Login with 'admin' failed too: {response.status_code}")
                return

        data = response.json()
        token = data.get("access") or data.get("token")
        if not token:
            print("No token in response:", data)
            return
        
        print("Login successful. Token obtained.")

        # 2. Create Category
        print("Attempting to create category...")
        category_url = f"{BASE_URL}/admin/categories/"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        category_data = {
            "name": "Test Category Python",
            "slug": "test-category-python"
        }
        
        response = requests.post(category_url, json=category_data, headers=headers)
        
        if response.status_code in [200, 201]:
            print("Category created successfully!")
            print(response.json())
        else:
            print(f"Category creation failed: {response.status_code}")
            print(response.text)

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_category_creation()
