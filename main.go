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
	os.MkdirAll(filepath.Join(".", "storage", "audio"), os.ModePerm)
	os.MkdirAll(filepath.Join(".", "storage", "covers"), os.ModePerm)

	mux := http.NewServeMux()
	trackRepo := repository.NewJSONTrackRepo("./storage/db.json")
	userRepo := repository.NewJSONUserRepo("./storage/users.json")

	mux.Handle("/", http.FileServer(http.Dir("./frontend")))
	mux.Handle("/covers/", http.StripPrefix("/covers/", http.FileServer(http.Dir("./storage/covers"))))

	mux.HandleFunc("/api/stream", streamAudioHandler)
	mux.HandleFunc("/api/tracks", func(w http.ResponseWriter, r *http.Request) { getTracksHandler(w, r, trackRepo) })
	mux.HandleFunc("/api/login", func(w http.ResponseWriter, r *http.Request) { loginHandler(w, r, userRepo) })
	mux.HandleFunc("/api/register", func(w http.ResponseWriter, r *http.Request) { registerHandler(w, r, userRepo) })
	mux.HandleFunc("/api/upload", func(w http.ResponseWriter, r *http.Request) { uploadHandler(w, r, trackRepo) })

	port := ":8080"
	log.Printf("Сервер запущен на http://localhost%s\n", port)
	http.ListenAndServe(port, mux)
}

func streamAudioHandler(w http.ResponseWriter, r *http.Request) {
	trackID := r.URL.Query().Get("id")
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
	tracks, _ := repo.GetAll()
	json.NewEncoder(w).Encode(tracks)
}

func loginHandler(w http.ResponseWriter, r *http.Request, repo repository.UserRepository) {
	var req models.LoginRequest
	json.NewDecoder(r.Body).Decode(&req)
	user, err := repo.GetByUsername(req.Username)
	if err != nil || user.Password != req.Password {
		http.Error(w, `{"error": "Неверный логин или пароль"}`, http.StatusUnauthorized)
		return
	}
	json.NewEncoder(w).Encode(models.LoginResponse{ID: user.ID, Username: user.Username, Email: user.Email, Role: user.Role})
}

func registerHandler(w http.ResponseWriter, r *http.Request, repo repository.UserRepository) {
	var req models.RegisterRequest
	json.NewDecoder(r.Body).Decode(&req)
	newUser := models.User{
		ID:       fmt.Sprintf("u_%d", time.Now().Unix()),
		Username: req.Username,
		Email:    req.Email,
		Password: req.Password,
		Role:     "user", // По умолчанию все обычные слушатели
	}
	if err := repo.AddUser(newUser); err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), http.StatusBadRequest)
		return
	}
	json.NewEncoder(w).Encode(models.LoginResponse{ID: newUser.ID, Username: newUser.Username, Email: newUser.Email, Role: newUser.Role})
}

func uploadHandler(w http.ResponseWriter, r *http.Request, repo repository.TrackRepository) {
	r.ParseMultipartForm(20 << 20)
	trackID := fmt.Sprintf("t_%d", time.Now().Unix())

	coverFile, coverHeader, _ := r.FormFile("cover_file")
	defer coverFile.Close()
	coverExt := filepath.Ext(coverHeader.Filename)
	coverPath := filepath.Join(".", "storage", "covers", trackID+coverExt)
	dstCover, _ := os.Create(coverPath)
	io.Copy(dstCover, coverFile)
	dstCover.Close()

	audioFile, _, _ := r.FormFile("audio_file")
	defer audioFile.Close()
	audioPath := filepath.Join(".", "storage", "audio", trackID+".mp3")
	dstAudio, _ := os.Create(audioPath)
	io.Copy(dstAudio, audioFile)
	dstAudio.Close()

	newTrack := models.Track{
		ID:       trackID,
		Title:    r.FormValue("title"),
		Author:   r.FormValue("author"),
		Cover:    "/covers/" + trackID + coverExt,
		FileName: trackID,
	}
	repo.Add(newTrack)
	w.WriteHeader(http.StatusCreated)
}
