// ================= 恢复 PWA Service Worker 注册 =================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

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

// ================= 实时时钟与电量逻辑 =================
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

// ================= 顶部清透玻璃弹窗逻辑 =================
let activeNotifications = [];
let notifCounter = 0;

function showToast(msg) {
    notifCounter++;
    const id = notifCounter;

    const banner = document.createElement('div');
    banner.className = 'notification-banner';
    banner.innerHTML = `
        <div class="text-content">
            <div class="title">提示</div>
            <div class="message">${msg}</div>
        </div>
    `;

    document.body.appendChild(banner);
    activeNotifications.unshift({ id, el: banner });
    void banner.offsetWidth; // 触发重绘
    updateStack();

    setTimeout(() => {
        removeNotification(id);
    }, 1200);
}

function removeNotification(id) {
    const index = activeNotifications.findIndex(n => n.id === id);
    if (index > -1) {
        const notif = activeNotifications[index];
        notif.el.classList.add('leaving');
        setTimeout(() => {
            if (notif.el.parentNode) notif.el.parentNode.removeChild(notif.el);
        }, 500);
        activeNotifications.splice(index, 1);
        updateStack();
    }
}

function updateStack() {
    activeNotifications.forEach((notif, index) => {
        const el = notif.el;
        if (index === 0) {
            el.style.transform = `translate(-50%, 0) scale(1)`;
            el.style.opacity = '1';
            el.style.zIndex = 9999;
        } else if (index === 1) {
            el.style.transform = `translate(-50%, 12px) scale(0.92)`;
            el.style.opacity = '0.85';
            el.style.zIndex = 9998;
        } else if (index === 2) {
            el.style.transform = `translate(-50%, 24px) scale(0.84)`;
            el.style.opacity = '0.5';
            el.style.zIndex = 9997;
        } else {
            el.style.transform = `translate(-50%, 36px) scale(0.75)`;
            el.style.opacity = '0';
            el.style.zIndex = 9996;
        }
    });
}

// ================= 动态事件绑定 =================
const screen = document.getElementById('screen');

function bindAllDynamicEvents() {
    document.querySelectorAll('.app-item, .widget-1x2, .widget-2x1, .widget-2x2, .widget-4x2, .widget-4x3').forEach(item => {
        const newBtn = item.cloneNode(true);
        item.replaceWith(newBtn);
    });

    document.querySelectorAll('.app-item').forEach(item => {
        const icon = item.querySelector('.app-icon-box') || item.querySelector('.dock-item');
        if (!icon) return;

        const pressDownAnim = () => {
            if (screen.classList.contains('edit-mode')) return;
            icon.style.transform = 'scale(0.92) scaleX(1.05) scaleY(0.92)';
            icon.style.boxShadow = 'inset 0 2px 4px rgba(255, 255, 255, 0.9), inset 0 -1px 3px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.05)';
        };

        const pressUpAnim = () => {
            if (screen.classList.contains('edit-mode')) return;
            icon.style.transform = 'scale(1.05) scaleX(0.95) scaleY(1.05)';
            icon.style.boxShadow = '';
            setTimeout(() => {
                icon.style.transform = 'scale(1)';
            }, 150);
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

    document.querySelectorAll('.widget-1x2, .widget-2x1, .widget-2x2, .widget-4x2').forEach(widget => {
        const content = widget.querySelector('.image-widget-content');
        const input = widget.querySelector('.widget-img-input');
        const widgetId = widget.getAttribute('data-widget-id');

        const pressDownAnim = () => {
            if (screen.classList.contains('edit-mode')) return;
            content.style.transform = 'scale(0.95)';
        };
        const pressUpAnim = () => {
            if (screen.classList.contains('edit-mode')) return;
            content.style.transform = 'scale(1)';
        };

        widget.addEventListener('touchstart', pressDownAnim, { passive: true });
        widget.addEventListener('touchend', pressUpAnim);
        widget.addEventListener('touchcancel', pressUpAnim);
        widget.addEventListener('mousedown', pressDownAnim);
        widget.addEventListener('mouseup', pressUpAnim);
        widget.addEventListener('mouseleave', pressUpAnim);

        content.addEventListener('click', (e) => {
            if (screen.classList.contains('edit-mode')) return;
            input.click();
        });

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64 = event.target.result;
                    content.style.backgroundImage = `url(${base64})`;
                    content.style.backgroundSize = 'cover';
                    content.style.backgroundColor = 'transparent';
                    content.style.border = 'none';
                    content.style.boxShadow = 'none';
                    const placeholder = content.querySelector('.upload-placeholder');
                    if (placeholder) placeholder.style.display = 'none';
                    await saveToDB(`widget_${widgetId}`, base64);
                    await saveCurrentState();
                };
                reader.readAsDataURL(file);
            }
        });
    });

    initDragSystem();
}

