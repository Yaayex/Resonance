document.addEventListener('DOMContentLoaded', () => {
    // 1. Находим все нужные элементы интерфейса
    const playPauseBtn = document.querySelector('.play-pause');
    const playPauseIcon = playPauseBtn.querySelector('i');
    
    const progressSlider = document.querySelector('.progress-slider');
    const currentTimeEl = document.querySelector('.time.current');
    const totalTimeEl = document.querySelector('.time.total');
    
    const volumeSlider = document.querySelector('.volume-slider');

    // 2. Создаем "невидимый" плеер в памяти
    const audio = new Audio();
    
    // Временно используем тестовый трек из сети. 
    // Позже мы заменим это на путь к нашему Go-бэкенду: 'http://localhost:8080/api/stream?id=t_98765'
    audio.src = '/api/stream?id=test';
    audio.volume = 0.8; // Дефолтная громкость 80%

    let isPlaying = false;

    // 3. Функция переключения Play / Pause
    function togglePlay() {
        if (isPlaying) {
            audio.pause();
            // Меняем иконку на Play
            playPauseIcon.classList.remove('fa-circle-pause');
            playPauseIcon.classList.add('fa-circle-play');
        } else {
            audio.play();
            // Меняем иконку на Pause
            playPauseIcon.classList.remove('fa-circle-play');
            playPauseIcon.classList.add('fa-circle-pause');
        }
        isPlaying = !isPlaying;
    }

    // Вспомогательная функция: превращает секунды в формат "М:СС" (например, 145 -> "2:25")
    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }

    // 4. Когда трек загрузился, выводим его общую длительность
    audio.addEventListener('loadedmetadata', () => {
        totalTimeEl.textContent = formatTime(audio.duration);
    });

    // 5. Двигаем ползунок по мере воспроизведения трека
    audio.addEventListener('timeupdate', () => {
        const currentTime = audio.currentTime;
        const duration = audio.duration;

        // Обновляем цифры текущего времени
        currentTimeEl.textContent = formatTime(currentTime);

        // Обновляем ползунок (переводим время в проценты от 0 до 100)
        if (duration) {
            const progressPercent = (currentTime / duration) * 100;
            progressSlider.value = progressPercent;
            
            // Закрашиваем пройденную часть ползунка белым цветом (крутая визуальная фишка)
            progressSlider.style.background = `linear-gradient(to right, #ffffff ${progressPercent}%, #535353 ${progressPercent}%)`;
        }
    });

    // 6. Перемотка трека, когда пользователь кликает или тянет ползунок прогресса
    progressSlider.addEventListener('input', (e) => {
        const seekTime = (e.target.value / 100) * audio.duration;
        audio.currentTime = seekTime;
    });

    // 7. Управление громкостью
    volumeSlider.addEventListener('input', (e) => {
        const volumeValue = e.target.value;
        audio.volume = volumeValue / 100;
        
        // Также закрашиваем ползунок громкости
        volumeSlider.style.background = `linear-gradient(to right, #ffffff ${volumeValue}%, #535353 ${volumeValue}%)`;
    });

    // 8. Вешаем слушатель клика на центральную кнопку
    playPauseBtn.addEventListener('click', togglePlay);
    
    // Инициализируем закраску ползунка громкости при старте
    volumeSlider.dispatchEvent(new Event('input'));
});