@echo off
echo ================================================
echo  KanbanApp - Setup inicial
echo ================================================
echo.

echo [1/4] Instalando dependencias do backend...
cd backend
call npm install
if errorlevel 1 ( echo ERRO no backend & pause & exit /b 1 )

echo.
echo [2/4] Gerando banco de dados SQLite...
call npx prisma db push
if errorlevel 1 ( echo ERRO no banco de dados & pause & exit /b 1 )

echo.
echo [3/4] Instalando dependencias do frontend...
cd ..\frontend
call npm install
if errorlevel 1 ( echo ERRO no frontend & pause & exit /b 1 )

echo.
echo ================================================
echo  Setup concluido com sucesso!
echo  Agora execute: start.bat
echo ================================================
pause
