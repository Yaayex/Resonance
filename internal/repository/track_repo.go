package repository

import (
	"encoding/json"
	"os"
	"resonance/internal/models" // Замени "resonance" на имя модуля из твоего go.mod
	"sync"
)

// TrackRepository — интерфейс, описывающий контракт для работы с треками
type TrackRepository interface {
	GetAll() ([]models.Track, error)
}

// JSONTrackRepo — реализация хранилища на основе JSON файла
type JSONTrackRepo struct {
	filePath string
	mu       sync.RWMutex // Мьютекс для безопасного чтения/записи
}

// NewJSONTrackRepo — конструктор
func NewJSONTrackRepo(path string) *JSONTrackRepo {
	return &JSONTrackRepo{
		filePath: path,
	}
}

// GetAll читает файл и возвращает массив треков
func (r *JSONTrackRepo) GetAll() ([]models.Track, error) {
	// Блокируем файл для чтения. Если кто-то сейчас пишет в него, мы подождем.
	r.mu.RLock()
	defer r.mu.RUnlock()

	data, err := os.ReadFile(r.filePath)
	if err != nil {
		return nil, err
	}

	var tracks []models.Track
	if err := json.Unmarshal(data, &tracks); err != nil {
		return nil, err
	}

	return tracks, nil
}
