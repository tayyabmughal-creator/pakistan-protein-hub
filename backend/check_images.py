import sqlite3
import os

db_path = r"C:\New Protein\backend\db.sqlite3"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("Checking products table...")
try:
    cursor.execute("SELECT id, name, image FROM products_product")
    rows = cursor.fetchall()
    
    print(f"Found {len(rows)} products:")
    for row in rows:
        print(f"ID: {row[0]}, Name: {row[1]}, Image Path: {row[2]}")
        
        # Check if file exists
        if row[2]:
            # Remove /media/ prefix if present to check on disk
            rel_path = row[2]
            if rel_path.startswith("/media/"):
                rel_path = rel_path[7:]
            elif rel_path.startswith("media/"):
                rel_path = rel_path[6:]
            
            full_path = os.path.join(r"C:\New Protein\backend\media", rel_path)
            exists = os.path.exists(full_path)
            print(f"  -> File exists on disk: {exists} ({full_path})")
            
except Exception as e:
    print(f"Error querying database: {e}")

conn.close()
