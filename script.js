// ================= IndexedDB 持久化逻辑 =================
const DB_NAME = 'LiquidDeskDB';
const STORE_NAME = 'deskStore';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveToDB(key, value) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject();
        });
    } catch (e) {
        console.error('DB Save Error', e);
    }
}

async function getFromDB(key) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject();
        });
    } catch (e) {
        console.error('DB Get Error', e);
        return null;
    }
}

// ================= 实时时钟逻辑 =================
const clockElement = document.getElementById('clock');
function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    if (clockElement) {
        clockElement.textContent = `${hours}:${minutes}`;
    }
}
updateTime();
setInterval(updateTime, 1000);

// ================= 真实电量获取逻辑 =================
if ('getBattery' in navigator) {
    navigator.getBattery().then(function(battery) {
        function updateBattery() {
            const level = Math.round(battery.level * 100);
            const batteryText = document.getElementById('battery-text');
            const batteryLevel = document.getElementById('battery-level');
            if (batteryText) batteryText.textContent = level;
            if (batteryLevel) batteryLevel.setAttribute('width', (level / 100) * 20);
        }
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
    });
}

// ================= 全局删除事件委托 =================
const screen = document.getElementById('screen');
screen.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn && screen.classList.contains('edit-mode')) {
        e.stopPropagation();
        const item = deleteBtn.closest('.jiggle-item');
        if (item) {
            item.classList.add('removing');
            setTimeout(async () => {
                item.remove();
                await saveCurrentState();
            }, 300);
        }
    }
});

// ================= 图片组件事件绑定（通用） =================
function bindImageWidget(widget) {
    const content = widget.querySelector('.image-widget-content');
    const input = widget.querySelector('.widget-img-input');
    const widgetId = widget.getAttribute('data-widget-id');
    if (!content || !input) return;

    const pressDown = () => { if (screen.classList.contains('edit-mode')) return; content.style.transform = 'scale(0.95)'; };
    const pressUp = () => { if (screen.classList.contains('edit-mode')) return; content.style.transform = 'scale(1)'; };

    widget.addEventListener('touchstart', pressDown, { passive: true });
    widget.addEventListener('touchend', pressUp);
    widget.addEventListener('touchcancel', pressUp);
    widget.addEventListener('mousedown', pressDown);
    widget.addEventListener('mouseup', pressUp);
    widget.addEventListener('mouseleave', pressUp);

    content.addEventListener('click', () => {
        if (screen.classList.contains('edit-mode')) return;
        input.click();
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result;
            content.style.backgroundImage = `url(${base64})`;
            content.classList.add('has-image');
            const ph = content.querySelector('.upload-placeholder');
            if (ph) ph.style.display = 'none';
            await saveToDB(`widget_${widgetId}`, base64);
            await saveCurrentState();
        };
        reader.readAsDataURL(file);
    });
}

// ================= 动态事件绑定 =================
function bindAllDynamicEvents() {
    // 重新绑定 app-item（克隆去除旧监听）
    document.querySelectorAll('.app-item').forEach(item => {
        const newBtn = item.cloneNode(true);
        item.replaceWith(newBtn);
    });

    document.querySelectorAll('.app-item').forEach(item => {
        const icon = item.querySelector('.app-icon-box') || item.querySelector('.dock-item');
        if (!icon) return;

        const pressDownAnim = () => {
            if (screen.classList.contains('edit-mode')) return;
            icon.style.transform = 'scale(0.92) scaleX(1.05) scaleY(0.92)';
            icon.style.boxShadow = 'inset 0 2px 4px rgba(255,255,255,0.9), inset 0 -1px 3px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.05)';
        };
        const pressUpAnim = () => {
            if (screen.classList.contains('edit-mode')) return;
            icon.style.transform = 'scale(1.05) scaleX(0.95) scaleY(1.05)';
            icon.style.boxShadow = '';
            setTimeout(() => { icon.style.transform = 'scale(1)'; }, 150);
        };
        const cancelPressAnim = () => {
            if (screen.classList.contains('edit-mode')) return;
            icon.style.transform = 'scale(1)';
            icon.style.boxShadow = '';
        };

        item.addEventListener('touchstart', pressDownAnim, { passive: true });
        item.addEventListener('touchend', pressUpAnim);
        item.addEventListener('touchcancel', cancelPressAnim);
        item.addEventListener('mousedown', pressDownAnim);
        item.addEventListener('mouseup', pressUpAnim);
        item.addEventListener('mouseleave', cancelPressAnim);
    });

    // 绑定所有图片组件（2x2 / 1x2 / 2x1 / 4x2）
    document.querySelectorAll('.widget-2x2, .widget-1x2, .widget-2x1, .widget-4x2').forEach(widget => {
        bindImageWidget(widget);
    });

    initDragForItems();
}

