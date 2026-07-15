// 实时时钟逻辑
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
            // 满电量宽度为20
            if (batteryLevel) batteryLevel.setAttribute('width', (level / 100) * 20);
        }
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
    });
}

// 获取屏幕元素
const screen = document.getElementById('screen');

// ================= 长按进入编辑模式逻辑 =================
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600;

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

// 退出编辑模式函数
const exitEditMode = (e) => {
    e.stopPropagation();
    screen.classList.remove('edit-mode');
    editMenu.classList.remove('show');
};

if (doneBtn) doneBtn.addEventListener('click', exitEditMode);
if (cancelBtn) cancelBtn.addEventListener('click', exitEditMode);

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


// ================= 删除按钮逻辑 =================
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

// ================= 软件图标果冻弹跳动效逻辑 =================
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
