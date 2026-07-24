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
    const adminAuthorInput = document.getElementById('admin-author-input'); // Поле автора в форме

    let audio; 
    let globalTracks = []; // Храним все треки для поиска и фильтрации
    let currentUser = null;

    function checkAuth() {
        const userData = localStorage.getItem('resonance_user');
        
        if (userData) {
            currentUser = JSON.parse(userData);
            loginScreen.style.display = 'none';
            mainApp.style.display = 'grid';
            
            userProfileName.textContent = currentUser.username;
            // Автоматически подставляем имя пользователя в форму добавления трека
            if(adminAuthorInput) adminAuthorInput.value = currentUser.username;
            
            if (currentUser.role === 'admin') {
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

    function logoutUser() {
        localStorage.removeItem('resonance_user');
        if (audio) audio.pause(); 
        window.location.reload(); 
    }

    // ==========================================
    // 2. ИНТЕРФЕЙС: ДРОПДАУН, НАВИГАЦИЯ, ПОИСК
    // ==========================================
    function initApp() {
        if (audio) return; // Защита от двойного запуска

        // --- Дропдаун профиля ---
        const profileBtn = document.getElementById('profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');

        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Чтобы клик не дошел до document
            profileDropdown.classList.toggle('active');
        });

        // Закрываем меню при клике в любое другое место
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target)) {
                profileDropdown.classList.remove('active');
            }
        });

        // Кнопки внутри дропдауна
        document.getElementById('drop-logout').addEventListener('click', (e) => {
            e.preventDefault(); logoutUser();
        });
        document.getElementById('drop-home').addEventListener('click', (e) => {
            e.preventDefault(); navHome.click();
        });
        document.getElementById('drop-library-link').addEventListener('click', (e) => {
            e.preventDefault(); navLibrary.click();
        });


        // --- НАВИГАЦИЯ ---
        const logoLink = document.getElementById('logo-link');
        const navHome = document.getElementById('nav-home');
        const navSearch = document.getElementById('nav-search');
        const navLibrary = document.getElementById('nav-library');
        const navAdmin = document.getElementById('nav-admin');
        
        const sections = {
            home: document.getElementById('tracks-section'),
            search: document.getElementById('search-section'),
            library: document.getElementById('library-section'),
            admin: document.getElementById('admin-section')
        };
        const pageTitle = document.getElementById('page-title');

        function switchSection(activeNav, targetSection, title) {
            // Убираем active у всех навигационных ссылок
            [navHome, navSearch, navLibrary, navAdmin].forEach(el => {
                if(el) { el.classList.remove('active'); el.style.color = ''; }
            });
            // Прячем все секции
            Object.values(sections).forEach(sec => { if(sec) sec.style.display = 'none'; });

            // Включаем нужные
            if(activeNav) {
                if(activeNav.id === 'nav-admin') activeNav.style.color = 'white';
                else activeNav.classList.add('active');
            }
            if(targetSection) {
                targetSection.style.display = targetSection.id === 'search-section' ? 'block' : 'grid';
                if(targetSection.id === 'admin-section' || targetSection.id === 'library-section') targetSection.style.display = 'block';
            }
            pageTitle.textContent = title;
        }

        logoLink.addEventListener('click', () => navHome.click());
        
        navHome.addEventListener('click', (e) => {
            e.preventDefault(); switchSection(navHome, sections.home, "Для вас");
            renderTracks(globalTracks, sections.home);
        });

        navSearch.addEventListener('click', (e) => {
            e.preventDefault(); switchSection(navSearch, sections.search, "Поиск");
            document.getElementById('search-input').focus();
        });

        navLibrary.addEventListener('click', (e) => {
            e.preventDefault(); switchSection(navLibrary, sections.library, "Моя медиатека");
            // Фильтруем треки: показываем только те, где автор = логин юзера
            const myTracks = globalTracks.filter(t => t.author === currentUser.username);
            renderTracks(myTracks, document.getElementById('library-results-section'));
        });

        if(navAdmin) {
            navAdmin.addEventListener('click', (e) => {
                e.preventDefault(); switchSection(navAdmin, sections.admin, "Управление контентом");
            });
        }

        // --- ЖИВОЙ ПОИСК ---
        const searchInput = document.getElementById('search-input');
        const searchResultsContainer = document.getElementById('search-results-section');

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query === '') {
                searchResultsContainer.innerHTML = ''; // Очищаем, если пусто
                return;
            }
            // Ищем по названию или автору
            const filtered = globalTracks.filter(t => 
                t.title.toLowerCase().includes(query) || 
                t.author.toLowerCase().includes(query)
            );
            renderTracks(filtered, searchResultsContainer);
        });

        // --- ЗАГРУЗКА ТРЕКА (АДМИНКА) ---
        const uploadForm = document.getElementById('upload-form');
        if (uploadForm) {
            uploadForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(uploadForm);
                try {
                    const response = await fetch('/api/upload', { method: 'POST', body: formData });
                    if (response.ok) {
                        alert('Трек успешно загружен!');
                        uploadForm.reset(); 
                        adminAuthorInput.value = currentUser.username; // Восстанавливаем имя после сброса формы
                        loadTracks(); // Обновляем массив
                        navHome.click(); // Перекидываем на главную
                    } else { alert('Ошибка при загрузке трека'); }
                } catch (error) { alert('Сетевая ошибка при загрузке'); }
            });
        }


        // ==========================================
        // 3. ПЛЕЕР И ОТРИСОВКА КАРТОЧЕК
        // ==========================================
        const playPauseBtn = document.querySelector('.play-pause');
        const playPauseIcon = playPauseBtn.querySelector('i');
        const progressSlider = document.querySelector('.progress-slider');
        const currentTimeEl = document.querySelector('.time.current');
        const totalTimeEl = document.querySelector('.time.total');
        const volumeSlider = document.querySelector('.volume-slider');

        const playerCover = document.getElementById('player-cover');
        const playerTitle = document.getElementById('player-title');
        const playerAuthor = document.getElementById('player-author');

        audio = new Audio();
        audio.volume = 0.8;
        let isPlaying = false;

        async function loadTracks() {
            try {
                const response = await fetch('/api/tracks');
                globalTracks = await response.json();
                // По умолчанию рендерим на главную
                renderTracks(globalTracks, sections.home);
            } catch (error) {
                console.error("Ошибка загрузки треков:", error);
                sections.home.innerHTML = '<p style="color: red;">Не удалось загрузить треки с сервера</p>';
            }
        }

        // Универсальная функция отрисовки карточек в нужный контейнер
        function renderTracks(tracksList, container) {
            container.innerHTML = ''; 
            
            if (tracksList.length === 0) {
                container.innerHTML = '<p style="color: #a7a7a7; grid-column: 1/-1;">Здесь пока ничего нет</p>';
                return;
            }

            tracksList.forEach(track => {
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
                container.appendChild(card);
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
                // Неоновый фиолетовый акцент на ползунке
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

        loadTracks(); // Загружаем треки при старте
    }

    // СТАРТ
    checkAuth();
});