// ================= 页面初始化加载缓存 =================
window.addEventListener('DOMContentLoaded', async () => {
    const savedWallpaper = await getFromDB('wallpaper');
    if (savedWallpaper) {
        document.getElementById('screen').style.backgroundImage = `url(${savedWallpaper})`;
    }

    const savedPages = await getFromDB('pagesHTML');
    const savedDock = await getFromDB('dockHTML');
    if (savedPages) document.querySelector('.pages-container').innerHTML = savedPages;
    if (savedDock) document.querySelector('.dock-container').innerHTML = savedDock;

    const widgets = document.querySelectorAll('.widget-2x2, .widget-1x2, .widget-2x1, .widget-4x2');
    for (const widget of widgets) {
        const widgetId = widget.getAttribute('data-widget-id');
        if (widgetId) {
            const base64 = await getFromDB(`widget_${widgetId}`);
            if (base64) {
                const content = widget.querySelector('.image-widget-content');
                if (content) {
                    content.style.backgroundImage = `url(${base64})`;
                    content.classList.add('has-image');
                    const ph = content.querySelector('.upload-placeholder');
                    if (ph) ph.style.display = 'none';
                }
            }
        }
    }

    bindAllDynamicEvents();
});

// ================= 长按进入编辑模式 =================
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600;
let backupPagesHTML = '';
let backupDockHTML = '';

screen.addEventListener('contextmenu', (e) => { e.preventDefault(); });

const startPress = (e) => {
    if (screen.classList.contains('edit-mode')) return;
    if (e.type === 'touchstart') { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }
    else { startX = e.clientX; startY = e.clientY; }

    pressTimer = setTimeout(() => {
        backupPagesHTML = document.querySelector('.pages-container').innerHTML;
        backupDockHTML = document.querySelector('.dock-container').innerHTML;
        screen.classList.add('edit-mode');
        if (navigator.vibrate) navigator.vibrate(50);
    }, LONG_PRESS_DURATION);
};

const movePress = (e) => {
    if (!pressTimer) return;
    let cx, cy;
    if (e.type === 'touchmove') { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    if (Math.abs(cx - startX) > 10 || Math.abs(cy - startY) > 10) {
        clearTimeout(pressTimer); pressTimer = null;
    }
};

const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };

screen.addEventListener('touchstart', startPress, { passive: true });
screen.addEventListener('touchmove', movePress, { passive: true });
screen.addEventListener('touchend', cancelPress);
screen.addEventListener('touchcancel', cancelPress);
screen.addEventListener('mousedown', startPress);
screen.addEventListener('mousemove', movePress);
screen.addEventListener('mouseup', cancelPress);
screen.addEventListener('mouseleave', cancelPress);

// ================= 编辑控制栏 =================
const editBtn = document.getElementById('edit-btn');
const editMenu = document.getElementById('edit-menu');
const doneBtn = document.getElementById('done-btn');

const saveCurrentState = async () => {
    if (document.activeElement) document.activeElement.blur();
    const pagesHTML = document.querySelector('.pages-container').innerHTML;
    const dockHTML = document.querySelector('.dock-container').innerHTML;
    await saveToDB('pagesHTML', pagesHTML);
    await saveToDB('dockHTML', dockHTML);
};

