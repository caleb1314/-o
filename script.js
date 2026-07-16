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
updateTime(); setInterval(updateTime, 1000);

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

        const pressDownAnim = () => { if (screen.classList.contains('edit-mode')) return; content.style.transform = 'scale(0.95)'; };
        const pressUpAnim = () => { if (screen.classList.contains('edit-mode')) return; content.style.transform = 'scale(1)'; };

        widget.addEventListener('touchstart', pressDownAnim, { passive: true });
        widget.addEventListener('touchend', pressUpAnim);
        widget.addEventListener('touchcancel', pressUpAnim);
        widget.addEventListener('mousedown', pressDownAnim);
        widget.addEventListener('mouseup', pressUpAnim);
        widget.addEventListener('mouseleave', pressUpAnim);

        content.addEventListener('click', () => { if (!screen.classList.contains('edit-mode')) input.click(); });

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

    bindAllDynamicEvents();
    initDragAndDrop();
});

// ================= 长按进入编辑模式 =================
const screen = document.getElementById('screen');
let pressTimer = null;
let startX = 0, startY = 0;
const LONG_PRESS_DURATION = 600;
let backupPagesHTML = '', backupDockHTML = '';

screen.addEventListener('contextmenu', (e) => e.preventDefault());

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
    let currentX, currentY;
    if (e.type === 'touchmove') { currentX = e.touches[0].clientX; currentY = e.touches[0].clientY; } 
    else { currentX = e.clientX; currentY = e.clientY; }
    if (Math.abs(currentX - startX) > 10 || Math.abs(currentY - startY) > 10) { clearTimeout(pressTimer); pressTimer = null; }
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
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); editMenu.classList.toggle('show'); });
}

// 全局删除事件
screen.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn && screen.classList.contains('edit-mode')) {
        e.stopPropagation();
        const item = deleteBtn.closest('.jiggle-item');
        if (item) {
            item.classList.add('removing');
            setTimeout(async () => { item.remove(); await saveCurrentState(); }, 300);
        }
    }
});

// ================= 组件面板逻辑 =================
const widgetPanel = document.getElementById('widget-panel');
const closePanelBtn = document.getElementById('close-panel');

document.getElementById('menu-add').addEventListener('click', (e) => {
    e.stopPropagation();
    editMenu.classList.remove('show');
    widgetPanel.classList.add('show');
});

closePanelBtn.addEventListener('click', () => widgetPanel.classList.remove('show'));

document.getElementById('panel-add-btn').addEventListener('click', () => {
    showToast('预留自定义组件接口');
});

document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.widget-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

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

// ================= 核心：绝对坐标网格算法 =================
function getWidgetSize(item) {
    if (item.classList.contains('widget-1x2')) return { w: 1, h: 2 };
    if (item.classList.contains('widget-2x1')) return { w: 2, h: 1 };
    if (item.classList.contains('widget-2x2')) return { w: 2, h: 2 };
    if (item.classList.contains('widget-4x2')) return { w: 4, h: 2 };
    if (item.classList.contains('widget-4x3')) return { w: 4, h: 3 };
    return { w: 1, h: 1 }; // app-item
}

function getOccupyingItems(gridElement, r, c, w, h, excludeItem = null) {
    const items = Array.from(gridElement.querySelectorAll('.app-item, [class*="widget-"]'));
    return items.filter(item => {
        if (item === excludeItem || item.classList.contains('drag-clone')) return false;
        if (!item.hasAttribute('data-row') || !item.hasAttribute('data-col')) return false;
        const ir = parseInt(item.getAttribute('data-row'));
        const ic = parseInt(item.getAttribute('data-col'));
        const size = getWidgetSize(item);
        return !(ir >= r + h || ir + size.h <= r || ic >= c + w || ic + size.w <= c);
    });
}

function findFirstFreeSpace(gridElement, w, h) {
    for (let r = 0; r <= 6 - h; r++) {
        for (let c = 0; c <= 4 - w; c++) {
            if (getOccupyingItems(gridElement, r, c, w, h).length === 0) {
                return { r, c };
            }
        }
    }
    return null;
}

function setItemPosition(item, r, c) {
    item.setAttribute('data-row', r);
    item.setAttribute('data-col', c);
    const size = getWidgetSize(item);
    item.style.gridArea = `${r + 1} / ${c + 1} / span ${size.h} / span ${size.w}`;
}

function getCurrentPageIndex() {
    const container = document.querySelector('.pages-container');
    return Math.round(container.scrollLeft / container.clientWidth);
}

