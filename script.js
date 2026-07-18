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
            if (batteryLevel) batteryLevel.setAttribute('width', (level / 100) * 27);
        }
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
    });
}

// ================= 顶部清透玻璃弹窗逻辑 =================
let activeNotifications = [];
let notifCounter = 0;
let lastToastTime = 0;

function showToast(msg) {
    const now = Date.now();
    if (now - lastToastTime < 1000) return; 
    lastToastTime = now;

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
    void banner.offsetWidth; 
    updateStack();

    setTimeout(() => {
        removeNotification(id);
    }, 1500);
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

// ================= 图片裁剪器逻辑 =================
let currentCropWidget = null;
let cropImgX = 0, cropImgY = 0, cropImgScale = 1;
let cropStartX = 0, cropStartY = 0, cropStartDist = 0;
let isDraggingCrop = false, isPinchingCrop = false;

const cropArea = document.getElementById('crop-area');
const cropImg = document.getElementById('crop-img');
const cropBox = document.getElementById('crop-box');

function updateCropImgTransform() {
    cropImg.style.transform = `translate(calc(-50% + ${cropImgX}px), calc(-50% + ${cropImgY}px)) scale(${cropImgScale})`;
}

cropArea.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
        isDraggingCrop = true;
        cropStartX = e.touches[0].clientX - cropImgX;
        cropStartY = e.touches[0].clientY - cropImgY;
    } else if (e.touches.length === 2) {
        isPinchingCrop = true;
        cropStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
});

cropArea.addEventListener('touchmove', e => {
    e.preventDefault();
    if (isPinchingCrop && e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        cropImgScale *= dist / cropStartDist;
        cropStartDist = dist;
        updateCropImgTransform();
    } else if (isDraggingCrop && e.touches.length === 1) {
        cropImgX = e.touches[0].clientX - cropStartX;
        cropImgY = e.touches[0].clientY - cropStartY;
        updateCropImgTransform();
    }
}, { passive: false });

cropArea.addEventListener('touchend', () => { isDraggingCrop = false; isPinchingCrop = false; });

let isMouseDownCrop = false;
cropArea.addEventListener('mousedown', e => {
    isMouseDownCrop = true;
    cropStartX = e.clientX - cropImgX;
    cropStartY = e.clientY - cropImgY;
});
window.addEventListener('mousemove', e => {
    if (!isMouseDownCrop) return;
    cropImgX = e.clientX - cropStartX;
    cropImgY = e.clientY - cropStartY;
    updateCropImgTransform();
});
window.addEventListener('mouseup', () => isMouseDownCrop = false);
cropArea.addEventListener('wheel', e => {
    e.preventDefault();
    cropImgScale *= e.deltaY > 0 ? 0.95 : 1.05;
    updateCropImgTransform();
}, { passive: false });

document.getElementById('crop-cancel').addEventListener('click', () => {
    document.getElementById('crop-modal').classList.remove('show');
    cropBox.style.borderRadius = '12px'; // 恢复默认圆角
});

