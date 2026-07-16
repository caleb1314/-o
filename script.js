// ================= IndexedDB 持久化逻辑 =================
const DB_NAME = 'LiquidDeskDB';
const STORE_NAME = 'deskStore';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
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
    } catch (e) { console.error('DB Save Error', e); }
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
    } catch (e) { return null; }
}

// ================= 实时时钟与电量 =================
const clockElement = document.getElementById('clock');
function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    if (clockElement) clockElement.textContent = `${hours}:${minutes}`;
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

// ================= 核心：绝对网格坐标初始化 =================
function initGridCoordinates() {
    document.querySelectorAll('.page').forEach(page => {
        const grid = Array(6).fill(0).map(() => Array(4).fill(null));
        const items = page.querySelectorAll('.app-item, [class*="widget-"]');
        
        items.forEach(item => {
            if (item.classList.contains('drag-clone')) return;
            
            let w = parseInt(getComputedStyle(item).getPropertyValue('--w')) || 1;
            let h = parseInt(getComputedStyle(item).getPropertyValue('--h')) || 1;
            
            let row = parseInt(item.getAttribute('data-row'));
            let col = parseInt(item.getAttribute('data-col'));
            
            // 如果没有坐标，或者坐标冲突，自动寻找空位分配
            if (!row || !col || !canPlace(grid, row-1, col-1, w, h)) {
                const pos = findEmptySpot(grid, w, h);
                if (pos) {
                    row = pos.r + 1;
                    col = pos.c + 1;
                    item.setAttribute('data-row', row);
                    item.setAttribute('data-col', col);
                } else {
                    // 如果实在放不下，隐藏或移除（防止破坏布局）
                    item.style.display = 'none';
                    return;
                }
            }
            
            if (row && col) {
                item.style.setProperty('--row', row);
                item.style.setProperty('--col', col);
                markGrid(grid, row-1, col-1, w, h, item);
            }
        });
    });
}

function canPlace(grid, r, c, w, h, ignoreItem = null) {
    if (r < 0 || c < 0 || r + h > 6 || c + w > 4) return false;
    for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
            if (grid[r + i][c + j] && grid[r + i][c + j] !== ignoreItem) return false;
        }
    }
    return true;
}

function markGrid(grid, r, c, w, h, item) {
    for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
            grid[r + i][c + j] = item;
        }
    }
}

function findEmptySpot(grid, w, h) {
    for (let r = 0; r <= 6 - h; r++) {
        for (let c = 0; c <= 4 - w; c++) {
            if (canPlace(grid, r, c, w, h)) return {r, c};
        }
    }
    return null;
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
                initGridCoordinates(); // 删除后重新计算网格
                await saveCurrentState();
            }, 300);
        }
    }
});

// ================= 动态事件绑定 =================
function bindAllDynamicEvents() {
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
            icon.style.boxShadow = 'inset 0 2px 4px rgba(255, 255, 255, 0.9), inset 0 -1px 3px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.05)';
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

    document.querySelectorAll('.image-widget-content').forEach(content => {
        const widget = content.closest('[class*="widget-"]');
        if (!widget) return;
        const newWidget = widget.cloneNode(true);
        widget.replaceWith(newWidget);
    });

    document.querySelectorAll('.image-widget-content').forEach(content => {
        const widget = content.closest('[class*="widget-"]');
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
                    content.classList.add('has-image');
                    const placeholder = content.querySelector('.upload-placeholder');
                    if (placeholder) placeholder.style.display = 'none';
                    await saveToDB(`widget_${widgetId}`, base64);
                    await saveCurrentState();
                };
                reader.readAsDataURL(file);
            }
        });
    });
}

// ================= 页面初始化加载缓存 =================
window.addEventListener('DOMContentLoaded', async () => {
    const savedWallpaper = await getFromDB('wallpaper');
    if (savedWallpaper) document.getElementById('screen').style.backgroundImage = `url(${savedWallpaper})`;
    
    const savedPages = await getFromDB('pagesHTML');
    const savedDock = await getFromDB('dockHTML');
    if (savedPages) document.querySelector('.pages-container').innerHTML = savedPages;
    if (savedDock) document.querySelector('.dock-container').innerHTML = savedDock;
    
    const widgets = document.querySelectorAll('[class*="widget-"]:not(.widget-4x3)');
    for (const widget of widgets) {
        const widgetId = widget.getAttribute('data-widget-id');
        if (widgetId) {
            const base64 = await getFromDB(`widget_${widgetId}`);
            if (base64) {
                const content = widget.querySelector('.image-widget-content');
                if (content) {
                    content.style.backgroundImage = `url(${base64})`;
                    content.classList.add('has-image');
                    const placeholder = content.querySelector('.upload-placeholder');
                    if (placeholder) placeholder.style.display = 'none';
                }
            }
        }
    }

    initGridCoordinates(); // 初始化绝对坐标
    bindAllDynamicEvents();
    initDragAndDrop(); // 启动全新拖拽系统
});

