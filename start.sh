#!/bin/bash

# UTF-8 locale support
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Header banner
echo "========================================"
echo "  HomeTavern - Запуск приложения"
echo "========================================"
echo ""
echo "Запускаю фронтенд и бэкенд одновременно..."
echo ""

# Kill processes on port 3000 (frontend/Vite)
if [ ! -z "$(lsof -ti:3000)" ]; then
    echo "Killing process on port 3000..."
    kill -9 $(lsof -ti:3000)
fi

# Kill processes on port 4000 (backend)
if [ ! -z "$(lsof -ti:4000)" ]; then
    echo "Killing process on port 4000..."
    kill -9 $(lsof -ti:4000)
fi

# Run the application
npm run dev

# Footer banner
echo ""
echo "========================================"
echo "  Приложение остановлено"
echo "========================================"

# Wait for user input before exiting
read -p "Нажмите Enter для выхода..."