document.getElementById('crop-done').addEventListener('click', async () => {
    const canvas = document.createElement('canvas');
    const rectBox = cropBox.getBoundingClientRect();
    const rectImg = cropImg.getBoundingClientRect();
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rectBox.width * dpr;
    canvas.height = rectBox.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    ctx.drawImage(cropImg, rectImg.left - rectBox.left, rectImg.top - rectBox.top, rectImg.width, rectImg.height);
    
    const base64 = canvas.toDataURL('image/png');
    
    if (currentCropWidget.classList.contains('avatar-circle')) {
        // 音乐组件头像裁剪完成
        currentCropWidget.style.backgroundImage = `url(${base64})`;
        currentCropWidget.style.backgroundColor = 'transparent';
        saveCurrentState();
        cropBox.style.borderRadius = '12px'; // 恢复默认圆角
    } else {
        // 普通图片组件裁剪完成
        const content = currentCropWidget.querySelector('.image-widget-content');
        content.style.backgroundImage = `url(${base64})`;
        content.style.backgroundColor = 'transparent';
        content.style.border = 'none';
        content.style.boxShadow = 'none';
        const placeholder = content.querySelector('.upload-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        
        const widgetId = currentCropWidget.getAttribute('data-widget-id');
        await saveToDB(`widget_${widgetId}`, base64);
        await saveCurrentState();
    }
    
    document.getElementById('crop-modal').classList.remove('show');
});

// ================= 动态事件绑定 =================
const screen = document.getElementById('screen');

function bindAllDynamicEvents() {
    document.querySelectorAll('.app-item, .widget-1x2, .widget-2x1, .widget-2x2, .widget-4x2, .widget-4x3, .custom-widget-item').forEach(item => {
        const newBtn = item.cloneNode(true);
        delete newBtn.dataset.jsInited; 
        item.replaceWith(newBtn);
    });

    document.querySelectorAll('.app-item').forEach(item => {
        const icon = item.querySelector('.app-icon-box');
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

    document.querySelectorAll('.widget-1x2, .widget-2x1, .widget-2x2, .widget-4x2, .custom-widget-item').forEach(widget => {
        const content = widget.querySelector('.image-widget-content');
        const input = widget.querySelector('.widget-img-input');
        if (!content || !input) return;

        const pressDownAnim = () => { if (!screen.classList.contains('edit-mode')) content.style.transform = 'scale(0.95)'; };
        const pressUpAnim = () => { if (!screen.classList.contains('edit-mode')) content.style.transform = 'scale(1)'; };

        widget.addEventListener('touchstart', pressDownAnim, { passive: true });
        widget.addEventListener('touchend', pressUpAnim);
        widget.addEventListener('touchcancel', pressUpAnim);
        widget.addEventListener('mousedown', pressDownAnim);
        widget.addEventListener('mouseup', pressUpAnim);
        widget.addEventListener('mouseleave', pressUpAnim);

        content.addEventListener('click', () => {
            if (screen.classList.contains('edit-mode')) return;
            input.click();
        });

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    currentCropWidget = widget;
                    cropImg.src = event.target.result;
                    
                    const widgetRect = widget.getBoundingClientRect();
                    const ratio = widgetRect.width / widgetRect.height;
                    let boxW = window.innerWidth * 0.8;
                    let boxH = boxW / ratio;
                    if (boxH > window.innerHeight * 0.6) {
                        boxH = window.innerHeight * 0.6;
                        boxW = boxH * ratio;
                    }
                    cropBox.style.width = boxW + 'px';
                    cropBox.style.height = boxH + 'px';

                    cropImgX = 0; cropImgY = 0;
                    cropImg.onload = () => {
                        const imgRatio = cropImg.naturalWidth / cropImg.naturalHeight;
                        cropImgScale = (imgRatio > ratio) ? (boxH / cropImg.naturalHeight) : (boxW / cropImg.naturalWidth);
                        cropImgScale *= 1.05; 
                        updateCropImgTransform();
                        document.getElementById('crop-modal').classList.add('show');
                    };
                    input.value = ''; 
                };
                reader.readAsDataURL(file);
            }
        });
    });

    // 绑定音乐组件头像上传事件（触发裁剪器）
    document.querySelectorAll('.avatar-circle').forEach(circle => {
        if (circle.dataset.hasUpload) return;
        circle.dataset.hasUpload = 'true';
        
        let input = circle.querySelector('input[type="file"]');
        if (!input) {
            input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.display = 'none';
            circle.appendChild(input);
        }
        
        circle.addEventListener('click', (e) => {
            if (screen.classList.contains('edit-mode')) return;
            e.stopPropagation();
            input.click();
        });
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    currentCropWidget = circle; // 复用裁剪器
                    cropImg.src = event.target.result;
                    
                    const ratio = 1; // 头像为正方形
                    let boxW = window.innerWidth * 0.7;
                    let boxH = boxW;
                    cropBox.style.width = boxW + 'px';
                    cropBox.style.height = boxH + 'px';
                    cropBox.style.borderRadius = '50%'; // 圆形裁剪框

                    cropImgX = 0; cropImgY = 0;
                    cropImg.onload = () => {
                        const imgRatio = cropImg.naturalWidth / cropImg.naturalHeight;
                        cropImgScale = (imgRatio > ratio) ? (boxH / cropImg.naturalHeight) : (boxW / cropImg.naturalWidth);
                        cropImgScale *= 1.05; 
                        updateCropImgTransform();
                        document.getElementById('crop-modal').classList.add('show');
                    };
                    input.value = ''; 
                };
                reader.readAsDataURL(file);
            }
        });
    });

    initDragSystem();
    
    document.querySelectorAll('.custom-widget-item').forEach(el => {
        if (el.dataset.jsInited) return; 
        const customId = el.getAttribute('data-custom-id');
        const widgetData = customWidgets.find(w => w.id === customId);
        if (widgetData && widgetData.js) {
            try {
                const func = new Function('widget', widgetData.js);
                func(el);
            } catch(e) {
                console.error('自定义组件 JS 执行错误:', e);
            }
        }
        el.dataset.jsInited = 'true';
    });
}

// ================= 拖拽系统 =================
let draggingItem = null;
let ghostEl = null;
let pageScrollTimer = null;
let originalParent = null;

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
    document.querySelectorAll('.app-item, .widget-1x2, .widget-2x1, .widget-2x2, .widget-4x2, .widget-4x3, .custom-widget-item').forEach(item => {
        item.addEventListener('touchstart', handleDragStart, { passive: false });
        item.addEventListener('mousedown', handleDragStart);
    });
}

