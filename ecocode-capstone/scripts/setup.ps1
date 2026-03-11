$ErrorActionPreference = "Stop"

Write-Host "Setting up EcoCode backend..."
Set-Location "$PSScriptRoot\..\backend"
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

Write-Host "Setting up EcoCode frontend..."
Set-Location "$PSScriptRoot\..\frontend"
npm install

Write-Host "Setup complete."