const exitEditMode = async (e) => {
    if (e) e.stopPropagation();
    document.querySelectorAll('.app-grid').forEach(g => deactivateAbsoluteGrid(g));
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
    await saveCurrentState();
};

if (doneBtn) doneBtn.addEventListener('click', exitEditMode);
if (editBtn && editMenu) {
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editMenu.classList.toggle('show');
    });
}

// ================= 组件面板 =================
const widgetPanel = document.getElementById('widget-panel');
const closePanelBtn = document.getElementById('close-panel');

function clearWidgetSelection() {
    document.querySelectorAll('.widget-option').forEach(o => o.classList.remove('selected'));
}

document.getElementById('menu-add').addEventListener('click', (e) => {
    e.stopPropagation();
    editMenu.classList.remove('show');
    widgetPanel.classList.add('show');
});

closePanelBtn.addEventListener('click', () => {
    widgetPanel.classList.remove('show');
    clearWidgetSelection();
});

document.addEventListener('click', (e) => {
    if (editMenu && editMenu.classList.contains('show')) {
        if (!editBtn.contains(e.target) && !editMenu.contains(e.target)) {
            editMenu.classList.remove('show');
        }
    }
    if (widgetPanel && widgetPanel.classList.contains('show')) {
        if (!widgetPanel.contains(e.target) && e.target.id !== 'menu-add') {
            widgetPanel.classList.remove('show');
            clearWidgetSelection();
        }
    }
});

// 小中大 tab 切换
document.querySelectorAll('.size-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.size-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const size = tab.dataset.size;
        document.querySelectorAll('.widget-option').forEach(opt => {
            opt.classList.toggle('hidden', opt.dataset.size !== size);
        });
    });
});

// 点击组件直接添加
document.querySelectorAll('.widget-option').forEach(opt => {
    opt.addEventListener('click', () => {
        let html = null;
        let cap = 0;
        if (opt.id === 'add-img-1x2') { html = getImg1x2HTML(); cap = 2; }
        else if (opt.id === 'add-img-2x1') { html = getImg2x1HTML(); cap = 2; }
        else if (opt.id === 'add-img-widget') { html = getImageWidgetHTML(); cap = 4; }
        else if (opt.id === 'add-img-4x2') { html = getImg4x2HTML(); cap = 8; }
        else if (opt.id === 'add-music-widget') { html = musicWidgetHTML; cap = 12; }
        if (html) {
            addWidgetToCurrentPage(html, cap);
            widgetPanel.classList.remove('show');
        }
    });
});

// ================= 容量计算 =================
function getCurrentPageIndex() {
    const container = document.querySelector('.pages-container');
    return Math.round(container.scrollLeft / container.clientWidth);
}

function getPageCapacity(page) {
    let used = 0;
    page.querySelectorAll('.jiggle-item').forEach(item => {
        if (item.classList.contains('widget-4x3')) used += 12;
        else if (item.classList.contains('widget-4x2')) used += 8;
        else if (item.classList.contains('widget-2x2')) used += 4;
        else if (item.classList.contains('widget-2x1')) used += 2;
        else if (item.classList.contains('widget-1x2')) used += 2;
        else used += 1;
    });
    return 24 - used;
}

// ================= Toast 通知 =================
let activeNotifications = [];
let notifCounter = 0;

function showToast(msg) {
    notifCounter++;
    const id = notifCounter;
    const banner = document.createElement('div');
    banner.className = 'notification-banner';
    banner.innerHTML = `<div class="text-content"><div class="title">提示</div><div class="message">${msg}</div></div>`;
    document.body.appendChild(banner);
    activeNotifications.unshift({ id, el: banner });
    void banner.offsetWidth;
    updateStack();
    setTimeout(() => removeNotification(id), 1500);
}

