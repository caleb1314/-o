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

// ================= 新增：长按进入编辑模式逻辑 =================
let pressTimer;
const LONG_PRESS_DURATION = 800; // 长按触发时间 800ms

const startPress = (e) => {
    // 如果已经在编辑模式，不触发
    if (screen.classList.contains('edit-mode')) return;
    
    pressTimer = setTimeout(() => {
        screen.classList.add('edit-mode');
        // 触发手机轻微震动反馈（仅安卓支持）
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }, LONG_PRESS_DURATION);
};

const cancelPress = () => {
    clearTimeout(pressTimer);
};

// 绑定全局长按事件
screen.addEventListener('touchstart', startPress, { passive: true });
screen.addEventListener('touchend', cancelPress);
screen.addEventListener('touchmove', cancelPress, { passive: true });
screen.addEventListener('mousedown', startPress);
screen.addEventListener('mouseup', cancelPress);
screen.addEventListener('mousemove', cancelPress);
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
