package repository

import (
	"encoding/json"
	"errors"
	"os"
	"resonance/internal/models" // Замени на свой модуль
	"sync"
)

type UserRepository interface {
	GetByUsername(username string) (*models.User, error)
	AddUser(user models.User) error
}

type JSONUserRepo struct {
	filePath string
	mu       sync.RWMutex
}

func NewJSONUserRepo(path string) *JSONUserRepo {
	return &JSONUserRepo{filePath: path}
}

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

func (r *JSONUserRepo) AddUser(user models.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	data, err := os.ReadFile(r.filePath)
	var users []models.User
	if err == nil {
		json.Unmarshal(data, &users)
	}

	// Проверка на уникальность
	for _, u := range users {
		if u.Username == user.Username {
			return errors.New("пользователь с таким логином уже существует")
		}
	}

	users = append(users, user)
	newData, err := json.MarshalIndent(users, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(r.filePath, newData, 0644)
}
