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

type AppRecord struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
	Date   int64  `json:"date"`
}

type User struct {
	ID         string      `json:"id"`
	Username   string      `json:"username"`
	Email      string      `json:"email"`
	Password   string      `json:"password"`
	Role       string      `json:"role"`
	AppStatus  string      `json:"app_status"`
	AppHistory []AppRecord `json:"app_history"`
}

type Track struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Author        string   `json:"author"`
	Collaborators []string `json:"collaborators"`
	Feats         []string `json:"feats"`
	Cover         string   `json:"cover"`
	FileName      string   `json:"file_name"`
	Plays         int      `json:"plays"`
	Hidden        bool     `json:"hidden"`
	ReleaseDate   int64    `json:"release_date"`
}

var (
	dbMu       sync.RWMutex
	usersPath  = "./storage/users.json"
	tracksPath = "./storage/db.json"
)

func readUsers() []User {
	dbMu.RLock()
	defer dbMu.RUnlock()
	data, _ := os.ReadFile(usersPath)
	var users []User
	json.Unmarshal(data, &users)
	return users
}

func writeUsers(users []User) {
	dbMu.Lock()
	defer dbMu.Unlock()
	data, _ := json.MarshalIndent(users, "", "  ")
	os.WriteFile(usersPath, data, 0644)
}

func readTracks() []Track {
	dbMu.RLock()
	defer dbMu.RUnlock()
	data, _ := os.ReadFile(tracksPath)
	var tracks []Track
	json.Unmarshal(data, &tracks)
	return tracks
}

func writeTracks(tracks []Track) {
	dbMu.Lock()
	defer dbMu.Unlock()
	data, _ := json.MarshalIndent(tracks, "", "  ")
	os.WriteFile(tracksPath, data, 0644)
}

func main() {
	os.MkdirAll("./storage/audio", os.ModePerm)
	os.MkdirAll("./storage/covers", os.ModePerm)
	if _, err := os.Stat(usersPath); os.IsNotExist(err) {
		writeUsers([]User{})
	}
	if _, err := os.Stat(tracksPath); os.IsNotExist(err) {
		writeTracks([]Track{})
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir("./frontend")))
	mux.Handle("/covers/", http.StripPrefix("/covers/", http.FileServer(http.Dir("./storage/covers"))))

	mux.HandleFunc("/api/stream", streamAudioHandler)
	mux.HandleFunc("/api/tracks", getTracksHandler)
	mux.HandleFunc("/api/login", loginHandler)
	mux.HandleFunc("/api/register", registerHandler)
	mux.HandleFunc("/api/upload", uploadHandler)
	mux.HandleFunc("/api/apply", applyArtistHandler)
	mux.HandleFunc("/api/admin/apps", getApplicationsHandler)
	mux.HandleFunc("/api/admin/resolve", resolveAppHandler)
	mux.HandleFunc("/api/admin/track", adminTrackHandler)
	mux.HandleFunc("/api/artist", getArtistProfileHandler)
	mux.HandleFunc("/api/artists", getArtistsListHandler)
	mux.HandleFunc("/api/staff", getStaffHandler)

	log.Println("Сервер запущен на http://localhost:8080")
	http.ListenAndServe(":8080", mux)
}

func streamAudioHandler(w http.ResponseWriter, r *http.Request) {
	trackID := r.URL.Query().Get("id")
	tracks := readTracks()
	for i, t := range tracks {
		if t.FileName == trackID {
			tracks[i].Plays++
			writeTracks(tracks)
			break
		}
	}
	http.ServeFile(w, r, filepath.Join(".", "storage", "audio", trackID+".mp3"))
}

func getTracksHandler(w http.ResponseWriter, r *http.Request) {
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
	req.AppHistory = []AppRecord{}
	writeUsers(append(users, req))
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

	collabsRaw := r.FormValue("collaborators")
	featsRaw := r.FormValue("feats")
	var collabs, feats []string
	if collabsRaw != "" {
		collabs = strings.Split(collabsRaw, ",")
	}
	if featsRaw != "" {
		feats = strings.Split(featsRaw, ",")
	}

	releaseDate := int64(0)
	if rd := r.FormValue("release_date"); rd != "" {
		t, err := time.Parse("2006-01-02T15:04", rd)
		if err == nil {
			releaseDate = t.Unix()
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
		Hidden:        false,
		ReleaseDate:   releaseDate,
	}
	writeTracks(append(readTracks(), newTrack))
	w.WriteHeader(http.StatusCreated)
}

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

func getApplicationsHandler(w http.ResponseWriter, r *http.Request) {
	var apps []User
	for _, u := range readUsers() {
		if u.AppStatus == "pending" {
			apps = append(apps, u)
		}
	}
	json.NewEncoder(w).Encode(apps)
}

func resolveAppHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username, Action, Reason string }
	json.NewDecoder(r.Body).Decode(&req)
	users := readUsers()
	for i, u := range users {
		if u.Username == req.Username {
			record := AppRecord{Date: time.Now().Unix()}
			if req.Action == "approve" {
				users[i].AppStatus = "approved"
				users[i].Role = "artist"
				record.Status = "Одобрено"
				record.Reason = "Заявка принята администратором"
			} else {
				users[i].AppStatus = "rejected"
				record.Status = "Отклонено"
				record.Reason = req.Reason
			}
			users[i].AppHistory = append(users[i].AppHistory, record)
			writeUsers(users)
			return
		}
	}
}

func adminTrackHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ TrackID, Action, NewTitle string }
	json.NewDecoder(r.Body).Decode(&req)
	tracks := readTracks()
	for i, t := range tracks {
		if t.ID == req.TrackID {
			if req.Action == "delete" {
				tracks = append(tracks[:i], tracks[i+1:]...)
			} else if req.Action == "toggle_hide" {
				tracks[i].Hidden = !tracks[i].Hidden
			} else if req.Action == "edit_title" {
				tracks[i].Title = req.NewTitle
			}
			writeTracks(tracks)
			return
		}
	}
}

func getArtistProfileHandler(w http.ResponseWriter, r *http.Request) {
	artistName := r.URL.Query().Get("name")
	var artistTracks []Track
	totalPlays := 0
	for _, t := range readTracks() {
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
		"name": artistName, "total_tracks": len(artistTracks), "total_plays": totalPlays, "tracks": artistTracks,
	})
}

func getArtistsListHandler(w http.ResponseWriter, r *http.Request) {
	var artists []string
	for _, u := range readUsers() {
		if u.Role == "artist" || u.Role == "admin" {
			artists = append(artists, u.Username)
		}
	}
	json.NewEncoder(w).Encode(artists)
}

func getStaffHandler(w http.ResponseWriter, r *http.Request) {
	var staff []User
	for _, u := range readUsers() {
		if u.Role == "admin" {
			staff = append(staff, u)
		}
	}
	json.NewEncoder(w).Encode(staff)
}
