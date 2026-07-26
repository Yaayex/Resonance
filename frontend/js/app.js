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

    // === СИСТЕМА УВЕДОМЛЕНИЙ (TOASTS) ===
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = 'fa-circle-info';
        let iconColor = '#0A84FF'; 
        
        if (type === 'success') {
            icon = 'fa-circle-check';
            iconColor = '#32D74B'; 
        } else if (type === 'error') {
            icon = 'fa-circle-xmark';
            iconColor = '#FF453A'; 
        }

        toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${iconColor}; font-size: 18px;"></i> <span>${message}</span>`;
        container.appendChild(toast);
        
        requestAnimationFrame(() => toast.classList.add('show'));
        
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 400);
        }, 3500);
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
                    e.stopPropagation();
                    document.getElementById('verification-modal').style.display = 'flex';
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
                
                if (currentUser.app_status === 'pending') {
                    statusBox.textContent = 'Заявка на рассмотрении.';
                    statusBox.className = 'status-box status-pending'; reqBtn.disabled = true; reqBtn.textContent = 'Ожидайте';
                } else if (currentUser.app_status === 'rejected') {
                    statusBox.textContent = 'Заявка отклонена. Посмотрите историю ниже.';
                    statusBox.className = 'status-box status-rejected'; reqBtn.disabled = false; reqBtn.textContent = 'Подать снова';
                } else {
                    statusBox.style.display = 'none'; reqBtn.disabled = false;
                }
            }

            histList.innerHTML = '';
            if (currentUser.app_history && currentUser.app_history.length > 0) {
                currentUser.app_history.forEach(rec => {
                    const d = new Date(rec.date * 1000).toLocaleDateString();
                    const cls = rec.status === 'Одобрено' ? 'approved' : 'rejected';
                    histList.innerHTML += `<div class="history-item ${cls}"><b>${d} - ${rec.status}</b><br>${rec.reason}</div>`;
                });
            } else { histList.innerHTML = 'Истории пока нет'; }

            initApp();
        } else {
            authScreen.style.display = 'flex'; mainApp.style.display = 'none';
        }
    }

    async function apiRequest(url, body) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { 
            localStorage.setItem('resonance_user', JSON.stringify(await res.json())); 
            checkAuth(); 
        } 
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

    document.getElementById('verify-close-btn').addEventListener('click', () => {
        document.getElementById('verification-modal').style.display = 'none';
    });

    document.getElementById('verify-submit-btn').addEventListener('click', async () => {
        const code = document.getElementById('verify-code-input').value.trim();
        if (!code) return;
        
        const res = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, code: code }) });
        
        if (res.ok) {
            showToast('Email успешно подтвержден! Ограничения сняты.', 'success');
            document.getElementById('verification-modal').style.display = 'none';
            localStorage.setItem('resonance_user', JSON.stringify(await res.json()));
            checkAuth();
        } else { showToast((await res.json()).error, 'error'); }
    });

    // Установка времени суток в баннере
    function setGreeting() {
        const hour = new Date().getHours();
        const greetingEl = document.getElementById('greeting-text');
        if (!greetingEl) return;
        if (hour >= 5 && hour < 12) greetingEl.textContent = 'Доброе утро';
        else if (hour >= 12 && hour < 18) greetingEl.textContent = 'Добрый день';
        else if (hour >= 18 && hour < 23) greetingEl.textContent = 'Добрый вечер';
        else greetingEl.textContent = 'Доброй ночи';
    }

    function initApp() {
        if (audio) return; 

        setGreeting();

        document.getElementById('mobile-menu-btn').addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
        document.getElementById('mobile-close-btn').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

        const profileBtn = document.getElementById('profile-btn');
        profileBtn.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('profile-dropdown').classList.toggle('active'); });
        
        document.getElementById('drop-logout').addEventListener('click', () => { localStorage.removeItem('resonance_user'); window.location.reload(); });
        
        document.getElementById('request-artist-btn').addEventListener('click', async () => {
            const res = await fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username }) });
            if (res.ok) { 
                localStorage.setItem('resonance_user', JSON.stringify(await res.json())); 
                checkAuth();
                showToast('Заявка отправлена', 'success');
            }
        });

        // Навигация
        const sections = {
            home: document.getElementById('home-section'), search: document.getElementById('search-section'),
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
            Object.values(sections).forEach(s => { if(s) s.style.display = 'none'; });
            if(nav) nav.classList.add('active');
            
            if(sec) {
                if(sec.id === 'search-section' || sec.id === 'artist-profile-section') sec.style.display = 'grid';
                else sec.style.display = 'block';
            }
            if(sec && sec.id === 'artist-profile-section') sec.style.display = 'block';
            
            document.getElementById('page-title').textContent = title;
            document.getElementById('sidebar').classList.remove('open'); 
        }

        document.getElementById('logo-link').addEventListener('click', () => navLinks.home.click());
        document.getElementById('drop-home').addEventListener('click', (e) => { e.preventDefault(); navLinks.home.click(); });
        document.getElementById('drop-settings').addEventListener('click', (e) => { e.preventDefault(); switchSec(null, sections.settings, "Настройки"); });

        navLinks.home.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.home, sections.home, "Слушать"); renderHomeSections(); });
        navLinks.search.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.search, sections.search, "Поиск"); document.getElementById('search-input').focus(); });
        navLinks.radio.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.radio, sections.radio, "Радио"); });
        navLinks.library.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.library, sections.library, "Медиатека"); filterAndRender(globalTracks.filter(t => t.author === currentUser.username), document.getElementById('library-results-section')); });
        navLinks.staff.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.staff, sections.staff, "Команда"); fetch('/api/staff').then(r=>r.json()).then(s=>{ let h=''; s.forEach(u=>h+=`<div class="staff-card"><div class="avatar-circle large"><i class="fa-solid fa-shield"></i></div><h4>${u.username}</h4><p class="staff-role">Администратор</p></div>`); document.getElementById('staff-grid').innerHTML=h; }); });
        
        if(navLinks.upload) navLinks.upload.addEventListener('click', (e) => { e.preventDefault(); fetchArtists(); switchSec(navLinks.upload, sections.upload, "Студия"); });
        if(navLinks.admin) navLinks.admin.addEventListener('click', (e) => { e.preventDefault(); switchSec(navLinks.admin, sections.admin, "Управление"); loadAdminData(); });

        document.getElementById('search-input').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const cont = document.getElementById('search-results-section');
            if (q === '') { cont.innerHTML = ''; return; }
            filterAndRender(globalTracks.filter(t => t.title.toLowerCase().includes(q) || t.author.toLowerCase().includes(q)), cont);
        });

        // Кнопка плей случайного трека на главном баннере
        const randomBtn = document.getElementById('play-random-btn');
        if(randomBtn) {
            randomBtn.addEventListener('click', () => {
                const now = Math.floor(Date.now() / 1000);
                const visibleTracks = globalTracks.filter(t => !t.hidden && (t.release_date === 0 || t.release_date <= now));
                if (visibleTracks.length > 0) {
                    const randomTrack = visibleTracks[Math.floor(Math.random() * visibleTracks.length)];
                    playTrack(randomTrack);
                } else {
                    showToast('Нет доступных треков', 'info');
                }
            });
        }

        // Фильтры-теги на главной (Визуальная заглушка)
        document.querySelectorAll('.tag-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                renderHomeSections(); // просто перерендериваем для эффекта
            });
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
                if (res.ok) { 
                    showToast('Трек успешно загружен!', 'success'); 
                    e.target.reset(); 
                    prevImg.src = 'https://via.placeholder.com/300/1C1C1E?text=Cover'; 
                    updateLivePreview(); 
                    loadTracks(); 
                    navLinks.home.click(); 
                }
                else { showToast('Произошла ошибка при загрузке', 'error'); }
            } catch (err) { showToast('Ошибка сети', 'error'); }
        });

        // --- УПРАВЛЕНИЕ АДМИН ПАНЕЛЬЮ ---
        document.querySelectorAll('.admin-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
                e.target.classList.add('active');
                document.getElementById(`admin-tab-${e.target.dataset.tab}`).style.display = 'block';
            });
        });

        async function loadAdminData() {
            loadAdminStats();
            loadAdminApps();
            loadAdminUsers();
        }

        async function loadAdminStats() {
            const res = await fetch('/api/admin/stats');
            const data = await res.json();
            document.getElementById('stat-users').textContent = data.total_users;
            document.getElementById('stat-tracks').textContent = data.total_tracks;
            document.getElementById('stat-apps').textContent = data.pending_apps;
        }

        async function loadAdminApps() {
            const res = await fetch('/api/admin/apps');
            const apps = await res.json();
            const tbody = document.getElementById('admin-apps-tbody');
            tbody.innerHTML = '';
            if(!apps || apps.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#8E8E93;">Нет активных заявок</td></tr>';
                return;
            }
            apps.forEach(app => {
                tbody.innerHTML += `<tr>
                    <td><b>${app.username}</b></td>
                    <td><span class="status-badge" style="position:static; background: rgba(255,165,0,0.2); color: orange;">Ожидает</span></td>
                    <td>
                        <button class="btn-sm btn-approve" data-u="${app.username}">Одобрить</button>
                        <button class="btn-sm btn-reject" data-u="${app.username}">Отклонить</button>
                    </td>
                </tr>`;
            });
            
            tbody.querySelectorAll('.btn-approve').forEach(b => b.onclick = async (e) => {
                await fetch('/api/admin/resolve', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: e.target.dataset.u, action: 'approve'})}); 
                loadAdminData();
                showToast('Заявка одобрена', 'success');
            });
            tbody.querySelectorAll('.btn-reject').forEach(b => b.onclick = async (e) => {
                const r = prompt("Причина отказа:");
                if(r) { 
                    await fetch('/api/admin/resolve', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: e.target.dataset.u, action: 'reject', reason: r})}); 
                    loadAdminData(); 
                    showToast('Заявка отклонена', 'info');
                }
            });
        }

        async function loadAdminUsers() {
            const res = await fetch('/api/admin/users');
            const users = await res.json();
            const tbody = document.getElementById('admin-users-tbody');
            tbody.innerHTML = '';
            if(!users) return;
            
            users.forEach(u => {
                const verifiedStr = u.is_verified ? '<i class="fa-solid fa-check" style="color: #32D74B;"></i> Да' : '<i class="fa-solid fa-xmark" style="color: #FF453A;"></i> Нет';
                
                let actionBtns = '';
                if(u.username !== currentUser.username) {
                    if (u.role === 'user') {
                        actionBtns += `<button class="btn-sm btn-action set-role" data-u="${u.username}" data-r="artist">Сделать Артистом</button>`;
                    } else if (u.role === 'artist') {
                        actionBtns += `<button class="btn-sm btn-action set-role" data-u="${u.username}" data-r="user">Забрать статус</button>`;
                    }
                    actionBtns += `<button class="btn-sm btn-reject delete-user" data-u="${u.username}">Удалить</button>`;
                } else {
                    actionBtns = '<span style="color:#8E8E93; font-size: 12px;">Это вы</span>';
                }

                tbody.innerHTML += `<tr>
                    <td><b>${u.username}</b></td>
                    <td>${u.email}</td>
                    <td>${u.role}</td>
                    <td>${verifiedStr}</td>
                    <td>${actionBtns}</td>
                </tr>`;
            });

            tbody.querySelectorAll('.set-role').forEach(b => b.onclick = async (e) => {
                const targetU = e.target.dataset.u;
                const newR = e.target.dataset.r;
                if(confirm(`Сменить роль пользователя ${targetU} на ${newR}?`)) {
                    await fetch('/api/admin/user_action', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: targetU, action: 'set_role', role: newR})});
                    loadAdminData();
                    showToast('Роль успешно обновлена', 'success');
                }
            });
            tbody.querySelectorAll('.delete-user').forEach(b => b.onclick = async (e) => {
                const targetU = e.target.dataset.u;
                if(confirm(`Точно удалить аккаунт ${targetU} НАВСЕГДА?`)) {
                    await fetch('/api/admin/user_action', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username: targetU, action: 'delete'})});
                    loadAdminData();
                    showToast('Пользователь удален', 'success');
                }
            });
        }


        // === ГЛОБАЛЬНЫЙ ОБРАБОТЧИК КЛИКОВ ===
        document.addEventListener('click', async (e) => {
            if (!e.target.closest('#profile-btn')) {
                const pd = document.getElementById('profile-dropdown');
                if (pd) pd.classList.remove('active');
            }

            const dots = e.target.closest('.track-dots');
            if (dots) {
                e.preventDefault();
                e.stopPropagation();
                const menu = dots.nextElementSibling;
                document.querySelectorAll('.track-menu').forEach(m => { if(m !== menu) m.classList.remove('active'); });
                menu.classList.toggle('active');
                return;
            }
            
            if (!e.target.closest('.track-menu')) {
                document.querySelectorAll('.track-menu').forEach(m => m.classList.remove('active'));
            }

            const menuBtn = e.target.closest('.track-menu button');
            if (menuBtn) {
                e.stopPropagation();
                const tid = menuBtn.parentElement.dataset.id;
                if (menuBtn.classList.contains('menu-hide')) {
                    await fetch('/api/admin/track', { method:'POST', body:JSON.stringify({TrackID: tid, Action: 'toggle_hide'})});
                    loadTracks();
                    showToast('Видимость трека изменена', 'success');
                }
                if (menuBtn.classList.contains('menu-del')) {
                    if(confirm('Удалить трек навсегда?')) { 
                        await fetch('/api/admin/track', { method:'POST', body:JSON.stringify({TrackID: tid, Action: 'delete'})}); 
                        loadTracks(); 
                        showToast('Трек удален', 'info');
                    }
                }
                if (menuBtn.classList.contains('menu-edit')) {
                    const nt = prompt("Новое название:");
                    if(nt) { 
                        await fetch('/api/admin/track', { method:'POST', body:JSON.stringify({TrackID: tid, Action: 'edit_title', NewTitle: nt})}); 
                        loadTracks(); 
                        showToast('Трек переименован', 'success');
                    }
                }
                document.querySelectorAll('.track-menu').forEach(m => m.classList.remove('active'));
                return;
            }

            const playBtn = e.target.closest('.play-btn-overlay');
            if (playBtn && !e.target.closest('.radio-card')) {
                e.stopPropagation();
                const trackId = playBtn.dataset.play;
                const track = globalTracks.find(t => t.id === trackId);
                if (track) playTrack(track);
                return;
            }

            const radioCard = e.target.closest('.radio-card');
            if (radioCard) {
                const url = radioCard.dataset.url;
                const title = radioCard.dataset.title;
                const cover = radioCard.dataset.cover;
                playRadio(url, title, cover);
                return;
            }

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
            renderHomeSections(); // Рендерим разбитую главную
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

        // Новая функция рендера для разделенной главной страницы
        function renderHomeSections() {
            const now = Math.floor(Date.now() / 1000);
            const visibleTracks = globalTracks.filter(t => {
                if (currentUser.role === 'admin') return true;
                if (t.hidden) return false;
                if (t.release_date > 0 && t.release_date > now) return false;
                return true;
            });

            // Имитируем разные категории
            const recContainer = document.getElementById('recommended-section');
            const newContainer = document.getElementById('new-releases-section');
            
            if(recContainer && newContainer) {
                // Случайные треки в "Рекомендуем"
                const shuffled = [...visibleTracks].sort(() => 0.5 - Math.random());
                renderTracks(shuffled.slice(0, 5), recContainer); // Показываем 5 штук
                
                // Последние добавленные в "Свежие релизы"
                renderTracks(visibleTracks.slice(-10).reverse(), newContainer);
            }
        }

        // Общая функция фильтрации (оставляем для других страниц типа медиатеки и поиска)
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
            if(!container) return;
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

            if (currentUser && currentUser.is_verified === false && audio.currentTime >= 30) {
                audio.pause();
                audio.currentTime = 0;
                isPlaying = false;
                playPauseIcon.classList.replace('fa-pause', 'fa-play');
                document.getElementById('verification-modal').style.display = 'flex';
                showToast('Требуется подтверждение почты для полного прослушивания', 'error');
                return; 
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