// ================= IndexedDB 持久化逻辑 =================
const DB_NAME = 'LiquidDeskDB';
const STORE_NAME = 'deskStore';

function openDB() {
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

async function saveData(key, value) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    return tx.complete;
}

async function loadData(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
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
            const batteryText = document.querySelector('.status-icons text');
            const batteryLevel = document.querySelector('.status-icons g rect');
            
            if (batteryText) batteryText.textContent = level;
            if (batteryLevel) batteryLevel.setAttribute('width', (level / 100) * 20);
        }
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
    });
}

// ================= 核心交互逻辑 =================
const screen = document.getElementById('screen');
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600;

// 备份数据用于取消修改
let backupDOM = null;
let backupWP = null;

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
        // 进入编辑模式前备份数据
        backupDOM = {
            pages: document.querySelector('.pages-container').innerHTML,
            dock: document.querySelector('.dock-container').innerHTML
        };
        backupWP = screen.style.backgroundImage;

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

// ================= 编辑控制栏逻辑 =================
const editBtn = document.getElementById('edit-btn');
const editMenu = document.getElementById('edit-menu');
const doneBtn = document.getElementById('done-btn');
const cancelBtn = document.getElementById('cancel-btn');

const exitEditMode = (e) => {
    e.stopPropagation();
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
};

// 点击完成：保存数据到 IndexedDB
if (doneBtn) {
    doneBtn.addEventListener('click', async (e) => {
        const currentDOM = {
            pages: document.querySelector('.pages-container').innerHTML,
            dock: document.querySelector('.dock-container').innerHTML
        };
        await saveData('dom', currentDOM);
        
        const currentWP = screen.style.backgroundImage;
        const wpMatch = currentWP.match(/url\(['"]?(.*?)['"]?\)/);
        if (wpMatch) {
            await saveData('wallpaper', wpMatch[1]);
        }
        exitEditMode(e);
    });
}

// 点击取消：恢复备份数据
if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
        if (backupDOM) {
            document.querySelector('.pages-container').innerHTML = backupDOM.pages;
            document.querySelector('.dock-container').innerHTML = backupDOM.dock;
            bindItemEvents(); // 重新绑定事件
        }
        if (backupWP !== null) {
            screen.style.backgroundImage = backupWP;
        }
        exitEditMode(e);
    });
}

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

// ================= 更换壁纸逻辑 =================
const wpUpload = document.getElementById('wp-upload');
document.getElementById('menu-change-wp').addEventListener('click', () => {
    wpUpload.click();
});

wpUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            screen.style.backgroundImage = `url(${ev.target.result})`;
        };
        reader.readAsDataURL(file);
    }
    editMenu.classList.remove('show');
});

// ================= 页面预览逻辑 =================
const previewOverlay = document.getElementById('page-preview-overlay');
const previewGrid = document.getElementById('preview-grid');

document.getElementById('menu-page-preview').addEventListener('click', () => {
    editMenu.classList.remove('show');
    // 同步当前壁纸
    previewOverlay.style.backgroundImage = screen.style.backgroundImage;
    
    previewGrid.innerHTML = '';
    const pages = document.querySelectorAll('.page');
    
    pages.forEach((page, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-item-wrapper jiggle-item'; // 继承抖动动效
        
        const item = document.createElement('div');
        item.className = 'preview-item liquid-glass';
        
        const scaleDiv = document.createElement('div');
        scaleDiv.className = 'preview-item-scale';
        scaleDiv.innerHTML = page.innerHTML; // 1:1克隆页面内容
        
        item.appendChild(scaleDiv);
        
        const check = document.createElement('div');
        check.className = 'preview-check active';
        check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
        
        wrapper.appendChild(item);
        wrapper.appendChild(check);
        previewGrid.appendChild(wrapper);
        
        // 点击跳转到对应页
        item.addEventListener('click', () => {
            previewOverlay.classList.remove('show');
            const container = document.querySelector('.pages-container');
            container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' });
        });

        // 打勾切换逻辑
        check.addEventListener('click', (e) => {
            e.stopPropagation();
            check.classList.toggle('active');
        });
    });
    
    previewOverlay.classList.add('show');
});

document.getElementById('preview-done-btn').addEventListener('click', () => {
    previewOverlay.classList.remove('show');
});

// ================= 动态绑定事件函数 =================
// 封装以便在恢复数据或初始化时重新绑定
function bindItemEvents() {
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

// ================= 初始化应用 =================
async function initApp() {
    const savedDOM = await loadData('dom');
    if (savedDOM) {
        document.querySelector('.pages-container').innerHTML = savedDOM.pages;
        document.querySelector('.dock-container').innerHTML = savedDOM.dock;
    }
    const savedWP = await loadData('wallpaper');
    if (savedWP) {
        screen.style.backgroundImage = `url(${savedWP})`;
    }
    bindItemEvents();
}

// 启动
initApp();