function handleDragStart(e) {
    if (!screen.classList.contains('edit-mode') || e.target.closest('.delete-btn')) return;
    e.preventDefault(); 
    draggingItem = e.currentTarget;
    originalParent = draggingItem.parentNode;
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

    const dock = document.querySelector('.dock-container');
    const dockRect = dock.getBoundingClientRect();
    const isOverDock = clientX >= dockRect.left && clientX <= dockRect.right && clientY >= dockRect.top && clientY <= dockRect.bottom;

    const isApp = draggingItem.classList.contains('app-item');

    if (isOverDock && isApp) {
        if (draggingItem.parentNode !== dock) {
            if (dock.querySelectorAll('.app-item').length >= 4) {
                showToast('Dock栏最多只能放4个软件！');
                return;
            }
            dock.appendChild(draggingItem);
            draggingItem.classList.remove('grid-item');
            draggingItem.style.removeProperty('--col');
            draggingItem.style.removeProperty('--row');
        } else {
            const siblings = [...dock.querySelectorAll('.app-item:not(.dragging)')];
            const nextSibling = siblings.find(sib => {
                return clientX <= sib.getBoundingClientRect().left + sib.offsetWidth / 2;
            });
            dock.insertBefore(draggingItem, nextSibling);
        }
    } else {
        if (draggingItem.parentNode === dock) {
            if (dock.querySelectorAll('.app-item').length <= 2) {
                showToast('Dock栏最少保留2个软件！');
                return;
            }
            draggingItem.classList.add('grid-item');
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
            
            const w = parseInt(draggingItem.style.getPropertyValue('--w')) || 1;
            const h = parseInt(draggingItem.style.getPropertyValue('--h')) || 1;
            
            const matrix = getOccupancyMatrix(currentPage);
            if (canFit(matrix, col, row, w, h)) {
                if (draggingItem.parentNode !== grid) grid.appendChild(draggingItem);
                draggingItem.style.setProperty('--col', col);
                draggingItem.style.setProperty('--row', row);
            }
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
        originalParent = null;
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
    
    // 恢复音乐APP的背景和头像缓存
    const savedMusicBg = await getFromDB('music_profile_bg');
    if (savedMusicBg) document.getElementById('profile-bg').style.backgroundImage = `url(${savedMusicBg})`;
    const savedMusicAvatar = await getFromDB('music_profile_avatar');
    if (savedMusicAvatar) document.getElementById('profile-avatar').style.backgroundImage = `url(${savedMusicAvatar})`;

    const savedPages = await getFromDB('pagesHTML');
    const savedDock = await getFromDB('dockHTML');
    if (savedPages) document.querySelector('.pages-container').innerHTML = savedPages;
    if (savedDock) document.querySelector('.dock-container').innerHTML = savedDock;
    
    const widgets = document.querySelectorAll('.widget-1x2, .widget-2x1, .widget-2x2, .widget-4x2, .custom-widget-item');
    for (const widget of widgets) {
        const widgetId = widget.getAttribute('data-widget-id');
        if (widgetId) {
            const base64 = await getFromDB(`widget_${widgetId}`);
            if (base64) {
                const content = widget.querySelector('.image-widget-content');
                if(content) {
                    content.style.backgroundImage = `url(${base64})`;
                    content.style.backgroundColor = 'transparent';
                    content.style.border = 'none';
                    content.style.boxShadow = 'none';
                    const placeholder = content.querySelector('.upload-placeholder');
                    if (placeholder) placeholder.style.display = 'none';
                }
            }
        }
    }
    
    await loadCustomWidgets();
    renderDefaultWidgetsPreview(); 
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

// ================= 删除组件/软件 =================
screen.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn && screen.classList.contains('edit-mode')) {
        e.stopPropagation();
        const item = deleteBtn.closest('.jiggle-item');
        if (item) {
            if (item.parentNode.classList.contains('dock-container')) {
                if (item.parentNode.querySelectorAll('.app-item').length <= 2) {
                    showToast('Dock栏最少保留2个软件！');
                    return;
                }
            }
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
    if (!widgetPanel.contains(e.target) && !e.target.closest('#menu-add')) {
        widgetPanel.classList.remove('show');
    }
});

document.querySelectorAll('.size-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.size-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const size = tab.dataset.size;
        
        document.querySelectorAll('.default-widget').forEach(opt => {
            opt.classList.toggle('hidden', opt.dataset.size !== size);
        });
        
        document.querySelectorAll('.custom-widget-opt').forEach(opt => {
            opt.classList.toggle('hidden', opt.dataset.size !== size);
        });
    });
});

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
    <div class="music-widget-inner">
        <svg class="connecting-lines" viewBox="0 0 400 250" preserveAspectRatio="xMidYMin slice"><defs><linearGradient id="fade-grad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#555555;stop-opacity:1" /><stop offset="85%" style="stop-color:#555555;stop-opacity:0" /></linearGradient></defs><circle cx="151" cy="100" r="4" fill="#555555" /><circle cx="249" cy="100" r="4" fill="#555555" /><path d="M 151 100 Q 100 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/><path d="M 249 100 Q 300 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/></svg>
        <div class="avatars-wrapper"><div class="avatar-group"><div class="speech-bubble" contenteditable="true" spellcheck="false">你在左边</div><div class="avatar-circle"></div></div><div class="avatar-group"><div class="speech-bubble" contenteditable="true" spellcheck="false">我紧靠右</div><div class="avatar-circle"></div></div></div>
        <div class="center-text" contenteditable="true" spellcheck="false">Twenty four seven with us</div>
        <div class="music-player-v2"><div class="music-title">Pink Lavender</div><div class="music-subtitle" contenteditable="true" spellcheck="false">· ⁺ ⋆ ‿ ıllıllı ‿ ⋆ ⁺ ·</div><div class="progress-container"><div class="time-label">1:26</div><div class="progress-bar"><div class="progress-fill"></div></div><div class="time-label">3:48</div></div><div class="controls-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="#666"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><div class="main-controls"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M22 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg><svg width="32" height="32" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="2" fill="#333"/><rect x="14" y="5" width="4" height="14" rx="2" fill="#333"/></svg><svg width="24" height="24" viewBox="0 0 24 24"><path d="M2 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M13 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg></div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2"><path d="M9.52 14.47 A 3.5 3.5 0 1 1 14.48 14.47"/><path d="M7.05 16.95 A 7 7 0 1 1 16.95 16.95"/><path d="M4.58 19.42 A 10.5 10.5 0 1 1 19.42 19.42"/><path d="M12 15.5L16.5 21H7.5L12 15.5Z" fill="#333"/></svg></div></div>
    </div>`;

document.querySelectorAll('.default-widget').forEach(opt => {
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

// ================= 默认组件预览渲染 =================
function renderDefaultWidgetsPreview() {
    const bgImg = document.getElementById('screen').style.backgroundImage || '';
    
    const defaults = [
        { id: 'add-img-1x2', w: 1, h: 2, html: getImgPreviewHTML() },
        { id: 'add-img-2x1', w: 2, h: 1, html: getImgPreviewHTML() },
        { id: 'add-img-widget', w: 2, h: 2, html: getImgPreviewHTML() },
        { id: 'add-img-4x2', w: 4, h: 2, html: getImgPreviewHTML() },
        { id: 'add-music-widget', w: 4, h: 3, html: getMusicPreviewHTML() }
    ];

    defaults.forEach(def => {
        const opt = document.getElementById(def.id);
        if (!opt) return;
        
        const realW = def.w * 76 + (def.w - 1) * 15;
        const realH = def.h * 78 + (def.h - 1) * 12;
        const scale = Math.min(50 / realW, 50 / realH);

        const oldPreview = opt.querySelector('.custom-widget-preview-wrapper');
        if (oldPreview) oldPreview.remove();

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-widget-preview-wrapper';
        wrapper.style.backgroundImage = bgImg;
        wrapper.innerHTML = `
            <div class="custom-widget-scale" style="width: ${realW}px; height: ${realH}px; transform: translate(-50%, -50%) scale(${scale});">
                <div style="width:100%; height:100%;">
                    ${def.html}
                </div>
            </div>
        `;
        opt.insertBefore(wrapper, opt.firstChild);
    });
}

function getImgPreviewHTML() {
    return `<div class="image-widget-content liquid-glass" style="width:100%;height:100%;"><div class="upload-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>添加</span></div></div>`;
}

