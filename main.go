package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// --- МОДЕЛИ ДАННЫХ ---
type Track struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Author        string   `json:"author"`
	Collaborators []string `json:"collaborators"` // Соавторы (&)
	Feats         []string `json:"feats"`         // При участии (feat.)
	Cover         string   `json:"cover"`
	FileName      string   `json:"file_name"`
	Plays         int      `json:"plays"` // Прослушивания
	Likes         int      `json:"likes"`
}

type User struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	Role      string `json:"role"`       // user, artist, admin
	AppStatus string `json:"app_status"` // none, pending, approved, rejected
	AppReason string `json:"app_reason"` // Причина отказа
}

// --- БАЗА ДАННЫХ (In-Memory + JSON) ---
var (
	dbMu       sync.RWMutex
	usersPath  = "./storage/users.json"
	tracksPath = "./storage/db.json"
)

func readUsers() []User {
	dbMu.RLock()
	defer dbMu.RUnlock()
	data, err := os.ReadFile(usersPath)
	var users []User
	if err == nil {
		json.Unmarshal(data, &users)
	}
	return users
}

func writeUsers(users []User) error {
	dbMu.Lock()
	defer dbMu.Unlock()
	data, _ := json.MarshalIndent(users, "", "  ")
	return os.WriteFile(usersPath, data, 0644)
}

func readTracks() []Track {
	dbMu.RLock()
	defer dbMu.RUnlock()
	data, err := os.ReadFile(tracksPath)
	var tracks []Track
	if err == nil {
		json.Unmarshal(data, &tracks)
	}
	return tracks
}

func writeTracks(tracks []Track) error {
	dbMu.Lock()
	defer dbMu.Unlock()
	data, _ := json.MarshalIndent(tracks, "", "  ")
	return os.WriteFile(tracksPath, data, 0644)
}

// --- СЕРВЕР И РОУТИНГ ---
func main() {
	os.MkdirAll(filepath.Join(".", "storage", "audio"), os.ModePerm)
	os.MkdirAll(filepath.Join(".", "storage", "covers"), os.ModePerm)

	// Если файлов БД нет, создаем пустые массивы
	if _, err := os.Stat(usersPath); os.IsNotExist(err) {
		writeUsers([]User{})
	}
	if _, err := os.Stat(tracksPath); os.IsNotExist(err) {
		writeTracks([]Track{})
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir("./frontend")))
	mux.Handle("/covers/", http.StripPrefix("/covers/", http.FileServer(http.Dir("./storage/covers"))))

	// API Маршруты
	mux.HandleFunc("/api/stream", streamAudioHandler)
	mux.HandleFunc("/api/tracks", getTracksHandler)
	mux.HandleFunc("/api/login", loginHandler)
	mux.HandleFunc("/api/register", registerHandler)
	mux.HandleFunc("/api/upload", uploadHandler)

	// Новые фичи
	mux.HandleFunc("/api/apply", applyArtistHandler)          // Подать заявку
	mux.HandleFunc("/api/admin/apps", getApplicationsHandler) // Админка: список заявок
	mux.HandleFunc("/api/admin/resolve", resolveAppHandler)   // Админка: одобрить/отклонить
	mux.HandleFunc("/api/artist", getArtistProfileHandler)    // Профиль артиста
	mux.HandleFunc("/api/staff", getStaffHandler)             // Контакты (администрация)

	port := ":8080"
	log.Printf("Сервер запущен на http://localhost%s\n", port)
	http.ListenAndServe(port, mux)
}

// --- ОБРАБОТЧИКИ ---

func streamAudioHandler(w http.ResponseWriter, r *http.Request) {
	trackID := r.URL.Query().Get("id")
	audioPath := filepath.Join(".", "storage", "audio", trackID+".mp3")

	// Засчитываем прослушивание при запросе аудио
	tracks := readTracks()
	for i, t := range tracks {
		if t.FileName == trackID {
			tracks[i].Plays++
			writeTracks(tracks)
			break
		}
	}

	http.ServeFile(w, r, audioPath)
}

func getTracksHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(readTracks())
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username, Password string }
	json.NewDecoder(r.Body).Decode(&req)

	for _, u := range readUsers() {
		if u.Username == req.Username && u.Password == req.Password {
			json.NewEncoder(w).Encode(u)
			return
		}
	}
	http.Error(w, `{"error": "Неверный логин или пароль"}`, http.StatusUnauthorized)
}

