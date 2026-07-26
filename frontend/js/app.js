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

    // --- ПРОВЕРКА ВХОДА И НАСТРОЙКИ UI ---
function checkAuth() {
        const userData = localStorage.getItem('resonance_user');
        if (userData) {
            currentUser = JSON.parse(userData);
            authScreen.style.display = 'none';
            mainApp.style.display = 'grid';
            
            // Если пользователь не верифицирован, добавляем плашку рядом с именем
            let nameHtml = currentUser.username;
            if (currentUser.is_verified === false) {
                nameHtml += `<span class="unverified-badge" id="open-verify-modal" title="Нажмите, чтобы подтвердить" style="cursor:pointer;">Не подтвержден</span>`;
            }
            document.getElementById('user-profile-name').innerHTML = nameHtml;
            
            if (document.getElementById('open-verify-modal')) {
                document.getElementById('open-verify-modal').addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.getElementById('verification-modal').style.display = 'flex';
                });
            }

            document.getElementById('set-username').value = currentUser.username;
            document.getElementById('set-email').value = currentUser.email || '';
            
            // ... остальной код из старой checkAuth (роли, админки, студия) ...
            const adminAuthorInput = document.getElementById('up-author');
            if(adminAuthorInput) adminAuthorInput.value = currentUser.username;

            const rankBadge = document.getElementById('user-rank-badge');
            const navUpload = document.getElementById('nav-upload-container');
            const navAdmin = document.getElementById('nav-admin-container');
            const reqBtn = document.getElementById('request-artist-btn');
            const statusBox = document.getElementById('app-status-box');
            const histList = document.getElementById('app-history-list');

            if (currentUser.role === 'admin') {
                rankBadge.textContent = 'Администратор'; rankBadge.style.color = '#FF453A';
                navUpload.style.display = 'block'; navAdmin.style.display = 'block'; reqBtn.style.display = 'none';
            } else if (currentUser.role === 'artist') {
                rankBadge.textContent = 'Артист'; rankBadge.style.color = '#0A84FF';
                navUpload.style.display = 'block'; navAdmin.style.display = 'none'; reqBtn.style.display = 'none';
            } else {
                rankBadge.textContent = 'Слушатель'; rankBadge.style.color = '#8E8E93';
                navUpload.style.display = 'none'; navAdmin.style.display = 'none';
            }
            
            initApp();
        } else {
            authScreen.style.display = 'flex'; mainApp.style.display = 'none';
        }
    }

    // Обработка кнопки модалки верификации
    document.getElementById('verify-close-btn').addEventListener('click', () => {
        document.getElementById('verification-modal').style.display = 'none';
    });

    document.getElementById('verify-submit-btn').addEventListener('click', async () => {
        const code = document.getElementById('verify-code-input').value.trim();
        if (!code) return;
        
        const res = await fetch('/api/verify', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ username: currentUser.username, code: code }) 
        });
        
        if (res.ok) {
            alert('Email успешно подтвержден! Ограничения сняты.');
            document.getElementById('verification-modal').style.display = 'none';
            localStorage.setItem('resonance_user', JSON.stringify(await res.json()));
            checkAuth();
        } else {
            alert((await res.json()).error);
        }
    });

    async function apiRequest(url, body) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { localStorage.setItem('resonance_user', JSON.stringify(await res.json())); checkAuth(); } 
        else alert((await res.json()).error);
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

    function initApp() {
        if (audio) return; 

        document.getElementById('mobile-menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
        document.getElementById('mobile-close-btn').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

        const profileBtn = document.getElementById('profile-btn');
        profileBtn.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('profile-dropdown').classList.toggle('active'); });
        
        document.getElementById('drop-logout').addEventListener('click', () => { localStorage.removeItem('resonance_user'); window.location.reload(); });
        
        document.getElementById('request-artist-btn').addEventListener('click', async () => {
            const res = await fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username }) });
            if (res.ok) { localStorage.setItem('resonance_user', JSON.stringify(await res.json())); checkAuth(); }
        });

        // Навигация
        const sections = {
            home: document.getElementById('tracks-section'), search: document.getElementById('search-section'),
            radio: document.getElementById('radio-section'), library: document.getElementById('library-section'), 
            settings: document.getElementById('settings-section'), upload: document.getElementById('upload-section'), 
            admin: document.getElementById('admin-section'), artist: document.getElementById('artist-profile-section'), 
            staff: document.getElementById('staff-section')
        };
        const navLinks = {
            home: document.getElementById('nav-home'), search: document.getElementById('nav-search'),
            radio: document.getElementById('nav-radio'), library: document.getElementById('nav-library'), 
            upload: document.getElementById('nav-upload'), admin: document.getElementById('nav-admin'), 
            staff: document.getElementById('nav-staff')
        };

        function switchSec(nav, sec, title) {
            document.querySelectorAll('.menu a, .role-link a').forEach(el => el.classList.remove('active'));
            Object.values(sections).forEach(s => s.style.display = 'none');
            if(nav) nav.classList.add('active');
            if(sec) sec.style.display = (sec.id === 'search-section' || sec.id === 'tracks-section' || sec.id === 'radio-section' || sec.id === 'artist-profile-section') ? 'grid' : 'block';
            if(sec.id === 'artist-profile-section') sec.style.display = 'block';
            document.getElementById('page-title').textContent = title;
            document.getElementById('sidebar').classList.remove('open'); 
        }

        document.getElementById('logo-link').addEventListener('click', () => navLinks.home.click());
        document.getElementById('drop-home').addEventListener('click', (e) => { e.preventDefault(); navLinks.home.click(); });
        document.getElementById('drop-settings').addEventListener('click', (e) => { e.preventDefault(); switchSec(null, sections.settings, "Настройки"); });

        navLinks.home.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.home, sections.home, "Слушать"); filterAndRender(globalTracks, sections.home); });
        navLinks.search.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.search, sections.search, "Поиск"); document.getElementById('search-input').focus(); });
        navLinks.radio.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.radio, sections.radio, "Радио"); });
        navLinks.library.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.library, sections.library, "Медиатека"); filterAndRender(globalTracks.filter(t => t.author === currentUser.username), document.getElementById('library-results-section')); });
        navLinks.staff.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.staff, sections.staff, "Команда"); fetch('/api/staff').then(r=>r.json()).then(s=>{ let h=''; s.forEach(u=>h+=`<div class="staff-card"><div class="avatar-circle large"><i class="fa-solid fa-shield"></i></div><h4>${u.username}</h4><p class="staff-role">Администратор</p></div>`); document.getElementById('staff-grid').innerHTML=h; }); });
        
        if(navLinks.upload) navLinks.upload.addEventListener('click', (e) => { e.preventDefault(); fetchArtists(); switchSec(navLinks.upload, sections.upload, "Студия"); });
        if(navLinks.admin) navLinks.admin.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.admin, sections.admin, "Управление"); loadAdminApps(); });

        document.getElementById('search-input').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const cont = document.getElementById('search-results-section');
            if (q === '') { cont.innerHTML = ''; return; }
            filterAndRender(globalTracks.filter(t => t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)), cont);
        });

        // --- ЛОГИКА ТЕГОВ И ПРЕВЬЮ В ФОРМЕ ЗАГРУЗКИ ---
        async function fetchArtists() {
            const r = await fetch('/api/artists');
            allArtists = await r.json();
        }

        function setupTagInput(inputId, listId, hiddenId, contId) {
            const input = document.getElementById(inputId);
            const list = document.getElementById(listId);
            const hidden = document.getElementById(hiddenId);
            const cont = document.getElementById(contId);
            let tags = [];

            function renderTags() {
                cont.querySelectorAll('.tag').forEach(e => e.remove());
                tags.forEach(t => {
                    const tagEl = document.createElement('div'); tagEl.className = 'tag'; tagEl.innerHTML = `${t} <i class="fa-solid fa-xmark"></i>`;
                    tagEl.querySelector('i').onclick = () => { tags = tags.filter(x => x !== t); renderTags(); updateLivePreview(); };
                    cont.insertBefore(tagEl, input);
                });
                hidden.value = tags.join(',');
            }

            input.addEventListener('input', () => {
                const q = input.value.toLowerCase();
                list.innerHTML = ''; list.style.display = 'none';
                if(!q) return;
                const matches = allArtists.filter(a => a.toLowerCase().includes(q) && !tags.includes(a) && a !== currentUser.username);
                if(matches.length > 0) {
                    list.style.display = 'block';
                    matches.forEach(m => {
                        const li = document.createElement('li'); li.textContent = m;
                        li.onclick = () => { tags.push(m); input.value = ''; list.style.display = 'none'; renderTags(); updateLivePreview(); };
                        list.appendChild(li);
                    });
                }
            });
            document.addEventListener('click', (e) => { if(!cont.contains(e.target)) list.style.display = 'none'; });
        }

        setupTagInput('collabs-input', 'collabs-autocomplete', 'collabs-hidden', 'collabs-container');
        setupTagInput('feats-input', 'feats-autocomplete', 'feats-hidden', 'feats-container');

        const upTitle = document.getElementById('up-title');
        const upCover = document.getElementById('up-cover');
        const prevTitle = document.getElementById('preview-title');
        const prevAuthors = document.getElementById('preview-authors');
        const prevImg = document.getElementById('preview-img');

        function updateLivePreview() {
            prevTitle.textContent = upTitle.value || 'Название трека';
            const collabs = document.getElementById('collabs-hidden').value.split(',').filter(x=>x);
            const feats = document.getElementById('feats-hidden').value.split(',').filter(x=>x);
            let a = currentUser.username;
            if(collabs.length) a += ' & ' + collabs.join(' & ');
            if(feats.length) a += ' feat. ' + feats.join(', ');
            prevAuthors.textContent = a;
        }

        upTitle.addEventListener('input', updateLivePreview);
        upCover.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => prevImg.src = ev.target.result;
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        document.getElementById('upload-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: new FormData(e.target) });
                if (res.ok) { alert('Трек загружен!'); e.target.reset(); prevImg.src = 'https://via.placeholder.com/300/1C1C1E?text=Cover'; updateLivePreview(); loadTracks(); navLinks.home.click(); }
                else alert('Ошибка');
            } catch (err) { alert('Ошибка сети'); }
        });

        async function loadAdminApps() {
            const res = await fetch('/api/admin/apps');
            const apps = await res.json();
            const tbody = document.getElementById('admin-apps-tbody');
            tbody.innerHTML = '';
            if(!apps) return;
            apps.forEach(app => {
                tbody.innerHTML += `<tr><td>${app.username}</td><td>Ожидает</td>
                    <td><button class="btn-sm btn-approve" data-u="${app.username}">Одобрить</button><button class="btn-sm btn-reject" data-u="${app.username}">Отклонить</button></td></tr>`;
            });
            tbody.querySelectorAll('.btn-approve').forEach(b => b.onclick = async (e) => {
                await fetch('/api/admin/resolve', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: e.target.dataset.u, action: 'approve'})}); loadAdminApps();
            });
            tbody.querySelectorAll('.btn-reject').forEach(b => b.onclick = async (e) => {
                const r = prompt("Причина отказа:");
                if(r) { await fetch('/api/admin/resolve', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: e.target.dataset.u, action: 'reject', reason: r})}); loadAdminApps(); }
            });
        }

        // ==========================================
        // ГЛОБАЛЬНЫЙ ОБРАБОТЧИК КЛИКОВ (ФИКС БАГА МЕНЮ И ВНЕДРЕНИЕ РАДИО)
        // ==========================================
        document.addEventListener('click', async (e) => {
            // Закрытие профиля
            if (!e.target.closest('#profile-btn')) {
                const pd = document.getElementById('profile-dropdown');
                if (pd) pd.classList.remove('active');
            }

            // --- 1. Меню трека (Три точки) ---
            const dots = e.target.closest('.track-dots');
            if (dots) {
                e.preventDefault();
                e.stopPropagation();
                const menu = dots.nextElementSibling;
                // Закрываем все остальные меню
                document.querySelectorAll('.track-menu').forEach(m => { if(m !== menu) m.classList.remove('active'); });
                menu.classList.toggle('active');
                return;
            }
            
            // Закрываем меню при клике в пустую область
            if (!e.target.closest('.track-menu')) {
                document.querySelectorAll('.track-menu').forEach(m => m.classList.remove('active'));
            }

            // --- 2. Действия в меню трека ---
            const menuBtn = e.target.closest('.track-menu button');
            if (menuBtn) {
                e.stopPropagation();
                const tid = menuBtn.parentElement.dataset.id;
                if (menuBtn.classList.contains('menu-hide')) {
                    await fetch('/api/admin/track', { method:'POST', body:JSON.stringify({TrackID: tid, Action: 'toggle_hide'})});
                    loadTracks();
                }
                if (menuBtn.classList.contains('menu-del')) {
                    if(confirm('Удалить трек навсегда?')) { 
                        await fetch('/api/admin/track', { method:'POST', body:JSON.stringify({TrackID: tid, Action: 'delete'})}); 
                        loadTracks(); 
                    }
                }
                if (menuBtn.classList.contains('menu-edit')) {
                    const nt = prompt("Новое название:");
                    if(nt) { 
                        await fetch('/api/admin/track', { method:'POST', body:JSON.stringify({TrackID: tid, Action: 'edit_title', NewTitle: nt})}); 
                        loadTracks(); 
                    }
                }
                document.querySelectorAll('.track-menu').forEach(m => m.classList.remove('active'));
                return;
            }

            // --- 3. Воспроизведение трека ---
            const playBtn = e.target.closest('.play-btn-overlay');
            if (playBtn && !e.target.closest('.radio-card')) {
                e.stopPropagation();
                const trackId = playBtn.dataset.play;
                const track = globalTracks.find(t => t.id === trackId);
                if (track) playTrack(track);
                return;
            }

            // --- 4. Воспроизведение Радио ---
            const radioCard = e.target.closest('.radio-card');
            if (radioCard) {
                const url = radioCard.dataset.url;
                const title = radioCard.dataset.title;
                const cover = radioCard.dataset.cover;
                playRadio(url, title, cover);
                return;
            }

            // --- 5. Профиль артиста ---
            const al = e.target.closest('.artist-link');
            if (al) {
                e.preventDefault();
                e.stopPropagation();
                switchSec(null, sections.artist, "Профиль артиста");
                document.getElementById('artist-profile-name').textContent = al.dataset.name;
                const r = await fetch(`/api/artist?name=${encodeURIComponent(al.dataset.name)}`);
                const d = await r.json();
                document.getElementById('artist-profile-stats').textContent = `${d.total_tracks} треков • ${d.total_plays} прослушиваний`;
                filterAndRender(d.tracks, document.getElementById('artist-tracks-container'));
                return;
            }
        });


        // ==========================================
        // ПЛЕЕР И ТРЕКИ
        // ==========================================
        const floatingPlayer = document.getElementById('floating-player');
        const playPauseBtn = document.querySelector('.play-pause');
        const playPauseIcon = playPauseBtn.querySelector('i');
        const progressSlider = document.querySelector('.progress-slider');
        const currentTimeEl = document.querySelector('.time.current');
        const totalTimeEl = document.querySelector('.time.total');

        audio = new Audio(); audio.volume = 0.8; let isPlaying = false;

        async function loadTracks() {
            const response = await fetch('/api/tracks');
            globalTracks = await response.json() || [];
            filterAndRender(globalTracks, sections.home);
        }

        function formatAuthors(track) {
            let html = `<span class="artist-link" data-name="${track.author}">${track.author}</span>`;
            if (track.collaborators && track.collaborators.length) track.collaborators.forEach(c => html += ` & <span class="artist-link" data-name="${c}">${c}</span>`);
            if (track.feats && track.feats.length) {
                html += ` feat. `;
                track.feats.forEach((f, i) => { html += `<span class="artist-link" data-name="${f}">${f}</span>`; if(i < track.feats.length-1) html += `, `; });
            }
            return html;
        }

        function filterAndRender(tracksList, container) {
            const now = Math.floor(Date.now() / 1000);
            const visible = tracksList.filter(t => {
                if (currentUser.role === 'admin') return true;
                if (t.hidden) return false;
                if (t.release_date > 0 && t.release_date > now) return false;
                return true;
            });
            renderTracks(visible, container);
        }

        function renderTracks(tracksList, container) {
            container.innerHTML = ''; 
            if (tracksList.length === 0) { container.innerHTML = '<p class="section-desc" style="grid-column: 1/-1; color: #8E8E93;">Здесь пока ничего нет</p>'; return; }

            const now = Math.floor(Date.now() / 1000);

            tracksList.forEach(track => {
                const card = document.createElement('div');
                card.className = `track-card ${track.hidden ? 'hidden-track' : ''}`;
                
                let adminHtml = '';
                let statusHtml = '';
                
                if (track.release_date > now) statusHtml = `<div class="status-badge" style="background:#FF9F0A;">Отложен</div>`;
                if (track.hidden) statusHtml += `<div class="status-badge" style="background:#FF453A; top:30px;">Скрыт</div>`;

                if (currentUser.role === 'admin') {
                    adminHtml = `
                        <button class="track-dots"><i class="fa-solid fa-ellipsis"></i></button>
                        <div class="track-menu" data-id="${track.id}">
                            <button class="menu-edit"><i class="fa-solid fa-pen"></i> Изменить</button>
                            <button class="menu-hide"><i class="fa-solid fa-eye-slash"></i> Видимость</button>
                            <button class="menu-del" style="color:#FF453A;"><i class="fa-solid fa-trash"></i> Удалить</button>
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div class="track-cover">
                        ${statusHtml}
                        <img src="${track.cover}" alt="Cover">
                        <button class="play-btn-overlay" data-play="${track.id}"><i class="fa-solid fa-play"></i></button>
                        ${adminHtml}
                    </div>
                    <div class="track-info">
                        <h3>${track.title}</h3>
                        <p>${formatAuthors(track)}</p>
                    </div>
                `;
                container.appendChild(card);
            });
        }
        
        function playTrack(track) {
            isLiveRadio = false;
            audio.src = `/api/stream?id=${track.file_name}`;
            document.getElementById('player-cover').src = track.cover;
            document.getElementById('player-title').textContent = track.title;
            let rawAuthors = track.author;
            if(track.collaborators && track.collaborators.length) rawAuthors += ' & ' + track.collaborators.join(' & ');
            if(track.feats && track.feats.length) rawAuthors += ' feat. ' + track.feats.join(', ');
            document.getElementById('player-author').textContent = rawAuthors;
            floatingPlayer.classList.add('active'); 
            audio.play(); 
            isPlaying = true; 
            playPauseIcon.classList.replace('fa-play', 'fa-pause');
            progressSlider.disabled = false;
        }

        function playRadio(url, title, cover) {
            isLiveRadio = true;
            audio.src = url;
            document.getElementById('player-cover').src = cover;
            document.getElementById('player-title').textContent = title;
            document.getElementById('player-author').textContent = "Прямой эфир (LIVE)";
            floatingPlayer.classList.add('active'); 
            audio.play(); 
            isPlaying = true; 
            playPauseIcon.classList.replace('fa-play', 'fa-pause');
            
            progressSlider.value = 100;
            progressSlider.style.background = `linear-gradient(to right, #0A84FF 100%, rgba(255,255,255,0.1) 100%)`;
            progressSlider.disabled = true;
            currentTimeEl.textContent = "";
            totalTimeEl.textContent = "LIVE";
        }

        playPauseBtn.addEventListener('click', () => {
            if (!audio.src) return; 
            if (isPlaying) { audio.pause(); playPauseIcon.classList.replace('fa-pause', 'fa-play'); } 
            else { audio.play(); playPauseIcon.classList.replace('fa-play', 'fa-pause'); }
            isPlaying = !isPlaying;
        });

        function formatTime(sec) { if (isNaN(sec) || !isFinite(sec)) return "0:00"; return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`; }
        
        audio.addEventListener('loadedmetadata', () => { 
            if (!isLiveRadio) totalTimeEl.textContent = formatTime(audio.duration); 
        });
        
        audio.addEventListener('timeupdate', () => {
                    if (isLiveRadio) return; 

                    // === ФИШКА ОГРАНИЧЕНИЯ В 30 СЕКУНД ===
                    if (currentUser && currentUser.is_verified === false && audio.currentTime >= 30) {
                        audio.pause();
                        audio.currentTime = 0;
                        isPlaying = false;
                        playPauseIcon.classList.replace('fa-pause', 'fa-play');
                        
                        // Показываем модалку
                        document.getElementById('verification-modal').style.display = 'flex';
                        return; // Останавливаем выполнение дальнейшего апдейта
                    }

                    currentTimeEl.textContent = formatTime(audio.currentTime);
                    if (audio.duration && isFinite(audio.duration)) {
                        const percent = (audio.currentTime / audio.duration) * 100;
                        progressSlider.value = percent;
                        progressSlider.style.background = `linear-gradient(to right, #ffffff ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
                    }
                });
        
        progressSlider.addEventListener('input', (e) => { 
            if (audio.src && !isLiveRadio) audio.currentTime = (e.target.value / 100) * audio.duration; 
        });
        
        document.querySelector('.volume-slider').addEventListener('input', (e) => { 
            audio.volume = e.target.value / 100; 
            e.target.style.background = `linear-gradient(to right, #ffffff ${e.target.value}%, rgba(255,255,255,0.1) ${e.target.value}%)`; 
        });
        document.querySelector('.volume-slider').dispatchEvent(new Event('input'));

        loadTracks();
    }
    checkAuth();
});