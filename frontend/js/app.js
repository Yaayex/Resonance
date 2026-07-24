document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. МОДУЛЬ АВТОРИЗАЦИИ
    // ==========================================
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');
    
    const adminLinkContainer = document.getElementById('admin-link-container');
    const userProfileName = document.getElementById('user-profile-name');
    const logoutBtn = document.getElementById('logout-btn');

    let audio; // Глобальный объект аудио
    let globalLoadTracksFn; // Чтобы вызывать перезагрузку из админки

    function checkAuth() {
        const userData = localStorage.getItem('resonance_user');
        
        if (userData) {
            const user = JSON.parse(userData);
            loginScreen.style.display = 'none';
            mainApp.style.display = 'grid';
            userProfileName.textContent = user.username;
            
            if (user.role === 'admin') {
                adminLinkContainer.style.display = 'block';
            } else {
                adminLinkContainer.style.display = 'none';
            }

            initApp();
        } else {
            loginScreen.style.display = 'flex';
            mainApp.style.display = 'none';
        }
    }

    loginBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) return;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            });

            if (response.ok) {
                const user = await response.json();
                localStorage.setItem('resonance_user', JSON.stringify(user));
                checkAuth(); 
            } else {
                const errData = await response.json();
                alert(errData.error || "Ошибка авторизации");
            }
        } catch (error) {
            console.error("Сетевая ошибка:", error);
            alert("Сервер недоступен");
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('resonance_user');
        if (audio) {
            audio.pause(); 
        }
        window.location.reload(); 
    });

    // ==========================================
    // 2. МОДУЛЬ ПРИЛОЖЕНИЯ (Плеер, Навигация, Загрузка)
    // ==========================================
    function initApp() {
        if (audio) return; // Защита от двойного запуска

        // --- НАВИГАЦИЯ ---
        const navHome = document.getElementById('nav-home');
        const navAdmin = document.getElementById('nav-admin');
        const tracksSection = document.getElementById('tracks-section');
        const adminSection = document.getElementById('admin-section');
        const pageTitle = document.getElementById('page-title');

        navHome.addEventListener('click', (e) => {
            e.preventDefault();
            navHome.classList.add('active');
            navAdmin.style.color = '#8a2be2'; // сброс
            tracksSection.style.display = 'grid';
            adminSection.style.display = 'none';
            pageTitle.textContent = "Для вас";
        });

        navAdmin.addEventListener('click', (e) => {
            e.preventDefault();
            navHome.classList.remove('active');
            navAdmin.style.color = 'white'; // активный стейт
            tracksSection.style.display = 'none';
            adminSection.style.display = 'block';
            pageTitle.textContent = "Управление контентом";
        });

        // --- ЗАГРУЗКА ТРЕКА (АДМИНКА) ---
        const uploadForm = document.getElementById('upload-form');
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Останавливаем стандартную перезагрузку страницы
            
            const formData = new FormData(uploadForm);
            
            try {
                // Fetch сам проставит правильные заголовки multipart/form-data
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData 
                });

                if (response.ok) {
                    alert('Трек успешно загружен!');
                    uploadForm.reset(); // Очищаем форму
                    globalLoadTracksFn(); // Перезагружаем список треков
                    navHome.click(); // Возвращаемся на главную
                } else {
                    alert('Ошибка при загрузке трека');
                }
            } catch (error) {
                console.error(error);
                alert('Сетевая ошибка при загрузке');
            }
        });

        // --- ПЛЕЕР ---
        const playPauseBtn = document.querySelector('.play-pause');
        const playPauseIcon = playPauseBtn.querySelector('i');
        const progressSlider = document.querySelector('.progress-slider');
        const currentTimeEl = document.querySelector('.time.current');
        const totalTimeEl = document.querySelector('.time.total');
        const volumeSlider = document.querySelector('.volume-slider');

        const playerCover = document.getElementById('player-cover');
        const playerTitle = document.getElementById('player-title');
        const playerAuthor = document.getElementById('player-author');
        const tracksContainer = document.querySelector('.tracks-container');

        audio = new Audio();
        audio.volume = 0.8;
        let isPlaying = false;

        async function loadTracks() {
            try {
                const response = await fetch('/api/tracks');
                const tracks = await response.json();
                renderTracks(tracks);
            } catch (error) {
                console.error("Ошибка загрузки треков:", error);
                tracksContainer.innerHTML = '<p style="color: red;">Не удалось загрузить треки с сервера</p>';
            }
        }
        
        globalLoadTracksFn = loadTracks; // Экспортируем функцию наружу

        function renderTracks(tracks) {
            tracksContainer.innerHTML = ''; 
            tracks.forEach(track => {
                const card = document.createElement('div');
                card.className = 'track-card';
                card.innerHTML = `
                    <div class="track-cover">
                        <img src="${track.cover}" alt="Cover">
                        <button class="play-btn-overlay"><i class="fa-solid fa-play"></i></button>
                    </div>
                    <div class="track-info">
                        <h3>${track.title}</h3>
                        <p>${track.author}</p>
                    </div>
                `;
                card.addEventListener('click', () => playTrack(track));
                tracksContainer.appendChild(card);
            });
        }

        function playTrack(track) {
            audio.src = `/api/stream?id=${track.file_name}`;
            
            playerCover.src = track.cover;
            playerTitle.textContent = track.title;
            playerAuthor.textContent = track.author;

            audio.play();
            isPlaying = true;
            
            playPauseIcon.classList.remove('fa-circle-play');
            playPauseIcon.classList.add('fa-circle-pause');
        }

        function togglePlay() {
            if (!audio.src) return; 
            if (isPlaying) {
                audio.pause();
                playPauseIcon.classList.remove('fa-circle-pause');
                playPauseIcon.classList.add('fa-circle-play');
            } else {
                audio.play();
                playPauseIcon.classList.remove('fa-circle-play');
                playPauseIcon.classList.add('fa-circle-pause');
            }
            isPlaying = !isPlaying;
        }

        function formatTime(seconds) {
            if (isNaN(seconds)) return "0:00";
            const min = Math.floor(seconds / 60);
            const sec = Math.floor(seconds % 60);
            return `${min}:${sec < 10 ? '0' : ''}${sec}`;
        }

        audio.addEventListener('loadedmetadata', () => {
            totalTimeEl.textContent = formatTime(audio.duration);
        });

        audio.addEventListener('timeupdate', () => {
            const currentTime = audio.currentTime;
            const duration = audio.duration;
            currentTimeEl.textContent = formatTime(currentTime);

            if (duration) {
                const progressPercent = (currentTime / duration) * 100;
                progressSlider.value = progressPercent;
                progressSlider.style.background = `linear-gradient(to right, #8a2be2 ${progressPercent}%, #535353 ${progressPercent}%)`;
            }
        });

        progressSlider.addEventListener('input', (e) => {
            if (!audio.src) return;
            const seekTime = (e.target.value / 100) * audio.duration;
            audio.currentTime = seekTime;
        });

        volumeSlider.addEventListener('input', (e) => {
            const volumeValue = e.target.value;
            audio.volume = volumeValue / 100;
            volumeSlider.style.background = `linear-gradient(to right, #ffffff ${volumeValue}%, #535353 ${volumeValue}%)`;
        });

        playPauseBtn.addEventListener('click', togglePlay);
        volumeSlider.dispatchEvent(new Event('input'));

        loadTracks();
    }

    // СТАРТ
    checkAuth();
});