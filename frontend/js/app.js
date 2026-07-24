document.addEventListener('DOMContentLoaded', () => {
    
    // --- ЭЛЕМЕНТЫ АВТОРИЗАЦИИ ---
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    
    const loginBox = document.getElementById('login-box');
    const registerBox = document.getElementById('register-box');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');

    showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); loginBox.style.display = 'none'; registerBox.style.display = 'block'; });
    showLoginLink.addEventListener('click', (e) => { e.preventDefault(); registerBox.style.display = 'none'; loginBox.style.display = 'block'; });

    let audio; 
    let globalTracks = [];
    let currentUser = null;

    // --- ПРОВЕРКА ВХОДА И ПРАВ ---
    function checkAuth() {
        const userData = localStorage.getItem('resonance_user');
        if (userData) {
            currentUser = JSON.parse(userData);
            authScreen.style.display = 'none';
            mainApp.style.display = 'grid';
            
            // Заполнение профиля
            document.getElementById('user-profile-name').textContent = currentUser.username;
            document.getElementById('set-username').value = currentUser.username;
            document.getElementById('set-email').value = currentUser.email || 'Не указан';
            const adminAuthorInput = document.getElementById('admin-author-input');
            if(adminAuthorInput) adminAuthorInput.value = currentUser.username;

            // Настройка ролей
            const rankBadge = document.getElementById('user-rank-badge');
            const navUpload = document.getElementById('nav-upload-container');
            const navAdmin = document.getElementById('nav-admin-container');

            if (currentUser.role === 'admin') {
                rankBadge.textContent = 'Администратор';
                rankBadge.style.color = '#ff4d4d';
                navUpload.style.display = 'block';
                navAdmin.style.display = 'block';
            } else if (currentUser.role === 'artist') {
                rankBadge.textContent = 'Артист';
                rankBadge.style.color = '#00d2ff';
                navUpload.style.display = 'block';
                navAdmin.style.display = 'none';
            } else {
                rankBadge.textContent = 'Слушатель';
                rankBadge.style.color = '#aaa';
                navUpload.style.display = 'none';
                navAdmin.style.display = 'none';
            }
            initApp();
        } else {
            authScreen.style.display = 'flex';
            mainApp.style.display = 'none';
        }
    }

    // --- ЛОГИН ---
    document.getElementById('login-btn').addEventListener('click', async () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        if (!username || !password) return;
        try {
            const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
            if (res.ok) {
                localStorage.setItem('resonance_user', JSON.stringify(await res.json()));
                checkAuth(); 
            } else alert((await res.json()).error);
        } catch (e) { alert("Сервер недоступен"); }
    });

    // --- РЕГИСТРАЦИЯ ---
    document.getElementById('register-btn').addEventListener('click', async () => {
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        if (!username || !email || !password) { alert("Заполните все поля"); return; }
        try {
            const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password }) });
            if (res.ok) {
                localStorage.setItem('resonance_user', JSON.stringify(await res.json()));
                checkAuth(); 
            } else alert((await res.json()).error);
        } catch (e) { alert("Сервер недоступен"); }
    });

    function logoutUser() {
        localStorage.removeItem('resonance_user');
        if (audio) audio.pause(); 
        window.location.reload(); 
    }

    // ==========================================
    // 2. ИНТЕРФЕЙС И ЛОГИКА
    // ==========================================
    function initApp() {
        if (audio) return; // Защита от дубля

        // Мобильное меню
        const sidebar = document.getElementById('sidebar');
        document.getElementById('mobile-menu-btn').addEventListener('click', () => sidebar.classList.add('open'));
        document.getElementById('mobile-close-btn').addEventListener('click', () => sidebar.classList.remove('open'));

        // Дропдаун профиля
        const profileBtn = document.getElementById('profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');
        profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profileDropdown.classList.toggle('active'); });
        document.addEventListener('click', (e) => { if (!profileBtn.contains(e.target)) profileDropdown.classList.remove('active'); });
        
        document.getElementById('drop-logout').addEventListener('click', (e) => { e.preventDefault(); logoutUser(); });
        document.getElementById('drop-home').addEventListener('click', (e) => { e.preventDefault(); navHome.click(); });
        document.getElementById('drop-library').addEventListener('click', (e) => { e.preventDefault(); navLibrary.click(); });
        document.getElementById('drop-settings').addEventListener('click', (e) => { e.preventDefault(); switchSection(null, sections.settings, "Настройки"); });

        // Заявка на артиста
        document.getElementById('request-artist-btn').addEventListener('click', () => {
            alert("Заявка отправлена администратору. Ожидайте рассмотрения.");
        });

        // Навигация
        const logoLink = document.getElementById('logo-link');
        const navHome = document.getElementById('nav-home');
        const navSearch = document.getElementById('nav-search');
        const navLibrary = document.getElementById('nav-library');
        const navUpload = document.getElementById('nav-upload');
        const navAdmin = document.getElementById('nav-admin');
        
        const sections = {
            home: document.getElementById('tracks-section'),
            search: document.getElementById('search-section'),
            library: document.getElementById('library-section'),
            settings: document.getElementById('settings-section'),
            upload: document.getElementById('upload-section'),
            admin: document.getElementById('admin-section')
        };
        const pageTitle = document.getElementById('page-title');

        function switchSection(activeNav, targetSection, title) {
            document.querySelectorAll('.menu a, .role-link a').forEach(el => el.classList.remove('active'));
            Object.values(sections).forEach(sec => sec.style.display = 'none');

            if(activeNav) activeNav.classList.add('active');
            if(targetSection) targetSection.style.display = (targetSection.id === 'search-section' || targetSection.id === 'tracks-section') ? 'grid' : 'block';
            pageTitle.textContent = title;
            sidebar.classList.remove('open'); // Закрываем сайдбар на мобилках при переходе
        }

        logoLink.addEventListener('click', () => navHome.click());
        navHome.addEventListener('click', (e) => { e.preventDefault(); switchSection(navHome, sections.home, "Для вас"); renderTracks(globalTracks, sections.home); });
        navSearch.addEventListener('click', (e) => { e.preventDefault(); switchSection(navSearch, sections.search, "Поиск"); document.getElementById('search-input').focus(); });
        navLibrary.addEventListener('click', (e) => { e.preventDefault(); switchSection(navLibrary, sections.library, "Медиатека"); renderTracks(globalTracks.filter(t => t.author === currentUser.username), document.getElementById('library-results-section')); });
        
        if(navUpload) navUpload.addEventListener('click', (e) => { e.preventDefault(); switchSection(navUpload, sections.upload, "Студия"); });
        if(navAdmin) navAdmin.addEventListener('click', (e) => { e.preventDefault(); switchSection(navAdmin, sections.admin, "Управление контентом"); });

        // Поиск
        document.getElementById('search-input').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const resContainer = document.getElementById('search-results-section');
            if (q === '') { resContainer.innerHTML = ''; return; }
            renderTracks(globalTracks.filter(t => t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)), resContainer);
        });

        // Загрузка трека
        const uploadForm = document.getElementById('upload-form');
        if (uploadForm) {
            uploadForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const res = await fetch('/api/upload', { method: 'POST', body: new FormData(uploadForm) });
                    if (res.ok) { alert('Трек опубликован!'); uploadForm.reset(); document.getElementById('admin-author-input').value = currentUser.username; loadTracks(); navHome.click(); } 
                    else alert('Ошибка при загрузке');
                } catch (err) { alert('Сетевая ошибка'); }
            });
        }

        // ==========================================
        // 3. ПЛЕЕР
        // ==========================================
        const floatingPlayer = document.getElementById('floating-player');
        const playPauseBtn = document.querySelector('.play-pause');
        const playPauseIcon = playPauseBtn.querySelector('i');
        const progressSlider = document.querySelector('.progress-slider');
        const currentTimeEl = document.querySelector('.time.current');
        const totalTimeEl = document.querySelector('.time.total');
        const volumeSlider = document.querySelector('.volume-slider');

        audio = new Audio();
        audio.volume = 0.8;
        let isPlaying = false;

        async function loadTracks() {
            try {
                const response = await fetch('/api/tracks');
                globalTracks = await response.json();
                renderTracks(globalTracks, sections.home);
            } catch (error) { sections.home.innerHTML = '<p style="color: red;">Ошибка загрузки треков</p>'; }
        }

        function renderTracks(tracksList, container) {
            container.innerHTML = ''; 
            if (tracksList.length === 0) { container.innerHTML = '<p class="section-desc" style="grid-column: 1/-1;">Здесь пока ничего нет</p>'; return; }

            tracksList.forEach(track => {
                const card = document.createElement('div');
                card.className = 'track-card';
                card.innerHTML = `<div class="track-cover"><img src="${track.cover}" alt="Cover"><button class="play-btn-overlay"><i class="fa-solid fa-play"></i></button></div><div class="track-info"><h3>${track.title}</h3><p>${track.author}</p></div>`;
                card.addEventListener('click', () => playTrack(track));
                container.appendChild(card);
            });
        }

        function playTrack(track) {
            audio.src = `/api/stream?id=${track.file_name}`;
            document.getElementById('player-cover').src = track.cover;
            document.getElementById('player-title').textContent = track.title;
            document.getElementById('player-author').textContent = track.author;

            // Показываем плавающий плеер при первом включении
            floatingPlayer.classList.add('active');

            audio.play();
            isPlaying = true;
            playPauseIcon.classList.replace('fa-circle-play', 'fa-circle-pause');
        }

        playPauseBtn.addEventListener('click', () => {
            if (!audio.src) return; 
            if (isPlaying) { audio.pause(); playPauseIcon.classList.replace('fa-circle-pause', 'fa-circle-play'); } 
            else { audio.play(); playPauseIcon.classList.replace('fa-circle-play', 'fa-circle-pause'); }
            isPlaying = !isPlaying;
        });

        function formatTime(sec) {
            if (isNaN(sec)) return "0:00";
            return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
        }

        audio.addEventListener('loadedmetadata', () => { totalTimeEl.textContent = formatTime(audio.duration); });
        audio.addEventListener('timeupdate', () => {
            currentTimeEl.textContent = formatTime(audio.currentTime);
            if (audio.duration) {
                const percent = (audio.currentTime / audio.duration) * 100;
                progressSlider.value = percent;
                progressSlider.style.background = `linear-gradient(to right, #8a2be2 ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
            }
        });

        progressSlider.addEventListener('input', (e) => {
            if (!audio.src) return;
            audio.currentTime = (e.target.value / 100) * audio.duration;
        });

        volumeSlider.addEventListener('input', (e) => {
            audio.volume = e.target.value / 100;
            volumeSlider.style.background = `linear-gradient(to right, #fff ${e.target.value}%, rgba(255,255,255,0.1) ${e.target.value}%)`;
        });
        volumeSlider.dispatchEvent(new Event('input'));

        loadTracks();
    }

    checkAuth();
});