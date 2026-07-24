package models

// User описывает аккаунт в базе данных
type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Password string `json:"password"` // В проде здесь должен быть хэш!
	Role     string `json:"role"`
}

// LoginRequest описывает JSON, который присылает фронтенд при попытке входа
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse описывает JSON, который бэкенд отдает при успешном входе
type LoginResponse struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}
