package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"resonance/internal/models"
	"resonance/internal/repository"
)

func main() {
	mux := http.NewServeMux()

	trackRepo := repository.NewJSONTrackRepo("./storage/db.json")
	userRepo := repository.NewJSONUserRepo("./storage/users.json")

	fs := http.FileServer(http.Dir("./frontend"))
	mux.Handle("/", fs)

	mux.HandleFunc("/api/stream", streamAudioHandler)

	mux.HandleFunc("/api/tracks", func(w http.ResponseWriter, r *http.Request) {
		getTracksHandler(w, r, trackRepo)
	})

	mux.HandleFunc("/api/login", func(w http.ResponseWriter, r *http.Request) {
		loginHandler(w, r, userRepo)
	})

	// Новый маршрут для загрузки треков (Админка)
	mux.HandleFunc("/api/upload", func(w http.ResponseWriter, r *http.Request) {
		uploadHandler(w, r, trackRepo)
	})

	port := ":8080"
	log.Printf("Сервер Resonance запущен на http://localhost%s\n", port)

	err := http.ListenAndServe(port, mux)
	if err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
}

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

func getTracksHandler(w http.ResponseWriter, r *http.Request, repo repository.TrackRepository) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")

	tracks, err := repo.GetAll()
	if err != nil {
		http.Error(w, "Ошибка чтения базы данных", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(tracks)
}

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

// Обработчик загрузки нового трека
func uploadHandler(w http.ResponseWriter, r *http.Request, repo repository.TrackRepository) {
	if r.Method != http.MethodPost {
		http.Error(w, "Только POST", http.StatusMethodNotAllowed)
		return
	}

	// Парсим multipart форму (лимит 20 МБ)
	err := r.ParseMultipartForm(20 << 20)
	if err != nil {
		http.Error(w, "Ошибка парсинга формы", http.StatusBadRequest)
		return
	}

	title := r.FormValue("title")
	author := r.FormValue("author")
	cover := r.FormValue("cover")

	// Получаем файл из поля "audio_file"
	file, _, err := r.FormFile("audio_file")
	if err != nil {
		http.Error(w, "Ошибка получения файла", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Генерируем уникальный ID на основе времени (например: t_1690000000)
	trackID := fmt.Sprintf("t_%d", time.Now().Unix())
	fileName := trackID

	// Путь сохранения: ./storage/audio/t_1690000000.mp3
	audioPath := filepath.Join(".", "storage", "audio", fileName+".mp3")
	dst, err := os.Create(audioPath)
	if err != nil {
		http.Error(w, "Ошибка сохранения файла на сервере", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Копируем байты из загруженного файла на диск
	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Ошибка записи файла", http.StatusInternalServerError)
		return
	}

	// Создаем модель и сохраняем в JSON
	newTrack := models.Track{
		ID:       trackID,
		Title:    title,
		Author:   author,
		Cover:    cover,
		FileName: fileName,
	}

	if err := repo.Add(newTrack); err != nil {
		http.Error(w, "Ошибка сохранения в БД", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Write([]byte(`{"status": "успешно"}`))
}
