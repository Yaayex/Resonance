document.addEventListener('DOMContentLoaded', () => {
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    
    document.getElementById('show-register').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-box').style.display = 'none'; document.getElementById('register-box').style.display = 'block'; });
    document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('register-box').style.display = 'none'; document.getElementById('login-box').style.display = 'block'; });

    let audio; 
    let globalTracks = [];
    let currentUser = null;
    let allArtists = [];
    let isLiveRadio = false;
    
    let activeGenre = 'Всё подряд';
    let currentTrackId = null;
    let isMyWaveMode = false;
    let currentLibraryTab = 'likes';

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
            const reqBtn = document.getElementById('request-artist-btn');
            const statusBox = document.getElementById('app-status-box');
            const libTabMy = document.getElementById('lib-tab-mytracks');

            if (currentUser.role === 'admin') {
                rankBadge.textContent = 'Администратор'; rankBadge.style.color = '#FF453A';
                navUpload.style.display = 'block'; navAdmin.style.display = 'block'; reqBtn.style.display = 'none';
                libTabMy.style.display = 'inline-block';
            } else if (currentUser.role === 'artist') {
                rankBadge.textContent = 'Артист'; rankBadge.style.color = '#0A84FF';
                navUpload.style.display = 'block'; navAdmin.style.display = 'none'; reqBtn.style.display = 'none';
                libTabMy.style.display = 'inline-block';
            } else {
                rankBadge.textContent = 'Слушатель'; rankBadge.style.color = '#8E8E93';
                navUpload.style.display = 'none'; navAdmin.style.display = 'none';
                libTabMy.style.display = 'none';
                
                if (currentUser.app_status === 'pending') {
                    statusBox.textContent = 'Заявка на рассмотрении.'; statusBox.className = 'status-box status-pending'; reqBtn.disabled = true; reqBtn.textContent = 'Ожидайте';
                } else if (currentUser.app_status === 'rejected') {
                    statusBox.textContent = 'Заявка отклонена.'; statusBox.className = 'status-box status-rejected'; reqBtn.disabled = false; reqBtn.textContent = 'Подать снова';
                } else {
                    statusBox.style.display = 'none'; reqBtn.disabled = false;
                }
            }
            initApp();
        } else {
            authScreen.style.display = 'flex'; mainApp.style.display = 'none';
        }
    }

    async function apiRequest(url, body) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { localStorage.setItem('resonance_user', JSON.stringify(await res.json())); checkAuth(); } 
        else { showToast((await res.json()).error, 'error'); }
    }

    document.getElementById('login-btn').addEventListener('click', () => {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value.trim();
        if (u && p) apiRequest('/api/login', { username: u, password: p });
    });
    document.getElementById('register-btn').addEventListener('click', () => {
        const u = document.getElementById('reg-username').value.trim();
        const e = document.getElementById('reg-email').value.trim();
        const p = document.getElementById('reg-password').value.trim();
        if (u && e && p) apiRequest('/api/register', { username: u, email: e, password: p });
    });
    document.getElementById('verify-close-btn').addEventListener('click', () => document.getElementById('verification-modal').style.display = 'none');
    document.getElementById('verify-submit-btn').addEventListener('click', async () => {
        const code = document.getElementById('verify-code-input').value.trim();
        if (!code) return;
        const res = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, code: code }) });
        if (res.ok) { showToast('Email подтвержден!', 'success'); document.getElementById('verification-modal').style.display = 'none'; localStorage.setItem('resonance_user', JSON.stringify(await res.json())); checkAuth(); } 
        else { showToast((await res.json()).error, 'error'); }
    });

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
                btn.classList.add('liked');
                btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
            } else {
                btn.classList.remove('liked');
                btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
            }
        });
    }

    document.getElementById('float-like-btn').addEventListener('click', () => toggleLike(currentTrackId));
    document.getElementById('fs-like-btn').addEventListener('click', () => toggleLike(currentTrackId));

    function playMyWave() {
        if(globalTracks.length === 0) {
            showToast('Медиатека пока пуста', 'error');
            return;
        }
        isMyWaveMode = true;
        playMyWaveNext(true);
        showToast('Включаю Мою Волну 🌊', 'info');
    }

    function playMyWaveNext(isFirst = false) {
        const now = Math.floor(Date.now() / 1000);
        const available = globalTracks.filter(t => {
            const relDate = t.release_date || 0;
            return !t.hidden && (relDate === 0 || relDate <= now) && t.id !== currentTrackId;
        });
        
        if (available.length === 0) {
            showToast('Больше нет доступных треков', 'info');
            isMyWaveMode = false;
            return;
        }

        const likedIds = (currentUser && currentUser.liked_tracks) || [];
        const likes = available.filter(t => likedIds.includes(t.id));
        const others = available.filter(t => !likedIds.includes(t.id));
        
        const shuffledLikes = likes.sort(() => 0.5 - Math.random());
        const shuffledOthers = others.sort(() => 0.5 - Math.random());
        
        let nextTrack;
        if (shuffledLikes.length > 0 && Math.random() > 0.4) {
            nextTrack = shuffledLikes[0];
        } else if (shuffledOthers.length > 0) {
            nextTrack = shuffledOthers[0];
        } else {
            nextTrack = shuffledLikes[0];
        }

        if (nextTrack) {
            playTrack(nextTrack);
            if(!isFirst) showToast('Моя Волна: следующий трек', 'info');
        }
    }

    function initApp() {
        if (audio) return; 
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
        document.getElementById('drop-settings').addEventListener('click', (e) => { e.preventDefault(); switchSec(null, sections.settings, "Настройки"); });
        
        navLinks.home.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.home, sections.home, "Слушать"); renderHomeSections(); });
        navLinks.search.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.search, sections.search, "Поиск"); document.getElementById('search-input').focus(); });
        navLinks.radio.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.radio, sections.radio, "Радио"); });
        navLinks.library.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.library, sections.library, "Медиатека"); renderLibrary(); });
        if(navLinks.upload) navLinks.upload.addEventListener('click', (e) => { e.preventDefault(); fetchArtists(); switchSec(navLinks.upload, sections.upload, "Студия"); });
        if(navLinks.admin) navLinks.admin.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.admin, sections.admin, "Управление"); loadAdminData(); });

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
            if (visibleTracks.length > 0) { playTrack(visibleTracks[Math.floor(Math.random() * visibleTracks.length)]); }
            else { showToast('Доступных треков нет', 'info'); }
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

        const fsPlayer = document.getElementById('fullscreen-player');
        const expandBtn = document.getElementById('expand-player-btn');
        const closeFsBtn = document.getElementById('close-fullscreen');
        const fsPlayBtn = document.getElementById('fs-play-pause');
        const fsProgress = document.getElementById('fs-progress-slider');
        const fsTimeCurrent = document.getElementById('fs-time-current');
        const fsTimeTotal = document.getElementById('fs-time-total');
        const floatNextBtn = document.getElementById('float-next-btn');

        expandBtn.addEventListener('click', () => {
            if(!currentTrackId && !isLiveRadio) return; 
            fsPlayer.classList.add('active');
            document.getElementById('fs-cover').src = document.getElementById('player-cover').src;
            document.getElementById('fs-title').textContent = document.getElementById('player-title').textContent;
            
            // Если включено радио
            if (isLiveRadio) {
                document.getElementById('fs-author').textContent = "Прямой эфир (LIVE)";
            } else {
                const currentTrack = globalTracks.find(t => t.id === currentTrackId);
                if (currentTrack) {
                    document.getElementById('fs-author').innerHTML = formatAuthors(currentTrack);
                }
            }

            fsPlayBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
            updateLikeButtons();
        });

        closeFsBtn.addEventListener('click', () => fsPlayer.classList.remove('active'));

        fsPlayBtn.addEventListener('click', () => {
            playPauseBtn.click();
            fsPlayBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        });

        document.getElementById('fs-next').addEventListener('click', () => {
            if(isMyWaveMode) playMyWaveNext();
        });
        floatNextBtn.addEventListener('click', () => {
            if(isMyWaveMode) playMyWaveNext();
        });

        // Работа с жанрами
        let appGenres = JSON.parse(localStorage.getItem('resonance_genres')) || [
            'Всё подряд', 'Новинки', 'Электроника', 'Тяжелый Рок', 'Хип-Хоп', 'В дорогу', 'Тренировка'
        ];

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
                        e.target.classList.add('active');
                        activeGenre = g;
                        renderHomeSections();
                    });
                    tagsContainer.appendChild(btn);
                });
            }

            const select = document.getElementById('up-genre');
            if (select) {
                select.innerHTML = '';
                appGenres.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g;
                    opt.textContent = g;
                    select.appendChild(opt);
                });
            }

            const tbody = document.getElementById('admin-genres-tbody');
            if (tbody) {
                tbody.innerHTML = '';
                appGenres.forEach(g => {
                    const tr = document.createElement('tr');
                    const isProtected = g === 'Всё подряд';
                    tr.innerHTML = `
                        <td>${g}</td>
                        <td>
                            ${isProtected ? '<span style="color:var(--text-muted); font-size:12px;">Базовый</span>' : `<button class="btn-sm btn-reject delete-genre-btn" data-g="${g}">Удалить</button>`}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        };

        document.getElementById('add-genre-btn')?.addEventListener('click', () => {
            const input = document.getElementById('new-genre-input');
            const val = input.value.trim();
            if (val && !appGenres.includes(val)) {
                appGenres.push(val);
                localStorage.setItem('resonance_genres', JSON.stringify(appGenres));
                window.renderGenresUI();
                input.value = '';
                showToast('Жанр добавлен', 'success');
            }
        });

        // Вкладки админки
        document.querySelectorAll('.admin-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
                
                e.target.classList.add('active');
                const tabId = e.target.dataset.tab;
                document.getElementById(`admin-tab-${tabId}`).style.display = 'block';
            });
        });

        async function fetchArtists() {
            const r = await fetch('/api/artists');
            allArtists = await r.json();
        }

        document.getElementById('upload-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: new FormData(e.target) });
                if (res.ok) { showToast('Трек успешно загружен!', 'success'); e.target.reset(); document.getElementById('preview-img').src = 'https://via.placeholder.com/300/1C1C1E?text=Cover'; loadTracks(); navLinks.home.click(); }
                else { showToast('Произошла ошибка при загрузке', 'error'); }
            } catch (err) { showToast('Ошибка сети', 'error'); }
        });

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
                let btns = u.username !== currentUser.username ? `<button class="btn-sm btn-reject delete-user" data-u="${u.username}">Удалить</button>` : 'Вы';
                uTbody.innerHTML += `<tr><td>${u.username}</td><td>${u.email}</td><td>${u.role}</td><td>${u.is_verified?'Да':'Нет'}</td><td>${btns}</td></tr>`;
            });
        }

        document.addEventListener('click', async (e) => {
            if (!e.target.closest('#profile-btn')) { const pd = document.getElementById('profile-dropdown'); if (pd) pd.classList.remove('active'); }
            
            const dots = e.target.closest('.track-dots');
            if (dots) { e.preventDefault(); e.stopPropagation(); const m = dots.nextElementSibling; document.querySelectorAll('.track-menu').forEach(x => { if(x !== m) x.classList.remove('active'); }); m.classList.toggle('active'); return; }
            if (!e.target.closest('.track-menu')) document.querySelectorAll('.track-menu').forEach(m => m.classList.remove('active'));

            const playBtn = e.target.closest('.play-btn-overlay');
            if (playBtn && !e.target.closest('.radio-card')) {
                e.stopPropagation();
                const tid = playBtn.dataset.play;
                const track = globalTracks.find(t => t.id === tid);
                if (track) { isMyWaveMode = false; playTrack(track); }
                return;
            }
            
            const radioCard = e.target.closest('.radio-card');
            if (radioCard) { playRadio(radioCard.dataset.url, radioCard.dataset.title, radioCard.dataset.cover); return; }

            // Обработка удаления жанра
            if (e.target.classList.contains('delete-genre-btn')) {
                const g = e.target.dataset.g;
                appGenres = appGenres.filter(x => x !== g);
                localStorage.setItem('resonance_genres', JSON.stringify(appGenres));
                if(activeGenre === g) activeGenre = 'Всё подряд';
                window.renderGenresUI();
                renderHomeSections();
                showToast('Жанр удален', 'info');
                return;
            }

            // Переход в профиль артиста при клике на автора (везде, где есть класс artist-link)
            if (e.target.classList.contains('artist-link')) {
                e.preventDefault();
                e.stopPropagation();
                const name = e.target.dataset.name;
                const r = await fetch(`/api/artist?name=${encodeURIComponent(name)}`);
                if (r.ok) {
                    const data = await r.json();
                    document.getElementById('artist-profile-name').textContent = data.name;
                    document.getElementById('artist-profile-stats').textContent = `${data.total_tracks} треков • ${data.total_plays} прослушиваний`;
                    renderTracks(data.tracks, document.getElementById('artist-tracks-container'));
                    
                    switchSec(null, sections.artist, "Профиль артиста");
                    
                    if(fsPlayer.classList.contains('active')) {
                        fsPlayer.classList.remove('active');
                    }
                }
                return;
            }
        });

        const floatingPlayer = document.getElementById('floating-player');
        const playPauseBtn = document.querySelector('.play-pause');
        const playPauseIcon = playPauseBtn.querySelector('i');
        const progressSlider = document.querySelector('.progress-slider');
        const currentTimeEl = document.querySelector('.time.current');
        const totalTimeEl = document.querySelector('.time.total');

        audio = new Audio(); audio.volume = 0.8; let isPlaying = false;

        async function loadTracks() {
            globalTracks = await (await fetch('/api/tracks')).json() || [];
            renderHomeSections();
        }

        function formatAuthors(t) {
            let html = `<span class="artist-link" data-name="${t.author}">${t.author}</span>`;
            if (t.collaborators && t.collaborators.length) t.collaborators.forEach(c => html += ` & <span class="artist-link" data-name="${c}">${c}</span>`);
            return html;
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
                if (currentUser.role === 'admin') return true;
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
                card.innerHTML = `
                    <div class="track-cover">
                        <img src="${t.cover}" alt="Cover">
                        <button class="play-btn-overlay" data-play="${t.id}"><i class="fa-solid fa-play"></i></button>
                    </div>
                    <div class="track-info"><h3>${t.title}</h3><p>${formatAuthors(t)}</p></div>`;
                container.appendChild(card);
            });
        }
        
        function playTrack(track) {
            isLiveRadio = false; currentTrackId = track.id;
            updateLikeButtons();
            audio.src = `/api/stream?id=${track.file_name}`;
            document.getElementById('player-cover').src = track.cover;
            document.getElementById('player-title').textContent = track.title;
            document.getElementById('player-author').innerHTML = formatAuthors(track);
            
            floatingPlayer.classList.add('active'); 
            
            if (fsPlayer.classList.contains('active')) {
                document.getElementById('fs-cover').src = track.cover;
                document.getElementById('fs-title').textContent = track.title;
                document.getElementById('fs-author').innerHTML = formatAuthors(track);
            }

            audio.play(); isPlaying = true; 
            playPauseIcon.classList.replace('fa-play', 'fa-pause');
            if(fsPlayBtn) fsPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            progressSlider.disabled = false;
            fsProgress.disabled = false;
        }

        function playRadio(url, title, cover) {
            isLiveRadio = true; currentTrackId = null; isMyWaveMode = false;
            updateLikeButtons();
            audio.src = url;
            document.getElementById('player-cover').src = cover;
            document.getElementById('player-title').textContent = title;
            document.getElementById('player-author').textContent = "Прямой эфир (LIVE)";
            floatingPlayer.classList.add('active'); 
            
            if (fsPlayer.classList.contains('active')) {
                document.getElementById('fs-cover').src = cover;
                document.getElementById('fs-title').textContent = title;
                document.getElementById('fs-author').textContent = "Прямой эфир (LIVE)";
            }

            audio.play(); isPlaying = true; 
            playPauseIcon.classList.replace('fa-play', 'fa-pause');
            progressSlider.disabled = true;
            fsProgress.disabled = true;
            if (fsTimeTotal) fsTimeTotal.textContent = "0:00";
        }

        playPauseBtn.addEventListener('click', () => {
            if (!audio.src) return; 
            if (isPlaying) { audio.pause(); playPauseIcon.classList.replace('fa-pause', 'fa-play'); } 
            else { audio.play(); playPauseIcon.classList.replace('fa-play', 'fa-pause'); }
            isPlaying = !isPlaying;
        });

        function formatTime(sec) { if (isNaN(sec) || !isFinite(sec)) return "0:00"; return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`; }
        
        audio.addEventListener('loadedmetadata', () => { 
            if (!isLiveRadio) {
                totalTimeEl.textContent = formatTime(audio.duration); 
                if (fsTimeTotal) fsTimeTotal.textContent = formatTime(audio.duration);
            }
        });
        
        audio.addEventListener('timeupdate', () => {
            if (isLiveRadio) return; 
            if (currentUser && currentUser.is_verified === false && audio.currentTime >= 30) {
                audio.pause(); isPlaying = false; playPauseIcon.classList.replace('fa-pause', 'fa-play');
                document.getElementById('verification-modal').style.display = 'flex';
                showToast('Требуется подтверждение почты', 'error'); return; 
            }
            const currTimeStr = formatTime(audio.currentTime);
            currentTimeEl.textContent = currTimeStr;
            if (fsTimeCurrent) fsTimeCurrent.textContent = currTimeStr;

            if (audio.duration && isFinite(audio.duration)) {
                const percent = (audio.currentTime / audio.duration) * 100;
                progressSlider.value = percent;
                progressSlider.style.background = `linear-gradient(to right, #ffffff ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
                
                fsProgress.value = percent;
                fsProgress.style.background = `linear-gradient(to right, #FA243C ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
            }
        });
        
        audio.addEventListener('ended', () => {
            if(isMyWaveMode) playMyWaveNext();
            else { isPlaying = false; playPauseIcon.classList.replace('fa-pause', 'fa-play'); if(fsPlayBtn) fsPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>'; }
        });

        progressSlider.addEventListener('input', (e) => { if (audio.src && !isLiveRadio) audio.currentTime = (e.target.value / 100) * audio.duration; });
        fsProgress.addEventListener('input', (e) => { if (audio.src && !isLiveRadio) audio.currentTime = (e.target.value / 100) * audio.duration; });
        
        document.querySelector('.volume-slider').addEventListener('input', (e) => { 
            audio.volume = e.target.value / 100; 
            e.target.style.background = `linear-gradient(to right, #ffffff ${e.target.value}%, rgba(255,255,255,0.1) ${e.target.value}%)`; 
        });
        document.querySelector('.volume-slider').dispatchEvent(new Event('input'));

        window.renderGenresUI();
        loadTracks();
    }
    checkAuth();
});