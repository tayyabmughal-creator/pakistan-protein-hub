import urllib.request
import os

BASE_URL = "http://127.0.0.1:8000"
IMAGE_PATH = "/media/products/adeel_ahmed.jpg"
FULL_URL = f"{BASE_URL}{IMAGE_PATH}"

print(f"Testing URL: {FULL_URL}")

try:
    with urllib.request.urlopen(FULL_URL) as response:
        print(f"Status Code: {response.status}")
        print("SUCCESS: Image is serving correctly!")
        print(f"Size: {len(response.read())} bytes")
except urllib.error.URLError as e:
    print(f"FAILURE: {e}")
    print("This confirms the backend server is NOT serving media files at this URL.")

# Check file system just in case
file_path = r"C:\New Protein\backend\media\products\adeel_ahmed.jpg"
if os.path.exists(file_path):
    print(f"\nFileSystem Check: File exists at {file_path}")
else:
    print(f"\nFileSystem Check: File NOT FOUND at {file_path}")