function getMusicPreviewHTML() {
    return `<div class="music-widget-inner" style="width:100%;height:100%;transform:scale(0.88);">
        <svg class="connecting-lines" viewBox="0 0 400 250" preserveAspectRatio="xMidYMin slice"><defs><linearGradient id="fade-grad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#555555;stop-opacity:1" /><stop offset="85%" style="stop-color:#555555;stop-opacity:0" /></linearGradient></defs><circle cx="151" cy="100" r="4" fill="#555555" /><circle cx="249" cy="100" r="4" fill="#555555" /><path d="M 151 100 Q 100 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/><path d="M 249 100 Q 300 145, 200 195" fill="none" stroke="url(#fade-grad)" stroke-width="1.5" stroke-linecap="round"/></svg>
        <div class="avatars-wrapper"><div class="avatar-group"><div class="speech-bubble">你在左边</div><div class="avatar-circle"></div></div><div class="avatar-group"><div class="speech-bubble">我紧靠右</div><div class="avatar-circle"></div></div></div>
        <div class="center-text">Twenty four seven with us</div>
        <div class="music-player-v2"><div class="music-title">Pink Lavender</div><div class="music-subtitle">· ⁺ ⋆ ‿ ıllıllı ‿ ⋆ ⁺ ·</div><div class="progress-container"><div class="time-label">1:26</div><div class="progress-bar"><div class="progress-fill"></div></div><div class="time-label">3:48</div></div><div class="controls-row"><svg width="20" height="20" viewBox="0 0 24 24" fill="#666"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><div class="main-controls"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M22 18V6l-8.5 6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg><svg width="32" height="32" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="2" fill="#333"/><rect x="14" y="5" width="4" height="14" rx="2" fill="#333"/></svg><svg width="24" height="24" viewBox="0 0 24 24"><path d="M2 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/><path d="M13 6v12l8.5-6z" fill="#333" stroke="#333" stroke-width="3" stroke-linejoin="round"/></svg></div><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2"><path d="M9.52 14.47 A 3.5 3.5 0 1 1 14.48 14.47"/><path d="M7.05 16.95 A 7 7 0 1 1 16.95 16.95"/><path d="M4.58 19.42 A 10.5 10.5 0 1 1 19.42 19.42"/><path d="M12 15.5L16.5 21H7.5L12 15.5Z" fill="#333"/></svg></div></div>
    </div>`;
}

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
            renderCustomWidgetsToPanel();
            renderDefaultWidgetsPreview(); 
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
                renderPreview();
            }
        });

        wrapper.appendChild(scaleBox);
        wrapper.appendChild(checkBtn);
        
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

document.getElementById('preview-add-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const newPage = document.createElement('div');
    newPage.className = 'page';
    newPage.innerHTML = `<div class="app-grid"></div>`;
    document.querySelector('.pages-container').appendChild(newPage);
    renderPreview();
    
    const pc = document.querySelector('.pages-container');
    setTimeout(() => {
        pc.scrollTo({ left: pc.scrollWidth, behavior: 'smooth' });
    }, 100);
});

document.getElementById('preview-done-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    document.getElementById('preview-overlay').classList.remove('show');
    await saveCurrentState();
    bindAllDynamicEvents();
});

// ================= 自定义组件逻辑 =================

let customWidgets = [];
let editingWidgetId = null; 

async function loadCustomWidgets() {
    const saved = await getFromDB('customWidgets');
    if (saved) {
        customWidgets = saved;
        renderCustomWidgetsToPanel();
        injectCustomWidgetsCSS();
    }
}