function updateStack() {
    activeNotifications.forEach((notif, index) => {
        const el = notif.el;
        if (index === 0) { el.style.transform = `translate(-50%, 0) scale(1)`; el.style.opacity = '1'; el.style.zIndex = 9999; }
        else if (index === 1) { el.style.transform = `translate(-50%, 12px) scale(0.92)`; el.style.opacity = '0.85'; el.style.zIndex = 9998; }
        else if (index === 2) { el.style.transform = `translate(-50%, 24px) scale(0.84)`; el.style.opacity = '0.5'; el.style.zIndex = 9997; }
        else { el.style.transform = `translate(-50%, 36px) scale(0.75)`; el.style.opacity = '0'; el.style.zIndex = 9996; }
    });
}

function removeNotification(id) {
    const index = activeNotifications.findIndex(n => n.id === id);
    if (index > -1) {
        const notif = activeNotifications[index];
        activeNotifications.splice(index, 1);
        notif.el.classList.add('leaving');
        updateStack();
        setTimeout(() => { if (notif.el.parentNode) notif.el.parentNode.removeChild(notif.el); }, 400);
    }
}

// ================= 添加组件到页面 =================
function addWidgetToCurrentPage(htmlString, capacityNeeded) {
    const pageIndex = getCurrentPageIndex();
    const pages = document.querySelectorAll('.pages-container .page');
    if (pageIndex >= pages.length) return;

    const page = pages[pageIndex];
    const appGrid = page.querySelector('.app-grid');
    if (!appGrid) return;

    if (getPageCapacity(page) < capacityNeeded) {
        showToast('空间不足，无法添加');
        return;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString.trim();
    const newElement = tempDiv.firstChild;
    appGrid.appendChild(newElement);

    // 绑定图片事件（如果是图片组件）
    if (newElement.querySelector('.image-widget-content')) {
        bindImageWidget(newElement);
    }

    initDragForItems();
    saveCurrentState();
}
// ================= 组件 HTML 模板 =================
function getImg1x2HTML() {
    const id = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    return `<div class="widget-1x2 jiggle-item" data-widget-id="${id}" data-cols="1" data-rows="2">
        <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220,220,225,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <div class="image-widget-content liquid-glass" style="height:100%;">
            <input type="file" class="widget-img-input" accept="image/*" style="display:none;">
            <div class="upload-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>添加</span></div>
        </div>
    </div>`;
}

function getImg2x1HTML() {
    const id = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    return `<div class="widget-2x1 jiggle-item" data-widget-id="${id}" data-cols="2" data-rows="1">
        <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220,220,225,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <div class="image-widget-content liquid-glass" style="height:100%;">
            <input type="file" class="widget-img-input" accept="image/*" style="display:none;">
            <div class="upload-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>添加</span></div>
        </div>
    </div>`;
}

function getImageWidgetHTML() {
    const id = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    return `<div class="widget-2x2 jiggle-item" data-widget-id="${id}" data-cols="2" data-rows="2">
        <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220,220,225,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <div class="image-widget-content liquid-glass" style="width:100%;height:100%;">
            <input type="file" class="widget-img-input" accept="image/*" style="display:none;">
            <div class="upload-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>添加照片</span></div>
        </div>
    </div>`;
}

function getImg4x2HTML() {
    const id = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    return `<div class="widget-4x2 jiggle-item" data-widget-id="${id}" data-cols="4" data-rows="2">
        <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220,220,225,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <div class="image-widget-content liquid-glass" style="height:100%;">
            <input type="file" class="widget-img-input" accept="image/*" style="display:none;">
            <div class="upload-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>添加</span></div>
        </div>
    </div>`;
}

const musicWidgetHTML = `
<div class="widget-4x3 jiggle-item" data-cols="4" data-rows="3">
    <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220,220,225,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
    <svg class="connecting-lines" viewBox="0 0 400 250" preserveAspectRatio="xMidYMin slice">
        <defs><linearGradient id="fade-grad2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#555555;stop-opacity:1"/><stop offset="85%" style="stop-color:#555555;stop-opacity:0"/></linearGradient></defs>
        <circle cx="151" cy="100" r="4" fill="#555555"/>
        <circle cx="249" cy="100" r="4" fill="#555555"/>
        <path d="M 151 100 Q 100 145, 200 195" fill="none" stroke="url(#fade-grad2)" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M 249 100 Q 300 145, 200 195" fill="none" stroke="url(#fade-grad2)" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <div class="avatars-wrapper">
        <div class="avatar-group"><div class="speech-bubble" contenteditable="true" spellcheck="false">你在左边</div><div class="avatar-circle"></div></div>
        <div class="avatar-group"><div class="speech-bubble" contenteditable="true" spellcheck="false">我紧靠右</div><div class="avatar-circle"></div></div>
    </div>
    <div class="center-text" contenteditable="true" spellcheck="false">Twenty four seven with us</div>
    <div class="music-player-v2">
        <div class="music-title">Pink Lavender</div>
        <div class="music-subtitle" contenteditable="true" spellcheck="false">· ⁺ ⋆ ‿ ıllıllı ‿ ⋆ ⁺ ·</div>
        <div class="progress-container">
            <div class="time-label">1:26</div>
            <div class="progress-bar"><div class="progress-fill"></div></div>
            <div class="time-label">3:48</div>
        </div>
        <div class="controls-row">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#666"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <div class="main-controls">
                <svg width="24" height="24" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M22 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg>
                <svg width="32" height="32" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="2" fill="#333"/><rect x="14" y="5" width="4" height="14" rx="2" fill="#333"/></svg>
                <svg width="24" height="24" viewBox="0 0 24 24"><path d="M2 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M13 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2"><path d="M9.52 14.47 A 3.5 3.5 0 1 1 14.48 14.47"/><path d="M7.05 16.95 A 7 7 0 1 1 16.95 16.95"/><path d="M4.58 19.42 A 10.5 10.5 0 1 1 19.42 19.42"/><path d="M12 15.5L16.5 21H7.5L12 15.5Z" fill="#333"/></svg>
        </div>
    </div>
</div>`;

// ================= 取消修改 =================
document.getElementById('menu-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.pages-container').innerHTML = backupPagesHTML;
    document.querySelector('.dock-container').innerHTML = backupDockHTML;
    bindAllDynamicEvents();
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
});

