#!/bin/bash

# Прод-режим HomeTavern: собранная сборка вместо dev-сервера.
#
# Зачем, если есть start.sh:
#   - в прод-сборке нет React StrictMode, который рендерит каждый компонент
#     дважды, и нет dev-оверхеда React;
#   - бандл минифицирован, а console.* из него вырезан (логи удерживают в памяти
#     всё выведенное, а на длинной сессии их много);
#   - dev-сервер отдаёт исходные модули по одному и держит HMR-воркер.
# На слабом устройстве разница заметна именно в прокрутке и наборе текста.
#
# Dev-режим по-прежнему запускается обычным: ./start.sh

# UTF-8 locale support
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "========================================"
echo "  HomeTavern - прод-режим"
echo "========================================"
echo ""

# Kill processes on port 3000 (frontend) and 4000 (backend) - как в start.sh
if [ ! -z "$(lsof -ti:3000)" ]; then
    echo "Killing process on port 3000..."
    kill -9 $(lsof -ti:3000)
fi

if [ ! -z "$(lsof -ti:4000)" ]; then
    echo "Killing process on port 4000..."
    kill -9 $(lsof -ti:4000)
fi

echo "Собираю сервер и клиент..."
npm run build
if [ $? -ne 0 ]; then
    echo "Сборка упала - запуск прерван, см. вывод выше."
    exit 1
fi

echo ""
echo "Поднимаю бэкенд на :4000..."
(cd server && npm start) &
SERVER_PID=$!

# Даём бэкенду подняться, иначе первая загрузка упрётся в пустой API
sleep 3

# При Ctrl+C снимаем и бэкенд, иначе он останется висеть на :4000
trap "kill $SERVER_PID 2>/dev/null" EXIT

IP=$(hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo "  Телефон в той же сети: http://${IP:-localhost}:3000/"
echo "  Остановить: Ctrl+C"
echo ""
echo "  После случайного падения вкладки («Опаньки…») откройте консоль"
echo "  и выполните __htDiagDump() - там следы событий до краха."
echo ""

# Хост и порт уже прописаны в vite.config.ts (preview), отдельный флаг не нужен
(cd client && npm run preview)

kill $SERVER_PID 2>/dev/null

echo ""
echo "========================================"
echo "  Приложение остановлено"
echo "========================================"

read -p "Нажмите Enter для выхода..."