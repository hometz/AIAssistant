#!/bin/sh

/bin/ollama serve &
sleep 5

echo "Подготовка локальной модели эмбеддингов..."
ollama pull nomic-embed-text-v2-moe

echo "Ollama готова к работе!"
wait $!