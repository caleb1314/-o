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

// ================= 动态事件绑定 (用于恢复DOM后重新绑定) =================
function bindAllDynamicEvents() {
    // 1. 删除按钮逻辑
    const deleteBtns = document.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
        // 克隆节点以清除旧事件，防止重复绑定
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
                }, 300);
            }
        });
    });

    // 2. 软件图标果冻弹跳动效逻辑
    const appItems = document.querySelectorAll('.app-item');
    appItems.forEach(item => {
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
}

// ================= 页面初始化加载缓存 =================
window.addEventListener('DOMContentLoaded', async () => {
    // 恢复壁纸
    const savedWallpaper = await getFromDB('wallpaper');
    if (savedWallpaper) {
        document.getElementById('screen').style.backgroundImage = `url(${savedWallpaper})`;
    }
    
    // 恢复布局与文字
    const savedPages = await getFromDB('pagesHTML');
    const savedDock = await getFromDB('dockHTML');
    if (savedPages) document.querySelector('.pages-container').innerHTML = savedPages;
    if (savedDock) document.querySelector('.dock-container').innerHTML = savedDock;
    
    // 初始化事件
    bindAllDynamicEvents();
});

// ================= 长按进入编辑模式逻辑 =================
const screen = document.getElementById('screen');
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600;

// 备份变量，用于取消修改
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
        // 进入编辑模式前，备份当前状态
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

// 保存当前状态到 IndexedDB
const saveCurrentState = async () => {
    // 触发一下 blur 确保 contenteditable 内容更新
    if(document.activeElement) document.activeElement.blur();
    
    const pagesHTML = document.querySelector('.pages-container').innerHTML;
    const dockHTML = document.querySelector('.dock-container').innerHTML;
    await saveToDB('pagesHTML', pagesHTML);
    await saveToDB('dockHTML', dockHTML);
};

// 完成编辑
const exitEditMode = async (e) => {
    if(e) e.stopPropagation();
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
    await saveCurrentState();
};

if (doneBtn) doneBtn.addEventListener('click', exitEditMode);

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

// ================= 新增：取消修改逻辑 =================
document.getElementById('menu-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    // 还原备份的 DOM
    document.querySelector('.pages-container').innerHTML = backupPagesHTML;
    document.querySelector('.dock-container').innerHTML = backupDockHTML;
    // 重新绑定事件
    bindAllDynamicEvents();
    
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
});

// ================= 新增：真实更换壁纸逻辑 =================
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

// ================= 新增：页面预览跳转逻辑 =================
document.getElementById('menu-preview').addEventListener('click', (e) => {
    e.stopPropagation();
    editMenu.classList.remove('show');
    
    const overlay = document.getElementById('preview-overlay');
    const container = document.getElementById('preview-container');
    container.innerHTML = '';
    
    // 获取当前壁纸背景
    const currentBg = document.getElementById('screen').style.backgroundImage || getComputedStyle(document.getElementById('screen')).backgroundImage;
    
    const pages = document.querySelectorAll('.pages-container .page');
    pages.forEach((page, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-page-wrapper';
        
        // 缩略图外壳 (附带壁纸)
        const scaleBox = document.createElement('div');
        scaleBox.className = 'preview-scale-box liquid-glass';
        scaleBox.style.backgroundImage = currentBg;
        
        // 缩放内容容器
        const scaleContent = document.createElement('div');
        scaleContent.className = 'preview-scale-content';
        
        // 克隆真实页面，做到一模一样
        const clonedPage = page.cloneNode(true);
        scaleContent.appendChild(clonedPage);
        scaleBox.appendChild(scaleContent);
        
        // 底部打勾图标
        const checkIcon = document.createElement('div');
        checkIcon.className = 'preview-check';
        checkIcon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        
        wrapper.appendChild(scaleBox);
        wrapper.appendChild(checkIcon);
        
        // 点击跳转
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

// 点击预览背景关闭预览
document.getElementById('preview-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'preview-overlay' || e.target.id === 'preview-container') {
        document.getElementById('preview-overlay').classList.remove('show');
    }
});
