#!/bin/bash
set -e

echo "======================================"
echo "  Phoenix ERP - Starting Application"
echo "======================================"

# Wait for database to be ready
echo "Waiting for database..."
until python manage.py dbshell -- -c '\q' 2>/dev/null; do
  echo "Database is unavailable - sleeping"
  sleep 2
done
echo "✓ Database is ready"

# Run migrations
echo "Running database migrations..."
python manage.py migrate --noinput
echo "✓ Migrations completed"

# Collect static files (in case new ones were added)
echo "Collecting static files..."
python manage.py collectstatic --noinput --clear
echo "✓ Static files collected"

# Create cache table if it doesn't exist
echo "Setting up cache tables..."
python manage.py createcachetable 2>/dev/null || echo "Cache table already exists"

echo "======================================"
echo "  Starting Gunicorn Server"
echo "======================================"

# Execute the main command (gunicorn)
exec "$@"
