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

// ================= IndexedDB 数据持久化 =================
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
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function setDBItem(key, value) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('IndexedDB set error:', e);
    }
}

async function getDBItem(key) {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.warn('IndexedDB get error:', e);
        return null;
    }
}

// ================= 核心交互逻辑 =================
const screen = document.getElementById('screen');
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600;

// 状态备份（用于取消修改）
let backupHTML = null;
let backupWallpaper = null;

// 绑定所有桌面元素的交互事件
function bindItemEvents() {
    // 删除按钮逻辑
    const deleteBtns = document.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = btn.closest('.jiggle-item');
            if (item) {
                item.classList.add('removing');
                setTimeout(() => {
                    item.remove();
                }, 300);
            }
        });
    });

    // 软件图标果冻弹跳动效逻辑
    const appItems = document.querySelectorAll('.app-item');
    appItems.forEach(item => {
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
}

// 初始化加载数据
window.addEventListener('DOMContentLoaded', async () => {
    const savedHTML = await getDBItem('desktopHTML');
    if (savedHTML) {
        document.querySelector('.pages-container').innerHTML = savedHTML.pages;
        document.querySelector('.dock-container').innerHTML = savedHTML.dock;
    }
    const savedWP = await getDBItem('wallpaper');
    if (savedWP) {
        document.getElementById('screen').style.backgroundImage = `url(${savedWP})`;
    }
    bindItemEvents();
});

// 长按进入编辑模式
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
        // 备份当前状态
        backupHTML = {
            pages: document.querySelector('.pages-container').innerHTML,
            dock: document.querySelector('.dock-container').innerHTML
        };
        backupWallpaper = document.getElementById('screen').style.backgroundImage;
        
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

// ================= 编辑控制栏逻辑 =================
const editBtn = document.getElementById('edit-btn');
const editMenu = document.getElementById('edit-menu');
const doneBtn = document.getElementById('done-btn');
const cancelBtn = document.getElementById('cancel-btn');

const exitEditMode = (e) => {
    if(e) e.stopPropagation();
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
};

// 点击编辑按钮弹出菜单
if (editBtn && editMenu) {
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editMenu.classList.toggle('show');
    });
}

// 点击空白处收起编辑菜单
document.addEventListener('click', (e) => {
    if (editMenu && editMenu.classList.contains('show')) {
        if (!editBtn.contains(e.target) && !editMenu.contains(e.target)) {
            editMenu.classList.remove('show');
        }
    }
});

// 完成修改（持久化保存）
if (doneBtn) {
    doneBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentHTML = {
            pages: document.querySelector('.pages-container').innerHTML,
            dock: document.querySelector('.dock-container').innerHTML
        };
        await setDBItem('desktopHTML', currentHTML);
        
        const currentWP = document.getElementById('screen').style.backgroundImage;
        if (currentWP) {
            const match = currentWP.match(/url\(['"]?(.*?)['"]?\)/);
            if (match) await setDBItem('wallpaper', match[1]);
        }
        exitEditMode(e);
    });
}

// 取消修改（恢复备份）
if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (backupHTML) {
            document.querySelector('.pages-container').innerHTML = backupHTML.pages;
            document.querySelector('.dock-container').innerHTML = backupHTML.dock;
            bindItemEvents(); // 重新绑定事件
        }
        if (backupWallpaper !== null) {
            document.getElementById('screen').style.backgroundImage = backupWallpaper;
        }
        exitEditMode(e);
    });
}

// ================= 更换壁纸逻辑 =================
const changeWpBtn = document.getElementById('change-wp-btn');
const wpInput = document.getElementById('wallpaper-input');

if (changeWpBtn) {
    changeWpBtn.addEventListener('click', () => wpInput.click());
}

if (wpInput) {
    wpInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('screen').style.backgroundImage = `url(${ev.target.result})`;
            };
            reader.readAsDataURL(file);
        }
    });
}

// ================= 页面预览逻辑 =================
const previewBtn = document.getElementById('preview-btn');
const previewOverlay = document.getElementById('page-preview-overlay');
const previewContainer = document.getElementById('preview-container');
const previewClose = document.getElementById('preview-close');

if (previewBtn) {
    previewBtn.addEventListener('click', () => {
        previewContainer.innerHTML = '';
        const pages = document.querySelectorAll('.page');
        
        pages.forEach((page, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-item-wrapper';
            
            const item = document.createElement('div');
            item.className = 'preview-item liquid-glass';
            
            const clone = page.cloneNode(true);
            clone.className = 'page-clone';
            
            // 计算缩放比例以适配预览框
            const rect = page.getBoundingClientRect();
            const previewWidth = 140; // 预览框宽度
            const scale = previewWidth / rect.width;
            const previewHeight = rect.height * scale;
            
            item.style.width = `${previewWidth}px`;
            item.style.height = `${previewHeight}px`;
            
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            clone.style.transform = `scale(${scale})`;
            
            item.appendChild(clone);
            
            const check = document.createElement('div');
            check.className = 'preview-check';
            check.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            
            wrapper.appendChild(item);
            wrapper.appendChild(check);
            
            // 点击跳转
            item.addEventListener('click', () => {
                const pagesContainer = document.querySelector('.pages-container');
                pagesContainer.scrollTo({
                    left: index * pagesContainer.clientWidth,
                    behavior: 'smooth'
                });
                previewOverlay.classList.remove('show');
            });
            
            previewContainer.appendChild(wrapper);
        });
        
        previewOverlay.classList.add('show');
        editMenu.classList.remove('show');
    });
}

if (previewClose) {
    previewClose.addEventListener('click', () => {
        previewOverlay.classList.remove('show');
    });
}
