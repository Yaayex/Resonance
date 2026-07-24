package repository

import (
	"encoding/json"
	"os"
	"sync"

	"resonance/internal/models" // Замени на свой модуль
)

// TrackRepository — интерфейс, описывающий контракт для работы с треками
type TrackRepository interface {
	GetAll() ([]models.Track, error)
	Add(track models.Track) error // <-- Новый метод
}

type JSONTrackRepo struct {
	filePath string
	mu       sync.RWMutex
}

func NewJSONTrackRepo(path string) *JSONTrackRepo {
	return &JSONTrackRepo{
		filePath: path,
	}
}

// GetAll читает файл и возвращает массив треков
func (r *JSONTrackRepo) GetAll() ([]models.Track, error) {
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

// Add записывает новый трек в JSON файл
func (r *JSONTrackRepo) Add(track models.Track) error {
	// Используем Lock (эксклюзивная блокировка для записи)
	r.mu.Lock()
	defer r.mu.Unlock()

	// 1. Читаем текущие данные
	data, err := os.ReadFile(r.filePath)
	if err != nil {
		return err
	}

	var tracks []models.Track
	if err := json.Unmarshal(data, &tracks); err != nil {
		return err
	}

	// 2. Добавляем новый трек в массив
	tracks = append(tracks, track)

	// 3. Форматируем обратно в красивый JSON
	newData, err := json.MarshalIndent(tracks, "", "  ")
	if err != nil {
		return err
	}

	// 4. Перезаписываем файл
	return os.WriteFile(r.filePath, newData, 0644)
}
