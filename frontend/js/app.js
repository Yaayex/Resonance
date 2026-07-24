document.addEventListener('DOMContentLoaded', () => {
    
    // --- ЭЛЕМЕНТЫ АВТОРИЗАЦИИ ---
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    const loginBox = document.getElementById('login-box');
    const registerBox = document.getElementById('register-box');
    
    document.getElementById('show-register').addEventListener('click', (e) => { e.preventDefault(); loginBox.style.display = 'none'; registerBox.style.display = 'block'; });
    document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); registerBox.style.display = 'none'; loginBox.style.display = 'block'; });

    let audio; 
    let globalTracks = [];
    let currentUser = null;

    // --- ПРОВЕРКА ВХОДА ---
    function checkAuth() {
        const userData = localStorage.getItem('resonance_user');
        if (userData) {
            currentUser = JSON.parse(userData);
            authScreen.style.display = 'none';
            mainApp.style.display = 'grid';
            
            document.getElementById('user-profile-name').textContent = currentUser.username;
            document.getElementById('set-username').value = currentUser.username;
            document.getElementById('set-email').value = currentUser.email || 'Не указан';
            document.getElementById('admin-author-input').value = currentUser.username;

            // Настройка UI в зависимости от роли и статуса заявки
            const rankBadge = document.getElementById('user-rank-badge');
            const navUpload = document.getElementById('nav-upload-container');
            const navAdmin = document.getElementById('nav-admin-container');
            const reqBtn = document.getElementById('request-artist-btn');
            const statusBox = document.getElementById('app-status-box');

            if (currentUser.role === 'admin') {
                rankBadge.textContent = 'Администратор'; rankBadge.style.color = '#ff4d4d';
                navUpload.style.display = 'block'; navAdmin.style.display = 'block';
                reqBtn.style.display = 'none'; // Админу не нужно подавать заявку
            } else if (currentUser.role === 'artist') {
                rankBadge.textContent = 'Артист'; rankBadge.style.color = '#00d2ff';
                navUpload.style.display = 'block'; navAdmin.style.display = 'none';
                reqBtn.style.display = 'none';
            } else {
                rankBadge.textContent = 'Слушатель'; rankBadge.style.color = '#aaa';
                navUpload.style.display = 'none'; navAdmin.style.display = 'none';
                
                // Логика статуса заявки
                if (currentUser.app_status === 'pending') {
                    statusBox.textContent = 'Ваша заявка на рассмотрении администратором.';
                    statusBox.className = 'status-box status-pending';
                    reqBtn.disabled = true;
                    reqBtn.textContent = 'Заявка отправлена';
                } else if (currentUser.app_status === 'rejected') {
                    statusBox.innerHTML = `Заявка отклонена. Причина: <b>${currentUser.app_reason || 'Без причины'}</b>`;
                    statusBox.className = 'status-box status-rejected';
                    reqBtn.disabled = false;
                    reqBtn.textContent = 'Подать заявку снова';
                } else {
                    statusBox.style.display = 'none';
                    reqBtn.disabled = false;
                }
            }
            initApp();
        } else {
            authScreen.style.display = 'flex';
            mainApp.style.display = 'none';
        }
    }

    // --- ЛОГИН И РЕГИСТРАЦИЯ ---
    async function apiRequest(url, body) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { localStorage.setItem('resonance_user', JSON.stringify(await res.json())); checkAuth(); } 
        else alert((await res.json()).error);
    }

    document.getElementById('login-btn').addEventListener('click', () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        if (username && password) apiRequest('/api/login', { username, password });
    });

    document.getElementById('register-btn').addEventListener('click', () => {
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        if (username && email && password) apiRequest('/api/register', { username, email, password });
        else alert("Заполните все поля");
    });

    // ==========================================
    // ИНТЕРФЕЙС И ЛОГИКА
    // ==========================================
    function initApp() {
        if (audio) return; 

        // --- Навигация и меню ---
        const sidebar = document.getElementById('sidebar');
        document.getElementById('mobile-menu-btn').addEventListener('click', () => sidebar.classList.add('open'));
        document.getElementById('mobile-close-btn').addEventListener('click', () => sidebar.classList.remove('open'));

        const profileBtn = document.getElementById('profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');
        profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profileDropdown.classList.toggle('active'); });
        document.addEventListener('click', (e) => { if (!profileBtn.contains(e.target)) profileDropdown.classList.remove('active'); });
        
        document.getElementById('drop-logout').addEventListener('click', (e) => { e.preventDefault(); localStorage.removeItem('resonance_user'); window.location.reload(); });
        document.getElementById('drop-home').addEventListener('click', (e) => { e.preventDefault(); navHome.click(); });
        document.getElementById('drop-settings').addEventListener('click', (e) => { e.preventDefault(); switchSection(null, sections.settings, "Настройки"); });

        // --- Заявка на артиста ---
        document.getElementById('request-artist-btn').addEventListener('click', async () => {
            const res = await fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username }) });
            if (res.ok) { localStorage.setItem('resonance_user', JSON.stringify(await res.json())); checkAuth(); }
        });

        const navHome = document.getElementById('nav-home');
        const sections = {
            home: document.getElementById('tracks-section'), search: document.getElementById('search-section'),
            library: document.getElementById('library-section'), settings: document.getElementById('settings-section'),
            upload: document.getElementById('upload-section'), admin: document.getElementById('admin-section'),
            artist: document.getElementById('artist-profile-section'), staff: document.getElementById('staff-section')
        };
        const pageTitle = document.getElementById('page-title');

        function switchSection(activeNav, targetSection, title) {
            document.querySelectorAll('.menu a, .role-link a').forEach(el => el.classList.remove('active'));
            Object.values(sections).forEach(sec => sec.style.display = 'none');
            if(activeNav) activeNav.classList.add('active');
            if(targetSection) targetSection.style.display = (targetSection.id === 'search-section' || targetSection.id === 'tracks-section' || targetSection.id === 'artist-profile-section') ? 'grid' : 'block';
            if(targetSection.id === 'artist-profile-section') targetSection.style.display = 'block';
            pageTitle.textContent = title;
            sidebar.classList.remove('open'); 
        }

        document.getElementById('logo-link').addEventListener('click', () => navHome.click());
        navHome.addEventListener('click', (e) => { e.preventDefault(); switchSection(navHome, sections.home, "Для вас"); renderTracks(globalTracks, sections.home); });
        
        document.getElementById('nav-search').addEventListener('click', (e) => { e.preventDefault(); switchSection(document.getElementById('nav-search'), sections.search, "Поиск"); document.getElementById('search-input').focus(); });
        
        document.getElementById('nav-library').addEventListener('click', (e) => { e.preventDefault(); switchSection(document.getElementById('nav-library'), sections.library, "Медиатека"); renderTracks(globalTracks.filter(t => t.author === currentUser.username), document.getElementById('library-results-section')); });
        
        document.getElementById('nav-staff').addEventListener('click', (e) => { e.preventDefault(); switchSection(document.getElementById('nav-staff'), sections.staff, "Команда проекта"); loadStaff(); });
        
        if(document.getElementById('nav-upload')) document.getElementById('nav-upload').addEventListener('click', (e) => { e.preventDefault(); switchSection(document.getElementById('nav-upload'), sections.upload, "Студия"); });
        
        if(document.getElementById('nav-admin')) document.getElementById('nav-admin').addEventListener('click', (e) => { e.preventDefault(); switchSection(document.getElementById('nav-admin'), sections.admin, "Управление"); loadAdminApps(); });

        // Поиск
        document.getElementById('search-input').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const resContainer = document.getElementById('search-results-section');
            if (q === '') { resContainer.innerHTML = ''; return; }
            renderTracks(globalTracks.filter(t => t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)), resContainer);
        });

        // Загрузка
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

        // --- Профиль артиста ---
        async function loadArtistProfile(artistName) {
            switchSection(null, sections.artist, "Профиль артиста");
            document.getElementById('artist-profile-name').textContent = artistName;
            
            const res = await fetch(`/api/artist?name=${encodeURIComponent(artistName)}`);
            const data = await res.json();
            
            document.getElementById('artist-profile-stats').textContent = `${data.total_tracks} треков • ${data.total_plays} прослушиваний`;
            renderTracks(data.tracks, document.getElementById('artist-tracks-container'));
        }

        // --- Команда проекта ---
        async function loadStaff() {
            const res = await fetch('/api/staff');
            const staff = await res.json();
            const grid = document.getElementById('staff-grid');
            grid.innerHTML = '';
            staff.forEach(u => {
                grid.innerHTML += `
                    <div class="staff-card">
                        <div class="avatar-circle large"><i class="fa-solid fa-shield"></i></div>
                        <h4>${u.username}</h4>
                        <p class="staff-role">Администратор</p>
                    </div>
                `;
            });
        }

        // --- Админка (Управление заявками) ---
        async function loadAdminApps() {
            const res = await fetch('/api/admin/apps');
            const apps = await res.json();
            const tbody = document.getElementById('admin-apps-tbody');
            tbody.innerHTML = '';
            if(!apps) return;
            apps.forEach(app => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${app.username}</td>
                    <td>${app.email}</td>
                    <td>${app.app_status === 'pending' ? 'Ожидает' : 'Отклонено'}</td>
                    <td>
                        <button class="btn-sm btn-approve" data-user="${app.username}">Одобрить</button>
                        <button class="btn-sm btn-reject" data-user="${app.username}">Отклонить</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Обработка кнопок
            tbody.querySelectorAll('.btn-approve').forEach(btn => btn.addEventListener('click', async (e) => {
                await fetch('/api/admin/resolve', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: e.target.dataset.user, action: 'approve'})});
                loadAdminApps();
            }));
            tbody.querySelectorAll('.btn-reject').forEach(btn => btn.addEventListener('click', async (e) => {
                const reason = prompt("Укажите причину отказа:");
                if(reason) {
                    await fetch('/api/admin/resolve', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: e.target.dataset.user, action: 'reject', reason: reason})});
                    loadAdminApps();
                }
            }));
        }

        // ==========================================
        // ПЛЕЕР И ТРЕКИ
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
            const response = await fetch('/api/tracks');
            globalTracks = await response.json() || [];
            renderTracks(globalTracks, sections.home);
        }

        // Функция форматирования авторов
        function formatAuthors(track) {
            let html = `<span class="artist-link" data-name="${track.author}">${track.author}</span>`;
            if (track.collaborators && track.collaborators.length > 0) {
                track.collaborators.forEach(c => { html += ` & <span class="artist-link" data-name="${c}">${c}</span>`; });
            }
            if (track.feats && track.feats.length > 0) {
                html += ` feat. `;
                track.feats.forEach((f, index) => {
                    html += `<span class="artist-link" data-name="${f}">${f}</span>`;
                    if (index < track.feats.length - 1) html += `, `;
                });
            }
            return html;
        }

        function renderTracks(tracksList, container) {
            container.innerHTML = ''; 
            if (tracksList.length === 0) { container.innerHTML = '<p class="section-desc" style="grid-column: 1/-1;">Здесь пока ничего нет</p>'; return; }

            tracksList.forEach(track => {
                const card = document.createElement('div');
                card.className = 'track-card';
                card.innerHTML = `
                    <div class="track-cover">
                        <img src="${track.cover}" alt="Cover">
                        <button class="play-btn-overlay" data-play="${track.id}"><i class="fa-solid fa-play"></i></button>
                    </div>
                    <div class="track-info">
                        <h3>${track.title}</h3>
                        <p>${formatAuthors(track)}</p>
                        <p style="font-size: 11px; margin-top: 5px; opacity: 0.5;"><i class="fa-solid fa-headphones"></i> ${track.plays}</p>
                    </div>
                `;
                container.appendChild(card);
            });

            // Делегирование событий (чтобы понимать, кликнули на 플레이 или на имя артиста)
            container.addEventListener('click', (e) => {
                // Если клик по ссылке артиста
                const artistLink = e.target.closest('.artist-link');
                if (artistLink) {
                    loadArtistProfile(artistLink.dataset.name);
                    return;
                }
                
                // Если клик по кнопке Play или самой карточке
                const card = e.target.closest('.track-card');
                if (card) {
                    const trackId = card.querySelector('.play-btn-overlay').dataset.play;
                    const track = tracksList.find(t => t.id === trackId);
                    if(track) playTrack(track);
                }
            });
        }

        function playTrack(track) {
            audio.src = `/api/stream?id=${track.file_name}`;
            document.getElementById('player-cover').src = track.cover;
            document.getElementById('player-title').textContent = track.title;
            // Упрощенный вывод авторов для плеера (без HTML-тегов)
            let rawAuthors = track.author;
            if(track.collaborators && track.collaborators.length > 0) rawAuthors += ' & ' + track.collaborators.join(' & ');
            if(track.feats && track.feats.length > 0) rawAuthors += ' feat. ' + track.feats.join(', ');
            document.getElementById('player-author').textContent = rawAuthors;

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