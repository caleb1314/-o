
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

// 软件图标果冻弹跳动效逻辑
const appItems = document.querySelectorAll('.app-item');
appItems.forEach(item => {
    const icon = item.querySelector('.app-icon-box') || item.querySelector('.dock-item');
    if (!icon) return;

    const pressDown = () => {
        icon.style.transform = 'scale(0.92) scaleX(1.05) scaleY(0.92)';
        icon.style.boxShadow = 'inset 0 2px 4px rgba(255, 255, 255, 0.9), inset 0 -1px 3px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.05)';
    };

    const pressUp = () => {
        icon.style.transform = 'scale(1.05) scaleX(0.95) scaleY(1.05)';
        icon.style.boxShadow = '';
        setTimeout(() => {
            icon.style.transform = 'scale(1)';
        }, 150);
    };

    const cancelPress = () => {
        icon.style.transform = 'scale(1)';
        icon.style.boxShadow = '';
    };

    // 绑定触摸和鼠标事件
    item.addEventListener('touchstart', pressDown, { passive: true });
    item.addEventListener('touchend', pressUp);
    item.addEventListener('touchcancel', cancelPress);
    item.addEventListener('mousedown', pressDown);
    item.addEventListener('mouseup', pressUp);
    item.addEventListener('mouseleave', cancelPress);
});