function renderCustomWidgetsToPanel() {
    const widgetList = document.getElementById('widget-list');
    widgetList.querySelectorAll('.custom-widget-opt').forEach(el => el.remove());

    const currentTabSize = document.querySelector('.size-tab.active').dataset.size;
    const bgImg = document.getElementById('screen').style.backgroundImage || '';

    customWidgets.forEach(widget => {
        const opt = document.createElement('div');
        opt.className = `widget-option custom-widget-opt ${widget.size === currentTabSize ? '' : 'hidden'}`;
        opt.dataset.size = widget.size;
        opt.dataset.id = widget.id;

        const realW = widget.w * 76 + (widget.w - 1) * 15;
        const realH = widget.h * 78 + (widget.h - 1) * 12;
        const scale = Math.min(50 / realW, 50 / realH);

        opt.innerHTML = `
            <div class="custom-widget-preview-wrapper" style="background-image: ${bgImg}">
                <div class="custom-widget-scale" style="width: ${realW}px; height: ${realH}px; transform: translate(-50%, -50%) scale(${scale});">
                    <div data-custom-id="${widget.id}" style="width:100%; height:100%;">
                        ${widget.html}
                    </div>
                </div>
            </div>
            <div class="widget-name">${widget.name}</div>
        `;

        let cwPressTimer = null;
        let longPressed = false;
        let startX = 0, startY = 0;

        const startCwPress = (e) => {
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            longPressed = false;
            
            cwPressTimer = setTimeout(() => {
                longPressed = true;
                openEditModal(widget);
            }, 1000); 
        };

        const moveCwPress = (e) => {
            if (!cwPressTimer) return;
            const touch = e.touches ? e.touches[0] : e;
            if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
                clearTimeout(cwPressTimer);
                cwPressTimer = null;
            }
        };

        const cancelCwPress = () => {
            if (cwPressTimer) {
                clearTimeout(cwPressTimer);
                cwPressTimer = null;
            }
        };

        opt.addEventListener('touchstart', startCwPress, { passive: true });
        opt.addEventListener('touchmove', moveCwPress, { passive: true });
        opt.addEventListener('touchend', cancelCwPress);
        opt.addEventListener('touchcancel', cancelCwPress);
        
        opt.addEventListener('mousedown', startCwPress);
        opt.addEventListener('mousemove', moveCwPress);
        opt.addEventListener('mouseup', cancelCwPress);
        opt.addEventListener('mouseleave', cancelCwPress);

        opt.addEventListener('click', (e) => {
            if (longPressed) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            const instanceId = 'cw-inst-' + Date.now() + '-' + Math.floor(Math.random()*1000);
            const htmlString = `
                <div class="widget-${widget.w}x${widget.h} jiggle-item grid-item custom-widget-item" data-custom-id="${widget.id}" data-widget-id="${instanceId}">
                    <div class="delete-btn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220,220,225,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg></div>
                    <div class="custom-widget-content" style="width:100%; height:100%;">
                        ${widget.html}
                    </div>
                </div>
            `;
            addWidgetToCurrentPage(htmlString, widget.w, widget.h);
            document.getElementById('widget-panel').classList.remove('show');
        });

        widgetList.appendChild(opt);
    });
}

function injectCustomWidgetsCSS() {
    const styleTag = document.getElementById('custom-widgets-style');
    let combinedCSS = '';
    customWidgets.forEach(widget => {
        const scopedCSS = widget.css.replace(/(^|\})\s*([^{]+)\s*\{/g, (match, p1, p2) => {
            if(p2.trim().startsWith('@')) return match;
            const scopedSelectors = p2.split(',').map(s => `[data-custom-id="${widget.id}"] ${s.trim()}`).join(', ');
            return `${p1} ${scopedSelectors} {`;
        });
        combinedCSS += scopedCSS + '\n';
    });
    styleTag.innerHTML = combinedCSS;
}

// ================= 弹窗交互逻辑 =================
const cwModalOverlay = document.getElementById('cw-modal-overlay');
const cwName = document.getElementById('cw-name');
const cwW = document.getElementById('cw-w');
const cwH = document.getElementById('cw-h');
const cwHtml = document.getElementById('cw-html');
const cwCss = document.getElementById('cw-css');
const cwJs = document.getElementById('cw-js'); 
const cwPreviewBox = document.getElementById('cw-preview-box');
const cwPreviewStyle = document.getElementById('cw-preview-style');
let currentCwSize = 'small';

function openEditModal(widget) {
    editingWidgetId = widget.id;
    document.getElementById('cw-modal-title').textContent = '编辑组件';
    document.getElementById('cw-delete').style.display = 'block';
    
    cwName.value = widget.name;
    cwW.value = widget.w;
    cwH.value = widget.h;
    cwHtml.value = widget.html;
    cwCss.value = widget.css;
    cwJs.value = widget.js || ''; 
    
    document.querySelectorAll('.cw-size-opt').forEach(o => {
        o.classList.toggle('active', o.dataset.size === widget.size);
    });
    currentCwSize = widget.size;
    
    updateCwPreview();
    cwModalOverlay.classList.add('show');
    if (navigator.vibrate) navigator.vibrate(50);
}

document.getElementById('panel-new-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('widget-panel').classList.remove('show');
    
    editingWidgetId = null;
    document.getElementById('cw-modal-title').textContent = '新建组件';
    document.getElementById('cw-delete').style.display = 'none';
    
    cwName.value = '';
    cwHtml.value = '';
    cwCss.value = '';
    cwJs.value = '';
    cwW.value = 2;
    cwH.value = 2;
    updateCwPreview();
    cwModalOverlay.classList.add('show');
});

document.getElementById('cw-cancel').addEventListener('click', () => {
    cwModalOverlay.classList.remove('show');
});

document.querySelectorAll('.cw-size-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.cw-size-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        currentCwSize = opt.dataset.size;
    });
});