// ================= 拖拽系统 =================
let draggingItem = null;
let ghostEl = null;
let pageScrollTimer = null;

function getOccupancyMatrix(page) {
    const matrix = Array(6).fill(null).map(() => Array(4).fill(false));
    page.querySelectorAll('.grid-item').forEach(item => {
        if (item === draggingItem) return; 
        const col = parseInt(item.style.getPropertyValue('--col'));
        const row = parseInt(item.style.getPropertyValue('--row'));
        const w = parseInt(item.style.getPropertyValue('--w'));
        const h = parseInt(item.style.getPropertyValue('--h'));
        for (let r = row - 1; r < row - 1 + h; r++) {
            for (let c = col - 1; c < col - 1 + w; c++) {
                if (r < 6 && c < 4) matrix[r][c] = true;
            }
        }
    });
    return matrix;
}

function canFit(matrix, col, row, w, h) {
    if (col < 1 || row < 1 || col + w - 1 > 4 || row + h - 1 > 6) return false;
    for (let r = row - 1; r < row - 1 + h; r++) {
        for (let c = col - 1; c < col - 1 + w; c++) {
            if (matrix[r][c]) return false;
        }
    }
    return true;
}

function findFirstAvailableSlot(page, w, h) {
    const matrix = getOccupancyMatrix(page);
    for (let r = 1; r <= 6 - h + 1; r++) {
        for (let c = 1; c <= 4 - w + 1; c++) {
            if (canFit(matrix, c, r, w, h)) return { col: c, row: r };
        }
    }
    return null;
}

function initDragSystem() {
    document.querySelectorAll('.grid-item').forEach(item => {
        item.addEventListener('touchstart', handleDragStart, { passive: false });
        item.addEventListener('mousedown', handleDragStart);
    });
}

function handleDragStart(e) {
    if (!screen.classList.contains('edit-mode') || e.target.closest('.delete-btn')) return;
    e.preventDefault(); 
    draggingItem = e.currentTarget;
    draggingItem.classList.add('dragging');

    ghostEl = draggingItem.cloneNode(true);
    ghostEl.classList.remove('dragging', 'jiggle-item');
    ghostEl.style.position = 'fixed';
    ghostEl.style.pointerEvents = 'none';
    ghostEl.style.zIndex = '9999';
    ghostEl.style.opacity = '0.8';
    
    const rect = draggingItem.getBoundingClientRect();
    ghostEl.style.width = rect.width + 'px';
    ghostEl.style.height = rect.height + 'px';
    document.body.appendChild(ghostEl);

    moveGhost(e);

    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchend', handleDragEnd);
    document.addEventListener('mouseup', handleDragEnd);
}

function moveGhost(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ghostEl.style.left = (clientX - ghostEl.offsetWidth / 2) + 'px';
    ghostEl.style.top = (clientY - ghostEl.offsetHeight / 2) + 'px';
    return { clientX, clientY };
}