// ================= 长按进入编辑模式 =================
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600;

let backupPagesHTML = '';
let backupDockHTML = '';

screen.addEventListener('contextmenu', (e) => e.preventDefault());

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
    }, LONG_PRESS_DURATION);
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

// ================= 编辑控制栏与弹窗 =================
const editBtn = document.getElementById('edit-btn');
const editMenu = document.getElementById('edit-menu');
const doneBtn = document.getElementById('done-btn');

const saveCurrentState = async () => {
    if(document.activeElement) document.activeElement.blur();
    const pagesHTML = document.querySelector('.pages-container').innerHTML;
    const dockHTML = document.querySelector('.dock-container').innerHTML;
    await saveToDB('pagesHTML', pagesHTML);
    await saveToDB('dockHTML', dockHTML);
};

const exitEditMode = async (e) => {
    if(e) e.stopPropagation();
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

// ================= 组件面板逻辑 =================
const widgetPanel = document.getElementById('widget-panel');
const closePanelBtn = document.getElementById('close-panel');

document.getElementById('menu-add').addEventListener('click', (e) => {
    e.stopPropagation();
    editMenu.classList.remove('show');
    widgetPanel.classList.add('show');
});

closePanelBtn.addEventListener('click', () => {
    widgetPanel.classList.remove('show');
});

document.getElementById('panel-add-btn').addEventListener('click', () => {
    showToast('自定义组件功能开发中');
});

document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.widget-tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

function getCurrentPageIndex() {
    const container = document.querySelector('.pages-container');
    return Math.round(container.scrollLeft / container.clientWidth);
}

// ================= 顶部弹窗 =================
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
        else { el.style.transform = `translate(-50%, 24px) scale(0.84)`; el.style.opacity = '0'; el.style.zIndex = 9997; }
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

// ================= 添加组件逻辑 =================
function getImageWidgetHTML(sizeClass) {
    const widgetId = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    return `
    <div class="${sizeClass} jiggle-item" data-widget-id="${widgetId}">
        <div class="delete-btn">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220, 220, 225, 0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg>
        </div>
        <div class="image-widget-content liquid-glass">
            <input type="file" class="widget-img-input" accept="image/*" style="display:none;">
            <div class="upload-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>添加照片</span>
            </div>
        </div>
    </div>
    `;
}

const musicWidgetHTML = `
<div class="widget-4x3 jiggle-item">
    <div class="delete-btn">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220, 220, 225, 0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg>
    </div>
    <svg class="connecting-lines" viewBox="0 0 400 250" preserveAspectRatio="xMidYMin slice">
        <defs><linearGradient id="fade-grad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#555555;stop-opacity:1" /><stop offset="85%" style="stop-color:#555555;stop-opacity:0" /></linearGradient></defs>
        <circle cx="151" cy="100" r="4" fill="#555555" /><circle cx="249" cy="100" r="4" fill="#555555" />
        <path d="M 151 100 Q 100 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M 249 100 Q 300 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/>
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
            <div class="time-label">1:26</div><div class="progress-bar"><div class="progress-fill"></div></div><div class="time-label">3:48</div>
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
</div>
`;

document.querySelectorAll('.widget-option').forEach(opt => {
    opt.addEventListener('click', () => {
        const type = opt.getAttribute('data-widget-type');
        let html = '';
        if (type.startsWith('img-')) {
            const size = type.split('-')[1]; 
            html = getImageWidgetHTML(`widget-${size}`);
        } else if (type === 'music-4x3') {
            html = musicWidgetHTML;
        }
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html.trim();
        const newElement = tempDiv.firstChild;
        
        const pageIndex = getCurrentPageIndex();
        const pages = document.querySelectorAll('.pages-container .page');
        const page = pages[pageIndex];
        
        // 尝试在当前页寻找空位
        const grid = Array(6).fill(0).map(() => Array(4).fill(null));
        const items = page.querySelectorAll('.app-item, [class*="widget-"]');
        items.forEach(item => {
            let w = parseInt(getComputedStyle(item).getPropertyValue('--w')) || 1;
            let h = parseInt(getComputedStyle(item).getPropertyValue('--h')) || 1;
            let row = parseInt(item.getAttribute('data-row')) - 1;
            let col = parseInt(item.getAttribute('data-col')) - 1;
            if (row >= 0 && col >= 0) markGrid(grid, row, col, w, h, item);
        });
        
        let newW = parseInt(getComputedStyle(newElement).getPropertyValue('--w')) || 1;
        let newH = parseInt(getComputedStyle(newElement).getPropertyValue('--h')) || 1;
        
        // 临时插入 DOM 以获取正确的 CSS 变量
        page.querySelector('.app-grid').appendChild(newElement);
        newW = parseInt(getComputedStyle(newElement).getPropertyValue('--w')) || 1;
        newH = parseInt(getComputedStyle(newElement).getPropertyValue('--h')) || 1;
        page.querySelector('.app-grid').removeChild(newElement);

        const pos = findEmptySpot(grid, newW, newH);
        
        if (pos) {
            newElement.setAttribute('data-row', pos.r + 1);
            newElement.setAttribute('data-col', pos.c + 1);
            newElement.style.setProperty('--row', pos.r + 1);
            newElement.style.setProperty('--col', pos.c + 1);
            
            page.querySelector('.app-grid').appendChild(newElement);
            bindAllDynamicEvents();
            saveCurrentState();
            widgetPanel.classList.remove('show');
        } else {
            showToast('当前页面空间不足');
        }
    });
});

// ================= 全新：绝对坐标系拖拽系统 =================
let draggingElement = null;
let dragClone = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let pageSwitchTimer = null;
let targetPageIndex = 0;

function getGridData(gridElement, ignoreItem = null) {
    const grid = Array(6).fill(0).map(() => Array(4).fill(null));
    const items = gridElement.querySelectorAll('.app-item, [class*="widget-"]');
    items.forEach(item => {
        if (item === ignoreItem || item.classList.contains('drag-clone')) return;
        let w = parseInt(getComputedStyle(item).getPropertyValue('--w')) || 1;
        let h = parseInt(getComputedStyle(item).getPropertyValue('--h')) || 1;
        let row = parseInt(item.getAttribute('data-row')) - 1;
        let col = parseInt(item.getAttribute('data-col')) - 1;
        if (row >= 0 && col >= 0) markGrid(grid, row, col, w, h, item);
    });
    return grid;
}

function getOverlappingItems(grid, r, c, w, h) {
    const items = new Set();
    if (r < 0 || c < 0 || r + h > 6 || c + w > 4) return ['OUT_OF_BOUNDS'];
    for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
            if (grid[r + i][c + j]) items.add(grid[r + i][c + j]);
        }
    }
    return Array.from(items);
}