function updateCwPreview() {
    const w = parseInt(cwW.value) || 2;
    const h = parseInt(cwH.value) || 2;
    
    const realW = w * 76 + (w - 1) * 15;
    const realH = h * 78 + (h - 1) * 12;
    
    cwPreviewBox.style.width = `${realW}px`;
    cwPreviewBox.style.height = `${realH}px`;
    
    const containerW = document.querySelector('.cw-preview-container').clientWidth - 20;
    const containerH = 120;
    const scale = Math.min(1, containerW / realW, containerH / realH);
    cwPreviewBox.style.transform = `scale(${scale})`;

    const tempId = 'preview-temp';
    cwPreviewBox.setAttribute('data-custom-id', tempId);
    cwPreviewBox.innerHTML = cwHtml.value;

    const scopedCSS = cwCss.value.replace(/(^|\})\s*([^{]+)\s*\{/g, (match, p1, p2) => {
        if(p2.trim().startsWith('@')) return match;
        const scopedSelectors = p2.split(',').map(s => `[data-custom-id="${tempId}"] ${s.trim()}`).join(', ');
        return `${p1} ${scopedSelectors} {`;
    });
    cwPreviewStyle.innerHTML = scopedCSS;
}

['input', 'change'].forEach(evt => {
    cwHtml.addEventListener(evt, updateCwPreview);
    cwCss.addEventListener(evt, updateCwPreview);
    cwW.addEventListener(evt, updateCwPreview);
    cwH.addEventListener(evt, updateCwPreview);
});

document.getElementById('cw-example-btn').addEventListener('click', () => {
    cwHtml.value = `<div class="custom-counter liquid-glass">
    <div class="count-val">0</div>
    <div class="count-label">点击计数器</div>
</div>`;
    cwCss.value = `.custom-counter {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    border-radius: 22px; color: #fff; cursor: pointer;
}
.count-val { font-size: 32px; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
.count-label { font-size: 12px; opacity: 0.8; margin-top: 4px; }`;
    cwJs.value = `const counterBox = widget.querySelector('.custom-counter');
const valDisplay = widget.querySelector('.count-val');
let count = 0;

counterBox.addEventListener('click', () => {
    if (document.getElementById('screen').classList.contains('edit-mode')) return;
    count++;
    valDisplay.textContent = count;
});`;
    updateCwPreview();
});

document.getElementById('cw-save').addEventListener('click', async () => {
    const name = cwName.value.trim();
    if (!name) {
        showToast('请给组件起个名字！');
        return;
    }
    
    if (editingWidgetId) {
        const index = customWidgets.findIndex(w => w.id === editingWidgetId);
        if (index > -1) {
            customWidgets[index] = {
                ...customWidgets[index],
                name: name,
                size: currentCwSize,
                w: parseInt(cwW.value) || 2,
                h: parseInt(cwH.value) || 2,
                html: cwHtml.value,
                css: cwCss.value,
                js: cwJs.value 
            };
            
            document.querySelectorAll(`.custom-widget-item[data-custom-id="${editingWidgetId}"]`).forEach(el => {
                const oldImgContent = el.querySelector('.image-widget-content');
                const bgImage = oldImgContent ? oldImgContent.style.backgroundImage : '';
                
                el.style.setProperty('--w', customWidgets[index].w);
                el.style.setProperty('--h', customWidgets[index].h);
                el.className = `widget-${customWidgets[index].w}x${customWidgets[index].h} jiggle-item grid-item custom-widget-item`;
                
                const content = el.querySelector('.custom-widget-content');
                if (content) {
                    content.innerHTML = customWidgets[index].html;
                    const newImgContent = content.querySelector('.image-widget-content');
                    if (newImgContent && bgImage && bgImage !== 'none') {
                        newImgContent.style.backgroundImage = bgImage;
                        newImgContent.style.backgroundColor = 'transparent';
                        newImgContent.style.border = 'none';
                        newImgContent.style.boxShadow = 'none';
                        const placeholder = newImgContent.querySelector('.upload-placeholder');
                        if (placeholder) placeholder.style.display = 'none';
                    }
                }
            });
        }
    } else {
        const newWidget = {
            id: 'cw_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            name: name,
            size: currentCwSize,
            w: parseInt(cwW.value) || 2,
            h: parseInt(cwH.value) || 2,
            html: cwHtml.value,
            css: cwCss.value,
            js: cwJs.value 
        };
        customWidgets.push(newWidget);
    }

    await saveToDB('customWidgets', customWidgets);
    await saveCurrentState(); 
    
    renderCustomWidgetsToPanel();
    injectCustomWidgetsCSS();
    bindAllDynamicEvents(); 
    
    cwModalOverlay.classList.remove('show');
    showToast('组件保存成功！');
});

document.getElementById('cw-delete').addEventListener('click', async () => {
    if (!editingWidgetId) return;
    
    customWidgets = customWidgets.filter(w => w.id !== editingWidgetId);
    
    document.querySelectorAll(`.custom-widget-item[data-custom-id="${editingWidgetId}"]`).forEach(el => el.remove());
    
    await saveToDB('customWidgets', customWidgets);
    await saveCurrentState();
    
    renderCustomWidgetsToPanel();
    injectCustomWidgetsCSS();
    
    cwModalOverlay.classList.remove('show');
    showToast('组件已删除');
});

// ================= 组件导入与导出逻辑 =================
const importInput = document.getElementById('import-widget-input');

document.getElementById('panel-import-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    importInput.click();
});

importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (!data.name || !data.html) {
                showToast('无效的组件文件！');
                return;
            }
            
            const newWidget = {
                id: 'cw_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                name: data.name + ' (导入)',
                size: data.size || 'small',
                w: data.w || 2,
                h: data.h || 2,
                html: data.html || '',
                css: data.css || '',
                js: data.js || ''
            };
            
            customWidgets.push(newWidget);
            await saveToDB('customWidgets', customWidgets);
            renderCustomWidgetsToPanel();
            injectCustomWidgetsCSS();
            showToast('组件导入成功！');
        } catch (err) {
            showToast('解析文件失败！');
        }
        importInput.value = ''; 
    };
    reader.readAsText(file);
});

document.getElementById('cw-export-btn').addEventListener('click', () => {
    const name = cwName.value.trim() || '未命名组件';
    const exportData = {
        name: name,
        size: currentCwSize,
        w: parseInt(cwW.value) || 2,
        h: parseInt(cwH.value) || 2,
        html: cwHtml.value,
        css: cwCss.value,
        js: cwJs.value
    };
    
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('组件已导出！');
});

// ================= 音乐 APP 交互与数据拉取逻辑 =================