func registerHandler(w http.ResponseWriter, r *http.Request) {
	var req User
	json.NewDecoder(r.Body).Decode(&req)

	users := readUsers()
	for _, u := range users {
		if u.Username == req.Username {
			http.Error(w, `{"error": "Пользователь уже существует"}`, http.StatusBadRequest)
			return
		}
	}

	req.ID = fmt.Sprintf("u_%d", time.Now().Unix())
	req.Role = "user"
	req.AppStatus = "none"
	users = append(users, req)
	writeUsers(users)
	json.NewEncoder(w).Encode(req)
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(20 << 20)
	trackID := fmt.Sprintf("t_%d", time.Now().Unix())

	coverFile, coverHeader, _ := r.FormFile("cover_file")
	defer coverFile.Close()
	coverExt := filepath.Ext(coverHeader.Filename)
	dstCover, _ := os.Create(filepath.Join(".", "storage", "covers", trackID+coverExt))
	io.Copy(dstCover, coverFile)
	dstCover.Close()

	audioFile, _, _ := r.FormFile("audio_file")
	defer audioFile.Close()
	dstAudio, _ := os.Create(filepath.Join(".", "storage", "audio", trackID+".mp3"))
	io.Copy(dstAudio, audioFile)
	dstAudio.Close()

	// Парсинг коллабораций и фитов
	collabsRaw := r.FormValue("collaborators")
	featsRaw := r.FormValue("feats")
	var collabs, feats []string
	if collabsRaw != "" {
		for _, c := range strings.Split(collabsRaw, ",") {
			collabs = append(collabs, strings.TrimSpace(c))
		}
	}
	if featsRaw != "" {
		for _, f := range strings.Split(featsRaw, ",") {
			feats = append(feats, strings.TrimSpace(f))
		}
	}

	newTrack := Track{
		ID:            trackID,
		Title:         r.FormValue("title"),
		Author:        r.FormValue("author"),
		Collaborators: collabs,
		Feats:         feats,
		Cover:         "/covers/" + trackID + coverExt,
		FileName:      trackID,
		Plays:         0,
	}

	tracks := readTracks()
	writeTracks(append(tracks, newTrack))
	w.WriteHeader(http.StatusCreated)
}

// Заявка на артиста
func applyArtistHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username string }
	json.NewDecoder(r.Body).Decode(&req)

	users := readUsers()
	for i, u := range users {
		if u.Username == req.Username {
			users[i].AppStatus = "pending"
			writeUsers(users)
			json.NewEncoder(w).Encode(users[i])
			return
		}
	}
}

// Список заявок для админа
func getApplicationsHandler(w http.ResponseWriter, r *http.Request) {
	var apps []User
	for _, u := range readUsers() {
		if u.AppStatus == "pending" || u.AppStatus == "rejected" {
			apps = append(apps, u)
		}
	}
	json.NewEncoder(w).Encode(apps)
}

// Одобрение/Отклонение заявки
func resolveAppHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username, Action, Reason string }
	json.NewDecoder(r.Body).Decode(&req)

	users := readUsers()
	for i, u := range users {
		if u.Username == req.Username {
			if req.Action == "approve" {
				users[i].AppStatus = "approved"
				users[i].Role = "artist"
			} else {
				users[i].AppStatus = "rejected"
				users[i].AppReason = req.Reason
			}
			writeUsers(users)
			return
		}
	}
}

// Профиль артиста
func getArtistProfileHandler(w http.ResponseWriter, r *http.Request) {
	artistName := r.URL.Query().Get("name")

	var artistTracks []Track
	totalPlays := 0

	for _, t := range readTracks() {
		// Считаем трек, если артист - основной автор, коллаборатор или фит
		isArtist := t.Author == artistName
		for _, c := range t.Collaborators {
			if c == artistName {
				isArtist = true
			}
		}
		for _, f := range t.Feats {
			if f == artistName {
				isArtist = true
			}
		}

		if isArtist {
			artistTracks = append(artistTracks, t)
			totalPlays += t.Plays
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"name":         artistName,
		"total_tracks": len(artistTracks),
		"total_plays":  totalPlays,
		"tracks":       artistTracks,
	})
}

// Список администрации
func getStaffHandler(w http.ResponseWriter, r *http.Request) {
	var staff []User
	for _, u := range readUsers() {
		if u.Role == "admin" {
			staff = append(staff, u)
		}
	}
	json.NewEncoder(w).Encode(staff)
}
