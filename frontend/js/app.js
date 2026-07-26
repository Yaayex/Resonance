document.addEventListener('DOMContentLoaded', () => {
    // === ГЛОБАЛЬНОЕ СОСТОЯНИЕ (ПЛОСКАЯ ОБЛАСТЬ ВИДИМОСТИ) ===
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    
    let audio = new Audio();
    audio.volume = 0.8;
    let isPlaying = false;
    let globalTracks = [];
    let currentContextList = [];
    let shuffledList = [];
    let currentUser = null;
    let allArtists = [];
    let isLiveRadio = false;
    let activeGenre = 'Всё подряд';
    let currentTrackId = null;
    let isMyWaveMode = false;
    let currentLibraryTab = 'likes';
    let isShuffle = false;
    let repeatMode = 0; // 0 = off, 1 = track, 2 = context

    // === DOM ЭЛЕМЕНТЫ УПРАВЛЕНИЯ ПЛЕЕРОМ ===
    const floatingPlayer = document.getElementById('floating-player');
    const fsPlayer = document.getElementById('fullscreen-player');
    const driveOverlay = document.getElementById('drive-mode-overlay');
    const playPauseBtn = document.querySelector('.play-pause');
    const playPauseIcon = playPauseBtn ? playPauseBtn.querySelector('i') : null;
    const fsPlayBtn = document.getElementById('fs-play-pause');
    const drivePlayBtn = document.getElementById('drive-play');
    const progressSlider = document.querySelector('.progress-slider');
    const fsProgress = document.getElementById('fs-progress-slider');
    const currentTimeEl = document.querySelector('.time.current');
    const totalTimeEl = document.querySelector('.time.total');
    const fsTimeCurrent = document.getElementById('fs-time-current');
    const fsTimeTotal = document.getElementById('fs-time-total');

    // === ФУНКЦИИ И УТИЛИТЫ ===
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        let icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info');
        let iconColor = type === 'success' ? '#32D74B' : (type === 'error' ? '#FF453A' : '#0A84FF'); 
        toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${iconColor}; font-size: 18px;"></i> <span>${message}</span>`;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hide'); setTimeout(() => toast.remove(), 400); }, 3500);
    }

    // Переключение экранов логина/регистрации
    document.getElementById('show-register').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-box').style.display = 'none'; document.getElementById('register-box').style.display = 'block'; });
    document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('register-box').style.display = 'none'; document.getElementById('login-box').style.display = 'block'; });

    async function apiRequest(url, body) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { localStorage.setItem('resonance_user', JSON.stringify(await res.json())); checkAuth(); } 
        else { showToast((await res.json()).error, 'error'); }
    }

    // === КНОПКИ АВТОРИЗАЦИИ И НАСТРОЕК (ВОССТАНОВЛЕНЫ) ===
    document.getElementById('login-btn').addEventListener('click', () => {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value.trim();
        if (u && p) apiRequest('/api/login', { username: u, password: p });
        else showToast('Введите логин и пароль', 'error');
    });

    document.getElementById('register-btn').addEventListener('click', () => {
        const u = document.getElementById('reg-username').value.trim();
        const e = document.getElementById('reg-email').value.trim();
        const p = document.getElementById('reg-password').value.trim();
        if (u && e && p) apiRequest('/api/register', { username: u, email: e, password: p });
        else showToast('Заполните все поля', 'error');
    });

    document.getElementById('verify-close-btn').addEventListener('click', () => document.getElementById('verification-modal').style.display = 'none');
    
    document.getElementById('verify-submit-btn').addEventListener('click', async () => {
        const code = document.getElementById('verify-code-input').value.trim();
        if (!code) return;
        const res = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, code: code }) });
        if (res.ok) { 
            showToast('Email подтвержден!', 'success'); 
            document.getElementById('verification-modal').style.display = 'none'; 
            localStorage.setItem('resonance_user', JSON.stringify(await res.json())); 
            checkAuth(); 
        } 
        else { showToast((await res.json()).error, 'error'); }
    });

    document.getElementById('update-email-btn')?.addEventListener('click', async () => {
        if(!currentUser) return;
        const newEmail = document.getElementById('set-email').value.trim();
        if(!newEmail || newEmail === currentUser.email) return;
        const res = await fetch('/api/settings/email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, newEmail: newEmail })
        });
        if (res.ok) {
            localStorage.setItem('resonance_user', JSON.stringify(await res.json())); 
            showToast('Email обновлен. Требуется подтверждение!', 'success');
            checkAuth();
            document.getElementById('verification-modal').style.display = 'flex';
        } else {
            showToast('Ошибка при смене почты', 'error');
        }
    });

    // === ОСТАЛЬНАЯ ЛОГИКА ===
    function loadSettingsLogs() {
        let logs = JSON.parse(localStorage.getItem(`admin_logs_${currentUser.username}`)) || [];
        const container = document.getElementById('admin-logs-list');
        if (container) {
            if (logs.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">Изменений не было.</p>';
            } else {
                container.innerHTML = logs.map(l => `
                    <div style="padding:12px; background:rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.05); margin-bottom:10px; border-radius:8px; font-size:13px;">
                        <div style="color:var(--accent); font-weight: 600; font-size:11px; margin-bottom:4px; text-transform: uppercase;">${new Date(l.date).toLocaleString()}</div>
                        ${l.msg}
                    </div>`).reverse().join('');
            }
        }
    }

    function updateArtistStatusUI() {
        const reqBtn = document.getElementById('request-artist-btn');
        const statusBox = document.getElementById('app-status-box');
        if(!reqBtn || !statusBox) return;

        if (currentUser.role === 'admin') {
            statusBox.style.display = 'flex';
            statusBox.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Вы являетесь администратором.';
            statusBox.className = 'status-box admin';
            reqBtn.style.display = 'none';
        } else if (currentUser.role === 'artist') {
            statusBox.style.display = 'flex';
            statusBox.innerHTML = '<i class="fa-solid fa-circle-check"></i> Вы являетесь артистом.';
            statusBox.className = 'status-box approved';
            reqBtn.style.display = 'none';
        } else {
            reqBtn.style.display = 'block';
            if (currentUser.app_status === 'pending') {
                statusBox.style.display = 'flex';
                statusBox.innerHTML = '<i class="fa-solid fa-clock"></i> Заявка на рассмотрении.';
                statusBox.className = 'status-box pending';
                reqBtn.disabled = true; reqBtn.textContent = 'Ожидайте';
            } else if (currentUser.app_status === 'rejected') {
                statusBox.style.display = 'flex';
                statusBox.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Заявка отклонена.';
                statusBox.className = 'status-box rejected';
                reqBtn.disabled = false; reqBtn.textContent = 'Подать снова';
            } else {
                statusBox.style.display = 'none'; reqBtn.disabled = false;
            }
        }
    }

    function checkAuth() {
        const userData = localStorage.getItem('resonance_user');
        if (userData) {
            currentUser = JSON.parse(userData);
            authScreen.style.display = 'none';
            mainApp.style.display = 'grid';
            
            let nameHtml = currentUser.username;
            if (currentUser.is_verified === false) {
                nameHtml += `<span class="unverified-badge" id="open-verify-modal" title="Нажмите, чтобы подтвердить" style="cursor:pointer;">Не подтвержден</span>`;
            }
            document.getElementById('user-profile-name').innerHTML = nameHtml;
            
            if (document.getElementById('open-verify-modal')) {
                document.getElementById('open-verify-modal').addEventListener('click', (e) => {
                    e.stopPropagation(); document.getElementById('verification-modal').style.display = 'flex';
                });
            }

            document.getElementById('set-username').value = currentUser.username;
            document.getElementById('set-email').value = currentUser.email || '';
            const adminAuthorInput = document.getElementById('up-author');
            if(adminAuthorInput) adminAuthorInput.value = currentUser.username;

            const rankBadge = document.getElementById('user-rank-badge');
            const navUpload = document.getElementById('nav-upload-container');
            const navAdmin = document.getElementById('nav-admin-container');
            const libTabMy = document.getElementById('lib-tab-mytracks');

            updateArtistStatusUI();

            if (currentUser.role === 'admin') {
                rankBadge.textContent = 'Администратор'; rankBadge.style.color = '#FF453A';
                navUpload.style.display = 'block'; navAdmin.style.display = 'block';
                libTabMy.style.display = 'inline-block';
            } else if (currentUser.role === 'artist') {
                rankBadge.textContent = 'Артист'; rankBadge.style.color = '#0A84FF';
                navUpload.style.display = 'block'; navAdmin.style.display = 'none';
                libTabMy.style.display = 'inline-block';
            } else {
                rankBadge.textContent = 'Слушатель'; rankBadge.style.color = '#8E8E93';
                navUpload.style.display = 'none'; navAdmin.style.display = 'none';
                libTabMy.style.display = 'none';
            }
            initApp();
        } else {
            authScreen.style.display = 'flex'; mainApp.style.display = 'none';
        }
    }

    function setGreeting() {
        const hour = new Date().getHours();
        const greetingEl = document.getElementById('greeting-text');
        if (!greetingEl) return;
        if (hour >= 5 && hour < 12) greetingEl.textContent = 'Доброе утро';
        else if (hour >= 12 && hour < 18) greetingEl.textContent = 'Добрый день';
        else if (hour >= 18 && hour < 23) greetingEl.textContent = 'Добрый вечер';
        else greetingEl.textContent = 'Доброй ночи';
    }

    async function toggleLike(trackId) {
        if(!trackId) return;
        const res = await fetch('/api/like', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({Username: currentUser.username, TrackID: trackId})
        });
        if (res.ok) {
            currentUser = await res.json();
            localStorage.setItem('resonance_user', JSON.stringify(currentUser));
            updateLikeButtons();
            
            if (currentUser.liked_tracks && currentUser.liked_tracks.includes(trackId)) showToast('Добавлено в избранное', 'success');
            else showToast('Удалено из избранного', 'info');

            if (document.getElementById('library-section').style.display !== 'none' && currentLibraryTab === 'likes') {
                renderLibrary();
            }
        }
    }

    function updateLikeButtons() {
        const isLiked = currentUser && currentUser.liked_tracks && currentUser.liked_tracks.includes(currentTrackId);
        const floatHeart = document.getElementById('float-like-btn');
        const fsHeart = document.getElementById('fs-like-btn');
        
        [floatHeart, fsHeart].forEach(btn => {
            if(!btn) return;
            if (isLiked) {
                btn.classList.add('liked'); btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
            } else {
                btn.classList.remove('liked'); btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
            }
        });
    }

    function updatePlayPauseUI() {
        if (!audio.src) return;
        const icon = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        if (playPauseIcon) playPauseIcon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        if (fsPlayBtn) fsPlayBtn.innerHTML = icon;
        if (drivePlayBtn) drivePlayBtn.innerHTML = icon;
    }

    function togglePlayPause() {
        if (!audio.src) return;
        if (isPlaying) audio.pause(); else audio.play();
        isPlaying = !isPlaying;
        updatePlayPauseUI();
    }

    function formatAuthors(t) {
        let html = `<span class="artist-link" data-name="${t.author}">${t.author}</span>`;
        if (t.collaborators && t.collaborators.length) t.collaborators.forEach(c => html += ` & <span class="artist-link" data-name="${c}">${c}</span>`);
        return html;
    }

    function getNextTrack() {
        if (!currentContextList || currentContextList.length === 0) return null;
        let listToUse = isShuffle ? shuffledList : currentContextList;
        const idx = listToUse.findIndex(t => t.id === currentTrackId);
        if (idx !== -1 && idx < listToUse.length - 1) return listToUse[idx + 1];
        if (repeatMode === 2 && listToUse.length > 0) return listToUse[0]; 
        return null;
    }

    function getPrevTrack() {
        if (!currentContextList || currentContextList.length === 0) return null;
        let listToUse = isShuffle ? shuffledList : currentContextList;
        const idx = listToUse.findIndex(t => t.id === currentTrackId);
        if (idx > 0) return listToUse[idx - 1];
        if (repeatMode === 2 && listToUse.length > 0) return listToUse[listToUse.length - 1];
        return null;
    }

    function playTrack(track, contextList) {
        isLiveRadio = false; currentTrackId = track.id;
        if(contextList) currentContextList = contextList;
        
        updateLikeButtons();
        audio.src = `/api/stream?id=${track.file_name}`;
        
        document.getElementById('player-cover').src = track.cover;
        document.getElementById('player-title').textContent = track.title;
        document.getElementById('player-author').innerHTML = formatAuthors(track);
        
        if (driveOverlay && driveOverlay.classList.contains('active')) {
            document.getElementById('drive-cover').src = track.cover;
            document.getElementById('drive-title').textContent = track.title;
            document.getElementById('drive-author').textContent = track.author;
        }

        if(floatingPlayer) floatingPlayer.classList.add('active'); 
        
        if (fsPlayer && fsPlayer.classList.contains('active')) {
            document.getElementById('fs-cover').src = track.cover;
            document.getElementById('fs-title').textContent = track.title;
            document.getElementById('fs-author').innerHTML = formatAuthors(track);
        }

        audio.play(); isPlaying = true; 
        updatePlayPauseUI();
        
        if(progressSlider) progressSlider.disabled = false; 
        if(fsProgress) fsProgress.disabled = false;
    }

    function playRadio(url, title, cover) {
        isLiveRadio = true; currentTrackId = null; isMyWaveMode = false; currentContextList = [];
        updateLikeButtons();
        audio.src = url;
        document.getElementById('player-cover').src = cover;
        document.getElementById('player-title').textContent = title;
        document.getElementById('player-author').textContent = "Прямой эфир (LIVE)";
        
        if(floatingPlayer) floatingPlayer.classList.add('active'); 
        
        if (fsPlayer && fsPlayer.classList.contains('active')) {
            document.getElementById('fs-cover').src = cover;
            document.getElementById('fs-title').textContent = title;
            document.getElementById('fs-author').textContent = "Прямой эфир (LIVE)";
        }

        audio.play(); isPlaying = true; 
        updatePlayPauseUI();
        if(progressSlider) progressSlider.disabled = true; 
        if(fsProgress) fsProgress.disabled = true;
        if (fsTimeTotal) fsTimeTotal.textContent = "0:00";
    }

    function playMyWaveNext(isFirst = false) {
        const now = Math.floor(Date.now() / 1000);
        const available = globalTracks.filter(t => {
            const relDate = t.release_date || 0;
            return !t.hidden && (relDate === 0 || relDate <= now) && t.id !== currentTrackId;
        });
        
        if (available.length === 0) { showToast('Больше нет доступных треков', 'info'); isMyWaveMode = false; return; }

        let activeGenreForWave = document.body.classList.contains('powerlift-mode') ? 'powerlift' : 'all';
        let filteredAvailable = available;

        if (activeGenreForWave === 'powerlift') {
            const heavyGenres = ['Тяжелый Рок', 'Электроника', 'Хип-Хоп'];
            filteredAvailable = available.filter(t => heavyGenres.includes(t.genre));
            if(filteredAvailable.length === 0) filteredAvailable = available; 
        }

        const likedIds = (currentUser && currentUser.liked_tracks) || [];
        const likes = filteredAvailable.filter(t => likedIds.includes(t.id));
        const others = filteredAvailable.filter(t => !likedIds.includes(t.id));
        
        const shuffledLikes = likes.sort(() => 0.5 - Math.random());
        const shuffledOthers = others.sort(() => 0.5 - Math.random());
        
        let nextTrack;
        if (shuffledLikes.length > 0 && Math.random() > 0.4) nextTrack = shuffledLikes[0];
        else if (shuffledOthers.length > 0) nextTrack = shuffledOthers[0];
        else nextTrack = shuffledLikes[0];

        if (nextTrack) {
            playTrack(nextTrack, currentContextList);
            if(!isFirst) showToast('Моя Волна: следующий трек', 'info');
            isMyWaveMode = true; 
        }
    }

    function playMyWave() {
        if(globalTracks.length === 0) { showToast('Медиатека пока пуста', 'error'); return; }
        isMyWaveMode = true; currentContextList = globalTracks;
        playMyWaveNext(true);
        showToast('Включаю Мою Волну 🌊', 'info');
    }

    function playNext() {
        if (isMyWaveMode) { playMyWaveNext(); return; }
        const next = getNextTrack();
        if (next) playTrack(next, currentContextList);
        else showToast('Вы достигли конца списка', 'info');
    }

    function playPrev() {
        if (isMyWaveMode) { showToast('В Моей Волне нельзя вернуться назад', 'info'); return; }
        if (audio.currentTime > 3) { audio.currentTime = 0; return; }
        const prev = getPrevTrack();
        if (prev) playTrack(prev, currentContextList);
        else showToast('Это первый трек', 'info');
    }

    function toggleShuffle() {
        isShuffle = !isShuffle;
        const btns = [document.getElementById('float-shuffle-btn'), document.getElementById('fs-shuffle')];
        btns.forEach(b => { if(b) { if(isShuffle) b.classList.add('active'); else b.classList.remove('active'); }});
        if(isShuffle && currentContextList.length > 0) {
            shuffledList = [...currentContextList].sort(() => 0.5 - Math.random());
        }
    }

    function toggleRepeat() {
        repeatMode = (repeatMode + 1) % 3;
        const btns = [document.getElementById('float-repeat-btn'), document.getElementById('fs-repeat')];
        btns.forEach(b => {
            if(!b) return;
            if(repeatMode === 0) { b.classList.remove('active'); b.innerHTML = '<i class="fa-solid fa-repeat"></i>'; }
            else if(repeatMode === 1) { b.classList.add('active'); b.innerHTML = '<i class="fa-solid fa-repeat"></i><span style="font-size:10px;position:absolute;margin-left:-8px;margin-top:2px;">1</span>'; }
            else { b.classList.add('active'); b.innerHTML = '<i class="fa-solid fa-repeat"></i>'; }
        });
    }

    function renderLibrary() {
        const cont = document.getElementById('library-results-section');
        if (currentLibraryTab === 'likes') {
            const likedIds = (currentUser && currentUser.liked_tracks) || [];
            const toRender = globalTracks.filter(t => likedIds.includes(t.id));
            filterAndRender(toRender, cont);
        } else {
            const toRender = globalTracks.filter(t => t.author === currentUser.username);
            filterAndRender(toRender, cont);
        }
    }

    function renderHomeSections() {
        const now = Math.floor(Date.now() / 1000);
        let visibleTracks = globalTracks.filter(t => {
            if (currentUser && currentUser.role === 'admin') return true;
            const relDate = t.release_date || 0;
            if (t.hidden || (relDate > 0 && relDate > now)) return false;
            return true;
        });

        if (activeGenre !== 'Всё подряд') {
            visibleTracks = visibleTracks.filter(t => t.genre === activeGenre);
            if (activeGenre === 'Тренировка') visibleTracks.sort((a, b) => (b.plays || 0) - (a.plays || 0));
        }

        const recContainer = document.getElementById('recommended-section');
        const newContainer = document.getElementById('new-releases-section');
        const recHeading = document.getElementById('rec-heading');
        const newHeading = document.getElementById('new-heading');
        
        if(recContainer && newContainer && recHeading && newHeading) {
            if (activeGenre === 'Всё подряд') {
                recHeading.textContent = 'Рекомендуем вам';
                newHeading.style.display = 'block';
                const shuffled = [...visibleTracks].sort(() => 0.5 - Math.random());
                renderTracks(shuffled.slice(0, 5), recContainer); 
                renderTracks(visibleTracks.slice(-10).reverse(), newContainer);
            } else {
                recHeading.textContent = activeGenre;
                newHeading.style.display = 'none';
                newContainer.innerHTML = ''; 
                renderTracks(visibleTracks, recContainer);
            }
        }
    }

    function filterAndRender(list, container) {
        if(!container) return;
        const now = Math.floor(Date.now() / 1000);
        const visible = list.filter(t => {
            if (currentUser && currentUser.role === 'admin') return true;
            const relDate = t.release_date || 0;
            if (t.hidden || (relDate > 0 && relDate > now)) return false;
            return true;
        });
        renderTracks(visible, container);
    }

    function renderTracks(list, container) {
        container.innerHTML = ''; 
        if (list.length === 0) { container.innerHTML = '<p class="section-desc" style="grid-column: 1/-1; color: #8E8E93;">Здесь пока ничего нет</p>'; return; }
        list.forEach(t => {
            const card = document.createElement('div'); card.className = `track-card ${t.hidden ? 'hidden-track' : ''}`;
            
            let adminMenuHtml = '';
            if (currentUser && currentUser.role === 'admin') {
                adminMenuHtml = `
                <button class="admin-dots"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                <div class="admin-menu">
                    <button class="admin-edit-track" data-id="${t.id}">Изменить название</button>
                    <button class="admin-hide-track" data-id="${t.id}">${t.hidden ? 'Сделать видимым' : 'Скрыть из поиска'}</button>
                    <button class="admin-del-track" data-id="${t.id}">Удалить трек</button>
                </div>`;
            }

            card.innerHTML = `
                <div class="track-cover">
                    <img src="${t.cover}" alt="Cover">
                    <button class="play-btn-overlay" data-play="${t.id}"><i class="fa-solid fa-play"></i></button>
                    ${adminMenuHtml}
                </div>
                <div class="track-info"><h3>${t.title}</h3><p>${formatAuthors(t)}</p></div>`;
            container.appendChild(card);
        });
    }

    async function loadTracks() {
        globalTracks = await (await fetch('/api/tracks')).json() || [];
        renderHomeSections();
    }

    async function loadAdminData() {
        const st = await (await fetch('/api/admin/stats')).json();
        document.getElementById('stat-users').textContent = st.total_users; document.getElementById('stat-tracks').textContent = st.total_tracks; document.getElementById('stat-apps').textContent = st.pending_apps;
        
        const apps = await (await fetch('/api/admin/apps')).json();
        const aTbody = document.getElementById('admin-apps-tbody'); aTbody.innerHTML = '';
        if(!apps || !apps.length) aTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Нет заявок</td></tr>';
        else apps.forEach(a => aTbody.innerHTML += `<tr><td>${a.username}</td><td>Ожидает</td><td><button class="btn-sm btn-approve" data-u="${a.username}">Одобрить</button> <button class="btn-sm btn-reject" data-u="${a.username}">Отклонить</button></td></tr>`);
        
        const usrs = await (await fetch('/api/admin/users')).json();
        const uTbody = document.getElementById('admin-users-tbody'); uTbody.innerHTML = '';
        usrs.forEach(u => {
            let btns = `
                <button class="btn-sm btn-action set-role" data-u="${u.username}" data-r="admin" title="Сделать администратором"><i class="fa-solid fa-shield"></i></button>
                <button class="btn-sm btn-action set-role" data-u="${u.username}" data-r="artist" title="Сделать артистом"><i class="fa-solid fa-music"></i></button>
                <button class="btn-sm btn-action set-role" data-u="${u.username}" data-r="user" title="Сделать слушателем"><i class="fa-solid fa-user"></i></button>
                <button class="btn-sm btn-reject delete-user" data-u="${u.username}">Удалить</button>
            `;
            uTbody.innerHTML += `<tr><td>${u.username} ${u.username === currentUser.username ? '(Вы)' : ''}</td><td>${u.email}</td><td>${u.role}</td><td>${u.is_verified?'Да':'Нет'}</td><td>${btns}</td></tr>`;
        });
    }

    // === ИНИЦИАЛИЗАЦИЯ И ПРИВЯЗКА СОБЫТИЙ ОДИН РАЗ ===
    let appInitialized = false;
    function initApp() {
        if (appInitialized) return;
        appInitialized = true;
        
        setGreeting();
        
        document.getElementById('mobile-menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
        document.getElementById('mobile-close-btn').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));
        const profileBtn = document.getElementById('profile-btn');
        profileBtn.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('profile-dropdown').classList.toggle('active'); });
        document.getElementById('drop-logout').addEventListener('click', () => { localStorage.removeItem('resonance_user'); window.location.reload(); });
        
        const sections = { home: document.getElementById('home-section'), search: document.getElementById('search-section'), radio: document.getElementById('radio-section'), library: document.getElementById('library-section'), settings: document.getElementById('settings-section'), upload: document.getElementById('upload-section'), admin: document.getElementById('admin-section'), artist: document.getElementById('artist-profile-section'), staff: document.getElementById('staff-section') };
        const navLinks = { home: document.getElementById('nav-home'), search: document.getElementById('nav-search'), radio: document.getElementById('nav-radio'), library: document.getElementById('nav-library'), upload: document.getElementById('nav-upload'), admin: document.getElementById('nav-admin'), staff: document.getElementById('nav-staff') };

        function switchSec(nav, sec, title) {
            document.querySelectorAll('.menu a, .role-link a').forEach(el => el.classList.remove('active'));
            Object.values(sections).forEach(s => { if(s) s.style.display = 'none'; });
            if(nav) nav.classList.add('active');
            if(sec) {
                if(sec.id === 'search-section' || sec.id === 'artist-profile-section') sec.style.display = 'grid';
                else sec.style.display = 'block';
            }
            document.getElementById('page-title').textContent = title;
            document.getElementById('sidebar').classList.remove('open'); 
        }

        document.getElementById('logo-link').addEventListener('click', () => navLinks.home.click());
        document.getElementById('drop-home').addEventListener('click', (e) => { e.preventDefault(); navLinks.home.click(); });
        
        document.getElementById('drop-settings').addEventListener('click', (e) => { 
            e.preventDefault(); loadSettingsLogs(); switchSec(null, sections.settings, "Настройки"); 
        });
        
        navLinks.home.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.home, sections.home, "Слушать"); renderHomeSections(); });
        navLinks.search.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.search, sections.search, "Поиск"); document.getElementById('search-input').focus(); });
        navLinks.radio.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.radio, sections.radio, "Радио"); });
        navLinks.library.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.library, sections.library, "Медиатека"); renderLibrary(); });
        if(navLinks.upload) navLinks.upload.addEventListener('click', async (e) => { e.preventDefault(); const r = await fetch('/api/artists'); allArtists = await r.json(); switchSec(navLinks.upload, sections.upload, "Студия"); });
        if(navLinks.admin) navLinks.admin.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.admin, sections.admin, "Управление"); loadAdminData(); });
        
        navLinks.staff.addEventListener('click', async (e) => { 
            e.preventDefault(); 
            switchSec(navLinks.staff, sections.staff, "Команда проекта"); 
            const r = await fetch('/api/staff');
            if(r.ok) {
                const data = await r.json();
                const grid = document.getElementById('staff-grid');
                grid.innerHTML = data.map(u => `
                    <div class="staff-card">
                        <div class="avatar-circle" style="width:60px; height:60px; font-size:24px; background:var(--bg-elevated); color:var(--accent); margin: 0 auto 12px auto;"><i class="fa-solid fa-shield"></i></div>
                        <h4>${u.username}</h4>
                        <div class="staff-role">Администратор</div>
                    </div>`).join('');
            }
        });

        document.getElementById('search-input').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const cont = document.getElementById('search-results-section');
            if (q === '') { cont.innerHTML = ''; return; }
            filterAndRender(globalTracks.filter(t => t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)), cont);
        });

        document.getElementById('play-random-btn').addEventListener('click', () => {
            const now = Math.floor(Date.now() / 1000);
            const visibleTracks = globalTracks.filter(t => {
                const relDate = t.release_date || 0;
                return !t.hidden && (relDate === 0 || relDate <= now);
            });
            if (visibleTracks.length > 0) { 
                currentContextList = visibleTracks;
                playTrack(visibleTracks[Math.floor(Math.random() * visibleTracks.length)], currentContextList); 
            } else { showToast('Доступных треков нет', 'info'); }
        });

        document.getElementById('play-my-wave-btn').addEventListener('click', playMyWave);
        document.getElementById('lib-my-wave-btn').addEventListener('click', playMyWave);

        document.getElementById('lib-tab-likes').addEventListener('click', (e) => {
            document.querySelectorAll('.library-tabs .tag-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active'); currentLibraryTab = 'likes'; renderLibrary();
        });
        document.getElementById('lib-tab-mytracks').addEventListener('click', (e) => {
            document.querySelectorAll('.library-tabs .tag-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active'); currentLibraryTab = 'mytracks'; renderLibrary();
        });

        // Навигация
        document.getElementById('fs-next').addEventListener('click', playNext);
        document.getElementById('float-next-btn').addEventListener('click', playNext);
        document.getElementById('fs-prev').addEventListener('click', playPrev);
        document.getElementById('float-prev-btn').addEventListener('click', playPrev);

        // Раскрытие плеера
        const expandBtn = document.getElementById('expand-player-btn');
        const closeFsBtn = document.getElementById('close-fullscreen');
        
        expandBtn.addEventListener('click', () => {
            if(!currentTrackId && !isLiveRadio) return; 
            fsPlayer.classList.add('active');
            document.getElementById('fs-cover').src = document.getElementById('player-cover').src;
            document.getElementById('fs-title').textContent = document.getElementById('player-title').textContent;
            
            if (isLiveRadio) {
                document.getElementById('fs-author').textContent = "Прямой эфир (LIVE)";
            } else {
                const currentTrack = globalTracks.find(t => t.id === currentTrackId);
                if (currentTrack) document.getElementById('fs-author').innerHTML = formatAuthors(currentTrack);
            }
            updatePlayPauseUI();
            updateLikeButtons();
        });

        closeFsBtn.addEventListener('click', () => fsPlayer.classList.remove('active'));
        if(fsPlayBtn) fsPlayBtn.addEventListener('click', togglePlayPause);
        if(playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);

        // УТП Режимы
        const powerliftBtn = document.getElementById('usp-powerlift-btn');
        if(powerliftBtn) powerliftBtn.addEventListener('click', () => {
            document.body.classList.toggle('powerlift-mode');
            powerliftBtn.classList.toggle('active');
            if(document.body.classList.contains('powerlift-mode')) {
                showToast('Powerlift Mode: Тяжелые треки, True Black', 'success');
                if(isMyWaveMode) playMyWaveNext(); 
            } else { showToast('Powerlift Mode отключен', 'info'); }
        });

        const driveBtn = document.getElementById('usp-drive-btn');
        const closeDriveBtn = document.getElementById('close-drive-mode');
        
        if(driveBtn) driveBtn.addEventListener('click', () => {
            if(!currentTrackId && !isLiveRadio) { showToast('Сначала включите трек', 'error'); return; }
            driveOverlay.classList.add('active');
            document.getElementById('drive-cover').src = document.getElementById('player-cover').src;
            document.getElementById('drive-title').textContent = document.getElementById('player-title').textContent;
            
            if (isLiveRadio) document.getElementById('drive-author').textContent = "Прямой эфир (LIVE)";
            else {
                const ct = globalTracks.find(t => t.id === currentTrackId);
                if (ct) document.getElementById('drive-author').textContent = ct.author;
            }
            updatePlayPauseUI();
        });

        if(closeDriveBtn) closeDriveBtn.addEventListener('click', () => driveOverlay.classList.remove('active'));
        if(drivePlayBtn) drivePlayBtn.addEventListener('click', togglePlayPause);
        document.getElementById('drive-next')?.addEventListener('click', playNext);
        document.getElementById('drive-prev')?.addEventListener('click', playPrev);

        // Жанры
        let appGenres = JSON.parse(localStorage.getItem('resonance_genres')) || ['Всё подряд', 'Новинки', 'Электроника', 'Тяжелый Рок', 'Хип-Хоп', 'В дорогу', 'Тренировка'];

        window.renderGenresUI = function() {
            const tagsContainer = document.getElementById('genre-tags');
            if (tagsContainer) {
                tagsContainer.innerHTML = '';
                appGenres.forEach(g => {
                    const btn = document.createElement('button');
                    btn.className = `tag-btn ${g === activeGenre ? 'active' : ''}`;
                    btn.textContent = g;
                    btn.addEventListener('click', (e) => {
                        document.querySelectorAll('#genre-tags .tag-btn').forEach(b => b.classList.remove('active'));
                        e.target.classList.add('active'); activeGenre = g; renderHomeSections();
                    });
                    tagsContainer.appendChild(btn);
                });
            }

            const select = document.getElementById('up-genre');
            if (select) {
                select.innerHTML = '';
                appGenres.forEach(g => {
                    const opt = document.createElement('option'); opt.value = g; opt.textContent = g; select.appendChild(opt);
                });
            }

            const tbody = document.getElementById('admin-genres-tbody');
            if (tbody) {
                tbody.innerHTML = '';
                appGenres.forEach(g => {
                    const tr = document.createElement('tr');
                    const isProtected = g === 'Всё подряд';
                    tr.innerHTML = `<td>${g}</td><td>${isProtected ? '<span style="color:var(--text-muted); font-size:12px;">Базовый</span>' : `<button class="btn-sm btn-reject delete-genre-btn" data-g="${g}">Удалить</button>`}</td>`;
                    tbody.appendChild(tr);
                });
            }
        };

        document.getElementById('add-genre-btn')?.addEventListener('click', () => {
            const input = document.getElementById('new-genre-input');
            const val = input.value.trim();
            if (val && !appGenres.includes(val)) {
                appGenres.push(val); localStorage.setItem('resonance_genres', JSON.stringify(appGenres));
                window.renderGenresUI(); input.value = ''; showToast('Жанр добавлен', 'success');
            }
        });

        document.querySelectorAll('.admin-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
                e.target.classList.add('active');
                document.getElementById(`admin-tab-${e.target.dataset.tab}`).style.display = 'block';
            });
        });

        document.getElementById('upload-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: new FormData(e.target) });
                if (res.ok) { showToast('Трек успешно загружен!', 'success'); e.target.reset(); document.getElementById('preview-img').src = 'https://via.placeholder.com/300/1C1C1E?text=Cover'; loadTracks(); navLinks.home.click(); }
                else { showToast('Ошибка', 'error'); }
            } catch (err) { showToast('Ошибка сети', 'error'); }
        });

        // Делегирование глобальных кликов
        document.addEventListener('click', async (e) => {
            if (!e.target.closest('#profile-btn')) { const pd = document.getElementById('profile-dropdown'); if (pd) pd.classList.remove('active'); }
            
            const adminDots = e.target.closest('.admin-dots');
            if (adminDots) { 
                e.preventDefault(); e.stopPropagation(); 
                const m = adminDots.nextElementSibling; 
                document.querySelectorAll('.admin-menu').forEach(x => { if(x !== m) x.classList.remove('active'); }); 
                m.classList.toggle('active'); return; 
            }
            if (!e.target.closest('.admin-menu')) document.querySelectorAll('.admin-menu').forEach(m => m.classList.remove('active'));

            if (e.target.classList.contains('admin-edit-track')) {
                const id = e.target.dataset.id; const newTitle = prompt("Введите новое название трека:");
                if(newTitle) {
                    await fetch('/api/admin/track', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({TrackID: id, Action: 'edit_title', NewTitle: newTitle})});
                    loadTracks(); showToast('Название изменено', 'success');
                }
            }
            if (e.target.classList.contains('admin-hide-track')) {
                const id = e.target.dataset.id;
                await fetch('/api/admin/track', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({TrackID: id, Action: 'toggle_hide'})});
                loadTracks(); showToast('Видимость изменена', 'success');
            }
            if (e.target.classList.contains('admin-del-track')) {
                const id = e.target.dataset.id;
                if(confirm('Точно удалить трек?')) {
                    await fetch('/api/admin/track', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({TrackID: id, Action: 'delete'})});
                    loadTracks(); showToast('Трек удален', 'info');
                }
            }

            const playBtnOverlay = e.target.closest('.play-btn-overlay');
            if (playBtnOverlay && !e.target.closest('.radio-card')) {
                e.stopPropagation();
                const tid = playBtnOverlay.dataset.play;
                const track = globalTracks.find(t => t.id === tid);
                const container = playBtnOverlay.closest('.tracks-container');
                if(container) {
                    const ids = Array.from(container.querySelectorAll('.play-btn-overlay')).map(b => b.dataset.play);
                    currentContextList = globalTracks.filter(gt => ids.includes(gt.id));
                    if(isShuffle) shuffledList = [...currentContextList].sort(() => 0.5 - Math.random());
                } else { currentContextList = [track]; }
                
                if (track) { isMyWaveMode = false; playTrack(track, currentContextList); }
                return;
            }
            
            const radioCard = e.target.closest('.radio-card');
            if (radioCard) { playRadio(radioCard.dataset.url, radioCard.dataset.title, "https://via.placeholder.com/300/1C1C1E/FA243C?text=RADIO"); return; }

            if (e.target.classList.contains('delete-genre-btn')) {
                const g = e.target.dataset.g; appGenres = appGenres.filter(x => x !== g);
                localStorage.setItem('resonance_genres', JSON.stringify(appGenres));
                if(activeGenre === g) activeGenre = 'Всё подряд';
                window.renderGenresUI(); renderHomeSections(); showToast('Жанр удален', 'info'); return;
            }

            const roleBtn = e.target.closest('.set-role');
            if (roleBtn) {
                const targetUser = roleBtn.dataset.u;
                const newRole = roleBtn.dataset.r;
                const res = await fetch('/api/admin/user_action', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({Username: targetUser, Action: 'set_role', Role: newRole}) });
                
                if (res.ok) {
                    showToast(`Роль для ${targetUser} изменена на ${newRole}`, 'success');
                    let logs = JSON.parse(localStorage.getItem(`admin_logs_${targetUser}`)) || [];
                    logs.push({ date: Date.now(), msg: `Администратор (<b>${currentUser.username}</b>) изменил вашу роль на: <b>${newRole}</b>.` });
                    localStorage.setItem(`admin_logs_${targetUser}`, JSON.stringify(logs));
                    
                    if (targetUser === currentUser.username) {
                        currentUser.role = newRole; localStorage.setItem('resonance_user', JSON.stringify(currentUser));
                    }
                    loadAdminData();
                } else { showToast('Ошибка при смене роли', 'error'); }
                return;
            }

            if (e.target.classList.contains('artist-link')) {
                e.preventDefault(); e.stopPropagation();
                const name = e.target.dataset.name;
                const r = await fetch(`/api/artist?name=${encodeURIComponent(name)}`);
                if (r.ok) {
                    const data = await r.json();
                    document.getElementById('artist-profile-name').textContent = data.name;
                    document.getElementById('artist-profile-stats').textContent = `${data.total_tracks} треков • ${data.total_plays} прослушиваний`;
                    renderTracks(data.tracks, document.getElementById('artist-tracks-container'));
                    switchSec(null, sections.artist, "Профиль артиста");
                    if(fsPlayer.classList.contains('active')) fsPlayer.classList.remove('active');
                }
                return;
            }
        });

        // Работа с Audio API
        function formatTime(sec) { if (isNaN(sec) || !isFinite(sec)) return "0:00"; return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`; }
        
        audio.addEventListener('loadedmetadata', () => { 
            if (!isLiveRadio) {
                if(totalTimeEl) totalTimeEl.textContent = formatTime(audio.duration); 
                if(fsTimeTotal) fsTimeTotal.textContent = formatTime(audio.duration);
            }
        });
        
        audio.addEventListener('timeupdate', () => {
            if (isLiveRadio) return; 
            if (currentUser && currentUser.is_verified === false && audio.currentTime >= 30) {
                audio.pause(); isPlaying = false; updatePlayPauseUI();
                document.getElementById('verification-modal').style.display = 'flex';
                showToast('Требуется подтверждение почты', 'error'); return; 
            }
            const currTimeStr = formatTime(audio.currentTime);
            if(currentTimeEl) currentTimeEl.textContent = currTimeStr;
            if (fsTimeCurrent) fsTimeCurrent.textContent = currTimeStr;

            if (audio.duration && isFinite(audio.duration)) {
                const percent = (audio.currentTime / audio.duration) * 100;
                if(progressSlider) {
                    progressSlider.value = percent;
                    progressSlider.style.background = `linear-gradient(to right, #ffffff ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
                }
                if(fsProgress) {
                    fsProgress.value = percent;
                    fsProgress.style.background = `linear-gradient(to right, #FA243C ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
                }
            }
        });
        
        audio.addEventListener('ended', () => {
            if(repeatMode === 1) { audio.currentTime = 0; audio.play(); return; }
            playNext(); 
            if(!isPlaying) updatePlayPauseUI();
        });

        if(progressSlider) progressSlider.addEventListener('input', (e) => { if (audio.src && !isLiveRadio) audio.currentTime = (e.target.value / 100) * audio.duration; });
        if(fsProgress) fsProgress.addEventListener('input', (e) => { if (audio.src && !isLiveRadio) audio.currentTime = (e.target.value / 100) * audio.duration; });
        
        const volumeSlider = document.querySelector('.volume-slider');
        if(volumeSlider) {
            volumeSlider.addEventListener('input', (e) => { 
                audio.volume = e.target.value / 100; 
                e.target.style.background = `linear-gradient(to right, #ffffff ${e.target.value}%, rgba(255,255,255,0.1) ${e.target.value}%)`; 
            });
            volumeSlider.dispatchEvent(new Event('input'));
        }

        window.renderGenresUI();
        loadTracks();
    }
    
    // Запуск авторизации
    checkAuth();
});