function handleDragMove(e) {
    e.preventDefault();
    const { clientX, clientY } = moveGhost(e);
    
    const pagesContainer = document.querySelector('.pages-container');
    const pageW = pagesContainer.clientWidth;
    
    if (clientX > window.innerWidth - 40) {
        if (!pageScrollTimer) pageScrollTimer = setTimeout(() => { pagesContainer.scrollBy({ left: pageW, behavior: 'smooth' }); }, 600);
    } else if (clientX < 40) {
        if (!pageScrollTimer) pageScrollTimer = setTimeout(() => { pagesContainer.scrollBy({ left: -pageW, behavior: 'smooth' }); }, 600);
    } else {
        clearTimeout(pageScrollTimer);
        pageScrollTimer = null;
    }

    const pageIndex = Math.round(pagesContainer.scrollLeft / pageW);
    const pages = document.querySelectorAll('.page');
    const currentPage = pages[pageIndex];
    if (!currentPage) return;
    
    const grid = currentPage.querySelector('.app-grid');
    const gridRect = grid.getBoundingClientRect();

    if (clientX >= gridRect.left && clientX <= gridRect.right && clientY >= gridRect.top && clientY <= gridRect.bottom) {
        const cellW = gridRect.width / 4;
        const cellH = gridRect.height / 6;
        const col = Math.floor((clientX - gridRect.left) / cellW) + 1;
        const row = Math.floor((clientY - gridRect.top) / cellH) + 1;
        
        const w = parseInt(draggingItem.style.getPropertyValue('--w'));
        const h = parseInt(draggingItem.style.getPropertyValue('--h'));
        
        const matrix = getOccupancyMatrix(currentPage);
        if (canFit(matrix, col, row, w, h)) {
            if (draggingItem.parentNode !== grid) grid.appendChild(draggingItem);
            draggingItem.style.setProperty('--col', col);
            draggingItem.style.setProperty('--row', row);
        }
    }
}

function handleDragEnd(e) {
    clearTimeout(pageScrollTimer);
    pageScrollTimer = null;
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    if (draggingItem) {
        draggingItem.classList.remove('dragging');
        draggingItem = null;
        saveCurrentState();
    }
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('touchend', handleDragEnd);
    document.removeEventListener('mouseup', handleDragEnd);
}

// ================= 页面初始化与状态保存 =================
window.addEventListener('DOMContentLoaded', async () => {
    const savedWallpaper = await getFromDB('wallpaper');
    if (savedWallpaper) document.getElementById('screen').style.backgroundImage = `url(${savedWallpaper})`;
    
    const savedPages = await getFromDB('pagesHTML');
    const savedDock = await getFromDB('dockHTML');
    if (savedPages) document.querySelector('.pages-container').innerHTML = savedPages;
    if (savedDock) document.querySelector('.dock-container').innerHTML = savedDock;
    
    const widgets = document.querySelectorAll('.widget-1x2, .widget-2x1, .widget-2x2, .widget-4x2');
    for (const widget of widgets) {
        const widgetId = widget.getAttribute('data-widget-id');
        if (widgetId) {
            const base64 = await getFromDB(`widget_${widgetId}`);
            if (base64) {
                const content = widget.querySelector('.image-widget-content');
                content.style.backgroundImage = `url(${base64})`;
                content.style.backgroundColor = 'transparent';
                content.style.border = 'none';
                content.style.boxShadow = 'none';
                const placeholder = content.querySelector('.upload-placeholder');
                if (placeholder) placeholder.style.display = 'none';
            }
        }
    }
    bindAllDynamicEvents();
});

let backupPagesHTML = '';
let backupDockHTML = '';
const saveCurrentState = async () => {
    await saveToDB('pagesHTML', document.querySelector('.pages-container').innerHTML);
    await saveToDB('dockHTML', document.querySelector('.dock-container').innerHTML);
};

// ================= 长按进入编辑模式 =================
let pressTimer = null;
let startX = 0, startY = 0;
screen.addEventListener('contextmenu', e => e.preventDefault());

const startPress = (e) => {
    if (screen.classList.contains('edit-mode')) return;
    
    if (e.type === 'touchstart') {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    } else {
        startX = e.clientX;
        startY = e.clientY;
    }

    pressTimer = setTimeout(() => {
        backupPagesHTML = document.querySelector('.pages-container').innerHTML;
        backupDockHTML = document.querySelector('.dock-container').innerHTML;
        screen.classList.add('edit-mode');
        if (navigator.vibrate) navigator.vibrate(50);
    }, 600);
};

const movePress = (e) => {
    if (!pressTimer) return;
    let currentX, currentY;
    if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
    } else {
        currentX = e.clientX;
        currentY = e.clientY;
    }
    if (Math.abs(currentX - startX) > 10 || Math.abs(currentY - startY) > 10) { 
        clearTimeout(pressTimer); 
        pressTimer = null; 
    }
};

