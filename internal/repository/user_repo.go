package repository

import (
	"encoding/json"
	"errors"
	"os"
	"sync"

	"resonance/internal/models" // Замени "resonance" на имя твоего модуля
)

type UserRepository interface {
	GetByUsername(username string) (*models.User, error)
}

type JSONUserRepo struct {
	filePath string
	mu       sync.RWMutex
}

func NewJSONUserRepo(path string) *JSONUserRepo {
	return &JSONUserRepo{
		filePath: path,
	}
}

// GetByUsername ищет пользователя по логину
func (r *JSONUserRepo) GetByUsername(username string) (*models.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	data, err := os.ReadFile(r.filePath)
	if err != nil {
		return nil, err
	}

	var users []models.User
	if err := json.Unmarshal(data, &users); err != nil {
		return nil, err
	}

	for _, u := range users {
		if u.Username == username {
			return &u, nil
		}
	}

	return nil, errors.New("пользователь не найден")
}
