@echo off
setlocal

set "ROOT=C:\Users\rglei\OneDrive\Desktop\Sgcg"

start "frontend" cmd /k "cd /d %ROOT%\frontend && npm run dev"
start "backend" cmd /k "cd /d %ROOT% && set APP_ENV=development && set FLASK_DEBUG=true && %ROOT%\.venv\Scripts\python.exe -m backend.app"

echo Started frontend and backend in development mode.
echo Frontend: http://localhost:5173
echo Backend:  http://127.0.0.1:5000

endlocal
