// ================= IndexedDB 封装 =================
const DB_NAME = 'LiquidDeskDB';
const STORE_NAME = 'deskStore';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

async function setItem(key, value) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject();
        });
    } catch (e) { console.error('IndexedDB Set Error:', e); }
}

async function getItem(key) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject();
        });
    } catch (e) { console.error('IndexedDB Get Error:', e); return null; }
}

// ================= 核心 DOM 元素 =================
const screenEl = document.getElementById('screen');
const pagesContainer = document.getElementById('pages-container');
const dockContainer = document.getElementById('dock-container');

// ================= 数据加载与保存 =================
async function loadData() {
    const layout = await getItem('layout');
    if (layout) {
        if (layout.pages) pagesContainer.innerHTML = layout.pages;
        if (layout.dock) dockContainer.innerHTML = layout.dock;
    }
    const wallpaper = await getItem('wallpaper');
    if (wallpaper) {
        screenEl.style.backgroundImage = `url(${wallpaper})`;
    }
}

async function saveData() {
    await setItem('layout', {
        pages: pagesContainer.innerHTML,
        dock: dockContainer.innerHTML
    });
}

// 初始化加载
loadData();

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

// ================= 编辑模式逻辑 =================
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600;
let layoutSnapshot = null; // 用于取消修改时的快照

screenEl.addEventListener('contextmenu', (e) => e.preventDefault());

const enterEditMode = () => {
    if (screenEl.classList.contains('edit-mode')) return;
    // 记录快照
    layoutSnapshot = {
        pages: pagesContainer.innerHTML,
        dock: dockContainer.innerHTML
    };
    screenEl.classList.add('edit-mode');
    if (navigator.vibrate) navigator.vibrate(50);
};

const exitEditMode = (save = true) => {
    screenEl.classList.remove('edit-mode');
    if (save) {
        saveData();
    } else if (layoutSnapshot) {
        // 恢复快照
        pagesContainer.innerHTML = layoutSnapshot.pages;
        dockContainer.innerHTML = layoutSnapshot.dock;
    }
    layoutSnapshot = null;
};

const startPress = (e) => {
    if (screenEl.classList.contains('edit-mode')) return;
    if (e.type === 'touchstart') {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    } else {
        startX = e.clientX;
        startY = e.clientY;
    }
    pressTimer = setTimeout(enterEditMode, LONG_PRESS_DURATION);
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

// ================= 事件委托 (解决 innerHTML 替换后事件丢失) =================
screenEl.addEventListener('touchstart', startPress, { passive: true });
screenEl.addEventListener('touchmove', movePress, { passive: true });
screenEl.addEventListener('touchend', cancelPress);
screenEl.addEventListener('touchcancel', cancelPress);
screenEl.addEventListener('mousedown', startPress);
screenEl.addEventListener('mousemove', movePress);
screenEl.addEventListener('mouseup', cancelPress);
screenEl.addEventListener('mouseleave', cancelPress);

// 删除按钮与果冻弹跳动效委托
const handlePressDown = (e) => {
    if (screenEl.classList.contains('edit-mode')) return;
    const item = e.target.closest('.app-item');
    if (!item) return;
    const icon = item.querySelector('.app-icon-box') || item.querySelector('.dock-item');
    if (icon) {
        icon.style.transform = 'scale(0.92) scaleX(1.05) scaleY(0.92)';
        icon.style.boxShadow = 'inset 0 2px 4px rgba(255, 255, 255, 0.9), inset 0 -1px 3px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.05)';
    }
};

const handlePressUp = (e) => {
    if (screenEl.classList.contains('edit-mode')) return;
    const item = e.target.closest('.app-item');
    if (!item) return;
    const icon = item.querySelector('.app-icon-box') || item.querySelector('.dock-item');
    if (icon) {
        icon.style.transform = 'scale(1.05) scaleX(0.95) scaleY(1.05)';
        icon.style.boxShadow = '';
        setTimeout(() => { if(icon) icon.style.transform = 'scale(1)'; }, 150);
    }
};

const handlePressCancel = (e) => {
    if (screenEl.classList.contains('edit-mode')) return;
    const item = e.target.closest('.app-item');
    if (!item) return;
    const icon = item.querySelector('.app-icon-box') || item.querySelector('.dock-item');
    if (icon) {
        icon.style.transform = 'scale(1)';
        icon.style.boxShadow = '';
    }
};

screenEl.addEventListener('touchstart', handlePressDown, { passive: true });
screenEl.addEventListener('touchend', handlePressUp);
screenEl.addEventListener('touchcancel', handlePressCancel);
screenEl.addEventListener('mousedown', handlePressDown);
screenEl.addEventListener('mouseup', handlePressUp);
screenEl.addEventListener('mouseleave', handlePressCancel);

// 删除逻辑委托
screenEl.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
        e.stopPropagation();
        const item = deleteBtn.closest('.jiggle-item');
        if (item) {
            item.classList.add('removing');
            setTimeout(() => item.remove(), 300);
        }
    }
});

// ================= 控制栏按钮逻辑 =================
document.getElementById('done-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    exitEditMode(true);
});

document.getElementById('cancel-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    exitEditMode(false);
});

// ================= 换壁纸逻辑 =================
const wallpaperBtn = document.getElementById('wallpaper-btn');
const wallpaperInput = document.getElementById('wallpaper-input');

wallpaperBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    wallpaperInput.click();
});

wallpaperInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target.result;
            screenEl.style.backgroundImage = `url(${base64})`;
            await setItem('wallpaper', base64);
        };
        reader.readAsDataURL(file);
    }
});

// ================= 页面预览逻辑 =================
const previewBtn = document.getElementById('preview-btn');
const previewOverlay = document.getElementById('page-preview-overlay');
const previewGrid = document.getElementById('preview-grid');
const closePreviewBtn = document.getElementById('close-preview-btn');

previewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    previewGrid.innerHTML = '';
    
    const screenWidth = screenEl.clientWidth;
    const screenHeight = screenEl.clientHeight;
    const pages = pagesContainer.querySelectorAll('.page');
    
    pages.forEach((page) => {
        const container = document.createElement('div');
        container.className = 'preview-item-container liquid-glass';
        
        // 同步当前壁纸
        const bg = screenEl.style.backgroundImage;
        if (bg && bg !== 'none') container.style.backgroundImage = bg;

        const scaleWrapper = document.createElement('div');
        scaleWrapper.className = 'preview-item-scale';
        scaleWrapper.style.width = `${screenWidth}px`;
        scaleWrapper.style.height = `${screenHeight}px`;
        
        // 克隆页面并移除抖动动画
        const clonedPage = page.cloneNode(true);
        clonedPage.querySelectorAll('.jiggle-item').forEach(item => {
            item.style.animation = 'none';
        });
        
        scaleWrapper.appendChild(clonedPage);
        container.appendChild(scaleWrapper);
        previewGrid.appendChild(container);
        
        // 计算缩放比例
        setTimeout(() => {
            const containerWidth = container.clientWidth;
            const scale = containerWidth / screenWidth;
            scaleWrapper.style.transform = `scale(${scale})`;
        }, 0);
    });
    
    previewOverlay.classList.add('show');
});

closePreviewBtn.addEventListener('click', () => {
    previewOverlay.classList.remove('show');
});
