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

// 获取屏幕元素
const screen = document.getElementById('screen');

// ================= 优化后的长按进入编辑模式逻辑 =================
let pressTimer = null;
let startX = 0;
let startY = 0;
const LONG_PRESS_DURATION = 600; // 稍微缩短到600ms，体验更灵敏

// 屏蔽浏览器默认的右键/长按菜单
screen.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

const startPress = (e) => {
    // 如果已经在编辑模式，不触发
    if (screen.classList.contains('edit-mode')) return;
    
    // 记录按下的初始坐标
    if (e.type === 'touchstart') {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    } else {
        startX = e.clientX;
        startY = e.clientY;
    }

    pressTimer = setTimeout(() => {
        screen.classList.add('edit-mode');
        // 触发手机轻微震动反馈（优先适配安卓端）
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
    
    // 允许 10px 以内的微小滑动，超过则认为是滑动翻页，取消长按
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

// 绑定全局长按事件 (替换了之前的严格取消逻辑)
screen.addEventListener('touchstart', startPress, { passive: true });
screen.addEventListener('touchmove', movePress, { passive: true });
screen.addEventListener('touchend', cancelPress);
screen.addEventListener('touchcancel', cancelPress);

screen.addEventListener('mousedown', startPress);
screen.addEventListener('mousemove', movePress);
screen.addEventListener('mouseup', cancelPress);
screen.addEventListener('mouseleave', cancelPress);

// 完成按钮退出编辑模式
const doneBtn = document.getElementById('done-btn');
if (doneBtn) {
    doneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        screen.classList.remove('edit-mode');
    });
}

// 删除按钮逻辑
const deleteBtns = document.querySelectorAll('.delete-btn');
deleteBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止事件冒泡，防止触发其他点击
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
        // 如果在编辑模式下，禁用果冻弹跳
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

    // 绑定触摸和鼠标事件
    item.addEventListener('touchstart', pressDownAnim, { passive: true });
    item.addEventListener('touchend', pressUpAnim);
    item.addEventListener('touchcancel', cancelPressAnim);
    item.addEventListener('mousedown', pressDownAnim);
    item.addEventListener('mouseup', pressUpAnim);
    item.addEventListener('mouseleave', cancelPressAnim);
});
