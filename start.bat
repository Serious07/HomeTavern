@echo off
chcp 65001 >nul
echo ========================================
echo   HomeTavern - Запуск приложения
echo ========================================
echo.
echo Сборка translation-library...
cd translation-library\nodejs
call npm run build
cd ..\..
echo.
echo Сборка llm-client...
cd llm-client\nodejs
call npm run build
cd ..\..
echo.
echo Сборка фронтенда...
call npm run build:client
echo.
echo Сборка бэкенда...
call npm run build:server
echo.
echo Запускаю фронтенд и бэкенд одновременно...
echo.
call npm run dev
echo.
echo ========================================
echo   Приложение остановлено
echo ========================================
pause