// ================= 更换壁纸 =================
const wallpaperInput = document.getElementById('wallpaper-input');
document.getElementById('menu-wallpaper').addEventListener('click', (e) => {
    e.stopPropagation();
    wallpaperInput.click();
});

wallpaperInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result;
            document.getElementById('screen').style.backgroundImage = `url(${base64})`;
            await saveToDB('wallpaper', base64);
        };
        reader.readAsDataURL(file);
    }
    editMenu.classList.remove('show');
});

// ================= 页面预览 =================
document.getElementById('menu-preview').addEventListener('click', (e) => {
    e.stopPropagation();
    editMenu.classList.remove('show');

    const overlay = document.getElementById('preview-overlay');
    const container = document.getElementById('preview-container');
    container.innerHTML = '';

    const currentBg = document.getElementById('screen').style.backgroundImage || getComputedStyle(document.getElementById('screen')).backgroundImage;

    document.querySelectorAll('.pages-container .page').forEach((page, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-page-wrapper';

        const scaleBox = document.createElement('div');
        scaleBox.className = 'preview-scale-box liquid-glass';
        scaleBox.style.backgroundImage = currentBg;

        const scaleContent = document.createElement('div');
        scaleContent.className = 'preview-scale-content';
        scaleContent.appendChild(page.cloneNode(true));
        scaleBox.appendChild(scaleContent);

        const checkIcon = document.createElement('div');
        checkIcon.className = 'preview-check';
        checkIcon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

        wrapper.appendChild(scaleBox);
        wrapper.appendChild(checkIcon);

        wrapper.addEventListener('click', () => {
            const pagesContainer = document.querySelector('.pages-container');
            pagesContainer.scrollTo({ left: pagesContainer.clientWidth * index, behavior: 'smooth' });
            overlay.classList.remove('show');
        });

        container.appendChild(wrapper);
    });

    overlay.classList.add('show');
});

