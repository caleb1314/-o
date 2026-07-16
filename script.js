// script.js
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

// ================= 动态事件绑定 =================
function bindAllDynamicEvents() {
    // 处理删除键
    const deleteBtns = document.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.replaceWith(newBtn);
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = btn.closest('.jiggle-item');
            if (item) {
                item.classList.add('removing');
                setTimeout(() => {
                    item.remove();
                    saveCurrentState(); // 删除后自动保存
                }, 300);
            }
        });
    });

    // 处理应用图标点击动画
    const appItems = document.querySelectorAll('.app-item:not(.widget-image-item)');
    appItems.forEach(item => {
        const newBtn = item.cloneNode(true);
        item.replaceWith(newBtn);
    });

    document.querySelectorAll('.app-item:not(.widget-image-item)').forEach(item => {
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

    // 处理图片组件的点击上传
    document.querySelectorAll('.widget-image-item').forEach(item => {
        const box = item.querySelector('.widget-image-box');
        const input = item.querySelector('.widget-image-input');
        
        // 移除旧事件
        const newBox = box.cloneNode(true);
        box.replaceWith(newBox);
        
        const updatedBox = item.querySelector('.widget-image-box');
        const updatedInput = item.querySelector('.widget-image-input');
        const updatedBg = item.querySelector('.widget-image-bg');
        
        updatedBox.addEventListener('click', (e) => {
            if (screen.classList.contains('edit-mode')) return;
            updatedInput.click();
        });
        
        updatedInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64 = event.target.result;
                    updatedBg.style.backgroundImage = `url(${base64})`;
                    const widgetId = item.getAttribute('data-widget-id');
                    await saveToDB(widgetId, base64);
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
    if (savedWallpaper) {
        document.getElementById('screen').style.backgroundImage = `url(${savedWallpaper})`;
    }
    
    const savedPages = await getFromDB('pagesHTML');
    const savedDock = await getFromDB('dockHTML');
    if (savedPages) document.querySelector('.pages-container').innerHTML = savedPages;
    if (savedDock) document.querySelector('.dock-container').innerHTML = savedDock;
    
    // 加载图片组件的缓存图片
    const imageWidgets = document.querySelectorAll('.widget-image-item');
    for (const widget of imageWidgets) {
        const widgetId = widget.getAttribute('data-widget-id');
        if (widgetId) {
            const base64 = await getFromDB(widgetId);
            if (base64) {
                const bg = widget.querySelector('.widget-image-bg');
                if (bg) bg.style.backgroundImage = `url(${base64})`;
            }
        }
    }
    
    bindAllDynamicEvents();
});

// ================= 长按进入编辑模式逻辑 =================
const screen = document.getElementById('screen');
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600;

let backupPagesHTML = '';
let backupDockHTML = '';

screen.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

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
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
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

// ================= 编辑控制栏与弹窗逻辑 =================
const editBtn = document.getElementById('edit-btn');
const editMenu = document.getElementById('edit-menu');
const doneBtn = document.getElementById('done-btn');

const saveCurrentState = async () => {
    if(document.activeElement) document.activeElement.blur();
    
    // 临时移除图片组件的 base64 背景，避免 HTML 缓存过大
    const bgs = document.querySelectorAll('.widget-image-bg');
    const bgCaches = [];
    bgs.forEach(bg => {
        bgCaches.push(bg.style.backgroundImage);
        bg.style.backgroundImage = '';
    });
    
    const pagesHTML = document.querySelector('.pages-container').innerHTML;
    const dockHTML = document.querySelector('.dock-container').innerHTML;
    
    // 恢复背景
    bgs.forEach((bg, index) => {
        bg.style.backgroundImage = bgCaches[index];
    });
    
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

document.addEventListener('click', (e) => {
    if (editMenu && editMenu.classList.contains('show')) {
        if (!editBtn.contains(e.target) && !editMenu.contains(e.target)) {
            editMenu.classList.remove('show');
        }
    }
});

// ================= 新增：添加组件与空间计算逻辑 =================
const widgetPanelOverlay = document.getElementById('widget-panel-overlay');

document.getElementById('menu-add').addEventListener('click', (e) => {
    e.stopPropagation();
    editMenu.classList.remove('show');
    widgetPanelOverlay.classList.add('show');
});

document.getElementById('widget-panel-close').addEventListener('click', () => {
    widgetPanelOverlay.classList.remove('show');
});

function showToast(msg) {
    const toast = document.getElementById('toast-container');
    const toastMsg = toast.querySelector('.toast-message');
    toastMsg.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 1000);
}

function getPageUsedSpace(page) {
    let space = 0;
    // 音乐组件算作 12 个格子 (4x3)
    const musicWidget = page.querySelector('.top-widget-container');
    if (musicWidget) space += 12;
    
    // 图片组件每个算作 4 个格子 (2x2)
    const imageWidgets = page.querySelectorAll('.widget-image-item');
    space += imageWidgets.length * 4;
    
    // 普通应用图标每个算作 1 个格子 (1x1)
    const appItems = page.querySelectorAll('.app-grid > .app-item:not(.widget-image-item)');
    space += appItems.length * 1;
    
    return space;
}

const musicWidgetHTML = `
<div class="top-widget-container jiggle-item">
    <div class="delete-btn">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220, 220, 225, 0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg>
    </div>
    <svg class="connecting-lines" viewBox="0 0 400 250" preserveAspectRatio="xMidYMin slice">
        <defs>
            <linearGradient id="fade-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#555555;stop-opacity:1" />
                <stop offset="85%" style="stop-color:#555555;stop-opacity:0" />
            </linearGradient>
        </defs>
        <circle cx="151" cy="100" r="4" fill="#555555" />
        <circle cx="249" cy="100" r="4" fill="#555555" />
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
</div>
`;

function addWidgetToCurrentPage(type) {
    const pagesContainer = document.querySelector('.pages-container');
    const pages = document.querySelectorAll('.page');
    const currentIndex = Math.round(pagesContainer.scrollLeft / pagesContainer.clientWidth);
    const currentPage = pages[currentIndex];
    
    const usedSpace = getPageUsedSpace(currentPage);
    const requiredSpace = type === 'music' ? 12 : 4;
    
    if (usedSpace + requiredSpace > 24) {
        showToast('空间不足，无法添加');
        return;
    }
    
    if (type === 'music') {
        if (currentPage.querySelector('.top-widget-container')) {
            showToast('该页面已有音乐组件');
            return;
        }
        const appGrid = currentPage.querySelector('.app-grid');
        appGrid.insertAdjacentHTML('beforebegin', musicWidgetHTML);
    } else if (type === 'image') {
        const widgetId = 'widget_img_' + Date.now();
        const imageHTML = `
            <div class="app-item widget-image-item jiggle-item" data-widget-id="${widgetId}">
                <div class="delete-btn">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(220, 220, 225, 0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/><line x1="7" y1="12" x2="17" y2="12" stroke="#555" stroke-width="2.5" stroke-linecap="round"/></svg>
                </div>
                <div class="widget-image-box liquid-glass">
                    <input type="file" class="widget-image-input" accept="image/*" style="display: none;">
                    <div class="widget-image-bg"></div>
                    <svg viewBox="0 0 24 24" width="32" height="32"><path d="M12 5v14M5 12h14" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"/></svg>
                </div>
            </div>
        `;
        const appGrid = currentPage.querySelector('.app-grid');
        appGrid.insertAdjacentHTML('beforeend', imageHTML);
    }
    
    bindAllDynamicEvents();
    widgetPanelOverlay.classList.remove('show');
    saveCurrentState();
}

document.getElementById('add-widget-image').addEventListener('click', () => {
    addWidgetToCurrentPage('image');
});

document.getElementById('add-widget-music').addEventListener('click', () => {
    addWidgetToCurrentPage('music');
});

// ================= 取消修改逻辑 =================
document.getElementById('menu-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.pages-container').innerHTML = backupPagesHTML;
    document.querySelector('.dock-container').innerHTML = backupDockHTML;
    
    // 恢复图片组件缓存
    const imageWidgets = document.querySelectorAll('.widget-image-item');
    imageWidgets.forEach(async (widget) => {
        const widgetId = widget.getAttribute('data-widget-id');
        if (widgetId) {
            const base64 = await getFromDB(widgetId);
            if (base64) {
                const bg = widget.querySelector('.widget-image-bg');
                if (bg) bg.style.backgroundImage = `url(${base64})`;
            }
        }
    });
    
    bindAllDynamicEvents();
    
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
});

// ================= 真实更换壁纸逻辑 =================
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

// ================= 页面预览跳转逻辑 =================
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
            pagesContainer.scrollTo({
                left: pagesContainer.clientWidth * index,
                behavior: 'smooth'
            });
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
