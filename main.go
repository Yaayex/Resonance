package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/smtp"
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
	ID               string      `json:"id"`
	Username         string      `json:"username"`
	Email            string      `json:"email"`
	Password         string      `json:"password,omitempty"`
	Role             string      `json:"role"`
	AppStatus        string      `json:"app_status"`
	AppHistory       []AppRecord `json:"app_history"`
	IsVerified       bool        `json:"is_verified"`
	VerificationCode string      `json:"verification_code,omitempty"`
	LikedTracks      []string    `json:"liked_tracks"`
}

type Track struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Author        string   `json:"author"`
	Collaborators []string `json:"collaborators"`
	Feats         []string `json:"feats"`
	Genre         string   `json:"genre"`
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

func init() {
	rand.Seed(time.Now().UnixNano())
}

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

func sendVerificationEmail(toEmail, code string) {
	from := "ТВОЙ_GMAIL@gmail.com"
	password := "ТВОЙ_ПАРОЛЬ_ПРИЛОЖЕНИЙ"
	smtpHost := "smtp.gmail.com"
	smtpPort := "587"

	htmlBody := fmt.Sprintf(`
	<!DOCTYPE html>
	<html>
	<body style="background-color: #000000; color: #ffffff; font-family: -apple-system, sans-serif; padding: 40px; text-align: center;">
		<h1 style="color: #FA243C; margin-bottom: 5px;">Resonance</h1>
		<p style="color: #8E8E93; font-size: 16px;">Ваш код подтверждения:</p>
		<div style="background-color: #1C1C1E; color: #FFFFFF; padding: 15px 30px; border-radius: 14px; display: inline-block; font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 20px 0; border: 1px solid #2C2C2E;">
			%s
		</div>
	</body>
	</html>`, code)

	msg := []byte("From: Resonance <" + from + ">\r\n" +
		"To: " + toEmail + "\r\n" +
		"Subject: Код подтверждения Resonance\r\n" +
		"MIME-version: 1.0;\r\n" +
		"Content-Type: text/html; charset=\"UTF-8\";\r\n\r\n" +
		htmlBody)

	auth := smtp.PlainAuth("", from, password, smtpHost)
	err := smtp.SendMail(smtpHost+":"+smtpPort, auth, from, []string{toEmail}, msg)
	if err != nil {
		log.Println("Ошибка отправки email:", err)
	}
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
	mux.HandleFunc("/api/verify", verifyHandler)
	mux.HandleFunc("/api/settings/email", changeEmailHandler)
	mux.HandleFunc("/api/upload", uploadHandler)
	mux.HandleFunc("/api/apply", applyArtistHandler)
	mux.HandleFunc("/api/like", toggleLikeHandler)

	mux.HandleFunc("/api/admin/stats", adminStatsHandler)
	mux.HandleFunc("/api/admin/users", getAllUsersHandler)
	mux.HandleFunc("/api/admin/user_action", adminUserActionHandler)
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
	req.LikedTracks = []string{}
	req.IsVerified = false
	req.VerificationCode = fmt.Sprintf("%06d", rand.Intn(1000000))

	writeUsers(append(users, req))
	go sendVerificationEmail(req.Email, req.VerificationCode)
	json.NewEncoder(w).Encode(req)
}

func verifyHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username, Code string }
	json.NewDecoder(r.Body).Decode(&req)
	users := readUsers()
	for i, u := range users {
		if u.Username == req.Username {
			if u.VerificationCode == req.Code {
				users[i].IsVerified = true
				writeUsers(users)
				json.NewEncoder(w).Encode(users[i])
				return
			}
			http.Error(w, `{"error": "Неверный код"}`, http.StatusBadRequest)
			return
		}
	}
	http.Error(w, `{"error": "Пользователь не найден"}`, http.StatusNotFound)
}

func changeEmailHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username, NewEmail string }
	json.NewDecoder(r.Body).Decode(&req)
	users := readUsers()
	for i, u := range users {
		if u.Username == req.Username {
			users[i].Email = req.NewEmail
			users[i].IsVerified = false
			users[i].VerificationCode = fmt.Sprintf("%06d", rand.Intn(1000000))
			writeUsers(users)
			go sendVerificationEmail(req.NewEmail, users[i].VerificationCode)
			json.NewEncoder(w).Encode(users[i])
			return
		}
	}
	http.Error(w, `{"error": "Пользователь не найден"}`, http.StatusNotFound)
}

func toggleLikeHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username, TrackID string }
	json.NewDecoder(r.Body).Decode(&req)
	users := readUsers()
	for i, u := range users {
		if u.Username == req.Username {
			if users[i].LikedTracks == nil {
				users[i].LikedTracks = []string{}
			}
			found := false
			for j, tID := range users[i].LikedTracks {
				if tID == req.TrackID {
					users[i].LikedTracks = append(users[i].LikedTracks[:j], users[i].LikedTracks[j+1:]...)
					found = true
					break
				}
			}
			if !found {
				users[i].LikedTracks = append(users[i].LikedTracks, req.TrackID)
			}
			writeUsers(users)
			json.NewEncoder(w).Encode(users[i])
			return
		}
	}
	http.Error(w, `{"error": "Пользователь не найден"}`, http.StatusNotFound)
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

	genre := r.FormValue("genre")
	if genre == "" {
		genre = "Всё подряд"
	}

	newTrack := Track{
		ID:            trackID,
		Title:         r.FormValue("title"),
		Author:        r.FormValue("author"),
		Collaborators: collabs,
		Feats:         feats,
		Genre:         genre,
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

func adminStatsHandler(w http.ResponseWriter, r *http.Request) {
	users := readUsers()
	tracks := readTracks()
	pendingApps := 0
	for _, u := range users {
		if u.AppStatus == "pending" {
			pendingApps++
		}
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total_users": len(users), "total_tracks": len(tracks), "pending_apps": pendingApps,
	})
}

func getAllUsersHandler(w http.ResponseWriter, r *http.Request) {
	users := readUsers()
	for i := range users {
		users[i].Password = ""
		users[i].VerificationCode = ""
	}
	json.NewEncoder(w).Encode(users)
}

func adminUserActionHandler(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username, Action, Role string }
	json.NewDecoder(r.Body).Decode(&req)
	users := readUsers()
	for i, u := range users {
		if u.Username == req.Username {
			if req.Action == "delete" {
				users = append(users[:i], users[i+1:]...)
			} else if req.Action == "set_role" {
				users[i].Role = req.Role
				if req.Role == "artist" {
					users[i].AppStatus = "approved"
				}
			}
			writeUsers(users)
			json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
			return
		}
	}
	http.Error(w, `{"error": "Пользователь не найден"}`, http.StatusNotFound)
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
			json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
			return
		}
	}
	http.Error(w, `{"error": "Трек не найден"}`, http.StatusNotFound)
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
