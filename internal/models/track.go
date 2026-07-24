package models

// Track описывает метаданные музыкального трека
type Track struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Author   string `json:"author"`
	Cover    string `json:"cover"`
	FileName string `json:"file_name"`
}
