#!/bin/bash

set -e

echo "=== Setting up Django backend ==="

# 1️⃣ Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Install with Homebrew: brew install python"
    exit 1
fi

# 2️⃣ Create virtual environment if missing
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# 3️⃣ Activate virtual environment
source venv/bin/activate

# 4️⃣ Upgrade pip & install dependencies
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

if [ -f "requirements.txt" ]; then
    echo "📥 Installing dependencies..."
    pip install -r requirements.txt
else
    echo "⚠️ No requirements.txt found! Skipping dependency installation."
fi

# 5️⃣ Apply migrations
echo "🛠 Applying database migrations..."
python manage.py migrate

# 6️⃣ Ensure user 'samuel' exists
echo "👤 Checking for user 'samuel'..."
python manage.py shell <<EOF
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username="samuel").exists():
    print("🔑 Creating user 'samuel' with password 'password677'...")
    User.objects.create_superuser("samuel", "samuel@example.com", "password677")
else:
    print("✅ User 'samuel' already exists.")
EOF

# 7️⃣ Start server
echo "🚀 Starting Django development server at http://127.0.0.1:8000..."
python manage.py runserver