// 1. 监听点击事件打开音乐 APP
screen.addEventListener('click', (e) => {
    if (screen.classList.contains('edit-mode')) return;
    const appItem = e.target.closest('.app-item');
    if (appItem && !e.target.closest('.delete-btn')) {
        const appName = appItem.querySelector('.app-name');
        if (appName && appName.textContent.trim() === '音乐') {
            document.getElementById('music-app-overlay').classList.add('show');
            document.querySelectorAll('.music-view').forEach(v => v.classList.remove('active'));
            document.getElementById('view-home').classList.add('active');
            document.querySelectorAll('.music-tab-item').forEach(t => t.classList.remove('active'));
            document.querySelector('.music-tab-item[data-target="view-home"]').classList.add('active');
            screen.classList.add('music-active');
            
            if (apiUrl && !window.musicDataLoaded) {
                fetchUserData();
                window.musicDataLoaded = true;
            }
        }
    }
});

// 2. 全局绑定：点击左上角三横线退出音乐 APP
document.querySelectorAll('.music-back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('music-app-overlay').classList.remove('show');
        screen.classList.remove('music-active');
    });
});

// 3. 隔离长按事件：防止在音乐 APP 内部长按触发桌面的编辑模式
const musicAppOverlay = document.getElementById('music-app-overlay');
musicAppOverlay.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
musicAppOverlay.addEventListener('mousedown', (e) => e.stopPropagation());
musicAppOverlay.addEventListener('contextmenu', (e) => e.stopPropagation());

// 4. 视图切换逻辑
document.querySelectorAll('.music-tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.target;
        if (!target) return;

        document.querySelectorAll('.music-tab-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.music-view').forEach(v => v.classList.remove('active'));
        document.getElementById(target).classList.add('active');
        
        if(target === 'view-profile') {
            screen.classList.remove('music-active');
        } else {
            screen.classList.add('music-active');
        }
    });
});

// 5. 自定义背景与头像上传 (加入 IndexedDB 缓存)
document.getElementById('profile-bg').addEventListener('click', (e) => {
    if(e.target.id !== 'bg-upload') document.getElementById('bg-upload').click();
});
document.getElementById('bg-upload').addEventListener('change', async function() {
    if(this.files[0]) {
        const reader = new FileReader();
        reader.onload = async e => {
            document.getElementById('profile-bg').style.backgroundImage = `url(${e.target.result})`;
            await saveToDB('music_profile_bg', e.target.result);
        };
        reader.readAsDataURL(this.files[0]);
    }
});

document.getElementById('profile-avatar').addEventListener('click', (e) => {
    e.stopPropagation();
    if(e.target.id !== 'avatar-upload') document.getElementById('avatar-upload').click();
});
document.getElementById('avatar-upload').addEventListener('change', async function() {
    if(this.files[0]) {
        const reader = new FileReader();
        reader.onload = async e => {
            document.getElementById('profile-avatar').style.backgroundImage = `url(${e.target.result})`;
            await saveToDB('music_profile_avatar', e.target.result);
        };
        reader.readAsDataURL(this.files[0]);
    }
});

// 6. 网易云 API 核心逻辑
let apiUrl = localStorage.getItem('netease_api') || '';
let apiCookie = localStorage.getItem('netease_cookie') || '';
let checkTimer = null;

async function fetchApi(path) {
    if (!apiUrl) return null;
    if (path.startsWith('/')) path = path.substring(1);
    const separator = path.includes('?') ? '&' : '?';
    let url = `${apiUrl}${path}${separator}timestamp=${Date.now()}`;
    if (apiCookie) url += `&cookie=${encodeURIComponent(apiCookie)}`;
    
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (err) {
        console.error('API Fetch Error:', err);
        return null;
    }
}

document.getElementById('api-settings-btn').addEventListener('click', () => {
    document.getElementById('api-input').value = apiUrl;
    document.getElementById('api-modal').classList.add('show');
});
document.getElementById('api-cancel').addEventListener('click', () => {
    document.getElementById('api-modal').classList.remove('show');
});
document.getElementById('api-confirm').addEventListener('click', () => {
    let val = document.getElementById('api-input').value.trim();
    if (val && !val.endsWith('/')) val += '/';
    apiUrl = val;
    localStorage.setItem('netease_api', apiUrl);
    document.getElementById('api-modal').classList.remove('show');
    if (apiUrl) startLogin();
});

async function startLogin() {
    document.getElementById('qr-modal').classList.add('show');
    document.getElementById('qr-img').style.display = 'none';
    document.getElementById('qr-loading').style.display = 'block';
    document.getElementById('qr-status').textContent = '正在获取二维码...';
    
    try {
        const keyRes = await fetchApi('login/qr/key');
        if (!keyRes || !keyRes.data) throw new Error('Key fetch failed');
        const key = keyRes.data.unikey;
        
        const qrRes = await fetchApi(`login/qr/create?key=${key}&qrimg=true`);
        document.getElementById('qr-img').src = qrRes.data.qrimg;
        document.getElementById('qr-img').style.display = 'block';
        document.getElementById('qr-loading').style.display = 'none';
        document.getElementById('qr-status').textContent = '请使用网易云音乐APP扫码';
        
        checkTimer = setInterval(() => checkQrStatus(key), 3000);
    } catch (err) {
        document.getElementById('qr-status').textContent = '获取失败，请检查API地址是否正确';
    }
}

async function checkQrStatus(key) {
    try {
        const res = await fetchApi(`login/qr/check?key=${key}`);
        if (!res) return;
        
        if (res.code === 800) {
            document.getElementById('qr-status').textContent = '二维码已过期，请重试';
            clearInterval(checkTimer);
        } else if (res.code === 802) {
            document.getElementById('qr-status').textContent = '扫描成功，请在手机上确认';
        } else if (res.code === 803) {
            clearInterval(checkTimer);
            apiCookie = res.cookie;
            localStorage.setItem('netease_cookie', apiCookie);
            document.getElementById('qr-status').textContent = '登录成功！正在拉取数据...';
            setTimeout(() => {
                document.getElementById('qr-modal').classList.remove('show');
                fetchUserData();
            }, 1500);
        }
    } catch (err) {
        console.error(err);
    }
}
document.getElementById('qr-cancel').addEventListener('click', () => {
    clearInterval(checkTimer);
    document.getElementById('qr-modal').classList.remove('show');
});

