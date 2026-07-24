package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
)

func main() {
	// Создаем роутер
	mux := http.NewServeMux()

	// 1. Раздача фронтенда (HTML, CSS, JS)
	// http.FileServer берет файлы из папки ./frontend и отдает их браузеру
	fs := http.FileServer(http.Dir("./frontend"))
	mux.Handle("/", fs)

	// 2. API для стриминга аудио
	mux.HandleFunc("/api/stream", streamAudioHandler)

	// Запуск сервера
	port := ":8080"
	log.Printf("Сервер Resonance запущен на http://localhost%s\n", port)

	err := http.ListenAndServe(port, mux)
	if err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
}

// Обработчик стриминга аудио
func streamAudioHandler(w http.ResponseWriter, r *http.Request) {
	// Получаем ID трека из URL, например: /api/stream?id=test
	trackID := r.URL.Query().Get("id")
	if trackID == "" {
		http.Error(w, "Не указан ID трека", http.StatusBadRequest)
		return
	}

	// Формируем путь к файлу.
	// В будущем здесь будет запрос к JSON БД, чтобы получить реальный путь
	audioPath := filepath.Join(".", "storage", "audio", trackID+".mp3")

	// Проверяем, существует ли файл
	if _, err := os.Stat(audioPath); os.IsNotExist(err) {
		http.Error(w, "Трек не найден", http.StatusNotFound)
		return
	}

	// Магия Go: http.ServeFile автоматически обрабатывает заголовки Range,
	// отдает Content-Type (audio/mpeg) и позволяет перематывать трек в браузере.
	http.ServeFile(w, r, audioPath)
}
