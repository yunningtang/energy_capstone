#!/usr/bin/env bash
set -euo pipefail

echo "Setting up EcoCode backend..."
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

echo "Setting up EcoCode frontend..."
cd ../frontend
npm install

echo "Done."