document.getElementById('preview-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'preview-overlay' || e.target.id === 'preview-container') {
        document.getElementById('preview-overlay').classList.remove('show');
    }
});

// ================= 拖拽系统 =================
const COLS = 4;
const ROWS = 6;
let dragState = null;
const PAGE_SCROLL_DELAY = 700;

function getGridMetrics(gridEl) {
    const rect = gridEl.getBoundingClientRect();
    const gap = 15;
    const cellW = (rect.width - gap * (COLS - 1)) / COLS;
    const cellH = (rect.height - gap * (ROWS - 1)) / ROWS;
    return { rect, cellW, cellH, gap };
}

function pxToCell(x, y, metrics) {
    const { rect, cellW, cellH, gap } = metrics;
    const relX = x - rect.left;
    const relY = y - rect.top;
    const col = Math.min(COLS, Math.max(1, Math.round(relX / (cellW + gap)) + 1));
    const row = Math.min(ROWS, Math.max(1, Math.round(relY / (cellH + gap)) + 1));
    return { col, row };
}

function getItemSpan(el) {
    const cols = parseInt(el.dataset.cols) || 1;
    const rows = parseInt(el.dataset.rows) || 1;
    return { cols, rows };
}

function placeItemAt(el, col, row, metrics) {
    const { cellW, cellH, gap } = metrics;
    const { cols, rows } = getItemSpan(el);
    el.style.position = 'absolute';
    el.style.left = (col - 1) * (cellW + gap) + 'px';
    el.style.top = (row - 1) * (cellH + gap) + 'px';
    el.style.width = (cols * cellW + (cols - 1) * gap) + 'px';
    el.style.height = (rows * cellH + (rows - 1) * gap) + 'px';
    el.style.gridColumn = '';
    el.style.gridRow = '';
    el.dataset.gridCol = col;
    el.dataset.gridRow = row;
}

function activateAbsoluteGrid(gridEl) {
    const metrics = getGridMetrics(gridEl);
    gridEl.style.position = 'relative';
    gridEl.querySelectorAll('.jiggle-item').forEach(item => {
        const style = getComputedStyle(item);
        const colStart = parseInt(style.gridColumnStart) || parseInt(item.dataset.gridCol) || 1;
        const rowStart = parseInt(style.gridRowStart) || parseInt(item.dataset.gridRow) || 1;
        item.dataset.gridCol = colStart;
        item.dataset.gridRow = rowStart;
        placeItemAt(item, colStart, rowStart, metrics);
    });
}

function deactivateAbsoluteGrid(gridEl) {
    gridEl.querySelectorAll('.jiggle-item').forEach(item => {
        const col = parseInt(item.dataset.gridCol) || 1;
        const row = parseInt(item.dataset.gridRow) || 1;
        const { cols, rows } = getItemSpan(item);
        item.style.position = '';
        item.style.left = '';
        item.style.top = '';
        item.style.width = '';
        item.style.height = '';
        item.style.gridColumn = `${col} / span ${cols}`;
        item.style.gridRow = `${row} / span ${rows}`;
    });
    gridEl.style.position = '';
}

function hasCollision(gridEl, col, row, cols, rows, excludeEl) {
    for (const item of gridEl.querySelectorAll('.jiggle-item')) {
        if (item === excludeEl) continue;
        if (dragState && item === dragState.placeholder) continue;
        const ic = parseInt(item.dataset.gridCol) || 1;
        const ir = parseInt(item.dataset.gridRow) || 1;
        const { cols: ic2, rows: ir2 } = getItemSpan(item);
        const noOverlap = (col + cols - 1 < ic) || (col > ic + ic2 - 1) ||
                          (row + rows - 1 < ir) || (row > ir + ir2 - 1);
        if (!noOverlap) return true;
    }
    return false;
}

function outOfBounds(col, row, cols, rows) {
    return col < 1 || row < 1 || col + cols - 1 > COLS || row + rows - 1 > ROWS;
}