// ================= 添加组件逻辑 =================
function getImageWidgetHTML(sizeClass) {
    const widgetId = 'img-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    return `
    <div class="${sizeClass} jiggle-item" data-widget-id="${widgetId}">
        <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220, 220, 225, 0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
        <div class="image-widget-content liquid-glass">
            <input type="file" class="widget-img-input" accept="image/*" style="display:none;">
            <div class="upload-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>添加照片</span></div>
        </div>
    </div>`;
}

const musicWidgetHTML = `
<div class="widget-4x3 jiggle-item">
    <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220, 220, 225, 0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
    <svg class="connecting-lines" viewBox="0 0 400 250" preserveAspectRatio="xMidYMin slice"><defs><linearGradient id="fade-grad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#555555;stop-opacity:1" /><stop offset="85%" style="stop-color:#555555;stop-opacity:0" /></linearGradient></defs><circle cx="151" cy="100" r="4" fill="#555555" /><circle cx="249" cy="100" r="4" fill="#555555" /><path d="M 151 100 Q 100 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/><path d="M 249 100 Q 300 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/></svg>
    <div class="avatars-wrapper"><div class="avatar-group"><div class="speech-bubble" contenteditable="true" spellcheck="false">你在左边</div><div class="avatar-circle"></div></div><div class="avatar-group"><div class="speech-bubble" contenteditable="true" spellcheck="false">我紧靠右</div><div class="avatar-circle"></div></div></div>
    <div class="center-text" contenteditable="true" spellcheck="false">Twenty four seven with us</div>
    <div class="music-player-v2"><div class="music-title">Pink Lavender</div><div class="music-subtitle" contenteditable="true" spellcheck="false">· ⁺ ⋆ ‿ ıllıllı ‿ ⋆ ⁺ ·</div><div class="progress-container"><div class="time-label">1:26</div><div class="progress-bar"><div class="progress-fill"></div></div><div class="time-label">3:48</div></div><div class="controls-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="#666"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><div class="main-controls"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M22 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg><svg width="32" height="32" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="2" fill="#333"/><rect x="14" y="5" width="4" height="14" rx="2" fill="#333"/></svg><svg width="24" height="24" viewBox="0 0 24 24"><path d="M2 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M13 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg></div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2"><path d="M9.52 14.47 A 3.5 3.5 0 1 1 14.48 14.47"/><path d="M7.05 16.95 A 7 7 0 1 1 16.95 16.95"/><path d="M4.58 19.42 A 10.5 10.5 0 1 1 19.42 19.42"/><path d="M12 15.5L16.5 21H7.5L12 15.5Z" fill="#333"/></svg></div></div>
</div>`;

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
        const grid = pages[pageIndex].querySelector('.app-grid');
        
        const size = getWidgetSize(newElement);
        const freeSpace = findFirstFreeSpace(grid, size.w, size.h);
        
        if (freeSpace) {
            setItemPosition(newElement, freeSpace.r, freeSpace.c);
            grid.appendChild(newElement);
            bindAllDynamicEvents();
            saveCurrentState();
            widgetPanel.classList.remove('show');
        } else {
            showToast('当前页面空间不足');
        }
    });
});

// ================= 原生级自由拖拽系统 (绝对坐标互换) =================
let draggingElement = null;
let dragClone = null;
let dragOffsetX = 0, dragOffsetY = 0;
let pageSwitchTimer = null;
let targetPageIndex = 0;
let originalRow = 0, originalCol = 0, originalGrid = null;

function initDragAndDrop() {
    const screen = document.getElementById('screen');
    
    screen.addEventListener('pointerdown', (e) => {
        if (!screen.classList.contains('edit-mode')) return;
        const item = e.target.closest('.app-grid > .app-item, .app-grid > [class*="widget-"]');
        if (!item || e.target.closest('.delete-btn')) return;
        
        e.preventDefault();
        draggingElement = item;
        originalGrid = item.closest('.app-grid');
        originalRow = parseInt(item.getAttribute('data-row'));
        originalCol = parseInt(item.getAttribute('data-col'));
        targetPageIndex = getCurrentPageIndex();
        
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
    });
    
    document.addEventListener('pointerup', (e) => {
        if (!draggingElement) return;
        
        const pages = document.querySelectorAll('.page');
        const targetGrid = pages[targetPageIndex].querySelector('.app-grid');
        const gridRect = targetGrid.getBoundingClientRect();
        
        const cellW = (gridRect.width + 15) / 4;
        const cellH = (gridRect.height + 15) / 6;
        
        const cloneRect = dragClone.getBoundingClientRect();
        const centerX = cloneRect.left + cloneRect.width / 2;
        const centerY = cloneRect.top + cloneRect.height / 2;
        
        let tC = Math.floor((centerX - gridRect.left) / cellW);
        let tR = Math.floor((centerY - gridRect.top) / cellH);
        
        const size = getWidgetSize(draggingElement);
        tC = Math.max(0, Math.min(4 - size.w, tC));
        tR = Math.max(0, Math.min(6 - size.h, tR));
        
        // 检查重叠与互换逻辑
        const overlaps = getOccupyingItems(targetGrid, tR, tC, size.w, size.h, draggingElement);
        
        if (overlaps.length === 0) {
            // 目标位置为空，直接移动
            setItemPosition(draggingElement, tR, tC);
            if (targetGrid !== originalGrid) targetGrid.appendChild(draggingElement);
        } else if (overlaps.length === 1) {
            // 目标位置有1个物品，尝试互换
            const swapItem = overlaps[0];
            const swapSize = getWidgetSize(swapItem);
            
            // 检查互换物品是否能放进原位置
            const swapOverlaps = getOccupyingItems(originalGrid, originalRow, originalCol, swapSize.w, swapSize.h, draggingElement);
            const swapOverlapsFiltered = swapOverlaps.filter(item => item !== swapItem);
            
            if (swapOverlapsFiltered.length === 0) {
                // 完美互换
                setItemPosition(draggingElement, tR, tC);
                setItemPosition(swapItem, originalRow, originalCol);
                if (targetGrid !== originalGrid) {
                    targetGrid.appendChild(draggingElement);
                    originalGrid.appendChild(swapItem);
                }
            } else {
                // 无法互换，弹回原位
                setItemPosition(draggingElement, originalRow, originalCol);
                if (draggingElement.parentNode !== originalGrid) originalGrid.appendChild(draggingElement);
            }
        } else {
            // 目标位置有多个物品，无法互换，弹回原位
            setItemPosition(draggingElement, originalRow, originalCol);
            if (draggingElement.parentNode !== originalGrid) originalGrid.appendChild(draggingElement);
        }
        
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