function updateItemPos(item, row, col, targetGridElement) {
    item.setAttribute('data-row', row);
    item.setAttribute('data-col', col);
    item.style.setProperty('--row', row);
    item.style.setProperty('--col', col);
    if (item.closest('.app-grid') !== targetGridElement) {
        targetGridElement.appendChild(item);
    }
}

function initDragAndDrop() {
    const screen = document.getElementById('screen');
    
    screen.addEventListener('pointerdown', (e) => {
        if (!screen.classList.contains('edit-mode')) return;
        const item = e.target.closest('.app-item, [class*="widget-"]');
        if (!item || e.target.closest('.delete-btn') || item.closest('.dock-container')) return;
        
        e.preventDefault();
        draggingElement = item;
        const rect = item.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        
        dragClone = item.cloneNode(true);
        dragClone.classList.add('drag-clone');
        dragClone.style.width = `${rect.width}px`;
        dragClone.style.height = `${rect.height}px`;
        dragClone.style.left = `${rect.left}px`;
        dragClone.style.top = `${rect.top}px`;
        document.body.appendChild(dragClone);
        
        item.classList.add('is-dragging');
        targetPageIndex = getCurrentPageIndex();
    });
    
    document.addEventListener('pointermove', (e) => {
        if (!draggingElement || !dragClone) return;
        
        dragClone.style.left = `${e.clientX - dragOffsetX}px`;
        dragClone.style.top = `${e.clientY - dragOffsetY}px`;
        
        // 边缘停留翻页逻辑
        const edgeThreshold = 40;
        if (e.clientX < edgeThreshold) {
            if (!pageSwitchTimer) {
                pageSwitchTimer = setTimeout(() => {
                    const container = document.querySelector('.pages-container');
                    targetPageIndex = Math.max(0, targetPageIndex - 1);
                    container.scrollTo({ left: container.clientWidth * targetPageIndex, behavior: 'smooth' });
                }, 800);
            }
        } else if (e.clientX > window.innerWidth - edgeThreshold) {
            if (!pageSwitchTimer) {
                pageSwitchTimer = setTimeout(() => {
                    const container = document.querySelector('.pages-container');
                    targetPageIndex = Math.min(document.querySelectorAll('.page').length - 1, targetPageIndex + 1);
                    container.scrollTo({ left: container.clientWidth * targetPageIndex, behavior: 'smooth' });
                }, 800);
            }
        } else {
            clearTimeout(pageSwitchTimer);
            pageSwitchTimer = null;
        }
        
        // 实时计算落点
        const pages = document.querySelectorAll('.page');
        const targetPage = pages[targetPageIndex];
        if (!targetPage) return;
        const targetGrid = targetPage.querySelector('.app-grid');
        const gridRect = targetGrid.getBoundingClientRect();
        
        const cellW = gridRect.width / 4;
        const cellH = gridRect.height / 6;
        
        const dragW = parseInt(getComputedStyle(draggingElement).getPropertyValue('--w')) || 1;
        const dragH = parseInt(getComputedStyle(draggingElement).getPropertyValue('--h')) || 1;
        
        // 计算鼠标中心点所在的格子
        const centerX = e.clientX - gridRect.left;
        const centerY = e.clientY - gridRect.top;
        
        let hoverCol = Math.floor(centerX / cellW) + 1;
        let hoverRow = Math.floor(centerY / cellH) + 1;
        
        // 防止越界
        hoverCol = Math.max(1, Math.min(4 - dragW + 1, hoverCol));
        hoverRow = Math.max(1, Math.min(6 - dragH + 1, hoverRow));
        
        const gridData = getGridData(targetGrid, draggingElement);
        const overlappingItems = getOverlappingItems(gridData, hoverRow-1, hoverCol-1, dragW, dragH);
        
        if (overlappingItems.length === 0) {
            // 完全空位，直接移动（拖到哪就是哪）
            updateItemPos(draggingElement, hoverRow, hoverCol, targetGrid);
        } else if (overlappingItems.length === 1 && overlappingItems[0] !== 'OUT_OF_BOUNDS') {
            // 遇到一个元素，检查是否同尺寸，同尺寸则互换位置
            const targetItem = overlappingItems[0];
            const targetW = parseInt(getComputedStyle(targetItem).getPropertyValue('--w')) || 1;
            const targetH = parseInt(getComputedStyle(targetItem).getPropertyValue('--h')) || 1;
            
            if (targetW === dragW && targetH === dragH) {
                const tempRow = draggingElement.getAttribute('data-row');
                const tempCol = draggingElement.getAttribute('data-col');
                const tempGrid = draggingElement.closest('.app-grid');
                
                updateItemPos(draggingElement, hoverRow, hoverCol, targetGrid);
                updateItemPos(targetItem, tempRow, tempCol, tempGrid);
            }
        }
    });
    
    document.addEventListener('pointerup', (e) => {
        if (!draggingElement) return;
        dragClone.remove();
        dragClone = null;
        draggingElement.classList.remove('is-dragging');
        draggingElement = null;
        clearTimeout(pageSwitchTimer);
        pageSwitchTimer = null;
    });
}

// ================= 取消修改、壁纸、预览逻辑 =================
document.getElementById('menu-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.pages-container').innerHTML = backupPagesHTML;
    document.querySelector('.dock-container').innerHTML = backupDockHTML;
    initGridCoordinates();
    bindAllDynamicEvents();
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
});

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

document.getElementById('menu-preview').addEventListener('click', (e) => {
    e.stopPropagation();
    editMenu.classList.remove('show');
    
    const overlay = document.getElementById('preview-overlay');
    const container = document.getElementById('preview-container');
    container.innerHTML = '';
    
    const currentBg = document.getElementById('screen').style.backgroundImage || getComputedStyle(document.getElementById('screen')).backgroundImage;
    
    const pages = document.querySelectorAll('.pages-container .page');
    pages.forEach((page, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-page-wrapper';
        
        const scaleBox = document.createElement('div');
        scaleBox.className = 'preview-scale-box liquid-glass';
        scaleBox.style.backgroundImage = currentBg;
        
        const scaleContent = document.createElement('div');
        scaleContent.className = 'preview-scale-content';
        
        const clonedPage = page.cloneNode(true);
        scaleContent.appendChild(clonedPage);
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
