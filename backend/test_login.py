import requests
import sys

BASE_URL = "http://127.0.0.1:8000/api"

def test_login(email, password):
    print(f"Testing login for {email}...")
    try:
        response = requests.post(f"{BASE_URL}/users/login", json={
            "email": email,
            "password": password
        })
        
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print("Login Successful!")
            data = response.json()
            print(f"Access Token: {data.get('access')[:20]}...")
            print(f"Refresh Token: {data.get('refresh')[:20]}...")
            print(f"User: {data.get('user')}")
            return True
        else:
            print(f"Login Failed: {response.text}")
            return False
    except Exception as e:
        print(f"Error connecting to backend: {e}")
        return False

if __name__ == "__main__":
    # Test with admin credentials (if known) or just check connectivity
    # Since I don't know the user's password, I'll try a default one or just check 401
    
    # Try a dummy login to see if endpoint is reachable
    test_login("admin@example.com", "admin123")