const cancelPress = () => { 
    if (pressTimer) { 
        clearTimeout(pressTimer); 
        pressTimer = null; 
    } 
};

screen.addEventListener('touchstart', startPress, { passive: true });
screen.addEventListener('touchmove', movePress, { passive: true });
screen.addEventListener('touchend', cancelPress);
screen.addEventListener('touchcancel', cancelPress);
screen.addEventListener('mousedown', startPress);
screen.addEventListener('mousemove', movePress);
screen.addEventListener('mouseup', cancelPress);
screen.addEventListener('mouseleave', cancelPress);

// ================= 编辑控制栏 =================
document.getElementById('done-btn').addEventListener('click', async () => {
    screen.classList.remove('edit-mode');
    document.getElementById('edit-menu').classList.remove('show');
    await saveCurrentState();
});

document.getElementById('edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('edit-menu').classList.toggle('show');
});

document.getElementById('menu-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.pages-container').innerHTML = backupPagesHTML;
    document.querySelector('.dock-container').innerHTML = backupDockHTML;
    bindAllDynamicEvents();
    screen.classList.remove('edit-mode');
    document.getElementById('edit-menu').classList.remove('show');
});

// ================= 删除组件 =================
screen.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn && screen.classList.contains('edit-mode')) {
        e.stopPropagation();
        const item = deleteBtn.closest('.jiggle-item');
        if (item) {
            item.style.transform = 'scale(0)';
            item.style.opacity = '0';
            setTimeout(async () => { 
                item.remove(); 
                await saveCurrentState(); 
            }, 300);
        }
    }
});

// ================= 组件面板与添加逻辑 =================
const widgetPanel = document.getElementById('widget-panel');
document.getElementById('menu-add').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('edit-menu').classList.remove('show');
    widgetPanel.classList.add('show');
});
document.addEventListener('click', (e) => {
    if (!widgetPanel.contains(e.target) && e.target.id !== 'menu-add') {
        widgetPanel.classList.remove('show');
    }
});

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

document.querySelectorAll('.widget-option').forEach(opt => {
    opt.addEventListener('click', () => {
        let html = null, w = 0, h = 0;
        if (opt.id === 'add-img-1x2') { html = getImgHTML(1, 2); w = 1; h = 2; }
        else if (opt.id === 'add-img-2x1') { html = getImgHTML(2, 1); w = 2; h = 1; }
        else if (opt.id === 'add-img-widget') { html = getImgHTML(2, 2); w = 2; h = 2; }
        else if (opt.id === 'add-img-4x2') { html = getImgHTML(4, 2); w = 4; h = 2; }
        else if (opt.id === 'add-music-widget') { html = musicWidgetHTML; w = 4; h = 3; }
        
        if (html) {
            addWidgetToCurrentPage(html, w, h);
            widgetPanel.classList.remove('show');
        }
    });
});

