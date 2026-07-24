package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"resonance/internal/models"
	"resonance/internal/repository"
)

func main() {
	mux := http.NewServeMux()

	// Инициализируем репозитории
	trackRepo := repository.NewJSONTrackRepo("./storage/db.json")
	userRepo := repository.NewJSONUserRepo("./storage/users.json")

	// Раздача статики фронтенда
	fs := http.FileServer(http.Dir("./frontend"))
	mux.Handle("/", fs)

	// API маршруты
	mux.HandleFunc("/api/stream", streamAudioHandler)

	mux.HandleFunc("/api/tracks", func(w http.ResponseWriter, r *http.Request) {
		getTracksHandler(w, r, trackRepo)
	})

	mux.HandleFunc("/api/login", func(w http.ResponseWriter, r *http.Request) {
		loginHandler(w, r, userRepo)
	})

	port := ":8080"
	log.Printf("Сервер Resonance запущен на http://localhost%s\n", port)

	err := http.ListenAndServe(port, mux)
	if err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
}

// Обработчик стриминга аудио
func streamAudioHandler(w http.ResponseWriter, r *http.Request) {
	trackID := r.URL.Query().Get("id")
	if trackID == "" {
		http.Error(w, "Не указан ID трека", http.StatusBadRequest)
		return
	}

	audioPath := filepath.Join(".", "storage", "audio", trackID+".mp3")

	if _, err := os.Stat(audioPath); os.IsNotExist(err) {
		http.Error(w, "Трек не найден", http.StatusNotFound)
		return
	}

	http.ServeFile(w, r, audioPath)
}

// Обработчик получения всех треков
func getTracksHandler(w http.ResponseWriter, r *http.Request, repo repository.TrackRepository) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")

	tracks, err := repo.GetAll()
	if err != nil {
		http.Error(w, "Ошибка чтения базы данных", http.StatusInternalServerError)
		log.Printf("Ошибка получения треков: %v", err)
		return
	}

	json.NewEncoder(w).Encode(tracks)
}

// Обработчик авторизации
func loginHandler(w http.ResponseWriter, r *http.Request, repo repository.UserRepository) {
	if r.Method != http.MethodPost {
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Неверный формат запроса"}`, http.StatusBadRequest)
		return
	}

	user, err := repo.GetByUsername(req.Username)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error": "Неверный логин или пароль"}`))
		return
	}

	if user.Password != req.Password {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error": "Неверный логин или пароль"}`))
		return
	}

	response := models.LoginResponse{
		ID:       user.ID,
		Username: user.Username,
		Role:     user.Role,
	}

	json.NewEncoder(w).Encode(response)
}
