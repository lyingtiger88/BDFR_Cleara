@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 18+ is required.& pause & exit /b 1)
start "" http://127.0.0.1:4177
node server.js
endlocal