function addWidgetToCurrentPage(htmlString, w, h) {
    const pagesContainer = document.querySelector('.pages-container');
    const pageIndex = Math.round(pagesContainer.scrollLeft / pagesContainer.clientWidth);
    const page = document.querySelectorAll('.page')[pageIndex];
    if (!page) return;
    const appGrid = page.querySelector('.app-grid');
    
    const slot = findFirstAvailableSlot(page, w, h);
    if (!slot) {
        showToast('当前页面空间不足');
        return;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString.trim();
    const newElement = tempDiv.firstChild;
    newElement.style.setProperty('--col', slot.col);
    newElement.style.setProperty('--row', slot.row);
    newElement.style.setProperty('--w', w);
    newElement.style.setProperty('--h', h);

    appGrid.appendChild(newElement);
    bindAllDynamicEvents();
    saveCurrentState();
}

function getImgHTML(w, h) {
    const id = 'img-' + Date.now() + '-' + Math.floor(Math.random()*1000);
    return `<div class="widget-${w}x${h} jiggle-item grid-item" data-widget-id="${id}">
        <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220,220,225,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <div class="image-widget-content liquid-glass">
            <input type="file" class="widget-img-input" accept="image/*" style="display:none;">
            <div class="upload-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>添加</span></div>
        </div>
    </div>`;
}

const musicWidgetHTML = `<div class="widget-4x3 jiggle-item grid-item">
    <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220, 220, 225, 0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
    <svg class="connecting-lines" viewBox="0 0 400 250" preserveAspectRatio="xMidYMin slice"><defs><linearGradient id="fade-grad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#555555;stop-opacity:1" /><stop offset="85%" style="stop-color:#555555;stop-opacity:0" /></linearGradient></defs><circle cx="151" cy="100" r="4" fill="#555555" /><circle cx="249" cy="100" r="4" fill="#555555" /><path d="M 151 100 Q 100 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/><path d="M 249 100 Q 300 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/></svg>
    <div class="avatars-wrapper"><div class="avatar-group"><div class="speech-bubble" contenteditable="true" spellcheck="false">你在左边</div><div class="avatar-circle"></div></div><div class="avatar-group"><div class="speech-bubble" contenteditable="true" spellcheck="false">我紧靠右</div><div class="avatar-circle"></div></div></div>
    <div class="center-text" contenteditable="true" spellcheck="false">Twenty four seven with us</div>
    <div class="music-player-v2"><div class="music-title">Pink Lavender</div><div class="music-subtitle" contenteditable="true" spellcheck="false">· ⁺ ⋆ ‿ ıllıllı ‿ ⋆ ⁺ ·</div><div class="progress-container"><div class="time-label">1:26</div><div class="progress-bar"><div class="progress-fill"></div></div><div class="time-label">3:48</div></div><div class="controls-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="#666"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><div class="main-controls"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M22 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg><svg width="32" height="32" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="2" fill="#333"/><rect x="14" y="5" width="4" height="14" rx="2" fill="#333"/></svg><svg width="24" height="24" viewBox="0 0 24 24"><path d="M2 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M13 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg></div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2"><path d="M9.52 14.47 A 3.5 3.5 0 1 1 14.48 14.47"/><path d="M7.05 16.95 A 7 7 0 1 1 16.95 16.95"/><path d="M4.58 19.42 A 10.5 10.5 0 1 1 19.42 19.42"/><path d="M12 15.5L16.5 21H7.5L12 15.5Z" fill="#333"/></svg></div></div>
</div>`;

// ================= 换壁纸与预览逻辑 =================
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
    document.getElementById('edit-menu').classList.remove('show');
});

function renderPreview() {
    const container = document.getElementById('preview-container');
    container.innerHTML = '';
    const currentBg = document.getElementById('screen').style.backgroundImage;
    
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
        
        const checkBtn = document.createElement('div');
        checkBtn.className = 'preview-check';
        checkBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        
        // 点击对勾删除逻辑
        checkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const items = page.querySelectorAll('.grid-item');
            if (items.length > 0) {
                showToast('该页面还有组件或软件，无法删除！');
            } else {
                if (document.querySelectorAll('.pages-container .page').length <= 1) {
                    showToast('至少保留一个主页！');
                    return;
                }
                page.remove();
                renderPreview(); // 重新渲染预览
            }
        });

        wrapper.appendChild(scaleBox);
        wrapper.appendChild(checkBtn);
        
        // 点击页面跳转
        wrapper.addEventListener('click', () => {
            const pc = document.querySelector('.pages-container');
            pc.scrollTo({ left: pc.clientWidth * index, behavior: 'smooth' });
            document.getElementById('preview-overlay').classList.remove('show');
            saveCurrentState();
        });
        
        container.appendChild(wrapper);
    });
}

document.getElementById('menu-preview').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('edit-menu').classList.remove('show');
    renderPreview();
    document.getElementById('preview-overlay').classList.add('show');
});

// 预览界面：添加新页面
document.getElementById('preview-add-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const newPage = document.createElement('div');
    newPage.className = 'page';
    newPage.innerHTML = `<div class="app-grid"></div>`;
    document.querySelector('.pages-container').appendChild(newPage);
    renderPreview();
    
    // 自动滚动到最新一页
    const pc = document.querySelector('.pages-container');
    setTimeout(() => {
        pc.scrollTo({ left: pc.scrollWidth, behavior: 'smooth' });
    }, 100);
});

// 预览界面：完成并保存
document.getElementById('preview-done-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    document.getElementById('preview-overlay').classList.remove('show');
    await saveCurrentState();
    bindAllDynamicEvents(); // 重新绑定新页面的拖拽事件
});
