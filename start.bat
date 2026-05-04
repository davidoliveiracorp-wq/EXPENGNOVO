@echo off
echo ================================================
echo  KanbanApp - Iniciando servidores
echo ================================================
echo.
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Pressione Ctrl+C em cada janela para parar.
echo ================================================

start "KanbanApp - Backend" cmd /k "cd /d %~dp0backend && npm run dev"
timeout /t 2 /nobreak >nul
start "KanbanApp - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Servidores iniciados! Acesse: http://localhost:5173
pause
