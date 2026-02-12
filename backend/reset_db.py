import os
import django
import sys

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.core.management import call_command
from django.db import connection

def reset_db():
    print("WARNING: This will DELETE ALL DATA and reset IDs to 1.")
    confirm = input("Are you sure? (type 'yes' to confirm): ")
    
    if confirm.lower() != 'yes':
        print("Cancelled.")
        return

    # For SQLite, we can just delete the file and run migrations.
    # But to be safe and support other DBs, let's flush.
    
    print("Flushing database...")
    call_command('flush', '--no-input')
    
    # For SQLite specifically, we might need to clear sqlite_sequence
    if 'sqlite' in str(connection.settings_dict['ENGINE']):
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM sqlite_sequence")
            print("SQLite sequence reset.")

    # Re-create admin
    from users.models import User
    User.objects.create_superuser('admin@example.com', 'adminpassword', name='Admin User', username='admin')
    print("Database reset. Admin created (admin@example.com / adminpassword).")

if __name__ == "__main__":
    reset_db()