function createPlaceholder(cols, rows, metrics) {
    const div = document.createElement('div');
    div.className = 'drag-placeholder';
    const { cellW, cellH, gap } = metrics;
    div.style.position = 'absolute';
    div.style.width = (cols * cellW + (cols - 1) * gap) + 'px';
    div.style.height = (rows * cellH + (rows - 1) * gap) + 'px';
    div.style.pointerEvents = 'none';
    div.style.zIndex = '5';
    div.dataset.cols = cols;
    div.dataset.rows = rows;
    return div;
}

function getCurrentGrid() {
    const container = document.getElementById('pages-container');
    const pageIndex = Math.round(container.scrollLeft / container.clientWidth);
    return document.querySelectorAll('.app-grid')[pageIndex] || null;
}

function onDragStart(e) {
    if (!screen.classList.contains('edit-mode')) return;
    if (e.target.closest('.delete-btn')) return;

    const touch = e.touches ? e.touches[0] : e;
    const item = e.currentTarget;
    const itemRect = item.getBoundingClientRect();
    const { cols, rows } = getItemSpan(item);

    const currentGrid = getCurrentGrid();
    if (!currentGrid) return;
    activateAbsoluteGrid(currentGrid);

    const offsetX = touch.clientX - itemRect.left;
    const offsetY = touch.clientY - itemRect.top;

    const ghost = item.cloneNode(true);
    ghost.className = ghost.className + ' dragging-ghost';
    ghost.style.cssText = `width:${itemRect.width}px;height:${itemRect.height}px;left:${itemRect.left}px;top:${itemRect.top}px;position:fixed;z-index:9000;pointer-events:none;transition:none;opacity:0.85;transform:scale(1.06);border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,0.3);`;
    document.body.appendChild(ghost);

    const metrics = getGridMetrics(currentGrid);
    const col = parseInt(item.dataset.gridCol) || 1;
    const row = parseInt(item.dataset.gridRow) || 1;
    const placeholder = createPlaceholder(cols, rows, metrics);
    placeholder.style.left = (col - 1) * (metrics.cellW + metrics.gap) + 'px';
    placeholder.style.top = (row - 1) * (metrics.cellH + metrics.gap) + 'px';
    currentGrid.appendChild(placeholder);

    item.style.opacity = '0';
    item.style.pointerEvents = 'none';

    dragState = {
        item, ghost, placeholder, cols, rows, offsetX, offsetY,
        currentGrid,
        currentPageIndex: Math.round(document.getElementById('pages-container').scrollLeft / document.getElementById('pages-container').clientWidth),
        lastValidCol: col,
        lastValidRow: row,
        pageScrollTimer: null,
        pendingPageIndex: null
    };

    if (e.touches) {
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('touchcancel', onDragEnd);
    } else {
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    if (e.cancelable) e.preventDefault();
}

function onDragMove(e) {
    if (!dragState) return;
    if (e.cancelable) e.preventDefault();

    const touch = e.touches ? e.touches[0] : e;
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    dragState.ghost.style.left = (clientX - dragState.offsetX) + 'px';
    dragState.ghost.style.top = (clientY - dragState.offsetY) + 'px';

    const screenW = window.innerWidth;
    const edgeZone = screenW * 0.15;
    if (clientX < edgeZone) { triggerPageScroll(-1); }
    else if (clientX > screenW - edgeZone) { triggerPageScroll(1); }
    else { cancelPageScroll(); }

    const grid = dragState.currentGrid;
    if (!grid) return;

    const metrics = getGridMetrics(grid);
    const centerX = clientX - dragState.offsetX + (dragState.cols * metrics.cellW + (dragState.cols - 1) * metrics.gap) / 2;
    const centerY = clientY - dragState.offsetY + (dragState.rows * metrics.cellH + (dragState.rows - 1) * metrics.gap) / 2;

    let { col, row } = pxToCell(centerX, centerY, metrics);
    col = Math.max(1, Math.min(col, COLS - dragState.cols + 1));
    row = Math.max(1, Math.min(row, ROWS - dragState.rows + 1));

    if (!outOfBounds(col, row, dragState.cols, dragState.rows) &&
        !hasCollision(grid, col, row, dragState.cols, dragState.rows, dragState.item)) {
        dragState.lastValidCol = col;
        dragState.lastValidRow = row;
        dragState.placeholder.style.left = (col - 1) * (metrics.cellW + metrics.gap) + 'px';
        dragState.placeholder.style.top = (row - 1) * (metrics.cellH + metrics.gap) + 'px';
    }
}

function triggerPageScroll(direction) {
    if (!dragState) return;
    if (dragState.pageScrollTimer) return;

    const container = document.getElementById('pages-container');
    const totalPages = document.querySelectorAll('.page').length;
    const currentPage = Math.round(container.scrollLeft / container.clientWidth);
    const targetPage = currentPage + direction;
    if (targetPage < 0 || targetPage >= totalPages) return;

    dragState.pendingPageIndex = targetPage;
    dragState.pageScrollTimer = setTimeout(() => {
        if (!dragState) return;

        deactivateAbsoluteGrid(dragState.currentGrid);
        container.scrollTo({ left: targetPage * container.clientWidth, behavior: 'smooth' });

        setTimeout(() => {
            if (!dragState) return;
            const newGrid = document.querySelectorAll('.app-grid')[targetPage];
            if (!newGrid) return;

            activateAbsoluteGrid(newGrid);
            newGrid.appendChild(dragState.item);

            dragState.placeholder.remove();
            const metrics = getGridMetrics(newGrid);
            const placeholder = createPlaceholder(dragState.cols, dragState.rows, metrics);
            placeholder.style.left = '0px';
            placeholder.style.top = '0px';
            newGrid.appendChild(placeholder);

            dragState.placeholder = placeholder;
            dragState.currentGrid = newGrid;
            dragState.currentPageIndex = targetPage;
            dragState.lastValidCol = 1;
            dragState.lastValidRow = 1;
            dragState.pageScrollTimer = null;
            dragState.pendingPageIndex = null;
        }, 400);
    }, PAGE_SCROLL_DELAY);
}

function cancelPageScroll() {
    if (!dragState) return;
    if (dragState.pageScrollTimer) {
        clearTimeout(dragState.pageScrollTimer);
        dragState.pageScrollTimer = null;
        dragState.pendingPageIndex = null;
    }
}

function onDragEnd(e) {
    if (!dragState) return;
    cancelPageScroll();

    const { item, ghost, placeholder, currentGrid, lastValidCol, lastValidRow } = dragState;

    ghost.remove();
    placeholder.remove();

    const metrics = getGridMetrics(currentGrid);
    placeItemAt(item, lastValidCol, lastValidRow, metrics);
    item.style.opacity = '';
    item.style.pointerEvents = '';

    dragState = null;

    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
    document.removeEventListener('touchcancel', onDragEnd);
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
}

function initDragForItems() {
    document.querySelectorAll('.jiggle-item').forEach(item => {
        item.removeEventListener('touchstart', onDragStart);
        item.removeEventListener('mousedown', onDragStart);
        item.addEventListener('touchstart', onDragStart, { passive: false });
        item.addEventListener('mousedown', onDragStart);

        if (!item.dataset.cols) {
            if (item.classList.contains('widget-4x3')) { item.dataset.cols = 4; item.dataset.rows = 3; }
            else if (item.classList.contains('widget-4x2')) { item.dataset.cols = 4; item.dataset.rows = 2; }
            else if (item.classList.contains('widget-2x2')) { item.dataset.cols = 2; item.dataset.rows = 2; }
            else if (item.classList.contains('widget-2x1')) { item.dataset.cols = 2; item.dataset.rows = 1; }
            else if (item.classList.contains('widget-1x2')) { item.dataset.cols = 1; item.dataset.rows = 2; }
            else { item.dataset.cols = 1; item.dataset.rows = 1; }
        }
        if (!item.dataset.gridCol) item.dataset.gridCol = 1;
        if (!item.dataset.gridRow) item.dataset.gridRow = 1;
    });
}