// 7. 搜索逻辑
const searchInput = document.getElementById('search-input');
const searchCancel = document.getElementById('search-cancel');
const resultArea = document.getElementById('search-result-area');
const resultList = document.getElementById('search-result-list');

window.doSearch = async function(keyword) {
    if(!keyword) return;
    searchInput.value = keyword;
    resultArea.style.display = 'block';
    resultList.innerHTML = '<div style="text-align:center; padding: 20px; color:#888; font-size:13px;">搜索中...</div>';
    
    const res = await fetchApi(`search?keywords=${encodeURIComponent(keyword)}`);
    if (res && res.result && res.result.songs) {
        resultList.innerHTML = res.result.songs.map(song => `
            <div class="search-result-item">
                <div class="search-result-info">
                    <div class="search-result-name">${song.name}</div>
                    <div class="search-result-artist">${song.artists.map(a=>a.name).join(' / ')} - ${song.album.name}</div>
                </div>
                <div class="search-result-action">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#ccc"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </div>
            </div>
        `).join('');
    } else {
        resultList.innerHTML = '<div style="text-align:center; padding: 20px; color:#888; font-size:13px;">未找到相关歌曲</div>';
    }
}

// 绑定放大镜点击事件
document.getElementById('search-btn').addEventListener('click', () => {
    doSearch(searchInput.value.trim());
});

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchInput.blur();
        doSearch(searchInput.value.trim());
    }
});

searchCancel.addEventListener('click', () => {
    searchInput.value = '';
    resultArea.style.display = 'none';
});

// 8. 获取并渲染数据
async function fetchUserData() {
    if (!apiUrl) return;
    try {
        const accRes = await fetchApi('user/account');
        if (accRes && accRes.profile) {
            const p = accRes.profile;
            document.getElementById('profile-nickname').textContent = p.nickname;
            document.getElementById('profile-avatar').style.backgroundImage = `url(${p.avatarUrl})`;
            document.getElementById('profile-bg').style.backgroundImage = `url(${p.backgroundUrl})`;
            
            const detRes = await fetchApi(`user/detail?uid=${p.userId}`);
            if (detRes && detRes.profile) {
                document.getElementById('profile-stats').innerHTML = `<span>${detRes.profile.follows} 关注</span><span>${detRes.profile.followeds} 粉丝</span>`;
                document.getElementById('profile-level').textContent = `Lv.${detRes.level}`;
            }
            
            const plRes = await fetchApi(`user/playlist?uid=${p.userId}`);
            if (plRes && plRes.playlist) renderUserPlaylist(plRes.playlist);
        }
        
        const recPlRes = await fetchApi('personalized?limit=3');
        if(recPlRes && recPlRes.result) {
            renderTopCards(recPlRes.result);
        }
        
        const recSongRes = await fetchApi('personalized/newsong?limit=3');
        if(recSongRes && recSongRes.result) renderHomeSongs(recSongRes.result);
        
    } catch (err) {
        console.error('获取数据失败', err);
    }
}

function renderTopCards(list) {
    const cards = document.querySelectorAll('#home-top-cards .music-card');
    const defaultTitles = ['每日推荐', '雷达歌单', '漫游'];
    const defaultSubs = ['今日限定好歌推荐', '反复聆听你爱的歌', '多样频道无限畅听'];
    
    list.forEach((item, i) => {
        if(cards[i]) {
            cards[i].style.backgroundImage = `url(${item.picUrl}?param=300y300)`;
            cards[i].style.backgroundSize = 'cover';
            cards[i].style.backgroundPosition = 'center';
            cards[i].className = 'music-card'; 
            cards[i].querySelector('.music-card-title').textContent = defaultTitles[i] || item.name.substring(0, 6);
            cards[i].querySelector('.music-card-sub').textContent = defaultSubs[i] || item.copywriter || '为你推荐';
        }
    });
}

function renderUserPlaylist(list) {
    const container = document.getElementById('user-playlist');
    if (!list || list.length === 0) return;
    container.innerHTML = list.map(item => `
        <div class="user-pl-item">
            <div class="user-pl-cover" style="background-image: url(${item.coverImgUrl}?param=100y100)"></div>
            <div class="user-pl-info">
                <div class="user-pl-name">${item.name}</div>
                <div class="user-pl-count">${item.trackCount}首</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#ccc"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </div>
    `).join('');
}

function renderHomeSongs(list) {
    const items = document.querySelectorAll('.music-song-item');
    list.slice(0, 3).forEach((item, i) => {
        if(items[i]) {
            const cover = items[i].querySelector('.music-song-cover');
            cover.style.backgroundImage = `url(${item.picUrl}?param=100y100)`;
            cover.style.backgroundSize = 'cover';
            cover.className = 'music-song-cover';
            items[i].querySelector('.music-song-name').textContent = item.name;
            
            // 随机加点标签 (SQ / VIP)
            let tags = '<span class="music-tag">推荐</span>';
            if (Math.random() > 0.5) tags += ' <span class="music-tag">SQ</span>';
            if (Math.random() > 0.7) tags += ' <span class="music-tag">VIP</span>';
            
            items[i].querySelector('.music-song-artist').innerHTML = `${tags} ${item.song.artists.map(a=>a.name).join(' / ')}`;
        }
    });
}
