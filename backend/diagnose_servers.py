import requests
import socket

def check_port(host, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex((host, port))
    sock.close()
    return result == 0

def check_url(url):
    try:
        response = requests.get(url, timeout=2)
        print(f"GET {url}: {response.status_code}")
        return True
    except Exception as e:
        print(f"GET {url}: FAILED ({e})")
        return False

def check_cors(url, origin):
    try:
        response = requests.options(url, headers={
            'Access-Control-Request-Method': 'POST',
            'Origin': origin
        }, timeout=2)
        print(f"OPTIONS {url} from {origin}: {response.status_code}")
        print(f"Access-Control-Allow-Origin: {response.headers.get('Access-Control-Allow-Origin')}")
    except Exception as e:
        print(f"OPTIONS {url}: FAILED ({e})")

print("--- Checking Ports ---")
print(f"Backend 8000 Open? {check_port('127.0.0.1', 8000)}")
print(f"Frontend 8080 Open? {check_port('127.0.0.1', 8080)}")

print("\n--- Checking URLs ---")
check_url('http://127.0.0.1:8000/admin/login/')
check_url('http://localhost:8000/admin/login/')
check_url('http://127.0.0.1:8080/')
check_url('http://localhost:8080/')

print("\n--- Checking CORS ---")
check_cors('http://localhost:8000/api/users/login', 'http://localhost:8080')
