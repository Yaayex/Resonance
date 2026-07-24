package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"resonance/internal/repository" // Не забудь поменять "resonance" на свой модуль
)

func main() {
	mux := http.NewServeMux()

	// Инициализируем наш репозиторий
	trackRepo := repository.NewJSONTrackRepo("./storage/db.json")

	fs := http.FileServer(http.Dir("./frontend"))
	mux.Handle("/", fs)

	// API маршруты
	mux.HandleFunc("/api/stream", streamAudioHandler)

	// Новый маршрут для получения списка треков
	mux.HandleFunc("/api/tracks", func(w http.ResponseWriter, r *http.Request) {
		getTracksHandler(w, r, trackRepo)
	})

	port := ":8080"
	log.Printf("Сервер Resonance запущен на http://localhost%s\n", port)

	err := http.ListenAndServe(port, mux)
	if err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
}

// Обработчик получения всех треков
func getTracksHandler(w http.ResponseWriter, r *http.Request, repo repository.TrackRepository) {
	// Запрещаем кэширование JSON ответа (чтобы при добавлении треков список сразу обновлялся)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")

	tracks, err := repo.GetAll()
	if err != nil {
		http.Error(w, "Ошибка чтения базы данных", http.StatusInternalServerError)
		log.Printf("Ошибка получения треков: %v", err)
		return
	}

	// Кодируем структуру Go обратно в JSON и отправляем клиенту
	json.NewEncoder(w).Encode(tracks)
}

// ... streamAudioHandler остается без изменений ...
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
