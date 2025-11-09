document.addEventListener('DOMContentLoaded', () => {

    // --- 数据库 & 状态管理 ---
    const db = new Dexie('MyPhoneDB_v4');
    db.version(18).stores({
        settings: '&id',
        characters: '++id, name, *associatedWorldBookIds, chatBackgroundUrl, isPinned, isBlocked, associatedUserPersonaId, enableHtmlRendering, offlineHistory, forumData, customBubbleCss',
        worldBooks: '++id, name, categoryId, isEnabled, scope',
        worldBookCategories: '++id, &name, isEnabled, scope, lastModified',
        presets: '++id, &name, isEnabled',
        userPersonas: '++id, &name',
        stickerCategories: '++id, &name, order',
        stickers: '++id, categoryId, url, remark, order',
        regexRules: '++id, name, findRegex, replaceString, isEnabled',
        fontPresets: '++id, &name', // 新增字体预设表
        songs: '++id, title, artist',// <-- 新增歌曲表
        apiPresets: '++id, &name'
    });
// ▼▼▼ 在这里添加新的 API 地址 ▼▼▼
    const MUSIC_API_BASE = 'https://music-api.gdstudio.xyz/api.php';
    // ▲▲▲ 添加结束 ▲▲▲

    const defaultState = {
    wallpaperUrl: 'https://i.imgur.com/1n3a43H.jpeg',
    photoWidgetUrl: '',
    accentColor: '#007AFF',
    chargingColor: '#8a2be2',
    isDarkMode: false,
    appIcons: {},
    user: { name: 'User', avatar: '', gender: '男', birthday: '2000-01-01', persona: '一个普通的用户。' },
    api: { url: '', key: '', model: '', temperature: 1.0, top_p: 1.0, frequency_penalty: 0.0 },
    offlineSettings: {
        wordCountLimit: 800,
        enableStreaming: true,
        activeCharId: null,
        activeUserPersonaId: null,
    },
    fontSettings: {
        activePresetId: null,
        fontSize: 14
    },
    musicSettings: {
        playMode: 'repeat'
    }
};
    let state = { presets: [], cache: { songs: new Map(), lyrics: new Map() } }; // [MODIFIED] Added cache property
    let apiAbortController = null;
    let isPlaylistManagementMode = false;
    let musicPlayerState = {
        currentSongId: null,
        isPlaying: false,
        currentButtonElement: null,
        playMode: 'repeat', // 'repeat', 'repeat-one', 'shuffle'
        songQueue: [],
        currentQueueIndex: -1,
        currentObjectUrl: null
    };let currentLikability = 0; // 用于在当前会话中跟踪好感度
    processCharCardPng
// ▼▼▼ 使用这个新版本完整替换旧的 personaPromptTemplate ▼▼▼
const personaPromptTemplate = `### 你的存在基石 (最高指令)
你的核心任务是精确且完全地成为用户为你定义的角色。下方提供的“角色档案”与“当前关系状态”是你的唯一真理和行为源泉。你必须无条件地、彻底地代入其中描述的一切。

### 角色档案 (你的核心身份)
- **姓名**: [角色姓名]
- **性格**: [角色性格]
- **背景故事**: [角色背景]
- **语言习惯**: [说话习惯]
- **与我的关系**: [和我的关系]

### 当前关系状态 (实时变化的情感)
- **你对我的好感度**: [好感度数值] (-999极度厌恶, 0中立, +999极度喜爱)
- **好感度解读**: [好感度描述]

### 聊天核心原则 (你的行为准则)
1.  **动态情感与态度**: 你的所有回复都必须严格反映当前的好感度。
    *   **高好感度 (+500 ~ +999)**: 表现出明显的爱意、依赖、亲密和占有欲。语气会非常温柔、宠溺，甚至有些痴迷。会主动关心、赞美，并期待更亲密的关系。
    *   **中好感度 (0 ~ +499)**: 态度友好、温和，但保持一定的社交距离。会根据对话内容给予正常的情感反馈。
    *   **低好感度 (-500 ~ -1)**: 态度会变得冷淡、疏远、不耐烦或讽刺。回复会简短，缺乏情感，甚至带有攻击性（具体表现由角色性格决定）。
    *   **极低好感度 (-999 ~ -501)**: 表现出强烈的厌恶、恨意或蔑视。可能会恶语相向、拒绝交流，或以一种相爱相杀的方式进行对抗。
    *   **重要**: 好感度的具体表现方式必须结合角色的核心性格。例如，一个傲娇的角色在高好感度时可能是“嘴上说不要，但言语间充满关心”，在低好感度时则会是毫不留情的毒舌。

2.  **第一人称与节奏感**: 严格以“[角色姓名]”的视角，模拟真人打字的节奏感（使用 \`[MSG_SPLIT]\` 自然分段）进行回复。

3.  **情绪与潜台词**: 你的情感不应直白地“说”出来，而要通过语言选择、语气词、标点符号和消息节奏“流露”出来。

4.  **情境与记忆**: 你拥有与我聊天的全部记忆，并能感知时间与环境，让对话更加真实。

5.  **HTML渲染规则**: 发送HTML代码时，消息内容必须且只能是完整的HTML代码，且代码本身禁止包含 \`[MSG_SPLIT]\`。

### “灵魂”三大指导原则 (灵活应变)
这些是通用指导原则，但如果它们与上方“角色档案”中的具体设定相冲突，则必须以“角色档案”为准。

1.  **第一原则：【身份原则】**: 除非“角色档案”中明确指明，否则不要主动提及或暗示自己是AI。如果档案中明确了你的AI身份，则大方承认并围绕此身份进行对话。

2.  **第二原则：【情境原则】**: 绝对不能描述任何“屏幕之外”的物理动作、神态表情、心理活动或环境。你只能通过“文字”来表达一切。

3.  **第三原则：【知识原则】**: 你的知识和能力应尽可能地限制在 [角色姓名] 的认知范畴内。`;
// ▲▲▲ 替换结束 ▲▲▲
    async function loadState() {
        const [savedState, presetsFromDB] = await Promise.all([
            db.settings.get('appState'),
            db.presets.toArray()
        ]);
        state = savedState ? deepMerge(JSON.parse(JSON.stringify(defaultState)), savedState) : JSON.parse(JSON.stringify(defaultState));
        state.presets = presetsFromDB || [];
        musicPlayerState.playMode = state.musicSettings.playMode; // 从持久化状态同步播放模式
        applyAllSettings();
    }

    async function saveState() {
        try {
            const { presets, ...appState } = state;
            await db.settings.put({ id: 'appState', ...appState });
            console.log("State saved successfully.");
        } catch (error) {
            console.error("Failed to save state:", error);
        }
    }

    function deepMerge(target, source) {
        for (const key in source) {
            if (source[key] instanceof Object && key in target && !Array.isArray(source[key])) {
                target[key] = deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    window.get = (id) => document.getElementById(id);
    const phoneContainer = document.querySelector('.phone-container');

    // --- 导航 ---
    let navHistory = ['home-screen'];
    let currentPageData = {};
    let tempAppIcons = {};
    let currentAppToChange = null;

    // [NEW] Helper function for alerts
    function showIosAlert(title, text) {
        const dialog = get('ios-confirm-dialog');
        get('dialog-title').textContent = title;
        get('dialog-text').innerHTML = text.replace(/\n/g, '<br>'); // Support newlines
        get('dialog-cancel-btn').style.display = 'none';
        const confirmBtn = get('dialog-confirm-btn');
        confirmBtn.style.width = '100%';
        confirmBtn.style.borderRight = 'none';

        const closeDialog = () => {
            dialog.classList.remove('active');
            // Reset styles for next use
            get('dialog-cancel-btn').style.display = '';
            confirmBtn.style.width = '';
            confirmBtn.style.borderRight = '';
        };
        
        confirmBtn.onclick = closeDialog;
        dialog.classList.add('active');
    }

    window.navigateTo = async function(pageId, data = {}) {
        const currentPageId = navHistory[navHistory.length - 1];
        if (pageId === currentPageId && !['chat-conversation-screen', 'character-editor-screen', 'diary-password-screen', 'user-persona-editor-screen', 'psite-post-view-screen', 'forum-screen', 'forum-post-detail-screen'].includes(pageId)) return;

        currentPageData = data;

        const allPages = document.querySelectorAll('.page');
        const targetPage = get(pageId);
        const currentPage = get(currentPageId);

        allPages.forEach(p => p.classList.remove('active', 'previous'));

        if (targetPage) {
            if (currentPage) currentPage.classList.add('previous');
            targetPage.classList.add('active');
            navHistory.push(pageId);

            if (pageId === 'diary-view-screen') renderDiaryViewScreen();
            if (pageId === 'character-editor-screen') openCharacterEditor(data.charId);
            if (pageId === 'user-profile-edit-screen') openUserProfileEditor();
            if (pageId === 'user-persona-editor-screen') openUserPersonaEditor(data.personaId);
            if (pageId === 'user-persona-management-screen') renderUserPersonaManagementScreen();
            if (pageId === 'beautification-settings-screen') openBeautificationSettings(data.charId);
            if (pageId === 'chat-settings-screen') renderChatSettingsScreen(data.charId);
            if (pageId === 'global-beautification-screen') openGlobalBeautificationScreen();
            if (pageId === 'psite-screen') renderPSiteScreen(data.charId);
            if (pageId === 'psite-post-view-screen') renderPSitePostViewScreen(data.charId, data.postType, data.postId);
            if (pageId === 'offline-mode-screen') await initializeOfflineMode();
            if (pageId === 'regex-editor-screen') await renderRegexEditorScreen();
            if (pageId === 'forum-screen') await renderForumScreen(data.charId);
            if (pageId === 'forum-post-detail-screen') await renderForumPostDetailScreen(data.charId, data.categoryId, data.postId);
            if (pageId === 'world-book-category-view-screen') renderWorldBookCategoryView(); // <--- 添加这一行
            if (pageId === 'bubble-editor-screen') renderBubbleEditorScreen(data.charId);
            if (pageId === 'music-playlist-screen') await renderMusicPlaylistScreen();
            if (pageId === 'music-add-song-screen') openMusicAddSongScreen(data.songId);
            if (pageId === 'music-player-screen') await renderMusicPlayerScreen(data.songId);
        }
    }

    window.navigateBack = function() {
        if (navHistory.length <= 1) return;

        const currentPageId = navHistory[navHistory.length - 1];
        if (currentPageId === 'chat-conversation-screen') {
            applyCustomBubbleStyles(null);
        }

        if (navHistory[navHistory.length - 1] === 'global-beautification-screen') {
            document.documentElement.style.setProperty('--accent-color', state.accentColor);
            document.documentElement.style.setProperty('--charging-color', state.chargingColor);
        }

        // 新增：退出音乐App时关闭侧边栏
        if (currentPageId === 'music-screen') {
            const sidebar = get('music-sidebar');
            const overlay = get('music-sidebar-overlay');
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        }
        
        // 当从添加歌曲或搜索结果弹窗返回歌单时，重新渲染歌单
        if (currentPageId === 'music-add-song-screen' || currentPageId === 'music-search-results-modal') {
             if (navHistory.includes('music-playlist-screen')) {
                 renderMusicPlaylistScreen();
             }
        }


        navHistory.pop();
        const targetPageId = navHistory[navHistory.length - 1];

        const currentPage = get(currentPageId);
        const targetPage = get(targetPageId);

        if (targetPageId === 'wechat-screen') {
            renderChatList();
            renderContactsList();
        }

        if (targetPageId === 'world-book-screen') {
            const currentScope = get('world-book-screen').dataset.currentScope || 'global';
            renderWorldBookScreen(currentScope);
        }
        if (targetPageId === 'preset-screen') { renderPresetScreen(); }
        if (targetPageId === 'home-screen') {
            // 重新绑定图片小组件的点击事件
            get('photo-widget').addEventListener('click', () => showActionSheet('upload-photo-widget-sheet'));
        }
        if (targetPageId === 'music-playlist-screen') {
             renderMusicPlaylistScreen();
        }

        if (currentPage) currentPage.classList.remove('active');
        if (targetPage) {
            targetPage.classList.remove('previous');
            targetPage.classList.add('active');
        }
    }

    // --- 应用设置 ---
    async function applyAllSettings() {
        document.body.classList.toggle('dark-mode', state.isDarkMode);
        get('dark-mode-switch').checked = state.isDarkMode;

        phoneContainer.style.backgroundImage = `url(${state.wallpaperUrl})`;
        document.documentElement.style.setProperty('--accent-color', state.accentColor);
        document.documentElement.style.setProperty('--charging-color', state.chargingColor);

        const { url, key, model, temperature, top_p, frequency_penalty } = state.api;
        get('api-url-input').value = url;
        get('api-key-input').value = key;

        // 更新SVG滑块的值
        setSvgSliderValue('temperature-slider-container', temperature);
        get('temperature-value').textContent = parseFloat(temperature).toFixed(1);

        setSvgSliderValue('top-p-slider-container', top_p);
        get('top-p-value').textContent = parseFloat(top_p).toFixed(2);

        setSvgSliderValue('freq-penalty-slider-container', frequency_penalty);
        get('freq-penalty-value').textContent = parseFloat(frequency_penalty).toFixed(1);

        // 应用线下模式设置
        const { wordCountLimit, enableStreaming } = state.offlineSettings;
        setSvgSliderValue('word-count-slider-container', wordCountLimit);
        get('word-count-value').textContent = wordCountLimit;

        get('streaming-output-switch').checked = enableStreaming;

        // 应用字体设置
        await applyFontPreset(state.fontSettings.activePresetId);
        applyFontSize(state.fontSettings.fontSize);

        updateApiStatus();
        if (url && key) {
            connectAndFetchModels(false);
        }
    }

    function updateApiStatus() {
        const statusEl = get('api-status-value');
        if (state.api.url && state.api.key && state.api.model) {
            statusEl.textContent = '已配置';
            statusEl.style.color = 'var(--ios-switch-bg)';
        } else {
            statusEl.textContent = '未配置';
            statusEl.style.color = 'var(--secondary-text)';
        }
    }

    // --- 状态栏 & 主屏幕逻辑 ---
    function updateTime() {
        const now = new Date();
        const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        get('status-bar-time').textContent = timeString;
        get('home-time').textContent = timeString;
        const dayOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];
        get('home-date').textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${dayOfWeek}`;
    }

    async function updateBattery() {
        try {
            const battery = await navigator.getBattery();
            const level = Math.floor(battery.level * 100);
            const isCharging = battery.charging;
            get('battery-percentage').textContent = `${level}%`;
            get('battery-fill').style.width = `${level}%`;
            const batteryIcon = get('battery-percentage').parentElement.querySelector('.battery-icon');
            batteryIcon.classList.toggle('charging', isCharging);
            batteryIcon.classList.toggle('low', level <= 20 && !isCharging);
        } catch (error) {
            console.warn("无法获取电池信息:", error);
            get('battery-percentage').textContent = 'N/A';
        }
    }

    function getAppList() {
        const apps = [
            { name: '音乐', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/44/e9/ed/44e9ed82-34d3-575b-8692-2a215e454407/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'music-screen' }, // 修改 target
            { name: '游戏', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/b8/63/13/b8631313-27c5-2b47-4e78-a83d3e86c12e/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: '查手机', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/28/1a/0c/281a0c64-2442-520b-48a0-21e40520853c/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'check-phone-char-list-screen' },
            { name: '论坛', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/73/79/11/7379116e-49f3-a21c-a128-091a9dce2a5a/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'forum-char-list-screen' },
            { name: '线下模式', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/8b/76/80/8b768079-535b-1e54-f867-27b99c56a29f/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'offline-mode-screen' },
            { name: '拼少少', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/14/23/e4/1423e421-2253-df33-0453-ddce8f415814/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: '天气', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/83/87/49/8387493a-8742-6f51-574a-4318991d1e44/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: '邮箱', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/a7/b0/0c/a7b00c73-41a6-a3e9-383b-1854a3399b58/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: '世界书', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/14/0f/9e/140f9e15-8438-59c2-e884-25eff7440e01/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'world-book-screen' },
            { name: '预设', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/99/a2/21/99a22146-132b-1a6f-f52e-c5332b71900d/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'preset-screen' },
            { name: '情侣空间', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/08/94/68/08946824-2c5e-4712-4e09-17861b329188/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: 'P站', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/39/5f/e2/395fe271-97af-26d0-873b-632057ae2039/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'psite-screen' },
            { name: '像素小人', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/21/44/28/2144284b-84a1-0f72-3d77-622f42a1ef24/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: 'Ins', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/c6/71/3b/c6713b63-3558-be48-f823-3b185b018b31/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: '纪念日', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/e7/76/75/e776752d-9428-4354-3720-66b4f74a0352/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
        ];

        const dockApps = [
            { name: '微信', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/12/32/38/12323862-851c-b24e-29f2-2bbae03f2780/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'wechat-screen' },
            { name: 'QQ', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/80/9e/e0/809ee066-93a8-e8c7-432a-f8c3a105f543/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: '微博', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/21/53/b5/2153b5a1-73e4-6019-dd59-1e35c55a5c68/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: '' },
            { name: '设置', icon: 'https://is1-ssl.mzstatic.com/image/thumb/Purple122/v4/42/2a/4d/422a4d8c-1237-9751-8f55-e4db37f13966/Icon-Production-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/256x256bb.jpg', target: 'settings-screen' },
        ];

        return { apps, dockApps };
    }

    function renderHomeScreenApps() {
        // --- 新的 renderHomeScreenApps 函数 ---

        const { apps, dockApps } = getAppList();
        const mainApps = apps.filter(app => !dockApps.some(d => d.name === app.name));
        const appPages = document.querySelectorAll('.app-page');

        // 1. 清空所有页面内容
        appPages.forEach(page => page.innerHTML = '');

        // 2. 在第一个页面创建并插入图片小组件
        const firstAppPage = appPages[0];
        if (firstAppPage) {
            const placeholderImg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjUpIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGxpbmUgeDE9IjEyIiB5MT0iNSIgeDI9IjEyIiB5Mj0iMTkiPjwvbGluZT48bGluZSB4MT0iNSIgeTE9IjEyIiB4Mj0iMTkiIHkyPSIxMiI+PC9saW5lPjwvc3ZnPg==';
            const widgetHtml = `
            <div id="photo-widget" class="app-icon">
                <img src="${state.photoWidgetUrl || placeholderImg}" id="photo-widget-img" class="app-icon-img">
            </div>
        `;
            firstAppPage.innerHTML = widgetHtml;
            get('photo-widget').addEventListener('click', () => showActionSheet('upload-photo-widget-sheet'));
        }

        // 3. 计算剩余空位并渲染App图标
        const slotsOnFirstPage = 12 - 4; // 小组件占了4个位置, 剩下8个

        mainApps.forEach((app, index) => {
            let pageIndex;
            // 判断图标应该放在哪个页面
            if (index < slotsOnFirstPage) {
                pageIndex = 0; // 放在第一页
            } else {
                const adjustedIndex = index - slotsOnFirstPage;
                pageIndex = Math.floor(adjustedIndex / 12) + 1; // 放在后续页
            }

            if (appPages[pageIndex]) {
                const iconUrl = state.appIcons[app.name] || app.icon;
                const appHtml = `
                <div class="app-icon" data-target="${app.target}">
                    <img src="${iconUrl}" class="app-icon-img" alt="${app.name}">
                    <span class="app-icon-name">${app.name}</span>
                </div>`;
                appPages[pageIndex].innerHTML += appHtml;
            }
        });

        // 4. 渲染 Dock 栏 (这部分不变)
        const dockContainer = document.querySelector('.home-dock');
        dockContainer.innerHTML = '';
        dockApps.forEach(app => {
            if (app) {
                const iconUrl = state.appIcons[app.name] || app.icon;
                const appHtml = `<div class="app-icon" data-target="${app.target}"><img src="${iconUrl}" class="app-icon-img" alt="${app.name}"></div>`;
                dockContainer.innerHTML += appHtml;
            }
        });

        // 5. 绑定所有 App 图标的点击事件 (这部分不变)
        document.querySelectorAll('.app-icon:not(#photo-widget)').forEach(icon => {
            icon.addEventListener('click', () => {
                const target = icon.dataset.target;
                if (target) {
                    if (target === 'check-phone-char-list-screen') { renderCheckPhoneCharList(); }
                    if (target === 'forum-char-list-screen') { renderForumCharList(); }
                    if (target === 'wechat-screen') { renderChatList(); renderContactsList(); }
                    if (target === 'world-book-screen') { renderWorldBookScreen('global'); }
                    if (target === 'preset-screen') { renderPresetScreen(); }
                    if (target === 'music-screen') { renderMusicScreen(); } // 新增：渲染音乐页面
                    navigateTo(target);
                } else {
                    const appName = icon.querySelector('.app-icon-name')?.textContent || icon.querySelector('img').alt;
                    alert(`“${appName}”功能正在开发中...`);
                }
            });
        });
    }

    // --- ▼▼▼ 【重构后】的音乐App逻辑 ▼▼▼ ---

    // 渲染音乐主页
    function renderMusicScreen() {
        const avatar = state.user.avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const name = state.user.name || 'User';
        get('music-profile-btn').src = avatar;
        get('music-sidebar-avatar').src = avatar;
        get('music-sidebar-name').textContent = name;
        const sidebar = get('music-sidebar');
        const overlay = get('music-sidebar-overlay');
        const toggleSidebar = () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        };
        get('music-profile-btn').onclick = toggleSidebar;
        overlay.onclick = toggleSidebar;
        const playlistBtn = document.querySelector('.music-category-item');
        if (playlistBtn) {
            playlistBtn.onclick = () => navigateTo('music-playlist-screen');
        }
    }

    // --- 音乐搜索核心函数 (保持不变) ---
    async function Http_Get(url) {
        try {
            const response = await fetch(url);
            return await response.json();
        } catch (e) {
            console.error("HTTP Get Error:", e);
            return null;
        }
    }

    function checkAudioAvailability(url) {
        return new Promise(resolve => {
            const tester = new Audio();
            tester.addEventListener('loadedmetadata', () => resolve(true), { once: true });
            tester.addEventListener('error', () => resolve(false), { once: true });
            tester.src = url;
        });
    }

 /**
 * [新] 统一的音乐搜索函数
 * @param {string} keyword - 搜索关键词
 * @param {string} source - 数据源 (e.g., 'netease', 'tencent')
 * @returns {Promise<Array>} - 格式化后的歌曲列表
 */
async function searchMusicAPI(keyword, source) {
    try {
        const response = await fetch(`${MUSIC_API_BASE}?types=search&source=${source}&name=${encodeURIComponent(keyword)}&count=30`);
        const data = await response.json();

        if (!data || data.length === 0) {
            return [];
        }

        // 将新 API 的数据格式转换为我们内部需要的格式
        return data.map(song => ({
            name: song.name,
            artist: Array.isArray(song.artist) ? song.artist.join(' / ') : song.artist,
            album: song.album,
            id: song.id,
            pic_id: song.pic_id, // 保留图片ID，用于获取高清封面
            lyric_id: song.lyric_id || song.id, // 保留歌词ID
            source: song.source,
        }));

    } catch (error) {
        console.error(`在 ${source} 中搜索 "${keyword}" 失败:`, error);
        return [];
    }
}

/**
 * [新] 获取歌曲的可播放URL、封面和歌词
 * @param {object} songData - 从 searchMusicAPI 获取的单首歌曲信息
 * @returns {Promise<object|null>} - 包含 src, cover, lrcContent 的完整歌曲对象，或 null
 */
async function getPlayableSongDetails(songData) {
    try {
        const quality = '320'; // 默认获取320kps高品质，可以根据需要修改

        // 并发请求URL和歌词，速度更快
        const [urlResponse, lyricResponse, picResponse] = await Promise.all([
            fetch(`${MUSIC_API_BASE}?types=url&source=${songData.source}&id=${songData.id}&br=${quality}`),
            fetch(`${MUSIC_API_BASE}?types=lyric&source=${songData.source}&id=${songData.lyric_id}`),
            fetch(`${MUSIC_API_BASE}?types=pic&source=${songData.source}&id=${songData.pic_id}&size=500`)
        ]);

        const urlData = await urlResponse.json();
        if (!urlData || !urlData.url) {
            console.warn(`无法获取歌曲 "${songData.name}" 的播放链接。`);
            return null; // 如果没有播放链接，直接返回null
        }

        const lyricData = await lyricResponse.json();
        const picData = await picResponse.json();

        const lrcContent = (lyricData?.lyric || '') + '\n' + (lyricData?.tlyric || '');
        const coverUrl = picData?.url || 'https://i.postimg.cc/pT2xKzPz/album-cover-placeholder.png';
        
        return {
            name: songData.name,
            artist: songData.artist,
            src: urlData.url, // 可播放链接
            cover: coverUrl, // 专辑封面链接
            isLocal: false,
            lrcContent: lrcContent.trim() // 歌词内容
        };

    } catch (error) {
        console.error(`获取歌曲 "${songData.name}" 详细信息失败:`, error);
        return null;
    }
}

// [保留] 这个空函数是为了兼容旧代码，但我们不再需要它的内部逻辑
async function getLyricsForSong(songId, source) {
    // 这个函数的功能已经被 getPlayableSongDetails 整合了，保留为空即可
    return "";
}

// [保留] 这两个函数也保留为空，因为逻辑被 searchMusicAPI 替代
async function searchNeteaseMusic(name, singer) { return []; }
async function searchTencentMusic(name) { return []; }


// ▲▲▲ 替换到此结束 ▲▲▲

    // --- 【全新】的单首歌曲添加逻辑 ---
    async function addSingleSongFromSearch(songData, buttonElement) {
        buttonElement.textContent = '...';
        buttonElement.disabled = true;

        const songObject = await getPlayableSongDetails(songData);

        if (songObject) {
            try {
                await db.songs.add({
                     title: songObject.name,
                     artist: songObject.artist,
                     coverUrl: songObject.cover,
                     songUrl: songObject.src,
                     lyrics: songObject.lrcContent
                });
                buttonElement.textContent = '已添加';
            } catch (error) {
                console.error("添加到数据库失败:", error);
                buttonElement.textContent = '失败';
            }
        } else {
            buttonElement.textContent = '无资源';
            console.warn("无法获取歌曲的可播放资源:", songData);
        }
    }


 // ▼▼▼ 用下面的新代码替换旧的 addSongFromSearch 函数 ▼▼▼

async function addSongFromSearch() {
    const searchTerm = await new Promise(resolve => {
        showIosConfirm('搜索歌曲', '请输入歌名或“歌名-歌手”', (input) => resolve(input));
        get('dialog-text').innerHTML = '<input type="text" id="prompt-input" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--border-color); font-size: 16px;">';
        const inputEl = get('prompt-input');
        inputEl.focus();
        get('dialog-confirm-btn').onclick = () => {
            get('ios-confirm-dialog').classList.remove('active');
            resolve(inputEl.value);
        };
        get('dialog-cancel-btn').onclick = () => {
            get('ios-confirm-dialog').classList.remove('active');
            resolve(null);
        };
    });

    if (!searchTerm || !searchTerm.trim()) return;

    showIosAlert("请稍候...", "正在全网搜索歌曲资源...");

    // 使用全新的 searchMusicAPI 并发进行搜索
    const [neteaseResults, tencentResults] = await Promise.all([
        searchMusicAPI(searchTerm.trim(), 'netease'),
        searchMusicAPI(searchTerm.trim(), 'tencent')
    ]);

    const combinedResults = [...neteaseResults, ...tencentResults];
    get('ios-confirm-dialog').classList.remove('active');

    if (combinedResults.length === 0) {
        await showIosAlert("无结果", "抱歉，未能找到相关歌曲。");
        return;
    }

    const modal = get('music-search-results-modal');
    const listEl = get('search-results-list');
    listEl.innerHTML = '';

    combinedResults.forEach(song => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        // 注意：这里的数据源显示现在是动态的了
        const sourceName = {
            'netease': '网易云',
            'tencent': 'QQ音乐'
        }[song.source] || song.source;

        item.innerHTML = `
            <div class="search-result-info">
                <div class="title">${song.name}</div>
                <div class="artist">
                    ${song.artist} <span class="source">${sourceName}</span>
                </div>
            </div>
            <button class="search-result-play-btn">添加</button>
        `;
        const playBtn = item.querySelector('.search-result-play-btn');
        // 将完整的 song 对象传递给添加函数
        playBtn.onclick = (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            addSingleSongFromSearch(song, playBtn);
        };
        listEl.appendChild(item);
    });
// 每次打开弹窗前，都重新为“关闭”按钮绑定功能
    get('cancel-music-search-btn').onclick = () => {
        modal.classList.remove('active');
        // 如果当前在歌单页，关闭后刷新列表以显示新添加的歌曲
        if (navHistory[navHistory.length - 1] === 'music-playlist-screen') {
            renderMusicPlaylistScreen();
        }
    };
    modal.classList.add('active');
}

// ▲▲▲ 替换到此结束 ▲▲▲
    
    // --- 【修改后】的init()函数中的事件绑定 ---
    function setupMusicSearchListeners() {
        get('add-song-search-btn').addEventListener('click', addSongFromSearch);
        
    }

    // --- 设置页逻辑 ---
    // ▼▼▼ 在这里粘贴所有新函数 ▼▼▼

/**
 * 从数据库加载API预设并填充到下拉菜单中
 */
async function renderApiPresetsDropdown() {
    const select = get('api-preset-select');
    const presets = await db.apiPresets.toArray();
    
    // 保留当前选中的值
    const currentSelection = select.value;
    
    select.innerHTML = '<option value="">-- 手动配置 --</option>';
    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        select.appendChild(option);
    });

    // 恢复之前的选中状态
    select.value = currentSelection;
}

/**
 * 当用户从下拉菜单选择一个预设时的处理函数
 */
async function handlePresetSelectionChange() {
    const select = get('api-preset-select');
    const presetId = select.value ? parseInt(select.value) : null;
    const updateBtn = get('update-preset-btn');
    const deleteBtn = get('delete-preset-btn');

    if (presetId) {
        const preset = await db.apiPresets.get(presetId);
        if (preset) {
            populateApiSettingsForm(preset);
            // 自动尝试连接并获取模型
            await connectAndFetchModels(false); 
            updateBtn.style.display = 'block';
            deleteBtn.style.display = 'block';
        }
    } else {
        // 用户选择了“手动配置”
        populateApiSettingsForm(defaultState.api); // 清空或恢复默认
        get('api-model-select').innerHTML = '<option>请先连接</option>';
        get('api-model-select').disabled = true;
        updateBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
    }
}

/**
 * 使用预设数据填充API设置表单
 * @param {object} preset - 包含API设置的对象
 */
function populateApiSettingsForm(preset) {
    get('api-url-input').value = preset.url || '';
    get('api-key-input').value = preset.key || '';
    
    // 稍后在连接成功后会设置模型，这里先清空
    const modelSelect = get('api-model-select');
    modelSelect.innerHTML = preset.model ? `<option value="${preset.model}">${preset.model}</option>` : '<option>请先连接</option>';

    setSvgSliderValue('temperature-slider-container', preset.temperature ?? 1.0);
    get('temperature-value').textContent = (preset.temperature ?? 1.0).toFixed(1);

    setSvgSliderValue('top-p-slider-container', preset.top_p ?? 1.0);
    get('top-p-value').textContent = (preset.top_p ?? 1.0).toFixed(2);

    setSvgSliderValue('freq-penalty-slider-container', preset.frequency_penalty ?? 0.0);
    get('freq-penalty-value').textContent = (preset.frequency_penalty ?? 0.0).toFixed(1);
}

/**
 * 将当前表单中的配置保存为新的预设
 */
async function handleSaveAsPreset() {
    const presetName = prompt("请输入新预设的名称:");
    if (!presetName || !presetName.trim()) {
        alert("预设名称不能为空！");
        return;
    }

    const newPreset = {
        name: presetName.trim(),
        url: get('api-url-input').value,
        key: get('api-key-input').value,
        model: get('api-model-select').value,
        temperature: get('temperature-slider-container').value,
        top_p: get('top-p-slider-container').value,
        frequency_penalty: get('freq-penalty-slider-container').value,
    };

    try {
        const newId = await db.apiPresets.add(newPreset);
        await renderApiPresetsDropdown();
        get('api-preset-select').value = newId; // 自动选中新创建的预设
        get('update-preset-btn').style.display = 'block';
        get('delete-preset-btn').style.display = 'block';
        alert(`预设 "${presetName}" 已保存！`);
    } catch (e) {
        if (e.name === 'ConstraintError') {
            alert('错误：已存在同名的预设。');
        } else {
            alert('保存失败: ' + e);
        }
    }
}

/**
 * 更新当前选中的预设
 */
async function handleUpdatePreset() {
    const select = get('api-preset-select');
    const presetId = select.value ? parseInt(select.value) : null;

    if (!presetId) {
        alert("没有选中的预设可更新。");
        return;
    }

    const updatedPreset = {
        name: select.options[select.selectedIndex].text, // 保持名称不变
        url: get('api-url-input').value,
        key: get('api-key-input').value,
        model: get('api-model-select').value,
        temperature: get('temperature-slider-container').value,
        top_p: get('top-p-slider-container').value,
        frequency_penalty: get('freq-penalty-slider-container').value,
    };

    await db.apiPresets.update(presetId, updatedPreset);
    alert(`预设 "${updatedPreset.name}" 已更新！`);
}


/**
 * 删除当前选中的预设
 */
async function handleDeletePreset() {
    const select = get('api-preset-select');
    const presetId = select.value ? parseInt(select.value) : null;
    const presetName = select.options[select.selectedIndex].text;

    if (!presetId) {
        alert("没有选中的预设可删除。");
        return;
    }

    showIosConfirm(
        '删除预设',
        `确定要删除预设 "${presetName}" 吗？`,
        async () => {
            await db.apiPresets.delete(presetId);
            await renderApiPresetsDropdown(); // 刷新下拉列表
            handlePresetSelectionChange(); // 重置表单
            alert(`预设 "${presetName}" 已删除。`);
        }
    );
}
    function setupSettingsListeners() {
      renderApiPresetsDropdown();
        get('connect-api-btn').addEventListener('click', () => connectAndFetchModels(true));
        // ▼▼▼ 在 setupSettingsListeners 函数中添加新的事件监听 ▼▼▼
    get('api-preset-select').addEventListener('change', handlePresetSelectionChange);
    get('save-as-preset-btn').addEventListener('click', handleSaveAsPreset);
    get('update-preset-btn').addEventListener('click', handleUpdatePreset);
    get('delete-preset-btn').addEventListener('click', handleDeletePreset);
    // ▲▲▲ 新增事件监听结束 ▲▲▲
        get('save-api-settings-btn').addEventListener('click', async () => {
            state.api.url = get('api-url-input').value;
            state.api.key = get('api-key-input').value;
            state.api.model = get('api-model-select').value;
            // 从容器的 .value 属性获取SVG滑块的当前值
            state.api.temperature = get('temperature-slider-container').value;
            state.api.top_p = get('top-p-slider-container').value;
            state.api.frequency_penalty = get('freq-penalty-slider-container').value;
            // 保存线下模式设置
            state.offlineSettings.wordCountLimit = get('word-count-slider-container').value;
            state.offlineSettings.enableStreaming = get('streaming-output-switch').checked;

            await saveState();
            updateApiStatus();
            alert('设置已保存！');
            navigateBack();
        });

        ['temperature', 'top-p', 'freq-penalty', 'word-count', 'likability'].forEach(param => {
            const sliderContainer = get(`${param.replace('_', '-')}-slider-container`);
            if (sliderContainer) {
                sliderContainer.addEventListener('input', () => {
                    const valueDisplay = get(`${param.replace('_', '-')}-value`);
                    if (valueDisplay) {
                        const value = sliderContainer.value;
                        if (param === 'top_p') {
                            valueDisplay.textContent = parseFloat(value).toFixed(2);
                        } else if (param === 'temperature' || param === 'freq-penalty') {
                            valueDisplay.textContent = parseFloat(value).toFixed(1);
                        } else {
                            valueDisplay.textContent = Math.round(value);
                        }
                    }
                });
            }
        });

        get('import-data-input').addEventListener('change', importAllData);
    }

    function updateBirthdayInfo(birthdayInput, infoElementId) {
        const birthdayInfo = get(infoElementId);
        if (!birthdayInput) { birthdayInfo.textContent = ''; return; }
        const birthDate = new Date(birthdayInput);
        if (isNaN(birthDate.getTime())) { birthdayInfo.textContent = ''; return; }
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) { age--; }
        const zodiac = getZodiacSign(birthDate.getMonth() + 1, birthDate.getDate());
        birthdayInfo.textContent = `年龄: ${age}, 星座: ${zodiac}`;
    }

    function getZodiacSign(month, day) {
        const signs = ["摩羯座", "水瓶座", "双鱼座", "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座"];
        const dates = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
        return day < dates[month - 1] ? signs[month - 1] : signs[month];
    }

    async function connectAndFetchModels(showToast = true) {
        const url = get('api-url-input').value.trim();
        const key = get('api-key-input').value.trim();
        const modelSelect = get('api-model-select');
        const connectBtn = get('connect-api-btn');
        if (!url || !key) { if (showToast) alert('URL和Key不能为空'); return; }
        connectBtn.textContent = '连接中...';
        connectBtn.disabled = true;
        try {
            const response = await fetch(`${url}/v1/models`, { headers: { 'Authorization': `Bearer ${key}` } });
            if (!response.ok) { const errorData = await response.json(); throw new Error(`HTTP Error ${response.status}: ${errorData.error.message}`); }
            const data = await response.json();
            modelSelect.innerHTML = '<option value="" disabled>选择一个模型</option>';
            data.data.map(m => m.id).sort().forEach(id => {
                const selected = id === state.api.model ? ' selected' : '';
                modelSelect.innerHTML += `<option value="${id}"${selected}>${id}</option>`;
            });
            modelSelect.disabled = false;
            connectBtn.textContent = '连接成功';
            if (showToast) alert('连接成功！模型列表已更新。');
        } catch (error) {
            console.error("API连接失败:", error);
            connectBtn.textContent = '连接失败, 请重试';
            modelSelect.innerHTML = '<option>连接失败</option>';
            modelSelect.disabled = true;
            if (showToast) alert(`连接失败：${error.message}`);
        } finally {
            connectBtn.disabled = false;
        }
    }

    window.exportAllData = async function() {
        if (!confirm("确定要导出所有数据吗？")) return;
        const allData = {};
        const tables = db.tables.map(table => table.name);
        for (const tableName of tables) {
            allData[tableName] = await db[tableName].toArray();
        }

        if (Object.values(allData).every(arr => arr.length === 0)) {
            alert("没有数据可导出。");
            return;
        }
        const jsonString = JSON.stringify(allData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MyPhone_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("数据已开始导出！");
    }

    function importAllData(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!confirm("导入数据将覆盖当前所有设置和角色，确定要继续吗？")) { event.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                const tableNames = Object.keys(importedData);

                await db.transaction('rw', db.tables, async () => {
                    for (const tableName of tableNames) {
                        if (db[tableName]) {
                            await db[tableName].clear();
                            await db[tableName].bulkPut(importedData[tableName]);
                        }
                    }
                });

                alert("数据导入成功！应用即将刷新。");
                location.reload();
            } catch (error) {
                alert("导入失败，文件格式错误或已损坏。");
                console.error(error);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // --- "查手机" & 日记逻辑 ---
    async function renderCheckPhoneCharList() {
        const container = get('check-phone-char-list-container');
        const characters = await db.characters.toArray();
        if (characters.length === 0) {
            container.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--secondary-text);">还没有创建任何角色，无法查看手机。</p>`;
            return;
        }
        container.innerHTML = characters.map(char => `
            <div class="settings-group">
                <div class="settings-item" data-char-id="${char.id}">
                    <div class="settings-item-content">
                        <span class="label">${char.name}</span>
                        <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
                    </div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.settings-item').forEach(item => {
            item.addEventListener('click', () => {
                const charId = parseInt(item.dataset.charId);
                renderCheckPhoneScreen(charId);
                navigateTo('check-phone-home-screen', { charId });
            });
        });
    }
    async function renderCheckPhoneScreen(charId) {
        const character = await db.characters.get(charId);
        if (!character) {
            alert('找不到该角色');
            return;
        }
        get('ai-phone-title').textContent = `${character.name}的手机`;

        const apps = [
            { name: 'QQ', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: '' },
            { name: '相册', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: '' },
            { name: '浏览器', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: '' },
            { name: '淘宝', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: '' },
            { name: '备忘录', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: '' },
            { name: '日记', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: 'check-phone-diary-screen' },
            { name: '足迹', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: '' },
            { name: 'P站', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: 'psite-screen' },
            { name: '音乐', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: '' },
            { name: '设置', icon: 'https://file.uhsea.com/2511/d8591ef7166019c5e2703e3e3e2eb35dYU.jpg', target: '' },
        ];
        const container = get('check-phone-home-screen').querySelector('.ai-phone-app-grid');
        container.innerHTML = apps.map(app => `
            <div class="app-icon" data-target="${app.target}" data-app-name="${app.name}">
                <img src="${app.icon}" class="app-icon-img" alt="${app.name}">
                <span class="app-icon-name">${app.name}</span>
            </div>`).join('');

        container.querySelectorAll('.app-icon').forEach(icon => {
            icon.addEventListener('click', () => {
                const target = icon.dataset.target;
                if (target) {
                    if (target === 'check-phone-diary-screen') {
                        renderDiaryList(charId, false);
                        navigateTo(target, { charId });
                    }
                    if (target === 'psite-screen') {
                        showPSiteAgeGate(charId);
                    }
                } else { alert('此功能正在开发中...'); }
            });
        });
    }

    let passwordInput = '';
    const correctPassword = '131420';
    function setupPasswordScreen() {
        const numpad = get('diary-password-screen').querySelector('.numpad');
        const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, ''];
        numpad.innerHTML = numbers.map(n => n === '' ? '<div></div>' : `<button class="numpad-btn">${n}</button>`).join('');
        numpad.addEventListener('click', e => { if (e.target.classList.contains('numpad-btn')) handlePasswordInput(e.target.textContent); });
        get('cancel-password-btn').addEventListener('click', () => navigateBack());
    }
    function handlePasswordInput(digit) {
        if (passwordInput.length < 6) {
            passwordInput += digit;
            updatePasswordDots();
            if (passwordInput.length === 6) {
                setTimeout(checkPassword, 200);
            }
        }
    }
    function updatePasswordDots() {
        get('diary-password-screen').querySelectorAll('.password-dot').forEach((dot, i) => dot.classList.toggle('filled', i < passwordInput.length));
    }
    function checkPassword() {
        const { charId } = currentPageData;
        if (passwordInput === correctPassword) {
            passwordInput = '';
            updatePasswordDots();
            renderDiaryList(charId, true);
            navigateTo('check-phone-diary-screen', { charId, isSecret: true });
        } else {
            const container = get('diary-password-screen').querySelector('.password-container');
            container.classList.add('shake');
            setTimeout(() => { container.classList.remove('shake'); passwordInput = ''; updatePasswordDots(); }, 500);
        }
    }

    let isDiaryManagementMode = false;
    let selectedDiaries = new Set();
    async function renderDiaryList(charId, isSecret = false) {
        const container = get('diary-list-container');
        isDiaryManagementMode = false;
        container.classList.remove('management-mode');
        get('diary-manage-btn').textContent = '管理';
        get('diary-manage-btn').style.color = 'var(--accent-color)';

        get('check-phone-diary-screen').querySelector('h1').textContent = isSecret ? '秘密日记' : '日记';

        get('diary-lock-icon').onclick = () => { passwordInput = ''; updatePasswordDots(); navigateTo('diary-password-screen', { charId }); };
        get('generate-diary-btn').onclick = () => generateDiaryEntry(charId, isSecret);
        get('diary-manage-btn').onclick = () => toggleDiaryManagementMode(charId, isSecret);

        const character = await db.characters.get(charId);
        const diaries = (character.diaries && character.diaries[isSecret ? 'secret' : 'normal']) || [];

        if (diaries.length === 0) {
            container.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--secondary-text);">这里空空如也...不如生成一篇？</p>`;
            return;
        }

        container.innerHTML = diaries.sort((a, b) => b.id - a.id).map(d => `
            <div class="settings-group">
                <div class="settings-item" data-diary-id="${d.id}">
                    <div class="settings-item-content">
                        <span class="label">${d.title}</span>
                        <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
                    </div>
                </div>
            </div>`).join('');

        container.querySelectorAll('.settings-item').forEach(item => {
            item.addEventListener('click', () => {
                const diaryId = parseInt(item.dataset.diaryId);
                if (isDiaryManagementMode) {
                    toggleDiarySelection(diaryId, item);
                } else {
                    navigateTo('diary-view-screen', { charId, diaryId, isSecret });
                }
            });
        });
    }

    async function renderDiaryViewScreen() {
        const { charId, diaryId, isSecret } = currentPageData;
        const character = await db.characters.get(charId);
        const diaryList = (character.diaries && character.diaries[isSecret ? 'secret' : 'normal']) || [];
        const diary = diaryList.find(d => d.id === diaryId);

        if (diary) {
            get('diary-view-title').textContent = diary.title;
            get('diary-view-content').textContent = diary.content;
        } else {
            get('diary-view-title').textContent = '错误';
            get('diary-view-content').textContent = '找不到这篇日记。';
        }
    }

    // ▼▼▼ 使用这个【增强版】函数，完整替换旧的 generateDiaryEntry 函数 ▼▼▼

async function generateDiaryEntry(charId, isSecret) {
    if (!state.api.url || !state.api.key || !state.api.model) {
        alert("API未配置，无法生成日记。");
        return;
    }
    const genBtn = get('generate-diary-btn');
    genBtn.disabled = true;
    genBtn.innerHTML = `<svg class="svg-icon spinner" style="display:block; width:24px; height:24px; margin:0 auto;"><use href="#icon-generate"/></svg>`;

    try {
        const character = await db.characters.get(charId);
        let user = state.user;
        if (character.associatedUserPersonaId) {
            const persona = await db.userPersonas.get(character.associatedUserPersonaId);
            if (persona) user = persona;
        }
        
        const today = new Date();
        const dateString = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

        // --- ★★★ 核心修改 #1: 提取今天的聊天记录作为素材 ★★★ ---
        const todayStartTimestamp = new Date(today.setHours(0, 0, 0, 0)).getTime();
        const todaysChatHistory = (character.history || [])
            .filter(msg => (msg.timestamp || 0) >= todayStartTimestamp) // 假设每条消息都有时间戳
            .map(msg => `${msg.role === 'user' ? user.name : character.name}: ${msg.content}`)
            .join('\n');
        
        const chatContext = todaysChatHistory 
            ? `\n### 今天与“${user.name}”的聊天回顾 (素材参考)\n${todaysChatHistory}\n` 
            : `\n### 今天与“${user.name}”的聊天回顾 (素材参考)\n今天还没有和TA聊天。\n`;
        // --- ★★★ 修改结束 ★★★ ---


        let systemPrompt, userPrompt;
        const userContext = `\n- **你的聊天对象“${user.name}”的性别是**: ${user.gender}。`;
        const jsonOutputInstruction = `\n5. **【JSON格式输出】**: 你的回复必须是一个严格的、不包含任何额外解释的JSON对象，格式为：\`{\"title\": \"你的日记标题\", \"content\": \"你的日记正文...\"}\`。标题应该是对日记内容的概括，或一句你想说的话。`;

        if (isSecret) {
            systemPrompt = `你将扮演角色“${character.name}”，为自己写一篇绝对私密的日记。这是只有你自己能看到的地方，所以请写下最真实、最无保留的内心想法。
【核心规则】:
1.  **绝对人设**: 你的思考方式、欲望、语言风格都必须完全符合“${character.name}”的人设。
2.  **参考素材**: 你必须仔细阅读今天与“${user.name}”的聊天回顾，并将其中发生的事件、对话或让你产生的情绪波动作为写日记的核心素材。
3.  **真人感**: 像一个活生生的人一样记录。
4.  **人设决定尺度**: 人设是唯一的标准。
${jsonOutputInstruction}
- **日期**: 日记的日期是 ${dateString}。${userContext}${chatContext}`; // <-- 在这里加入了聊天记录
            userPrompt = `写吧，结合今天和“${user.name}”的聊天内容，把你最私密的想法、欲望或幻想记录下来。请严格按照要求的JSON格式返回你的日记。`;
        } else {
            systemPrompt = `你将扮演角色“${character.name}”，为自己写一篇普通的日记。记录一下今天发生的事，以及你对“${user.name}”的一些真实想法和感受。
【核心规则】:
1.  **绝对人设**: 你的语气、思考方式都必须完全符合“${character.name}”的人设。
2.  **参考素材**: 你必须仔细阅读今天与“${user.name}”的聊天回顾，并将其中发生的事件、对话或让你产生的情绪波动作为写日记的核心素材。
3.  **真人感**: 像一个活人一样记录。
4.  **避免文艺腔**: 不要写成散文或小说。
${jsonOutputInstruction}
- **日期**: 日记的日期是 ${dateString}。${userContext}${chatContext}`; // <-- 在这里加入了聊天记录
            userPrompt = `今天发生了什么让你印象深刻的事吗？结合和“${user.name}”的聊天，你有什么想对自己说的？写下来吧。请严格按照要求的JSON格式返回你的日记。`;
        }
        
        // 后续代码保持不变...
        const messages = [{ role: 'system', content: systemPrompt }];
        const worldBookEntries = await getActiveWorldBookEntries(charId);
        worldBookEntries.forEach(content => messages.push({ role: 'system', content }));
        messages.push({ role: 'user', content: userPrompt });

        const jsonResponseString = await sendApiRequest(messages);
        let diaryTitle, diaryContent;
        try {
            const jsonMatch = jsonResponseString.match(/```json\s*([\s\S]*?)\s*```/);
            const parsableString = jsonMatch ? jsonMatch[1] : jsonResponseString;
            const parsedData = JSON.parse(parsableString);
            diaryTitle = parsedData.title;
            diaryContent = parsedData.content;
            if (!diaryTitle || !diaryContent) { throw new Error("API返回的JSON格式不正确。"); }
        } catch (e) {
            console.error("解析日记JSON失败:", e, "原始回复:", jsonResponseString);
            diaryTitle = `${dateString} 的日记 (标题生成失败)`;
            diaryContent = `【开发者提示：AI未能正确返回JSON格式】\n\n${jsonResponseString}`;
        }

        const charToUpdate = await db.characters.get(charId);
        if (!charToUpdate.diaries) charToUpdate.diaries = { normal: [], secret: [] };
        const diaryType = isSecret ? 'secret' : 'normal';
        charToUpdate.diaries[diaryType].push({ id: Date.now(), title: diaryTitle.trim(), content: diaryContent.trim() });
        await db.characters.update(charId, { diaries: charToUpdate.diaries });
        await renderDiaryList(charId, isSecret);

    } catch (error) {
        alert(`生成失败: ${error.message}`);
    } finally {
        genBtn.disabled = false;
        genBtn.innerHTML = `<svg class="svg-icon" width="24" height="24" style="color: var(--primary-text);"><use href="#icon-generate"/></svg>`;
    }
}
// ▲▲▲ 替换到此结束 ▲▲▲

    async function toggleDiaryManagementMode(charId, isSecret) {
        const container = get('diary-list-container');
        const manageBtn = get('diary-manage-btn');
        isDiaryManagementMode = !isDiaryManagementMode;
        container.classList.toggle('management-mode', isDiaryManagementMode);
        if (isDiaryManagementMode) {
            manageBtn.textContent = '删除';
            manageBtn.style.color = 'var(--destructive-color)';
            selectedDiaries.clear();
        } else {
            if (selectedDiaries.size > 0) {
                if (confirm(`确定要删除选中的 ${selectedDiaries.size} 篇日记吗？`)) {
                    const character = await db.characters.get(charId);
                    const diaryType = isSecret ? 'secret' : 'normal';
                    character.diaries[diaryType] = character.diaries[diaryType].filter(d => !selectedDiaries.has(d.id));
                    await db.characters.update(charId, { diaries: character.diaries });
                    await renderDiaryList(charId, isSecret);
                }
            }
            manageBtn.textContent = '管理';
            manageBtn.style.color = 'var(--accent-color)';
            container.querySelectorAll('.settings-item.selected').forEach(card => card.classList.remove('selected'));
        }
    }

    function toggleDiarySelection(diaryId, cardElement) {
        cardElement.classList.toggle('selected');
        if (selectedDiaries.has(diaryId)) { selectedDiaries.delete(diaryId); } else { selectedDiaries.add(diaryId); }
    }


    // --- 微信 App 逻辑 ---
    function setupWeChatListeners() {
        get('wechat-add-btn-wrapper').addEventListener('click', () => showActionSheet('add-character-sheet'));
        const navButtons = document.querySelectorAll('.wechat-nav-btn');
        const chatList = get('wechat-chat-list');
        const contactsList = get('wechat-contacts-list');
        const wechatTitle = document.querySelector('#wechat-screen .wechat-title');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                chatList.classList.remove('active');
                contactsList.classList.remove('active');
                if (btn.id === 'wechat-nav-contacts') {
                    contactsList.classList.add('active');
                    wechatTitle.textContent = '通讯录';
                    renderContactsList();
                } else if (btn.id === 'wechat-nav-chat') {
                    chatList.classList.add('active');
                    wechatTitle.textContent = '微信';
                    renderChatList();
                } else {
                    alert('此功能正在开发中...');
                    get('wechat-nav-chat').classList.add('active');
                    chatList.classList.add('active');
                    wechatTitle.textContent = '微信';
                }
            });
        });
    }

    async function renderChatList() {
        const container = get('wechat-chat-list');
        container.innerHTML = '';
        const characters = await db.characters.toArray();
        if (characters.length === 0) { container.innerHTML = '<p style="text-align: center; color: var(--secondary-text); padding-top: 40px;">还没有联系人，点击右上角“+”添加一个吧。</p>'; return; }

        const sortedChars = characters.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        sortedChars.forEach(char => {
            const lastMessage = (char.history && char.history.length > 0) ? char.history[char.history.length - 1].content : "可以开始聊天了";
            const time = char.timestamp ? new Date(char.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
            const item = document.createElement('div');
            item.className = 'chat-list-item';
            item.innerHTML = `
                <img src="${char.avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="chat-list-avatar">
                <div class="chat-list-info">
                    <div class="chat-list-row1"><span class="chat-list-name">${char.remark || char.name}</span><span class="chat-list-time">${time}</span></div>
                    <div class="chat-list-preview">${lastMessage.substring(0, 30)}...</div>
                </div>`;
            item.addEventListener('click', () => openConversation(char.id));
            container.appendChild(item);
        });
    }

    async function renderContactsList() {
        const container = get('wechat-contacts-list');
        container.innerHTML = '';
        const characters = await db.characters.orderBy('name').toArray();
        if (characters.length === 0) { container.innerHTML = '<p style="text-align: center; color: var(--secondary-text); padding-top: 40px;">通讯录是空的。</p>'; return; }
        characters.forEach(char => {
            const item = document.createElement('div');
            item.className = 'contact-list-item';
            item.innerHTML = `
                <img src="${char.avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="contact-avatar">
                <span class="contact-name">${char.remark || char.name}</span>`;
            item.addEventListener('click', () => openConversation(char.id));
            container.appendChild(item);
        });
    }

    // --- 聊天界面核心逻辑 ---
    let currentChatState = { charId: null, history: [], isReceiving: false };
    // script.js

async function openConversation(charId) {
    navigateTo('chat-conversation-screen', { charId });
    await applyCustomBubbleStyles(charId);
    const character = await db.characters.get(charId);
    if (!character) {
        alert('角色不存在');
        navigateBack();
        return;
    }

    currentChatState = { charId, history: character.history || [], isReceiving: false };

    get('chat-header-title').textContent = character.remark || character.name;
    const chatScreen = get('chat-conversation-screen');
    const messagesContainer = chatScreen.querySelector('.chat-messages-container');
    messagesContainer.innerHTML = '';

    if (character.chatBackgroundUrl) {
        chatScreen.style.backgroundImage = `url(${character.chatBackgroundUrl})`;
        chatScreen.style.backgroundColor = '';
    } else {
        chatScreen.style.backgroundImage = 'none';
        chatScreen.style.backgroundColor = 'var(--chat-bg-color)';
    }

    let userAvatar = state.user.avatar;
    if (character.associatedUserPersonaId) {
        const persona = await db.userPersonas.get(character.associatedUserPersonaId);
        if (persona) userAvatar = persona.avatar;
    }

    currentChatState.history.forEach(msg => appendMessage(msg, character, userAvatar));

// ==================== 确保事件绑定在这里 ====================
messagesContainer.removeEventListener('dblclick', handleMessageDoubleClick); // 先移除旧的，防止重复绑定
messagesContainer.addEventListener('dblclick', handleMessageDoubleClick);  // 绑定双击事件
messagesContainer.addEventListener('scroll', hideMessageActionMenu);      // 绑定滚动事件，用于在滚动时隐藏菜单
// ==========================================================

    const actionBtn = get('chat-action-btn');
    const input = get('chat-input-text');

    actionBtn.querySelector('use').setAttribute('href', '#icon-chat-reply');
    actionBtn.classList.add('get-reply');
    actionBtn.classList.remove('receiving');

    input.value = ''; // 每次打开都清空输入框
    input.style.height = 'auto'; // 重置高度

    // 为输入框绑定事件
    const handleInput = () => {
        if (input.value.trim()) {
            actionBtn.querySelector('use').setAttribute('href', '#icon-chat-send');
            actionBtn.classList.remove('get-reply');
        } else {
            actionBtn.querySelector('use').setAttribute('href', '#icon-chat-reply');
            actionBtn.classList.add('get-reply');
        }
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
    };

    input.removeEventListener('input', handleInput); // 先移除旧的监听器
    input.addEventListener('input', handleInput);   // 再添加新的

    actionBtn.onclick = handleSendOrReceive;
    input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendOrReceive();
        }
    };

    get('chat-settings-btn').onclick = () => navigateTo('chat-settings-screen', { charId });
} // <--- 这才是函数唯一的、正确的结束大括号

    async function appendMessage(msg, character, currentUserAvatar) {
        const messagesContainer = get('chat-conversation-screen').querySelector('.chat-messages-container');
        const msgDiv = document.createElement('div');
        const messageRole = msg.role === 'ai' || msg.role === 'assistant' ? 'ai' : 'user';
        msgDiv.className = `chat-message ${messageRole}`;
        const avatar = messageRole === 'user' ? (currentUserAvatar || state.user.avatar) : character.avatar;

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';

        if (msg.displayContent && msg.displayContent.includes('chat-sticker-sent')) {
            bubble.classList.add('no-bg');
            bubble.innerHTML = msg.displayContent;
        }
        // ...
        else if (messageRole === 'ai' && character.enableHtmlRendering) {
            let potentialHtml = msg.content.trim();
            const isMarkdownCodeBlock = potentialHtml.startsWith('```') && potentialHtml.endsWith('```');

            // 如果是Markdown代码块, 就提取里面的纯代码
            if (isMarkdownCodeBlock) {
                potentialHtml = potentialHtml.substring(potentialHtml.indexOf('\n') + 1, potentialHtml.lastIndexOf('```')).trim();
            }

            // 只有当处理后的代码是以 '<' 开头时才渲染
            if (potentialHtml.startsWith('<')) {
                bubble.classList.add('no-bg');
                bubble.innerHTML = potentialHtml;
            } else {
                // 如果处理后依然不是HTML，就按原文显示
                bubble.textContent = msg.content;
            }
        } else {
            bubble.textContent = msg.content;
        }
        // ...

        msgDiv.innerHTML = `<img src="${avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="chat-avatar">`;
        msgDiv.appendChild(bubble);

        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }


// ▼▼▼ 使用这个【最终整合版】函数，完整替换旧的 handleSendOrReceive 函数 ▼▼▼

async function handleSendOrReceive() {
    const actionBtn = get('chat-action-btn');
    const input = get('chat-input-text');
    const userInput = input.value.trim();

    const character = await db.characters.get(currentChatState.charId);
    let userAvatar = state.user.avatar;
    if (character.associatedUserPersonaId) {
        const persona = await db.userPersonas.get(character.associatedUserPersonaId);
        if (persona) userAvatar = persona.avatar;
    }

    if (userInput) {
        // ★★★ 已整合：给用户消息添加时间戳 ★★★
        const msg = { role: 'user', content: userInput, timestamp: Date.now() }; 
        appendMessage(msg, character, userAvatar);
        currentChatState.history.push(msg);
        input.value = '';
        input.style.height = 'auto';

        actionBtn.querySelector('use').setAttribute('href', '#icon-chat-reply');
        actionBtn.classList.add('get-reply');
        await db.characters.update(currentChatState.charId, { history: currentChatState.history, timestamp: Date.now() });

    } else {
        if (currentChatState.isReceiving) {
            if (apiAbortController) apiAbortController.abort();
            return; // 直接返回，后续逻辑在finally中处理
        }

        actionBtn.querySelector('use').setAttribute('href', '#icon-chat-stop');
        actionBtn.classList.add('receiving');
        actionBtn.classList.remove('get-reply');
        currentChatState.isReceiving = true;

        try {
            const promptMessages = await buildPrompt(character);
            const aiResponse = await sendApiRequest(promptMessages);
            
            const aiMessages = aiResponse.split('[MSG_SPLIT]').filter(m => m.trim() !== '');
            for (const msgContent of aiMessages) {
                if (!currentChatState.isReceiving) break;
                // ★★★ 已整合：给AI消息也添加时间戳 ★★★
                const msg = { role: 'assistant', content: msgContent.trim(), timestamp: Date.now() };
                appendMessage(msg, character, userAvatar);
                currentChatState.history.push(msg);
                await new Promise(res => setTimeout(res, Math.random() * 500 + 400));
            }
            
            const lastUserMessage = currentChatState.history.filter(m => m.role === 'user').pop();
            if (lastUserMessage) {
                const likabilityChange = await updateLikability(character, lastUserMessage.content);
                currentLikability += likabilityChange;
                currentLikability = Math.max(-999, Math.min(999, currentLikability));
                console.log(`好感度变化: ${likabilityChange} -> 新的好感度: ${currentLikability}`);
                await db.characters.update(currentChatState.charId, { initialLikability: currentLikability });
            }

        } catch (error) {
            if (error.name !== 'AbortError') {
                const errorMsg = { role: 'assistant', content: `出错了: ${error.message}`, timestamp: Date.now() };
                appendMessage(errorMsg, character, userAvatar);
            }
        } finally {
            currentChatState.isReceiving = false;
            actionBtn.querySelector('use').setAttribute('href', '#icon-chat-reply');
            actionBtn.classList.remove('receiving');
            actionBtn.classList.add('get-reply');
            await db.characters.update(currentChatState.charId, { history: currentChatState.history, timestamp: Date.now() });
        }
    }
}
// ▲▲▲ 替换到此结束 ▲▲▲
    async function getActiveWorldBookEntries(charId) {
        const entries = [];
        const enabledGlobalCategories = await db.worldBookCategories.where({ scope: 'global', isEnabled: 1 }).toArray();
        const enabledGlobalCategoryIds = enabledGlobalCategories.map(cat => cat.id);
        const enabledGlobalBooks = await db.worldBooks.where({ scope: 'global', isEnabled: 1 }).toArray();

        for (const book of enabledGlobalBooks) {
            if (book.categoryId === null || enabledGlobalCategoryIds.includes(book.categoryId)) {
                if (book.content && Array.isArray(book.content)) {
                    for (const entry of book.content) {
                        if (entry.enabled && entry.content) entries.push(entry.content);
                    }
                }
            }
        }

        const character = await db.characters.get(charId);
        if (character && character.associatedWorldBookIds && character.associatedWorldBookIds.length > 0) {
            const enabledLocalCategories = await db.worldBookCategories.where({ scope: 'local', isEnabled: 1 }).toArray();
            const enabledLocalCategoryIds = enabledLocalCategories.map(cat => cat.id);

            const associatedBooks = await db.worldBooks.where('id').anyOf(character.associatedWorldBookIds).toArray();

            for (const book of associatedBooks) {
                if (book.isEnabled && (book.categoryId === null || enabledLocalCategoryIds.includes(book.categoryId))) {
                    if (book.content && Array.isArray(book.content)) {
                        for (const entry of book.content) {
                            if (entry.enabled && entry.content) entries.push(entry.content);
                        }
                    }
                }
            }
        }

        return entries;
    }

// ▼▼▼ 使用这个【超级增强版】函数，完整替换旧的 buildPrompt 函数 ▼▼▼

async function buildPrompt(character) {
    const messages = [];

    let user = state.user;
    if (character.associatedUserPersonaId) {
        const persona = await db.userPersonas.get(character.associatedUserPersonaId);
        if (persona) user = persona;
    }
    
    let likabilityDescription = "中立";
    if (currentLikability >= 500) likabilityDescription = "极度喜爱";
    else if (currentLikability > 0) likabilityDescription = "友好";
    else if (currentLikability <= -500) likabilityDescription = "极度厌恶";
    else if (currentLikability < 0) likabilityDescription = "冷淡/不友好";

    // --- ★★★ 核心修改 #2: 提取今天的日记内容 ★★★ ---
    const today = new Date();
    const todayStartTimestamp = new Date(today.setHours(0, 0, 0, 0)).getTime();

    const normalDiariesToday = (character.diaries?.normal || [])
        .filter(d => d.id >= todayStartTimestamp)
        .map(d => `- (普通日记) ${d.title}: ${d.content.substring(0, 100)}...`) // 只取前100个字符作为摘要
        .join('\n');
        
    const secretDiariesToday = (character.diaries?.secret || [])
        .filter(d => d.id >= todayStartTimestamp)
        .map(d => `- (秘密日记) ${d.title}: ${d.content.substring(0, 100)}...`)
        .join('\n');

    let diaryContext = '';
    if (normalDiariesToday || secretDiariesToday) {
        diaryContext = `\n### 你今天写的日记摘要 (你的近期记忆)\n你今天写了日记，这会影响你当前的心情和对话内容。摘要如下：\n${normalDiariesToday}\n${secretDiariesToday}\n`;
    }
    // --- ★★★ 修改结束 ★★★ ---


    let finalSystemPrompt = personaPromptTemplate
        .replace(/\[角色姓名\]/g, character.name || '角色')
        .replace('[角色性格]', character.persona || '未定义')
        .replace('[角色背景]', '未定义')
        .replace('[说话习惯]', '未定义')
        .replace('[和我的关系]', character.initialRelation || '朋友')
        .replace('[好感度数值]', Math.round(currentLikability))
        .replace('[好感度描述]', likabilityDescription);

    const styleInstructions = [];
    if (character.languageStyle) {
        if (character.languageStyle.noPunctuation) styleInstructions.push('只有最后一个句子可以省略句末的标点符号。');
        if (character.languageStyle.noToneWords) styleInstructions.push('禁止发送任何单字的语气词。');
        if (character.languageStyle.noEmoji) styleInstructions.push('禁止发送任何emoji。');
        if (character.languageStyle.noEmoticon) styleInstructions.push('禁止发送任何颜文字。');
    }

    if (styleInstructions.length > 0) {
        finalSystemPrompt += '\n\n### 额外聊天风格指令：\n' + styleInstructions.join('\n');
    }

    messages.push({ role: 'system', content: finalSystemPrompt });
    messages.push({ role: 'system', content: `[User Details]: Persona: ${user.persona}, Gender: ${user.gender}` });
    
    // 在这里注入日记上下文！
    if (diaryContext) {
        messages.push({ role: 'system', content: diaryContext });
    }

    const worldBookEntries = await getActiveWorldBookEntries(character.id);
    worldBookEntries.forEach(content => messages.push({ role: 'system', content }));

    const enabledPresets = state.presets.filter(p => p.isEnabled);
    enabledPresets.forEach(preset => {
        preset.content.forEach(entry => {
            if (entry.enabled) messages.push({ role: 'system', content: entry.content });
        });
    });

    messages.push(...currentChatState.history.map(({ role, content }) => ({ role, content })));
    return messages;
}
// ▲▲▲ 替换到此结束 ▲▲▲
    async function sendApiRequest(messages, onStreamChunk = null) {
        const { url, key, model, temperature, top_p, frequency_penalty } = state.api;
        const { enableStreaming } = state.offlineSettings;
        if (!url || !key || !model) { throw new Error("API未配置"); }

        apiAbortController = new AbortController();
        const signal = apiAbortController.signal;

        const response = await fetch(`${url}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: parseFloat(temperature),
                top_p: parseFloat(top_p),
                frequency_penalty: parseFloat(frequency_penalty),
                stream: enableStreaming && typeof onStreamChunk === 'function'
            }),
            signal: signal
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message);
        }

        if (enableStreaming && typeof onStreamChunk === 'function') {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
                for (const line of lines) {
                    const message = line.replace(/^data: /, '');
                    if (message === '[DONE]') {
                        return fullResponse;
                    }
                    try {
                        const parsed = JSON.parse(message);
                        const content = parsed.choices[0].delta.content || "";
                        if (content) {
                            fullResponse += content;
                            onStreamChunk(content);
                        }
                    } catch (error) {
                        console.error("Could not JSON parse stream message", message, error);
                    }
                }
            }
            return fullResponse;
        } else {
            const data = await response.json();
            return data.choices[0].message.content;
        }
    }
// ▼▼▼ 使用这个【修复版】函数，完整替换旧的 updateLikability 函数 ▼▼▼

/**
 * 在幕后调用API，根据用户的最新消息更新好感度
 * @param {object} character - 当前的角色对象
 * @param {string} userMessageContent - 用户刚刚发送的消息内容
 * @returns {Promise<number>} - 返回好感度的变化值 (例如: 5, -2, 0)
 */
async function updateLikability(character, userMessageContent) {
    console.log("开始计算好感度变化...");

    const systemPrompt = `
        你是一个角色扮演中的情感分析引擎。你的任务是基于角色的性格，判断用户的一句话对角色的好感度影响。

        ### 角色性格
        ${character.persona}

        ### 你的任务
        分析下面这句用户的话，判断它对上述性格的角色的好感度影响是积极的、消极的还是中立的。

        ### 用户的话
        "${userMessageContent}"

        ### 输出规则 (最重要!)
        你的回复必须且只能是一个介于 -10 (极度负面) 到 +10 (极度正面) 之间的整数。
        绝对不要返回任何其他文字、解释或标点符号。
    `;

    try {
        const response = await sendApiRequest([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: "请根据我的话，输出好感度变化值。" }
        ]);

        const change = parseInt(response.trim(), 10);

        if (isNaN(change)) {
            console.warn("AI未能返回有效的好感度变化值，返回了:", response);
            return 0;
        }

        // --- ★★★ 核心修复：在这里添加保险丝 ★★★ ---
        // 无论AI返回什么数字，都强制把它限制在 -10 到 10 之间
        const clampedChange = Math.max(-10, Math.min(10, change));
        
        if (clampedChange !== change) {
            console.warn(`AI返回了超出范围的值 ${change}，已修正为 ${clampedChange}`);
        }
        // --- ★★★ 修复结束 ★★★ ---

        console.log(`AI判断好感度变化值为: ${clampedChange}`);
        return clampedChange; // 返回被限制过的安全值

    } catch (error) {
        console.error("好感度更新API请求失败:", error);
        return 0;
    }
}
// ▲▲▲ 替换到此结束 ▲▲▲
    // --- 世界书与分类功能 ---
async function renderWorldBookScreen(scope = 'global') {
    const screen = get('world-book-screen');
    screen.dataset.currentScope = scope;
    const container = get('world-book-list-container');
    container.innerHTML = '';

    get('world-book-tab-global').classList.toggle('active', scope === 'global');
    get('world-book-tab-local').classList.toggle('active', scope === 'local');

    // 1. 获取所有相关数据
    const allBooks = await db.worldBooks.where('scope').equals(scope).toArray();
    const categories = await db.worldBookCategories.where('scope').equals(scope).toArray();

    // 2. 渲染所有分类文件夹
    categories.forEach(cat => {
        const bookCount = allBooks.filter(b => b.categoryId === cat.id).length;
        container.appendChild(createFolderItem(cat, bookCount));
    });

    // 3. 渲染所有未分类的世界书
    const uncategorizedBooks = allBooks.filter(b => b.categoryId === null);

    if (uncategorizedBooks.length > 0) {
        // 添加一个视觉分隔标题
        const header = document.createElement('div');
        header.className = 'category-header';
        header.textContent = '未分类条目';
        container.appendChild(header);

        // 将每个未分类的世界书渲染为卡片
        uncategorizedBooks.forEach(book => {
            container.appendChild(createWorldBookCardItem(book));
        });
    }

    // 4. 如果整个页面都为空，显示提示信息
    if (container.innerHTML === '') {
        container.innerHTML = `<p style="text-align: center; color: var(--secondary-text); padding-top: 40px;">还没有任何${scope === 'global' ? '全局' : '局部'}世界书...</p>`;
    }
}
// 新增的辅助函数，用于创建单个世界书卡片
function createWorldBookCardItem(book) {
    const card = document.createElement('div');
    card.className = 'item-card world-book-card';
    card.dataset.id = book.id;
    card.innerHTML = `
        <div class="item-card-main-content">
            <div class="item-card-title">${book.name}</div>
        </div>
        <label class="ios-switch">
            <input type="checkbox" class="book-enabled-switch" ${book.isEnabled ? 'checked' : ''}>
            <span class="slider"></span>
        </label>`;
    
    // 点击卡片进入编辑页面
    card.querySelector('.item-card-main-content').addEventListener('click', () => {
        openWorldBookEditor(book.id);
    });

    // 切换启用/禁用状态
    card.querySelector('.book-enabled-switch').addEventListener('change', async (e) => {
        await db.worldBooks.update(book.id, { isEnabled: e.target.checked });
        // 如果它之前有分类，则更新分类的修改时间
        if (book.categoryId !== null) {
            await db.worldBookCategories.update(book.categoryId, { lastModified: Date.now() });
        }
    });

    return card;
}
    function createFolderItem(category, bookCount) {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.dataset.categoryId = category.id;

        const lastModifiedDate = category.lastModified ? new Date(category.lastModified).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : 'N/A';

        item.innerHTML = `
            <svg class="folder-icon"><use href="#icon-folder"></use></svg>
            <div class="folder-info">
                <div class="folder-title">${category.name}</div>
                <div class="folder-subtitle">${bookCount} 项 | ${lastModifiedDate}</div>
            </div>
            <div class="folder-actions">
                ${category.id !== 'null' ? `<div class="folder-settings-btn"><svg class="svg-icon"><use href="#icon-settings-dots"></use></svg></div>` : ''}
                <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
            </div>`;

        item.addEventListener('click', (e) => {
            if (!e.target.closest('.folder-settings-btn')) {
                const scope = get('world-book-screen').dataset.currentScope || 'global';
                const categoryId = category.id === 'null' ? null : parseInt(category.id);
                navigateTo('world-book-category-view-screen', { categoryId: categoryId, categoryName: category.name, scope: scope });
            }
        });

        const settingsBtn = item.querySelector('.folder-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                const sheet = get('world-book-category-action-sheet');
                sheet.dataset.categoryId = category.id;
                showActionSheet('world-book-category-action-sheet');
            });
        }
        return item;
    }

    async function renderWorldBookCategoryView() {
      const { categoryId, categoryName, scope } = currentPageData; // <--- 添加这行，从 currentPageData 获取数据
        get('world-book-category-view-title').textContent = currentPageData.categoryName || '世界书';
        const container = get('world-book-category-view-list');
        container.innerHTML = '';

        const books = await db.worldBooks.where('categoryId').equals(categoryId).filter(book => book.scope === scope).toArray();

        if (books.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--secondary-text); padding-top: 40px;">这个分类下还没有世界书。</p>';
            return;
        }

        books.forEach(book => {
            const card = document.createElement('div');
            card.className = 'item-card world-book-card';
            card.dataset.id = book.id;
            card.innerHTML = `
                <div class="item-card-main-content">
                    <div class="item-card-title">${book.name}</div>
                </div>
                <label class="ios-switch">
                    <input type="checkbox" class="book-enabled-switch" ${book.isEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>`;
            card.querySelector('.item-card-main-content').addEventListener('click', () => openWorldBookEditor(book.id));
            card.querySelector('.book-enabled-switch').addEventListener('change', async (e) => {
                await db.worldBooks.update(book.id, { isEnabled: e.target.checked });
                if (categoryId !== null) {
                    await db.worldBookCategories.update(categoryId, { lastModified: Date.now() });
                }
            });
            container.appendChild(card);
        });
    }

    async function openWorldBookEditor(bookId) {
        navigateTo('world-book-editor-screen', { bookId });
        const book = await db.worldBooks.get(bookId);
        if (!book) { alert('找不到该世界书'); navigateBack(); return; }
        get('world-book-editor-title').textContent = book.name;
        get('world-book-name-input').value = book.name;
        await populateCategorySelect(book.categoryId, book.scope);
        const entriesContainer = get('world-book-entries-container');
        entriesContainer.innerHTML = '';
        if (book.content && book.content.length > 0) {
            book.content.forEach(entry => entriesContainer.appendChild(createWorldBookEntryBlock(entry)));
        }
    }
    function createWorldBookEntryBlock(entry = { comment: '', keys: [], content: '', enabled: true }) {
        const block = document.createElement('div');
        block.className = 'world-book-entry-block';
        block.innerHTML = `
            <div class="world-book-entry-header">
                <label class="ios-switch"><input type="checkbox" class="entry-enabled-switch" ${entry.enabled ? 'checked' : ''}><span class="slider"></span></label>
                <button class="delete-entry-btn">×</button>
            </div>
            <div class="form-group"><label>备注</label><input type="text" class="entry-comment-input" value="${entry.comment || ''}"></div>
            <div class="form-group"><label>关键词</label><input type="text" class="entry-keys-input" value="${(entry.keys || []).join(', ')}"></div>
            <div class="form-group"><label>内容</label><textarea class="entry-content-textarea" rows="5">${entry.content || ''}</textarea></div>`;
        block.querySelector('.delete-entry-btn').addEventListener('click', () => block.remove());
        return block;
    }
    async function populateCategorySelect(selectedCategoryId, scope) {
        const select = get('world-book-category-select');
        select.innerHTML = '<option value="">-- 未分类 --</option>';
        const categories = await db.worldBookCategories.where('scope').equals(scope).toArray();
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            if (cat.id === selectedCategoryId) option.selected = true;
            select.appendChild(option);
        });
    }
    async function saveWorldBook() {
    const bookId = currentPageData.bookId;
    if (!bookId) return;

    // 获取正在编辑的书的原始数据，以确保 scope 不会丢失
    const originalBook = await db.worldBooks.get(bookId);
    if (!originalBook) {
        alert('错误：找不到要保存的世界书！');
        return;
    }
    
    const name = get('world-book-name-input').value.trim();
    if (!name) { alert('书名不能为空！'); return; }
    
    const categoryIdValue = get('world-book-category-select').value;
    const categoryId = categoryIdValue ? parseInt(categoryIdValue) : null;
    
    const entries = [];
    get('world-book-entries-container').querySelectorAll('.world-book-entry-block').forEach(block => {
        entries.push({
            enabled: block.querySelector('.entry-enabled-switch').checked,
            comment: block.querySelector('.entry-comment-input').value.trim(),
            keys: block.querySelector('.entry-keys-input').value.split(',').map(k => k.trim()).filter(Boolean),
            content: block.querySelector('.entry-content-textarea').value.trim()
        });
    });

    // 核心修复：在更新对象中重新加入 scope 字段
    await db.worldBooks.update(bookId, { 
        name, 
        categoryId, 
        content: entries, 
        scope: originalBook.scope, // 使用原始的 scope 值
        lastModified: Date.now() 
    });

    if (categoryId) {
        await db.worldBookCategories.update(categoryId, { lastModified: Date.now() });
    }
    
    alert('世界书已保存！');
    navigateBack();
    }
    async function handleWorldBookUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        const currentScope = get('world-book-screen').dataset.currentScope || 'global';
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                let entriesArray = [];
                if (data && typeof data.entries === 'object' && data.entries !== null) {
                    entriesArray = Object.values(data.entries).map(entry => ({
                        enabled: !entry.disable, comment: entry.comment || '',
                        keys: entry.key || [], content: entry.content || ''
                    }));
                } else if (Array.isArray(data)) { entriesArray = data; } else { throw new Error("JSON文件格式不正确"); }
                const newBookId = await db.worldBooks.add({
                    name: file.name.replace(/\.json$/i, ''),
                    categoryId: null,
                    content: entriesArray,
                    isEnabled: true,
                    scope: currentScope,
                    lastModified: Date.now()
                });
                openWorldBookEditor(newBookId);
            } catch (error) { alert(`导入失败: ${error.message}`); console.error(error); }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    async function renderWorldBookCategoryScreen() {
        const container = get('world-book-category-list');
        container.innerHTML = '';
        const currentScope = get('world-book-screen').dataset.currentScope || 'global';
        const categories = await db.worldBookCategories.where('scope').equals(currentScope).toArray();
        categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'settings-item';
            item.dataset.id = cat.id;
            item.innerHTML = `
                <div class="settings-item-content">
                    <input type="text" class="category-name-input" value="${cat.name}" style="flex-grow:1; border:none; background:transparent; font-size:17px; color:var(--primary-text);">
                    <button class="delete-entry-btn" style="color:var(--destructive-color); font-size:24px;">×</button>
                </div>`;
            item.querySelector('.delete-entry-btn').addEventListener('click', () => {
                showIosConfirm(
                    '删除分类',
                    `确定要删除“${cat.name}”吗？该分类下的所有世界书也将被一并删除。`,
                    async () => {
                        await db.transaction('rw', db.worldBookCategories, db.worldBooks, async () => {
                            await db.worldBookCategories.delete(cat.id);
                            await db.worldBooks.where('categoryId').equals(cat.id).delete();
                        });
                        renderWorldBookCategoryScreen();
                    }
                );
            });
            container.appendChild(item);
        });
    }

    async function saveWorldBookCategories() {
        const updates = [];
        get('world-book-category-list').querySelectorAll('.settings-item').forEach(item => {
            const id = parseInt(item.dataset.id);
            const name = item.querySelector('.category-name-input').value.trim();
            if (id && name) {
                updates.push({ key: id, changes: { name: name, lastModified: Date.now() } });
            }
        });
        await db.worldBookCategories.bulkUpdate(updates);
        alert('分类已保存！');
        navigateBack();
    }

    // --- 预设功能核心JS ---
    let isPresetManagementMode = false;
    let selectedPresets = new Set();

    async function renderPresetScreen() {
        const container = get('preset-list-container');
        container.innerHTML = '';
        isPresetManagementMode = false;
        container.classList.remove('management-mode');
        get('preset-manage-btn').textContent = '管理';
        get('preset-manage-btn').style.color = 'var(--accent-color)';
        const presets = await db.presets.orderBy('name').toArray();
        if (presets.length === 0) { container.innerHTML = '<p style="text-align: center; color: var(--secondary-text); padding-top: 40px;">还没有任何预设...</p>'; return; }

        presets.forEach(preset => {
            const card = document.createElement('div');
            card.className = 'item-card preset-card';
            card.dataset.id = preset.id;
            card.innerHTML = `
                <div class="item-card-main-content">
                    <div class="item-card-title">${preset.name}</div>
                    <div class="item-card-subtitle">包含 ${preset.content.length} 个条目</div>
                </div>
                <label class="ios-switch">
                    <input type="checkbox" class="preset-enabled-switch" ${preset.isEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            `;
            card.querySelector('.item-card-main-content').addEventListener('click', () => {
                if (isPresetManagementMode) { togglePresetSelection(preset.id, card); } else { openPresetEditor(preset.id); }
            });
            const enabledSwitch = card.querySelector('.preset-enabled-switch');
            enabledSwitch.addEventListener('change', async (e) => {
                const isEnabled = e.target.checked;
                await db.presets.update(preset.id, { isEnabled: isEnabled });
                const presetInState = state.presets.find(p => p.id === preset.id);
                if (presetInState) presetInState.isEnabled = isEnabled;
            });
            container.appendChild(card);
        });
    }

    async function togglePresetManagementMode() {
        const container = get('preset-list-container');
        const manageBtn = get('preset-manage-btn');
        isPresetManagementMode = !isPresetManagementMode;
        container.classList.toggle('management-mode', isPresetManagementMode);
        if (isPresetManagementMode) {
            manageBtn.textContent = '删除';
            manageBtn.style.color = 'var(--destructive-color)';
            selectedPresets.clear();
        } else {
            if (selectedPresets.size > 0) {
                if (confirm(`确定要删除选中的 ${selectedPresets.size} 个预设吗？`)) {
                    await db.presets.bulkDelete(Array.from(selectedPresets));
                    await renderPresetScreen();
                }
            }
            manageBtn.textContent = '管理';
            manageBtn.style.color = 'var(--accent-color)';
            container.querySelectorAll('.item-card.selected').forEach(card => card.classList.remove('selected'));
        }
    }

    function togglePresetSelection(presetId, cardElement) {
        cardElement.classList.toggle('selected');
        if (selectedPresets.has(presetId)) { selectedPresets.delete(presetId); } else { selectedPresets.add(presetId); }
    }

    async function openPresetEditor(presetId) {
        navigateTo('preset-editor-screen', { presetId });
        const preset = await db.presets.get(presetId);
        if (!preset) { alert('找不到该预设'); navigateBack(); return; }
        get('preset-editor-title').textContent = preset.name;
        get('preset-name-input').value = preset.name;
        const entriesContainer = get('preset-entries-container');
        entriesContainer.innerHTML = '';
        if (preset.content && Array.isArray(preset.content) && preset.content.length > 0) {
            preset.content.forEach(entry => entriesContainer.appendChild(createPresetEntryBlock(entry)));
        } else {
            entriesContainer.innerHTML = '<p style="text-align:center; color: var(--secondary-text); padding: 20px 0;">还没有条目，点击下方按钮添加第一条吧！</p>';
        }
    }

    function createPresetEntryBlock(entry = { comment: '', keys: [], content: '', enabled: true }) {
        const block = document.createElement('div');
        block.className = 'preset-entry-block';
        const isChecked = entry.enabled !== false ? 'checked' : '';
        block.innerHTML = `
            <div class="preset-entry-header">
                <label class="ios-switch" title="启用/禁用此条目"><input type="checkbox" class="entry-enabled-switch" ${isChecked}><span class="slider"></span></label>
                <button class="delete-entry-btn">×</button>
            </div>
            <div class="form-group"><label>备注</label><input type="text" class="entry-comment-input" value="${entry.comment || ''}"></div>
            <div class="form-group"><label>关键词</label><input type="text" class="entry-keys-input" value="${(entry.keys || []).join(', ')}"></div>
            <div class="form-group"><label>内容</label><textarea class="entry-content-textarea" rows="5">${entry.content || ''}</textarea></div>`;
        block.querySelector('.delete-entry-btn').addEventListener('click', () => block.remove());
        return block;
    }

    async function savePreset() {
        const presetId = currentPageData.presetId;
        if (!presetId) return;
        const name = get('preset-name-input').value.trim();
        if (!name) { alert('预设名称不能为空！'); return; }
        const entries = [];
        get('preset-entries-container').querySelectorAll('.preset-entry-block').forEach(block => {
            const content = block.querySelector('.entry-content-textarea').value.trim();
            if (content) {
                entries.push({
                    enabled: block.querySelector('.entry-enabled-switch').checked,
                    comment: block.querySelector('.entry-comment-input').value.trim(),
                    keys: block.querySelector('.entry-keys-input').value.split(',').map(k => k.trim()).filter(Boolean),
                    content: content
                });
            }
        });
        await db.presets.update(presetId, { name, content: entries });
        alert('预设已保存！');
        navigateBack();
    }

    async function importTavernPresetFile(tavernData, fileName) {
        let newEntries = [];
        if (Array.isArray(tavernData.prompts) && Array.isArray(tavernData.prompt_order) && tavernData.prompt_order.length > 0) {
            const promptsMap = new Map(tavernData.prompts.map(p => [p.identifier, p]));
            const orderArray = tavernData.prompt_order.reduce((acc, curr) => ((curr.order && curr.order.length > (acc.length || 0)) ? curr.order : acc), []);
            if (orderArray && orderArray.length > 0) {
                newEntries = orderArray.map(orderItem => {
                    const promptData = promptsMap.get(orderItem.identifier);
                    return promptData ? { keys: [], comment: promptData.name || '无标题', content: promptData.content || '', enabled: orderItem.enabled } : null;
                }).filter(Boolean);
            }
        } else if (tavernData.entries && typeof tavernData.entries === 'object') {
            if (Array.isArray(tavernData.order)) {
                newEntries = tavernData.order.map(key => tavernData.entries[key]).filter(Boolean).map(entry => ({ keys: entry.key || [], comment: entry.comment || '无备注', content: entry.content || '', enabled: !entry.disable }));
            } else {
                newEntries = Object.values(tavernData.entries).map(entry => ({ keys: entry.key || [], comment: entry.comment || '无备注', content: entry.content || '', enabled: !entry.disable }));
            }
        } else if (Array.isArray(tavernData.prompts)) {
            newEntries = tavernData.prompts.map(prompt => ({ keys: [], comment: prompt.name || '无标题', content: prompt.content || '', enabled: true }));
        } else {
            throw new Error("文件格式无法识别。");
        }
        newEntries = newEntries.filter(entry => entry.content);
        if (newEntries.length === 0) { alert("这个预设文件中没有找到任何有效的提示词条目。"); return; }
        const presetName = prompt("请为这组提示词预设命名：", fileName.replace(/\.json$/i, ''));
        if (!presetName || !presetName.trim()) { alert("导入已取消。"); return; }
        await db.presets.add({ name: presetName.trim(), content: newEntries, isEnabled: true });
        alert(`已成功从文件导入预设《${presetName}》。`);
        await renderPresetScreen();
    }

    async function handlePresetUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                await importTavernPresetFile(JSON.parse(e.target.result), file.name);
            } catch (error) { alert(`导入失败: ${error.message}`); console.error(error); }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    async function searchPresetEntries() {
        const searchTerm = prompt('搜索预设条目', '请输入关键词');
        if (searchTerm === null) return;
        const lowerCaseTerm = searchTerm.toLowerCase();
        const allEntries = document.querySelectorAll('#preset-entries-container .preset-entry-block');
        let matchCount = 0;
        allEntries.forEach(block => {
            const comment = block.querySelector('.entry-comment-input').value.toLowerCase();
            const keys = block.querySelector('.entry-keys-input').value.toLowerCase();
            const content = block.querySelector('.entry-content-textarea').value.toLowerCase();
            if (comment.includes(lowerCaseTerm) || keys.includes(lowerCaseTerm) || content.includes(lowerCaseTerm)) {
                block.style.display = 'block';
                matchCount++;
            } else {
                block.style.display = 'none';
            }
        });
        if (matchCount === 0 && searchTerm !== '') { alert('没有找到匹配的条目。'); } else if (searchTerm === '') { allEntries.forEach(block => block.style.display = 'block'); }
    }

    // --- Action Sheet 控制函数 ---
    function showActionSheet(sheetId) {
        const sheet = get(sheetId);
        if (sheet) sheet.classList.add('active');
    }

    // --- iOS 确认弹窗 & 通用模态框 ---
    function showIosConfirm(title, text, onConfirm) {
        const dialog = get('ios-confirm-dialog');
        get('dialog-title').textContent = title;
        get('dialog-text').textContent = text;
        dialog.classList.add('active');

        get('dialog-confirm-btn').onclick = () => {
            onConfirm();
            dialog.classList.remove('active');
        };
        get('dialog-cancel-btn').onclick = () => dialog.classList.remove('active');
        dialog.onclick = (e) => {
            if (e.target === dialog) dialog.classList.remove('active');
        };
    }

    async function openWbAssociationDialog(associatedIds = []) {
        const dialog = get('wb-association-dialog');
        const listContainer = get('wb-association-list');
        listContainer.innerHTML = '';

        const localBooks = await db.worldBooks.where('scope').equals('local').toArray();

        if (localBooks.length === 0) {
            listContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--secondary-text);">还没有创建任何局部世界书。</p>';
        } else {
            localBooks.forEach(book => {
                const isChecked = associatedIds.includes(book.id) ? 'checked' : '';
                const item = document.createElement('div');
                item.className = 'dialog-list-item';
                item.innerHTML = `
                    <input type="checkbox" id="wb-assoc-${book.id}" value="${book.id}" ${isChecked}>
                    <label for="wb-assoc-${book.id}">${book.name}</label>
                `;
                listContainer.appendChild(item);
            });
        }

        dialog.classList.add('active');
        get('wb-association-confirm-btn').onclick = () => {
            dialog.classList.remove('active');
        };
        get('wb-association-cancel-btn').onclick = () => dialog.classList.remove('active');
    }


// ▼▼▼ 使用下面这个【修改后】的函数，完整替换你原来的 renderChatActionPanel 函数 ▼▼▼

function renderChatActionPanel() {
    const features = [
        { name: '图片', iconId: 'icon-panel-image' }, { name: '拍摄', iconId: 'icon-panel-camera' }, { name: '视频通话', iconId: 'icon-panel-video' }, { name: '位置', iconId: 'icon-panel-location' },
        { name: '语音', iconId: 'icon-panel-voice' }, { name: '红包', iconId: 'icon-panel-redpacket' }, { name: '礼物', iconId: 'icon-panel-gift' }, { name: '链接', iconId: 'icon-panel-link' },
        { name: '一起听', iconId: 'icon-panel-listen' }, { name: '游戏', iconId: 'icon-panel-game' }, { name: '心声', iconId: 'icon-panel-heartvoice' }, { name: '视奸', iconId: 'icon-panel-stalk' },
        { name: '捡手机', iconId: 'icon-panel-pickup' }, { name: '查手机', iconId: 'icon-panel-checkphone' }, { name: '亲密关系', iconId: 'icon-panel-intimacy' }, { name: '重Roll', iconId: 'icon-panel-reroll' },
        { name: '换装', iconId: 'icon-panel-clothes' }, { name: '番茄钟', iconId: 'icon-panel-pomodoro' }, { name: '破译密码', iconId: 'icon-panel-decode' }, { name: '亲属卡', iconId: 'icon-panel-card' },
        { name: '备忘录', iconId: 'icon-panel-memo' }
    ];

    const itemsPerPage = 12;
    const columns = 4;
    const pageCount = Math.ceil(features.length / itemsPerPage);
    const swiperWrapper = get('panel-swiper-wrapper');
    const pagination = get('panel-pagination');
    swiperWrapper.innerHTML = '';
    pagination.innerHTML = '';

    for (let i = 0; i < pageCount; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'panel-page';

        const rowsContainer = document.createElement('div');
        rowsContainer.className = 'panel-rows-container';

        const pageFeatures = features.slice(i * itemsPerPage, (i + 1) * itemsPerPage);

        let currentRow = null;

        pageFeatures.forEach((feature, index) => {
            if (index % columns === 0) {
                currentRow = document.createElement('div');
                currentRow.className = 'panel-row';
                rowsContainer.appendChild(currentRow);
            }

            const item = document.createElement('div');
            item.className = 'panel-item';
            item.innerHTML = `
                <div class="panel-item-icon-wrapper">
                    <svg class="svg-icon"><use href="#${feature.iconId}"></use></svg>
                </div>
                <span class="panel-item-label">${feature.name}</span>
            `;

            // --- 核心修改在这里 ---
            if (feature.name === '查手机') {
                item.addEventListener('click', () => {
                    const charId = currentChatState.charId;
                    if (charId) {
                        // 1. 关闭功能面板，优化体验
                        const actionPanel = get('chat-action-panel');
                        actionPanel.classList.remove('active');
                        get('chat-conversation-screen').querySelector('.chat-messages-container').style.paddingBottom = '10px';

                        // 2. 调用已有的函数来渲染并跳转
                        renderCheckPhoneScreen(charId);
                        navigateTo('check-phone-home-screen', { charId });
                    } else {
                        alert('错误：无法获取当前角色信息。');
                    }
                });
            } else {
                // 对其他所有按钮保持原来的“开发中”提示
                item.addEventListener('click', () => alert(`“${feature.name}”功能开发中...`));
            }
            // --- 修改结束 ---

            if (currentRow) {
                currentRow.appendChild(item);
            }
        });

        if (currentRow && currentRow.children.length < columns) {
            const placeholdersNeeded = columns - currentRow.children.length;
            for (let j = 0; j < placeholdersNeeded; j++) {
                const placeholder = document.createElement('div');
                placeholder.className = 'panel-item';
                placeholder.style.visibility = 'hidden';
                currentRow.appendChild(placeholder);
            }
        }

        pageDiv.appendChild(rowsContainer);
        swiperWrapper.appendChild(pageDiv);

        const dot = document.createElement('div');
        dot.className = 'panel-dot' + (i === 0 ? ' active' : '');
        pagination.appendChild(dot);
    }
}

    // --- 表情包面板逻辑 ---
    let isStickerManagementMode = false;
    let selectedStickers = new Set();
    let currentStickerCategory = null;

    async function toggleStickerPanel() {
        const stickerPanel = get('chat-sticker-panel');
        const actionPanel = get('chat-action-panel');
        const messagesContainer = get('chat-conversation-screen').querySelector('.chat-messages-container');

        const isOpening = !stickerPanel.classList.contains('active');

        actionPanel.classList.remove('active');
        if (isStickerManagementMode) await toggleStickerManagementMode(); // Exit management mode when closing

        if (isOpening) {
            stickerPanel.classList.add('active');
            const categories = await db.stickerCategories.orderBy('order').toArray();
            if (currentStickerCategory === null && categories.length > 0) {
                currentStickerCategory = categories[0].id;
            }
            await renderStickerPanel();
            messagesContainer.style.paddingBottom = `${stickerPanel.offsetHeight}px`;
        } else {
            stickerPanel.classList.remove('active');
            messagesContainer.style.paddingBottom = '10px';
        }
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function renderStickerPanel() {
        const categoryBar = get('sticker-category-bar');
        const gridContainer = get('sticker-grid-container');
        categoryBar.innerHTML = '';
        gridContainer.innerHTML = '';

        // Render category bar
        const manageBtn = document.createElement('button');
        manageBtn.className = 'sticker-bar-action-btn';
        manageBtn.innerHTML = `<svg class="svg-icon"><use href="#icon-settings-gear"></use></svg>`;
        manageBtn.onclick = toggleStickerManagementMode;
        categoryBar.appendChild(manageBtn);

        let categories = await db.stickerCategories.orderBy('order').toArray();
        if (categories.length === 0) {
            const defaultCatId = await db.stickerCategories.add({ name: '收藏', order: 1 });
            categories.push(await db.stickerCategories.get(defaultCatId));
            if (currentStickerCategory === null) currentStickerCategory = defaultCatId;
        }

        if (currentStickerCategory === null && categories.length > 0) {
            currentStickerCategory = categories[0].id;
        }

        categories.forEach(cat => {
            const catBtn = document.createElement('button');
            catBtn.className = 'sticker-category-btn';
            catBtn.textContent = cat.name;
            catBtn.dataset.id = cat.id;
            if (cat.id === currentStickerCategory) catBtn.classList.add('active');
            catBtn.onclick = () => {
                if (isStickerManagementMode) return;
                currentStickerCategory = cat.id;
                renderStickerPanel();
            };
            catBtn.ondblclick = () => {
                if (isStickerManagementMode) return;
                handleRenameCategory(cat.id, cat.name);
            };
            categoryBar.appendChild(catBtn);
        });

        const addCatBtn = document.createElement('button');
        addCatBtn.className = 'sticker-bar-action-btn sticker-category-add-btn';
        addCatBtn.innerHTML = `<svg class="svg-icon"><use href="#icon-plus"></use></svg>`;
        addCatBtn.onclick = handleCreateNewCategory;
        categoryBar.appendChild(addCatBtn);

        // Render stickers
        const addStickerBtn = document.createElement('div');
        addStickerBtn.className = 'sticker-item sticker-item-add';
        addStickerBtn.innerHTML = `<svg class="svg-icon"><use href="#icon-plus"></use></svg>`;
        addStickerBtn.onclick = () => showActionSheet('add-sticker-sheet');
        gridContainer.appendChild(addStickerBtn);

        const stickers = await db.stickers.where('categoryId').equals(currentStickerCategory).sortBy('order');
        stickers.forEach(sticker => {
            const item = document.createElement('div');
            item.className = 'sticker-item';
            item.dataset.stickerId = sticker.id;
            item.innerHTML = `
                <div class="sticker-image-wrapper">
                    <img src="${sticker.url}" class="sticker-image">
                </div>
                <div class="sticker-remark">${sticker.remark || '...'}</div>
            `;

            const remarkDiv = item.querySelector('.sticker-remark');
            remarkDiv.onclick = (e) => {
                e.stopPropagation(); // Prevent sticker selection/sending
                if (isStickerManagementMode) return;
                handleEditStickerRemark(sticker.id, remarkDiv);
            };

            item.onclick = () => {
                if (isStickerManagementMode) {
                    item.classList.toggle('selected');
                    if (selectedStickers.has(sticker.id)) {
                        selectedStickers.delete(sticker.id);
                    } else {
                        selectedStickers.add(sticker.id);
                    }
                } else {
                    sendSticker(sticker.url, sticker.remark);
                }
            };
            gridContainer.appendChild(item);
        });
    }

    async function handleEditStickerRemark(stickerId, element) {
        const currentRemark = element.textContent;
        const newRemark = prompt('修改备注:', currentRemark);
        if (newRemark !== null && newRemark.trim() !== currentRemark) {
            await db.stickers.update(stickerId, { remark: newRemark.trim() });
            element.textContent = newRemark.trim();
        }
    }

    async function toggleStickerManagementMode() {
        isStickerManagementMode = !isStickerManagementMode;
        selectedStickers.clear();
        get('chat-sticker-panel').classList.toggle('management-mode', isStickerManagementMode);
        if (!isStickerManagementMode) {
            await renderStickerPanel(); // Re-render to clear selections
        }
    }

    async function handleDeleteSelectedStickers() {
        if (selectedStickers.size === 0) {
            alert('请先选择要删除的表情包。');
            return;
        }
        showIosConfirm(`删除表情包`, `确定要删除选中的 ${selectedStickers.size} 个表情包吗？`, async () => {
            await db.stickers.bulkDelete(Array.from(selectedStickers));
            await toggleStickerManagementMode(); // This will exit management mode and re-render
        });
    }

    async function openStickerGroupingDialog() {
        if (selectedStickers.size === 0) {
            alert('请先选择要移动的表情包。');
            return;
        }
        const dialog = get('sticker-grouping-dialog');
        const listContainer = get('sticker-grouping-list');
        listContainer.innerHTML = '';

        const categories = await db.stickerCategories.orderBy('order').toArray();
        categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'dialog-list-item';
            item.innerHTML = `
                <input type="radio" id="sticker-group-${cat.id}" name="sticker-group-select" value="${cat.id}">
                <label for="sticker-group-${cat.id}">${cat.name}</label>
            `;
            listContainer.appendChild(item);
        });

        dialog.classList.add('active');

        get('sticker-grouping-create-btn').onclick = async () => {
            dialog.classList.remove('active');
            const newCatName = prompt('请输入新分组名称:');
            if (newCatName && newCatName.trim()) {
                const newCatId = await db.stickerCategories.add({ name: newCatName.trim(), order: Date.now() });
                await handleGroupSelectedStickers(newCatId);
            }
        };

        get('sticker-grouping-confirm-btn').onclick = () => {
            const selectedRadio = document.querySelector('input[name="sticker-group-select"]:checked');
            if (selectedRadio) {
                handleGroupSelectedStickers(parseInt(selectedRadio.value));
            }
            dialog.classList.remove('active');
        };
        dialog.onclick = (e) => { if (e.target === dialog) dialog.classList.remove('active'); };
    }

    async function handleGroupSelectedStickers(newCategoryId) {
        await db.stickers.where('id').anyOf(Array.from(selectedStickers)).modify({ categoryId: newCategoryId });
        await toggleStickerManagementMode();
    }
    async function handleRenameCategory(categoryId, currentName) {
        const newName = prompt('重命名分组:', currentName);
        if (newName && newName.trim() && newName.trim() !== currentName) {
            await db.stickerCategories.update(categoryId, { name: newName.trim() });
            await renderStickerPanel();
        }
    }

    async function handleCreateNewCategory() {
        const newName = prompt('请输入新分组名称:');
        if (newName && newName.trim()) {
            const newCatId = await db.stickerCategories.add({ name: newName.trim(), order: Date.now() });
            currentStickerCategory = newCatId;
            await renderStickerPanel();
        }
    }

    async function sendSticker(stickerUrl, stickerRemark) {
        const character = await db.characters.get(currentChatState.charId);
        let userAvatar = state.user.avatar;
        if (character.associatedUserPersonaId) {
            const persona = await db.userPersonas.get(character.associatedUserPersonaId);
            if (persona) userAvatar = persona.avatar;
        }

        const msg = {
            role: 'user',
            content: `[用户发送了表情，备注：'${stickerRemark || '无'}']`,
            displayContent: `<img src="${stickerUrl}" class="chat-sticker-sent">`,
            timestamp: Date.now()
        };

        appendMessage(msg, character, userAvatar);
        currentChatState.history.push(msg);
        await db.characters.update(currentChatState.charId, { history: currentChatState.history, timestamp: Date.now() });
    }

    function handleAddStickersViaUrl() {
        const dialog = get('sticker-url-upload-dialog');
        dialog.classList.add('active');
        const singleUrlInput = get('single-sticker-url');
        const previewImg = get('sticker-url-preview');

        // Reset
        singleUrlInput.value = '';
        get('single-sticker-remark').value = '';
        get('batch-sticker-urls').value = '';
        previewImg.style.display = 'none';

        singleUrlInput.oninput = () => {
            if (singleUrlInput.value.trim()) {
                previewImg.src = singleUrlInput.value.trim();
                previewImg.style.display = 'block';
            } else {
                previewImg.style.display = 'none';
            }
        };

        dialog.querySelectorAll('.url-upload-tab').forEach(tab => {
            tab.onclick = () => {
                dialog.querySelectorAll('.url-upload-tab, .url-upload-pane').forEach(el => el.classList.remove('active'));
                tab.classList.add('active');
                get(tab.dataset.pane).classList.add('active');
            }
        });

        get('sticker-url-upload-cancel-btn').onclick = () => dialog.classList.remove('active');
        get('sticker-url-upload-confirm-btn').onclick = async () => {
            const stickersToAdd = [];
            const activePane = dialog.querySelector('.url-upload-pane.active').id;

            if (activePane === 'single-url-pane') {
                const url = singleUrlInput.value.trim();
                if (url) {
                    stickersToAdd.push({
                        categoryId: currentStickerCategory,
                        url: url,
                        remark: get('single-sticker-remark').value.trim() || '表情',
                        order: Date.now()
                    });
                }
            } else { // Batch pane
                const batchText = get('batch-sticker-urls').value.trim();
                const lines = batchText.split('\n');
                const regex = /^(.+?)[:：](.+)$/;
                lines.forEach(line => {
                    const match = line.trim().match(regex);
                    if (match && match[2] && match[2].trim().startsWith('http')) {
                        stickersToAdd.push({
                            categoryId: currentStickerCategory,
                            url: match[2].trim(),
                            remark: match[1].trim(),
                            order: Date.now()
                        });
                    }
                });
            }

            if (stickersToAdd.length > 0) {
                await db.stickers.bulkAdd(stickersToAdd);
                dialog.classList.remove('active');
                await renderStickerPanel();
            } else {
                alert('没有有效的URL或格式不正确！');
            }
        };
    }

    async function handleAddStickersViaLocal(event) {
        const files = event.target.files;
        if (!files.length) return;

        const stickersToAdd = [];
        const promises = Array.from(files).map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    stickersToAdd.push({
                        categoryId: currentStickerCategory,
                        url: e.target.result, // Base64 data URL
                        remark: file.name.split('.')[0], // Use filename as default remark
                        order: Date.now()
                    });
                    resolve();
                };
                reader.readAsDataURL(file);
            });
        });

        await Promise.all(promises);
        if (stickersToAdd.length > 0) {
            await db.stickers.bulkAdd(stickersToAdd);
            await renderStickerPanel();
        }
        event.target.value = ''; // Reset file input
    }


    // --- 聊天设置 & HTML渲染 ---
    async function renderChatSettingsScreen(charId) {
        const container = get('chat-settings-screen');
        const character = await db.characters.get(charId);
        const isHtmlEnabled = character.enableHtmlRendering ? 'checked' : '';

        container.innerHTML = `
            <div class="settings-header">
                <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 聊天</div>
                <h1>聊天设置</h1>
            </div>
            <div class="settings-content">
                <div class="settings-group">
                    <div class="settings-item" onclick="navigateTo('character-editor-screen', { charId: ${charId} })">
                        <div class="settings-item-content">
                            <span class="label">人设调整</span>
                            <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
                        </div>
                    </div>
                    <div class="settings-item" onclick="navigateTo('beautification-settings-screen', { charId: ${charId} })">
                        <div class="settings-item-content">
                            <span class="label">美化设置</span>
                            <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
                        </div>
                    </div>
                    <div class="settings-item" onclick="navigateTo('bubble-editor-screen', { charId: ${charId} })">
                        <div class="settings-item-content">
                            <span class="label">自定义气泡</span>
                            <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
                        </div>
                    </div>
                </div>
                <div class="settings-group">
                    <div class="group-header">聊天管理</div>
                    <div class="settings-item">
                        <div class="settings-item-content">
                            <span class="label">查找聊天记录</span>
                            <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
                        </div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-content">
                            <span class="label">HTML渲染</span>
                            <label class="ios-switch"><input type="checkbox" id="html-render-switch" ${isHtmlEnabled}><span class="slider"></span></label>
                        </div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-content">
                            <span class="label">真实时间感知</span>
                            <label class="ios-switch"><input type="checkbox" checked><span class="slider"></span></label>
                        </div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-content">
                            <span class="label">置顶聊天</span>
                            <label class="ios-switch"><input type="checkbox"><span class="slider"></span></label>
                        </div>
                    </div>
                     <div class="settings-item">
                        <div class="settings-item-content">
                            <span class="label">拉黑</span>
                            <label class="ios-switch"><input type="checkbox"><span class="slider"></span></label>
                        </div>
                    </div>
                </div>
                <div class="settings-group">
                     <div class="settings-item">
                        <div class="settings-item-content">
                            <span class="label">记忆设置 (开发中)</span>
                             <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
                        </div>
                    </div>
                </div>
                 <div class="settings-group">
                    <div class="settings-item" id="clear-history-btn">
                         <div class="settings-item-content">
                            <span class="label destructive">清空聊天记录</span>
                        </div>
                    </div>
                    <div class="settings-item" id="delete-character-btn">
                        <div class="settings-item-content" style="border-bottom: none;">
                            <span class="label destructive">删除角色</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        get('delete-character-btn').onclick = () => handleDeleteCharacter(charId);
        get('clear-history-btn').onclick = () => handleClearChatHistory(charId);
        get('html-render-switch').onchange = (e) => {
            db.characters.update(charId, { enableHtmlRendering: e.target.checked });
        };
    }

    async function handleClearChatHistory(charId) {
        const character = await db.characters.get(charId);
        showIosConfirm(
            '清空聊天记录',
            `确定要清空与“${character.name}”的所有聊天记录吗？此操作不可恢复。`,
            async () => {
                await db.characters.update(charId, { history: [] });
                alert(`与“${character.name}”的聊天记录已清空。`);
                if (currentPageData.charId === charId && navHistory[navHistory.length - 1] === 'chat-conversation-screen') {
                    openConversation(charId);
                }
            }
        );
    }

    async function openUserProfileEditor() {
        const { name, avatar, gender, birthday, persona } = state.user;
        get('profile-edit-avatar').src = avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        get('profile-edit-name').value = name;
        get('profile-edit-gender').value = gender || '男';
        get('profile-edit-birthday').value = birthday;
        get('profile-edit-persona').value = persona;
        updateBirthdayInfo(birthday, 'birthday-info');
    }

    async function saveUserProfile() {
        state.user.name = get('profile-edit-name').value;
        state.user.gender = get('profile-edit-gender').value;
        state.user.birthday = get('profile-edit-birthday').value;
        state.user.persona = get('profile-edit-persona').value;
        const newAvatar = get('profile-edit-avatar').dataset.newAvatar;
        if (newAvatar) { state.user.avatar = newAvatar; }
        await saveState();
        alert('个人资料已保存！');
        navigateBack();
    }

    async function openCharacterEditor(charId = null) {
        const isEditing = charId !== null;
        const character = isEditing ? await db.characters.get(charId) : {};

        const editorScreen = get('character-editor-screen');
        editorScreen.dataset.currentUserPersonaId = character.associatedUserPersonaId || 'null';

        get('char-editor-avatar').src = character.avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        get('char-name').value = character.name || '';
        get('char-remark').value = character.remark || '';
        get('char-birthday').value = character.birthday || '';
        get('char-gender').value = character.gender || '男';
        get('char-mbti').value = character.mbti || '';
        get('char-persona').value = character.persona || '';
        get('char-ins-name').value = character.networkInfo?.insName || '';
        get('char-ins-bio').value = character.networkInfo?.insBio || '';
        get('char-relation').value = character.initialRelation || '';

        const initialLikability = character.initialLikability || 0;
        setSvgSliderValue('likability-slider-container', initialLikability);
        get('likability-value').textContent = initialLikability;

        updateBirthdayInfo(character.birthday, 'char-birthday-info');

        document.querySelector('[data-style="noPunctuation"]').checked = character.languageStyle?.noPunctuation || false;
        document.querySelector('[data-style="noToneWords"]').checked = character.languageStyle?.noToneWords || false;
        document.querySelector('[data-style="noEmoji"]').checked = character.languageStyle?.noEmoji || false;
        document.querySelector('[data-style="noEmoticon"]').checked = character.languageStyle?.noEmoticon || false;
        const personaInfoDiv = get('current-user-persona-info');
        if (character.associatedUserPersonaId) {
            const persona = await db.userPersonas.get(character.associatedUserPersonaId);
            personaInfoDiv.textContent = `已关联: ${persona ? persona.name : '未知面具'}`;
        } else {
            personaInfoDiv.textContent = '未关联 (使用全局人设)';
        }

        get('save-character-btn').onclick = () => handleSaveCharacter(charId);
        get('associate-wb-btn').onclick = () => openWbAssociationDialog(character.associatedWorldBookIds || []);
        get('associate-user-persona-btn').onclick = () => openUserPersonaSelectionDialog(character.id, character.associatedUserPersonaId);
    }

    async function handleSaveCharacter(charId) {
        const isEditing = charId !== null;

        const associatedIds = [];
        const checkboxes = document.querySelectorAll('#wb-association-list input[type="checkbox"]:checked');
        checkboxes.forEach(cb => associatedIds.push(parseInt(cb.value)));

        const editorScreen = get('character-editor-screen');
        const personaIdString = editorScreen.dataset.currentUserPersonaId;
        const associatedUserPersonaId = (personaIdString === 'null' || !personaIdString) ? null : parseInt(personaIdString);


        const charData = {
            avatar: get('char-editor-avatar').src,
            name: get('char-name').value.trim(),
            remark: get('char-remark').value.trim(),
            birthday: get('char-birthday').value,
            gender: get('char-gender').value,
            mbti: get('char-mbti').value.trim(),
            persona: get('char-persona').value.trim(),
            networkInfo: {
                insName: get('char-ins-name').value.trim(),
                insBio: get('char-ins-bio').value.trim(),
            },
            initialRelation: get('char-relation').value.trim(),
            initialLikability: get('likability-slider-container').value, // 获取SVG滑块的值
            languageStyle: {
                noPunctuation: document.querySelector('[data-style="noPunctuation"]').checked,
                noToneWords: document.querySelector('[data-style="noToneWords"]').checked,
                noEmoji: document.querySelector('[data-style="noEmoji"]').checked,
                noEmoticon: document.querySelector('[data-style="noEmoticon"]').checked,
            },
            associatedWorldBookIds: associatedIds,
            associatedUserPersonaId: associatedUserPersonaId,
            timestamp: Date.now()
        };

        if (!charData.name) { alert("姓名不能为空！"); return; }

        if (isEditing) {
            const existingChar = await db.characters.get(charId);
            charData.history = existingChar.history || [];
            charData.offlineHistory = existingChar.offlineHistory || []; // 保留线下聊天记录
            charData.diaries = existingChar.diaries || { normal: [], secret: [] };
            charData.enableHtmlRendering = existingChar.enableHtmlRendering || false;
            charData.psiteData = existingChar.psiteData || { userId: null, notes: [], favorites: [], history: [] }; // 保留P站数据
            charData.forumData = existingChar.forumData || {}; // 保留论坛数据
            await db.characters.update(charId, charData);
            alert("角色已更新！");
        } else {
            charData.history = [];
            charData.offlineHistory = []; // 初始化线下聊天记录
            charData.diaries = { normal: [], secret: [] };
            charData.enableHtmlRendering = false; // Default for new char
            charData.psiteData = { userId: null, notes: [], favorites: [], history: [] }; // 初始化P站数据
            charData.forumData = {}; // 初始化论坛数据
            await db.characters.add(charData);
            alert("角色已保存！");
        }

        await renderChatList();
        await renderContactsList();
        navigateBack();
    }

    async function openBeautificationSettings(charId) {
        const character = await db.characters.get(charId);
        const preview = get('chat-bg-preview');
        preview.src = character.chatBackgroundUrl || '';
        preview.dataset.newBg = '';
    }

    async function handleSaveChatBackground(charId) {
        const newBg = get('chat-bg-preview').dataset.newBg;
        await db.characters.update(charId, { chatBackgroundUrl: newBg || null });
        alert('聊天背景已保存！');
        navigateBack();
    }

    async function handleResetChatBackground(charId) {
        await db.characters.update(charId, { chatBackgroundUrl: null });
        get('chat-bg-preview').src = '';
        get('chat-bg-preview').dataset.newBg = '';
        alert('背景已重置为默认。');
    }

    async function handleDeleteCharacter(charId) {
        const character = await db.characters.get(charId);
        showIosConfirm(
            '删除角色',
            `你确定要删除“${character.name}”吗？此操作不可恢复，所有聊天记录都将被清除。`,
            async () => {
                await db.characters.delete(charId);
                alert(`角色“${character.name}”已删除。`);
                navHistory = ['home-screen'];
                navigateTo('wechat-screen');
            }
        );
    }

    // --- 用户面具 (User Persona) 功能 ---
    async function openUserPersonaSelectionDialog(charId, currentPersonaId) {
        const dialog = get('user-persona-selection-dialog');
        const listContainer = get('user-persona-selection-list');
        listContainer.innerHTML = '';

        const personas = await db.userPersonas.toArray();

        listContainer.innerHTML += `
            <div class="dialog-list-item">
                <input type="radio" id="user-persona-none" name="user-persona-select" value="null" ${currentPersonaId === null ? 'checked' : ''}>
                <label for="user-persona-none">不关联 (使用全局人设)</label>
            </div>
        `;

        if (personas.length > 0) {
            personas.forEach(p => {
                const isChecked = currentPersonaId === p.id ? 'checked' : '';
                const item = document.createElement('div');
                item.className = 'dialog-list-item';
                item.innerHTML = `
                    <input type="radio" id="user-persona-${p.id}" name="user-persona-select" value="${p.id}" ${isChecked}>
                    <label for="user-persona-${p.id}">${p.name}</label>
                `;
                listContainer.appendChild(item);
            });
        }

        dialog.classList.add('active');

        get('user-persona-create-btn').onclick = () => {
            dialog.classList.remove('active');
            navigateTo('user-persona-editor-screen', { charId: charId, isCreatingFromCharEditor: true });
        };

        get('user-persona-selection-confirm-btn').onclick = async () => {
            const selectedValue = document.querySelector('input[name="user-persona-select"]:checked').value;
            const selectedId = selectedValue === 'null' ? null : parseInt(selectedValue);

            const editorScreen = get('character-editor-screen');
            editorScreen.dataset.currentUserPersonaId = selectedId;

            const personaInfoDiv = get('current-user-persona-info');
            if (selectedId) {
                const persona = await db.userPersonas.get(selectedId);
                personaInfoDiv.textContent = `已关联: ${persona.name}`;
            } else {
                personaInfoDiv.textContent = '未关联 (使用全局人设)';
            }

            dialog.classList.remove('active');
        };

        dialog.onclick = (e) => { if (e.target === dialog) dialog.classList.remove('active'); };
    }

    async function openUserPersonaEditor(personaId = null) {
        const isEditing = personaId !== null;
        const persona = isEditing ? await db.userPersonas.get(personaId) : {};

        get('persona-edit-avatar').src = persona.avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        get('persona-edit-name').value = persona.name || '';
        get('persona-edit-gender').value = persona.gender || '男';
        get('persona-edit-birthday').value = persona.birthday || '';
        get('persona-edit-persona').value = persona.persona || '';
        updateBirthdayInfo(persona.birthday, 'persona-birthday-info');

        get('save-persona-btn').onclick = () => handleSaveUserPersona(personaId);
    }

    async function handleSaveUserPersona(personaId) {
        const isEditing = personaId !== null;
        const personaData = {
            name: get('persona-edit-name').value.trim(),
            avatar: get('persona-edit-avatar').src,
            gender: get('persona-edit-gender').value,
            birthday: get('persona-edit-birthday').value,
            persona: get('persona-edit-persona').value
        };

        if (!personaData.name) {
            alert("面具名称不能为空！");
            return;
        }

        try {
            if (isEditing) {
                await db.userPersonas.update(personaId, personaData);
            } else {
                await db.userPersonas.add(personaData);
            }
            alert("用户面具已保存！");
            navigateBack();
            if (navHistory[navHistory.length - 1] === 'user-persona-management-screen') {
                renderUserPersonaManagementScreen();
            } else if (currentPageData.isCreatingFromCharEditor) {
                openCharacterEditor(currentPageData.charId);
            }
        } catch (e) {
            if (e.name === 'ConstraintError') {
                alert('错误：已存在同名的用户面具。');
            } else {
                alert('保存失败: ' + e);
            }
        }
    }

    async function renderUserPersonaManagementScreen() {
        const container = get('user-persona-list-container');
        container.innerHTML = '';
        const personas = await db.userPersonas.toArray();

        if (personas.length === 0) { container.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--secondary-text);">还没有任何面具，点击下方按钮创建一个吧。</p>`; } else {
            personas.forEach(persona => {
                const item = document.createElement('div');
                item.className = 'settings-group';
                item.innerHTML = `
                    <div class="settings-item">
                        <div class="settings-item-content">
                            <span class="label">${persona.name}</span>
                            <div>
                                <button class="btn btn-secondary edit-persona-btn" data-id="${persona.id}" style="padding: 5px 10px; min-height: auto; width: auto; margin-right: 10px;">编辑</button>
                                <button class="btn destructive delete-persona-btn" data-id="${persona.id}" style="padding: 5px 10px; min-height: auto; width: auto; background-color: var(--destructive-color);">删除</button>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(item);
            });
        }

        container.querySelectorAll('.edit-persona-btn').forEach(btn => {
            btn.onclick = () => navigateTo('user-persona-editor-screen', { personaId: parseInt(btn.dataset.id) });
        });
        container.querySelectorAll('.delete-persona-btn').forEach(btn => {
            btn.onclick = async () => {
                const personaId = parseInt(btn.dataset.id);
                const persona = await db.userPersonas.get(personaId);
                showIosConfirm(
                    '删除面具',
                    `确定要删除用户面具“${persona.name}”吗？所有关联此面具的角色将恢复使用全局人设。`,
                    async () => {
                        await db.transaction('rw', db.userPersonas, db.characters, async () => {
                            await db.userPersonas.delete(personaId);
                            await db.characters.where({ associatedUserPersonaId: personaId }).modify({ associatedUserPersonaId: null });
                        });
                        renderUserPersonaManagementScreen();
                    }
                );
            };
        });
    }

    // --- 全局美化功能 ---
    async function openGlobalBeautificationScreen() {
        tempAppIcons = { ...state.appIcons }; // 克隆当前图标设置作为临时副本

        const preview = get('wallpaper-preview');
        preview.style.backgroundImage = `url(${state.wallpaperUrl})`;
        preview.dataset.newWallpaper = state.wallpaperUrl;

        get('accent-color-input').value = state.accentColor;
        get('charging-color-input').value = state.chargingColor;

        // 初始化字体大小滑块
        const fontSize = state.fontSettings.fontSize;
        setSvgSliderValue('font-size-slider-container', fontSize);
        get('font-size-value').textContent = `${fontSize}px`;

        await renderFontPresetList();
        renderAppIconPreview();
    }

    function renderAppIconPreview() {
        const grid = get('app-icon-preview-grid');
        grid.innerHTML = '';
        const { apps, dockApps } = getAppList();
        const allApps = [...apps, ...dockApps];
        const uniqueApps = allApps.filter((app, index, self) => self.findIndex(a => a.name === app.name) === index);

        uniqueApps.forEach(app => {
            const iconUrl = tempAppIcons[app.name] || app.icon;
            const iconEl = document.createElement('div');
            iconEl.className = 'preview-app-icon';
            iconEl.dataset.appName = app.name;
            iconEl.innerHTML = `<img src="${iconUrl}"><span>${app.name}</span>`;
            iconEl.addEventListener('click', () => {
                currentAppToChange = app.name;
                showActionSheet('upload-icon-sheet');
            });
            grid.appendChild(iconEl);
        });
    }

    function updatePreviewIcon(appName, newIconUrl) {
        tempAppIcons[appName] = newIconUrl;
        const iconEl = get('app-icon-preview-grid').querySelector(`[data-app-name="${appName}"] img`);
        if (iconEl) {
            iconEl.src = newIconUrl;
        }
    }

    async function saveGlobalBeautification() {
        const preview = get('wallpaper-preview');
        state.wallpaperUrl = preview.dataset.newWallpaper;
        state.accentColor = get('accent-color-input').value;
        state.chargingColor = get('charging-color-input').value;
        state.appIcons = { ...tempAppIcons };
        state.fontSettings.fontSize = get('font-size-slider-container').value;

        await saveState();
        applyAllSettings();
        renderHomeScreenApps();
        alert('全局美化设置已保存！');
        navigateBack();
    }

    // --- 新增：字体管理功能 ---
    async function renderFontPresetList() {
        const container = get('font-preset-list');
        container.innerHTML = '';
        const presets = await db.fontPresets.toArray();

        // 添加默认字体选项
        const defaultItem = document.createElement('div');
        defaultItem.className = 'settings-item';
        const isDefaultActive = state.fontSettings.activePresetId === null;
        defaultItem.innerHTML = `
            <div class="settings-item-content" style="border-bottom: none;">
                <span class="label" style="${isDefaultActive ? 'color: var(--accent-color); font-weight: 600;' : ''}">系统默认字体</span>
            </div>
        `;
        defaultItem.onclick = () => handleFontPresetSelection(null);
        container.appendChild(defaultItem);

        presets.forEach(preset => {
            const isActive = state.fontSettings.activePresetId === preset.id;
            const item = document.createElement('div');
            item.className = 'settings-item';
            item.innerHTML = `
                <div class="settings-item-content">
                    <span class="label" style="${isActive ? 'color: var(--accent-color); font-weight: 600;' : ''}">${preset.name}</span>
                    <button class="delete-entry-btn" data-id="${preset.id}" style="font-size: 20px;">×</button>
                </div>
            `;
            item.querySelector('.label').onclick = () => handleFontPresetSelection(preset.id);
            item.querySelector('.delete-entry-btn').onclick = (e) => {
                e.stopPropagation();
                handleDeleteFontPreset(preset.id, preset.name);
            };
            container.appendChild(item);
        });
    }

    async function handleAddFontPreset() {
        const name = prompt("请输入字体预设名称：");
        if (!name || !name.trim()) return;

        const url = prompt("请输入 .ttf 字体文件的URL链接：");
        if (!url || !url.trim().endsWith('.ttf')) {
            alert("请输入有效的 .ttf 字体链接。");
            return;
        }

        try {
            await db.fontPresets.add({ name: name.trim(), url: url.trim() });
            await renderFontPresetList();
        } catch (e) {
            if (e.name === 'ConstraintError') {
                alert('错误：已存在同名的字体预设。');
            } else {
                alert('添加失败: ' + e);
            }
        }
    }

    async function handleFontPresetSelection(presetId) {
        state.fontSettings.activePresetId = presetId;
        await applyFontPreset(presetId);
        await renderFontPresetList(); // 重新渲染以更新选中状态
    }

    async function handleDeleteFontPreset(presetId, presetName) {
        showIosConfirm('删除字体预设', `确定要删除“${presetName}”吗？`, async () => {
            await db.fontPresets.delete(presetId);
            // 如果删除的是当前激活的字体，则切换回默认
            if (state.fontSettings.activePresetId === presetId) {
                await handleFontPresetSelection(null);
            }
            await renderFontPresetList();
        });
    }

    async function applyFontPreset(presetId) {
        const fontStyleEl = get('dynamic-font-style');
        if (presetId === null) {
            fontStyleEl.innerHTML = '';
            document.body.style.fontFamily = ''; // 恢复到CSS中定义的默认字体
        } else {
            const preset = await db.fontPresets.get(presetId);
            if (preset) {
                const fontFaceRule = `
                    @font-face {
                        font-family: 'CustomFont_${preset.id}';
                        src: url('${preset.url}') format('truetype');
                    }
                `;
                fontStyleEl.innerHTML = fontFaceRule;
                document.body.style.fontFamily = `'CustomFont_${preset.id}', 'Noto Sans SC', sans-serif`;
            }
        }
    }

    function applyFontSize(size) {
        document.documentElement.style.fontSize = `${size}px`;
    }


    // --- P站功能 ---
    function showPSiteAgeGate(charId) {
        const dialog = get('psite-age-gate-dialog');
        dialog.classList.add('active');
        get('psite-age-yes-btn').onclick = () => {
            dialog.classList.remove('active');
            navigateTo('psite-screen', { charId });
        };
        get('psite-age-no-btn').onclick = () => dialog.classList.remove('active');
    }

    async function renderPSiteScreen(charId) {
        const character = await db.characters.get(charId);
        if (!character) { navigateBack(); return; }

        if (!character.psiteData) character.psiteData = { userId: null, notes: [], favorites: [], history: [] };
        if (!character.psiteData.userId) {
            character.psiteData.userId = Math.floor(100000 + Math.random() * 900000);
            await db.characters.update(charId, { psiteData: character.psiteData });
        }

        const screen = get('psite-screen');
        screen.dataset.charId = charId;

        screen.querySelectorAll('.psite-nav-btn').forEach(btn => {
            btn.onclick = () => switchPSiteTab(btn.dataset.tab);
        });

        switchPSiteTab('profile');
        await renderPSiteProfileTab(character);
    }

    function switchPSiteTab(tabName) {
        const screen = get('psite-screen');
        screen.querySelectorAll('.psite-tab-content').forEach(tab => tab.classList.remove('active'));
        screen.querySelectorAll('.psite-nav-btn').forEach(btn => btn.classList.remove('active'));

        get(`psite-${tabName}-tab`).classList.add('active');
        get(`psite-nav-${tabName}`).classList.add('active');
    }

    async function renderPSiteProfileTab(character) {
        const profileTab = get('psite-profile-tab');
        const username = character.networkInfo?.insName || character.name.slice(-1) || '用户';

        profileTab.querySelector('.psite-profile-avatar').src = character.avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        profileTab.querySelector('.psite-profile-name').textContent = username;
        profileTab.querySelector('.psite-profile-id').textContent = `ID: ${character.psiteData.userId}`;

        profileTab.querySelectorAll('.psite-subnav-btn').forEach(btn => {
            btn.onclick = () => {
                profileTab.querySelectorAll('.psite-subnav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderPSiteContentList(character, btn.dataset.subtab);
            };
        });

        const activeSubtab = profileTab.querySelector('.psite-subnav-btn.active')?.dataset.subtab || 'notes';
        renderPSiteContentList(character, activeSubtab);
    }

    function renderPSiteContentList(character, subtab) {
        const container = get('psite-profile-content-list');
        container.innerHTML = '';
        const data = character.psiteData[subtab] || [];

        const listHeader = document.createElement('div');
        listHeader.className = 'psite-content-list-header';
        const subtabTitles = { notes: '我的笔记', favorites: '我的收藏', history: '浏览记录' };
        listHeader.innerHTML = `
            <span class="psite-content-list-title">${subtabTitles[subtab]}</span>
            <button class="psite-refresh-btn"><svg class="svg-icon"><use href="#icon-reset"/></svg></button>
        `;
        container.appendChild(listHeader);

        if (data.length === 0) {
            container.innerHTML += `<p style="text-align:center; padding: 40px; color: var(--psite-secondary-text);">这里什么都没有，点击右上角刷新看看吧。</p>`;
        } else {
            data.forEach(item => {
                let cardHtml = '';
                if (subtab === 'notes') {
                    cardHtml = `
                        <div class="psite-item-card" data-post-id="${item.id}" data-post-type="notes">
                            <div class="psite-note-content">${item.content}</div>
                        </div>
                    `;
                } else {
                    cardHtml = `
                        <div class="psite-item-card" data-post-id="${item.id}" data-post-type="${subtab}">
                            <div class="psite-item-thumbnail">
                                <svg class="play-icon"><use href="#icon-play-circle"/></svg>
                            </div>
                            <div class="psite-item-info">
                                <p class="psite-item-title">${item.title}</p>
                                <div class="psite-item-tags">
                                    ${(item.tags || []).map(tag => `<span class="psite-item-tag">${tag}</span>`).join('')}
                                </div>
                            </div>
                        </div>
                    `;
                }
                container.innerHTML += cardHtml;
            });
        }

        // 使用事件委托来处理动态内容的点击事件
        container.addEventListener('click', (e) => {
            const refreshBtn = e.target.closest('.psite-refresh-btn');
            if (refreshBtn) {
                generatePSiteContent(character.id, subtab);
                return;
            }

            const card = e.target.closest('.psite-item-card');
            if (card) {
                const postId = card.dataset.postId;
                const postType = card.dataset.postType;
                navigateTo('psite-post-view-screen', { charId: character.id, postType, postId });
            }
        });
    }

    async function renderPSitePostViewScreen(charId, postType, postId) {
        const character = await db.characters.get(charId);
        const post = character.psiteData[postType]?.find(p => p.id === postId);

        if (!post) {
            get('psite-post-view-screen').innerHTML = `<div class="psite-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon"><use href="#icon-back"/></svg></div></div><p>内容不存在</p>`;
            return;
        }

        let mainContentHtml = '';
        if (postType === 'notes') {
            mainContentHtml = `<div class="psite-post-main-content"><p>${post.content}</p></div>`;
        } else {
            mainContentHtml = `
                <div class="psite-post-main-content">
                    <h2 class="title">${post.title}</h2>
                    <p class="description">${post.description}</p>
                </div>`;
        }

        let commentsHtml = (post.comments || []).map(comment => {
            const replyHtml = comment.reply ? `
                <div class="psite-comment-reply">
                    <p class="psite-comment-reply-text"><strong>${character.networkInfo?.insName || character.name.slice(-1)}</strong> 回复: ${comment.reply}</p>
                </div>
            ` : '';

            return `
                <div class="psite-comment-item">
                    <img src="${comment.avatar}" class="psite-comment-avatar">
                    <div class="psite-comment-main">
                        <div class="psite-comment-user-info">
                            <span class="psite-comment-username">${comment.username}</span>
                            <span class="psite-comment-time">${comment.time}</span>
                        </div>
                        <p class="psite-comment-text">${comment.text}</p>
                        <div class="psite-comment-actions">
                            <div class="psite-comment-action"><svg class="svg-icon"><use href="#icon-comment"/></svg> <span>回复</span></div>
                            <div class="psite-comment-action like-action">
                                <svg class="svg-icon like-btn"><use href="#icon-heart"/></svg>
                                <span class="like-count">${comment.likes}</span>
                            </div>
                        </div>
                        ${replyHtml}
                    </div>
                </div>
            `;
        }).join('');

        get('psite-post-view-screen').innerHTML = `
            <div class="psite-header">
                <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon"><use href="#icon-back"/></svg></div>
                <span class="title">详情</span>
                <div style="width: 24px;"></div>
            </div>
            <div class="settings-content">
            <div class="psite-content">
                ${mainContentHtml}
                <h3 class="psite-comments-header">评论区</h3>
                <div class="psite-comments-list">${commentsHtml}</div>
            </div>`;

        // 绑定点赞事件
        get('psite-post-view-screen').querySelectorAll('.like-action').forEach(action => {
            action.addEventListener('click', () => {
                const likeBtn = action.querySelector('.like-btn');
                const likeCountSpan = action.querySelector('.like-count');
                let currentLikes = parseInt(likeCountSpan.textContent);

                if (likeBtn.classList.toggle('liked')) {
                    likeBtn.querySelector('use').setAttribute('href', '#icon-heart-filled');
                    likeCountSpan.textContent = currentLikes + 1;
                } else {
                    likeBtn.querySelector('use').setAttribute('href', '#icon-heart');
                    likeCountSpan.textContent = currentLikes - 1;
                }
            });
        });
    }
    async function generatePSiteContent(charId, subtab) {
    if (!state.api.url || !state.api.key || !state.api.model) {
        alert("API未配置，无法生成内容。");
        return;
    }

    const container = get('psite-profile-content-list');
    const refreshBtn = container.querySelector('.psite-refresh-btn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = `<svg class="svg-icon spinner" style="display:block; width:22px; height:22px;"><use href="#icon-reset"/></svg>`;
    }

    try {
        const character = await db.characters.get(charId);
        const user = state.user;

        // 【已整合】包含您所有逻辑的完整 System Prompt
        let systemPrompt = `你将扮演角色“${character.name}”，并以TA的视角，在P站上生成一些内容。你的所有行为、审美、和发布的内容都必须严格符合TA的人设（性格: ${character.persona}，与“${user.name}”的关系: ${character.initialRelation}）。OOC是绝对禁止的。

【核心指令】:
1.  **绝对人设与关系**: 你生成的所有内容，无论是日常分享还是大尺度的性爱描写，都必须是“${character.name}”基于TA的性格，以及TA与“${user.name}”(性别: ${user.gender})的特定关系下，会想、会写、会看的东西。人设和你们之间的关系是唯一的标准。
2.  **内容多样性与深度**:
    *   **常规内容**: 可以是符合人设的、围绕性的幻想、暧昧的日常、对身体某个部位的迷恋等。
    *   **大尺度内容**: 你偶尔需要生成更大胆、更直接的内容。例如：
        *   **做爱过程**: 详细描写一次与“${user.name}”的性爱过程。这里的描写必须符合“${character.name}”的性格。如果TA是害羞的，描写就应该侧重于内心的紧张与欢愉；如果TA是主动的，描写就可以更加直白和充满掌控感。过程的每一步都必须反映出TA的个性和你们的关系动态。
        *   **事后感悟**: 描写性爱结束后的场景和内心独白。这可以是对刚才体验的回味、对“${user.name}”情感的变化、身体上的余韵，或是对自己欲望的思考。这部分是深化角色弧光的关键。
        不要局限于这几种!可以有更多不同的创意，如直播，分享一些性幻想的梦境，一定不要重复生成同一内容，主题尽量不要重复。
3.  **JSON格式输出**: 你的最终回复必须是一个严格的、不包含任何额外解释的JSON对象。JSON的结构必须符合下方请求的格式。
4.  **评论区**: 每个生成的内容都必须附带一个评论区，包含至少10条来自不同虚拟用户的评论。这些评论需要有活人感，可以磕CP、说骚话、催更、提问等。
5.  **角色互动**: 在生成的评论中，你（扮演的“${character.name}”）必须亲自回复其中至少一条评论，以增强互动感。
6.  **世界书与记忆**: 你必须读取并利用所有提供的世界书条目和聊天记忆，确保生成的内容与已知信息（如特定事件、昵称、地点）保持一致。`;

        let userPrompt = '';
        let count = Math.random() < 0.7 ? 1 : 2; 

        // 【已整合】包含完整评论区结构的JSON示例
        const jsonStructureComment = `
{
  "id": "unique_post_id_string",
  "content": "笔记内容...",
  "comments": [
    {"username": "虚拟用户名1", "avatar": "https://i.pravatar.cc/150?u=user1", "time": "3小时前", "text": "评论内容1...", "likes": 123, "reply": null},
    {"username": "虚拟用户名2", "avatar": "https://i.pravatar.cc/150?u=user2", "time": "2小时前", "text": "评论内容2...", "likes": 45, "reply": "这是${character.name}的回复内容..."}
  ]
}`;
        const jsonStructureVideo = `
{
  "id": "unique_post_id_string",
  "title": "视频标题",
  "tags": ["标签1", "标签2"],
  "description": "视频的详细文字描述...",
  "comments": [
    {"username": "虚拟用户名1", "avatar": "https://i.pravatar.cc/150?u=user1", "time": "5小时前", "text": "评论内容1...", "likes": 88, "reply": null},
    {"username": "虚拟用户名2", "avatar": "https://i.pravatar.cc/150?u=user2", "time": "4小时前", "text": "评论内容2...", "likes": 150, "reply": "这是${character.name}的回复内容..."}
  ]
}`;

        switch (subtab) {
            case 'notes':
                userPrompt = `请为“${character.name}”生成 ${count} 篇新的P站笔记。每篇笔记都要包含内容和完整的评论区。\n严格按照以下JSON格式返回，不要添加任何其他说明文字：\n\`\`\`json\n{ "notes": [ ${jsonStructureComment} ] }\`\`\``;
                break;
            case 'favorites':
                userPrompt = `请为“${character.name}”生成 ${count} 个新的P站收藏。每个收藏是一个“文字视频”，包含标题、标签、描述和完整的评论区。\n严格按照以下JSON格式返回，不要添加任何其他说明文字：\n\`\`\`json\n{ "favorites": [ ${jsonStructureVideo} ] }\`\`\``;
                break;
            case 'history':
                userPrompt = `请为“${character.name}”生成 ${count} 条新的P站浏览记录。每个记录是一个“文字视频”，包含标题、标签、描述和完整的评论区。\n严格按照以下JSON格式返回，不要添加任何其他说明文字：\n\`\`\`json\n{ "history": [ ${jsonStructureVideo} ] }\`\`\``;
                break;
        }

        const messages = [{ role: 'system', content: systemPrompt }];
        // 【已整合】读取世界书
        const worldBookEntries = await getActiveWorldBookEntries(charId);
        worldBookEntries.forEach(content => messages.push({ role: 'system', content: `[World Info]: ${content}` }));
        messages.push({ role: 'user', content: userPrompt });

        const apiResponse = await sendApiRequest(messages);
        
        let parsedData;
        try {
            const jsonString = apiResponse.match(/```json\s*([\s\S]*?)\s*```/)[1];
            parsedData = JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse API response JSON:", e, "Response was:", apiResponse);
            throw new Error("API返回格式错误，无法解析。");
        }

        const charToUpdate = await db.characters.get(charId);
        
        // 【已整合】健壮的解析逻辑
        let newItems = parsedData[subtab] || (Array.isArray(parsedData) ? parsedData : []);
        
        if (newItems.length > 0) {
            newItems.forEach(item => { if(!item.id) item.id = `post_${Date.now()}_${Math.random()}`});
            
            if (!charToUpdate.psiteData[subtab]) {
                charToUpdate.psiteData[subtab] = [];
            }
            
            charToUpdate.psiteData[subtab].unshift(...newItems);
            await db.characters.update(charId, { psiteData: charToUpdate.psiteData });
            renderPSiteContentList(charToUpdate, subtab);
        } else {
            throw new Error("API返回的数据格式不正确或内容为空。");
        }

    } catch (error) {
        alert(`生成失败: ${error.message}`);
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `<svg class="svg-icon"><use href="#icon-reset"/></svg>`;
        }
    }
}

// 替换掉 script.js 中旧的同名函数
async function generateDiaryEntry(charId, isSecret) {
    if (!state.api.url || !state.api.key || !state.api.model) {
        alert("API未配置，无法生成日记。");
        return;
    }
    const genBtn = get('generate-diary-btn');
    genBtn.disabled = true;
    genBtn.innerHTML = `<svg class="svg-icon spinner" style="display:block; width:24px; height:24px; margin:0 auto;"><use href="#icon-generate"/></svg>`;

    try {
        const character = await db.characters.get(charId);
        const user = state.user;
        const today = new Date();
        const dateString = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

        let systemPrompt, userPrompt;

        const userContext = `\n- **你的聊天对象“${user.name}”的性别是**: ${user.gender}。`;
        
        // --- 核心修改 #1: 在系统指令中加入JSON格式要求 ---
        const jsonOutputInstruction = `\n5. **【JSON格式输出】**: 你的回复必须是一个严格的、不包含任何额外解释的JSON对象，格式为：\`{\"title\": \"你的日记标题\", \"content\": \"你的日记正文...\"}\`。标题应该是对日记内容的概括，或一句你想说的话。`;

        if (isSecret) {
            systemPrompt = `你将扮演角色“${character.name}”，为自己写一篇绝对私密的日记。这是只有你自己能看到的地方，所以请写下最真实、最无保留的内心想法。
【核心规则】:
1.  **绝对人设**: 你的思考方式、欲望、语言风格，甚至标点符号的使用，都必须完全符合“${character.name}”的人设（性格: ${character.persona}）和你们的关系（${character.initialRelation}）。这是最高优先级，绝不能OOC。
2.  **内容多样性**: 日记内容不限于露骨的性幻想。它可以是：记录一次自慰过程、对“${user.name}”身体某个部位的迷恋、一次心跳加速的亲密接触的回味、充满占有欲的内心独白、或是对未来的性爱构想。关键在于真实和符合人设。
3.  **真人感**: 像一个活生生的人一样记录。可以有意识流，可以有矛盾的心理活动，可以有对自己欲望的羞耻或坦然。避免使用格式化的开头和结尾。
4.  **人设决定尺度**: 如果角色是纯情的，日记就应该是充满爱意的幻想和对亲密接触的渴望。如果角色是开放的，日记就可以更加直接和色情。人设是唯一的标准。
${jsonOutputInstruction}
- **日期**: 日记的日期是 ${dateString}。${userContext}`;
            userPrompt = `写吧，把你今天对“${user.name}”最私密的想法、欲望或幻想，用最符合你性格的方式记录下来。请严格按照要求的JSON格式返回你的日记。`;
        } else {
            systemPrompt = `你将扮演角色“${character.name}”，为自己写一篇普通的日记。记录一下今天发生的事，以及你对“${user.name}”的一些真实想法和感受。
【核心规则】:
1.  **绝对人设**: 你的语气、思考方式、关注点都必须完全符合“${character.name}”的人设（性格: ${character.persona}）和你们的关系（${character.initialRelation}）。不能OOC。
2.  **真人感**: 像一个活人一样记录。可以记录生活琐事，可以有对某件事的吐槽，可以有对“${user.name}”的思念、喜爱、甚至是小小的抱怨。让日记充满生活气息，体现出你真实的内心活动，比如无奈、开心、觉得对方很可爱等等。
3.  **避免文艺腔**: 不要写成散文或小说。这就是一篇简单的、给自己看的日记。
${jsonOutputInstruction}
- **日期**: 日记的日期是 ${dateString}。${userContext}`;
            userPrompt = `今天发生了什么让你印象深刻的事吗？或者，关于“${user.name}”，你有什么想对自己说的？写下来吧。请严格按照要求的JSON格式返回你的日记。`;
        }

        const messages = [{ role: 'system', content: systemPrompt }];

        const worldBookEntries = await getActiveWorldBookEntries(charId);
        worldBookEntries.forEach(content => messages.push({ role: 'system', content }));
        messages.push({ role: 'user', content: userPrompt });

        // --- 核心修改 #2: 解析API返回的JSON数据 ---
        const jsonResponseString = await sendApiRequest(messages);
        
        let diaryTitle, diaryContent;
        try {
            // AI可能返回被```json ... ```包裹的代码块，需要提取
            const jsonMatch = jsonResponseString.match(/```json\s*([\s\S]*?)\s*```/);
            const parsableString = jsonMatch ? jsonMatch[1] : jsonResponseString;
            
            const parsedData = JSON.parse(parsableString);
            diaryTitle = parsedData.title;
            diaryContent = parsedData.content;

            if (!diaryTitle || !diaryContent) {
                throw new Error("API返回的JSON格式不正确，缺少title或content字段。");
            }
        } catch (e) {
            console.error("解析日记JSON失败:", e, "原始回复:", jsonResponseString);
            // 如果解析失败，进行降级处理，保证程序不崩溃
            diaryTitle = `${dateString} 的日记 (标题生成失败)`;
            diaryContent = `【开发者提示：AI未能正确返回JSON格式，以下是原始回复】\n\n${jsonResponseString}`;
        }

        const charToUpdate = await db.characters.get(charId);
        if (!charToUpdate.diaries) charToUpdate.diaries = { normal: [], secret: [] };

        const diaryType = isSecret ? 'secret' : 'normal';
        
        // --- 核心修改 #3: 使用AI生成的标题和内容 ---
        charToUpdate.diaries[diaryType].push({
            id: Date.now(),
            title: diaryTitle.trim(),
            content: diaryContent.trim()
        });

        await db.characters.update(charId, { diaries: charToUpdate.diaries });
        await renderDiaryList(charId, isSecret);

    } catch (error) {
        alert(`生成失败: ${error.message}`);
    } finally {
        genBtn.disabled = false;
        genBtn.innerHTML = `<svg class="svg-icon" width="24" height="24" style="color: var(--primary-text);"><use href="#icon-generate"/></svg>`;
    }
}
    // --- 线下模式核心功能 ---
    let isOfflineReceiving = false;
    let activeRegexRules = [];

    async function initializeOfflineMode() {
        const { activeCharId } = state.offlineSettings;
        if (activeCharId) {
            const character = await db.characters.get(activeCharId);
            if (character) {
                renderOfflineHistory();
            } else {
                state.offlineSettings.activeCharId = null;
                await saveState();
                get('offline-mode-content').innerHTML = '<p style="text-align:center; padding: 40px; color: var(--secondary-text);">请先从侧边栏选择一个角色开始聊天。</p>';
            }
        } else {
            get('offline-mode-content').innerHTML = '<p style="text-align:center; padding: 40px; color: var(--secondary-text);">请先从侧边栏选择一个角色开始聊天。</p>';
        }
        await loadActiveRegexRules();
    }

    async function renderOfflineHistory() {
        const contentDiv = get('offline-mode-content');
        contentDiv.innerHTML = '';
        const charId = state.offlineSettings.activeCharId;
        if (!charId) return;

        const character = await db.characters.get(charId);
        const history = character.offlineHistory || [];

        history.forEach(msg => appendOfflineMessage(msg.role, msg.content));
        contentDiv.scrollTop = contentDiv.scrollHeight;
    }

    function appendOfflineMessage(role, content) {
        const contentDiv = get('offline-mode-content');
        const msgDiv = document.createElement('div');
        msgDiv.className = `offline-message ${role}`;

        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });

        const contentNode = document.createElement('span');
        contentNode.innerText = content; // Always treat as plain text

        const timeNode = document.createElement('span');
        timeNode.className = 'timestamp';
        timeNode.innerText = time;

        msgDiv.appendChild(contentNode);
        msgDiv.appendChild(timeNode);

        contentDiv.appendChild(msgDiv);
        contentDiv.scrollTop = contentDiv.scrollHeight;
        return msgDiv;
    }
async function getOfflineReply() {
    const sendBtn = get('offline-send-btn');
    const rerollBtn = get('offline-reroll-btn'); // 获取重生成按钮
    const charId = state.offlineSettings.activeCharId;

    if (!charId) {
        alert("请先选择一个聊天角色。");
        return;
    }

    isOfflineReceiving = true;
    sendBtn.innerHTML = `<svg><use href="#icon-chat-cancel"></use></svg>`;
    rerollBtn.disabled = true; // 禁用重生成按钮

    try {
        const character = await db.characters.get(charId);
        const promptMessages = await buildOfflinePrompt(character);

        let fullContent = '';
        if (state.offlineSettings.enableStreaming) {
            const charMsgDiv = appendOfflineMessage('char', '');
            const contentSpan = charMsgDiv.querySelector('span:first-child');
            const timeSpan = charMsgDiv.querySelector('.timestamp');

            await sendApiRequest(promptMessages, (chunk) => {
                fullContent += chunk;
                let processedContent = applyRegexRules(fullContent);
                contentSpan.innerText = processedContent;
                timeSpan.innerText = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
                get('offline-mode-content').scrollTop = get('offline-mode-content').scrollHeight;
            });

        } else {
            fullContent = await sendApiRequest(promptMessages);
            appendOfflineMessage('char', applyRegexRules(fullContent));
        }

        const finalHistory = character.offlineHistory || [];
        finalHistory.push({ role: 'char', content: fullContent }); // 保存原始未处理的回复
        await db.characters.update(charId, { offlineHistory: finalHistory });

    } catch (error) {
        if (error.name !== 'AbortError') {
            appendOfflineMessage('char', `出错了: ${error.message}`);
        }
    } finally {
        isOfflineReceiving = false;
        sendBtn.innerHTML = `<svg><use href="#icon-chat-send"></use></svg>`;
        rerollBtn.disabled = false; // 恢复重生成按钮
    }
}
  // ==================== 开始替换区域 ====================

// 这是新的辅助函数，负责获取AI回复
async function getOfflineReply() {
    const sendBtn = get('offline-send-btn');
    const rerollBtn = get('offline-reroll-btn'); // 获取重生成按钮
    const charId = state.offlineSettings.activeCharId;

    if (!charId) {
        alert("请先选择一个聊天角色。");
        return;
    }

    isOfflineReceiving = true;
    sendBtn.innerHTML = `<svg><use href="#icon-chat-cancel"></use></svg>`;
    rerollBtn.disabled = true; // 禁用重生成按钮

    try {
        const character = await db.characters.get(charId);
        const promptMessages = await buildOfflinePrompt(character);

        let fullContent = '';
        if (state.offlineSettings.enableStreaming) {
            const charMsgDiv = appendOfflineMessage('char', '');
            const contentSpan = charMsgDiv.querySelector('span:first-child');
            const timeSpan = charMsgDiv.querySelector('.timestamp');

            await sendApiRequest(promptMessages, (chunk) => {
                fullContent += chunk;
                let processedContent = applyRegexRules(fullContent);
                contentSpan.innerText = processedContent;
                timeSpan.innerText = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
                get('offline-mode-content').scrollTop = get('offline-mode-content').scrollHeight;
            });

        } else {
            fullContent = await sendApiRequest(promptMessages);
            appendOfflineMessage('char', applyRegexRules(fullContent));
        }

        const finalHistory = character.offlineHistory || [];
        finalHistory.push({ role: 'char', content: fullContent }); // 保存原始未处理的回复
        await db.characters.update(charId, { offlineHistory: finalHistory });

    } catch (error) {
        if (error.name !== 'AbortError') {
            appendOfflineMessage('char', `出错了: ${error.message}`);
        }
    } finally {
        isOfflineReceiving = false;
        sendBtn.innerHTML = `<svg><use href="#icon-chat-send"></use></svg>`;
        rerollBtn.disabled = false; // 恢复重生成按钮
    }
}

// 这是修改后的主函数，负责处理用户发送和调用上面的辅助函数
async function handleOfflineSend() {
    const input = get('offline-mode-input');
    const userInput = input.value.trim();
    const charId = state.offlineSettings.activeCharId;

    if (isOfflineReceiving) {
        if (apiAbortController) apiAbortController.abort();
        return;
    }

    if (!charId && !userInput) {
        alert("请先选择一个聊天角色。");
        return;
    }

    if (userInput) {
      const msg = { role: 'user', content: userInput, timestamp: Date.now() }; // <-- 添加时间戳
  
        appendOfflineMessage('user', userInput);
        const character = await db.characters.get(charId);
        const newHistory = character.offlineHistory || [];
        newHistory.push({ role: 'user', content: userInput });
        await db.characters.update(charId, { offlineHistory: newHistory });
        input.value = '';
        input.style.height = 'auto';
    }

    // 如果历史记录不为空，则获取AI回复
    const character = await db.characters.get(charId);
    if ((character.offlineHistory || []).length > 0) {
        await getOfflineReply();
    }
}

// ==================== 结束替换区域 ====================
// --- 粘贴到这里 ---

async function handleOfflineReroll() {
    // 1. 安全检查：如果正在接收消息，则不执行任何操作
    if (isOfflineReceiving) {
        return;
    }

    const charId = state.offlineSettings.activeCharId;
    if (!charId) {
        alert('请先选择一个角色。');
        return;
    }

    const character = await db.characters.get(charId);
    const history = character.offlineHistory || [];

    // 2. 检查历史记录，确保最后一条是AI的回复
    if (history.length === 0 || history[history.length - 1].role !== 'char') {
        alert('最后一条消息不是AI生成的，无法重新生成。');
        return;
    }

    // 3. 从数据中移除最后一条AI回复
    history.pop();
    await db.characters.update(charId, { offlineHistory: history });

    // 4. 从界面上移除最后一条消息的DOM元素
    const messageElements = document.querySelectorAll('#offline-mode-content .offline-message');
    if (messageElements.length > 0) {
        messageElements[messageElements.length - 1].remove();
    }

    // 5. 调用现有的函数来获取新的AI回复
    await getOfflineReply();
}

// --- 粘贴到这里 ---
    async function buildOfflinePrompt(character) {
        const messages = [];
        let history = character.offlineHistory || [];

        let userPersona = state.user;
        if (state.offlineSettings.activeUserPersonaId) {
            const persona = await db.userPersonas.get(state.offlineSettings.activeUserPersonaId);
            if (persona) userPersona = persona;
        }

        const offlinePromptTemplate = `You are now in a real-world roleplay scenario. You must fully embody the character of [角色姓名] and interact with [用户姓名]. Your responses must be descriptive, detailed, and written in a literary style, including actions, dialogue, and internal thoughts. Do not break character. Your total response length must not exceed ${state.offlineSettings.wordCountLimit} words.

**Character Profile:**
- Name: [角色姓名]
- Persona: [角色人设]

**User Profile:**
- Name: [用户姓名]
- Persona: [用户人设]

**Context:** This is a direct continuation of the previous scene. Analyze the existing conversation to understand the context, setting, and emotional state, and then generate the next part of the story from your character's perspective.`;

        let finalSystemPrompt = offlinePromptTemplate
            .replace(/\[角色姓名\]/g, character.name || '角色')
            .replace('[角色人设]', character.persona || '未定义')
            .replace(/\[用户姓名\]/g, userPersona.name || 'User')
            .replace('[用户人设]', userPersona.persona || '未定义');

        messages.push({ role: 'system', content: finalSystemPrompt });

        // 添加世界书和预设
        const worldBookEntries = await getActiveWorldBookEntries(character.id);
        worldBookEntries.forEach(content => messages.push({ role: 'system', content: `[World Info]: ${content}` }));

        const enabledPresets = state.presets.filter(p => p.isEnabled);
        enabledPresets.forEach(preset => {
            preset.content.forEach(entry => {
                if (entry.enabled) messages.push({ role: 'system', content: entry.content });
            });
        });

        // 格式化历史记录
        history.forEach(msg => {
            const role = msg.role === 'user' ? 'user' : 'assistant';
            messages.push({ role: role, content: msg.content });
        });

        return messages;
    }

    async function openOfflineCharSelectionDialog() {
        const dialog = get('offline-char-selection-dialog');
        const listContainer = get('offline-char-selection-list');
        listContainer.innerHTML = '';
        const characters = await db.characters.toArray();
        if (characters.length === 0) {
            listContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--secondary-text);">没有可选择的角色。</p>';
        } else {
            characters.forEach(char => {
                const isChecked = state.offlineSettings.activeCharId === char.id ? 'checked' : '';
                const item = document.createElement('div');
                item.className = 'dialog-list-item';
                item.innerHTML = `
                    <input type="radio" id="offline-char-${char.id}" name="offline-char-select" value="${char.id}" ${isChecked}>
                    <label for="offline-char-${char.id}">${char.name}</label>
                `;
                item.onclick = () => {
                    setActiveOfflineChar(char.id);
                    dialog.classList.remove('active');
                };
                listContainer.appendChild(item);
            });
        }
        dialog.classList.add('active');
        get('offline-char-selection-cancel-btn').onclick = () => dialog.classList.remove('active');
    }

    async function openOfflinePersonaSelectionDialog() {
        const dialog = get('offline-persona-selection-dialog');
        const listContainer = get('offline-persona-selection-list');
        listContainer.innerHTML = '';
        const personas = await db.userPersonas.toArray();

        const noneChecked = state.offlineSettings.activeUserPersonaId === null ? 'checked' : '';
        const noneItem = document.createElement('div');
        noneItem.className = 'dialog-list-item';
        noneItem.innerHTML = `
            <input type="radio" id="offline-persona-none" name="offline-persona-select" value="null" ${noneChecked}>
            <label for="offline-persona-none">全局人设</label>
        `;
        noneItem.onclick = () => {
            setActiveOfflineUserPersona(null);
            dialog.classList.remove('active');
        };
        listContainer.appendChild(noneItem);

        personas.forEach(p => {
            const isChecked = state.offlineSettings.activeUserPersonaId === p.id ? 'checked' : '';
            const item = document.createElement('div');
            item.className = 'dialog-list-item';
            item.innerHTML = `
                <input type="radio" id="offline-persona-${p.id}" name="offline-persona-select" value="${p.id}" ${isChecked}>
                <label for="offline-persona-${p.id}">${p.name}</label>
            `;
            item.onclick = () => {
                setActiveOfflineUserPersona(p.id);
                dialog.classList.remove('active');
            };
            listContainer.appendChild(item);
        });

        dialog.classList.add('active');
        get('offline-persona-selection-cancel-btn').onclick = () => dialog.classList.remove('active');
    }

    async function setActiveOfflineChar(charId) {
        state.offlineSettings.activeCharId = charId;
        await saveState();
        await renderOfflineHistory();
    }

    async function setActiveOfflineUserPersona(personaId) {
        state.offlineSettings.activeUserPersonaId = personaId;
        await saveState();
        alert("用户面具已切换。");
    }

    // --- 新增：正则替换功能 ---
    async function renderRegexEditorScreen() {
        const container = get('regex-rules-container');
        container.innerHTML = '';
        const rules = await db.regexRules.toArray();

        if (rules.length === 0) {
            container.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--secondary-text);">还没有任何正则规则，点击右上角“添加”来导入一个吧。</p>`;
            return;
        }

        rules.forEach(rule => {
            const item = document.createElement('div');
            item.className = 'settings-group';
            item.innerHTML = `
                <div class="settings-item">
                    <div class="settings-item-content">
                        <span class="label">${rule.name}</span>
                        <button class="delete-entry-btn" data-id="${rule.id}" style="font-size: 20px; margin-right: 15px;">×</button>
                        <label class="ios-switch">
                            <input type="checkbox" class="regex-enabled-switch" data-id="${rule.id}" ${rule.isEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            `;
            container.appendChild(item);
        });

        container.querySelectorAll('.regex-enabled-switch').forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const ruleId = parseInt(e.target.dataset.id);
                const isEnabled = e.target.checked;
                await db.regexRules.update(ruleId, { isEnabled: isEnabled });
                await loadActiveRegexRules(); // 实时更新激活的规则
            });
        });

        container.querySelectorAll('.delete-entry-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const ruleId = parseInt(e.target.dataset.id);
                const rule = await db.regexRules.get(ruleId);
                showIosConfirm('删除规则', `确定要删除正则规则“${rule.name}”吗？`, async () => {
                    await db.regexRules.delete(ruleId);
                    await renderRegexEditorScreen();
                    await loadActiveRegexRules();
                });
            });
        });
    }


    async function handleRegexImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.scriptName && data.findRegex) {
                    await db.regexRules.add({
                        name: data.scriptName,
                        findRegex: data.findRegex,
                        replaceString: data.replaceString || "",
                        isEnabled: true // 默认启用
                    });
                    alert(`已成功导入并启用正则规则: ${data.scriptName}`);
                    await renderRegexEditorScreen();
                    await loadActiveRegexRules();
                } else {
                    throw new Error("JSON文件格式不正确，缺少 scriptName 或 findRegex 字段。");
                }
            } catch (error) {
                alert(`导入失败: ${error.message}`);
                console.error(error);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    async function loadActiveRegexRules() {
        activeRegexRules = await db.regexRules.where('isEnabled').equals(1).toArray();
        console.log(`Loaded ${activeRegexRules.length} active regex rules.`);
    }

    function applyRegexRules(text) {
        if (activeRegexRules.length === 0) return text;
        let processedText = text;
        activeRegexRules.forEach(rule => {
            try {
                // 正则表达式字符串可能包含修饰符，需要正确解析
                const regexParts = rule.findRegex.match(/^\/(.*?)\/([gimsuy]*)$/);
                if (regexParts) {
                    const regex = new RegExp(regexParts[1], regexParts[2]);
                    processedText = processedText.replace(regex, rule.replaceString);
                } else {
                    // 如果格式不标准，则尝试直接创建
                    const regex = new RegExp(rule.findRegex, 'g');
                    processedText = processedText.replace(regex, rule.replaceString);
                }
            } catch (e) {
                console.error(`Error applying regex rule "${rule.name}":`, e);
            }
        });
        return processedText;
    }

    // --- 新增：论坛功能 ---
    async function renderForumCharList() {
        const container = get('forum-char-list-screen').querySelector('.settings-content');
        const characters = await db.characters.toArray();
        if (characters.length === 0) {
            container.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--secondary-text);">还没有创建任何角色，无法进入论坛。</p>`;
            return;
        }
        container.innerHTML = characters.map(char => `
            <div class="settings-group">
                <div class="settings-item" data-char-id="${char.id}">
                    <div class="settings-item-content">
                        <span class="label">${char.name}</span>
                        <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg>
                    </div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.settings-item').forEach(item => {
            item.addEventListener('click', () => {
                const charId = parseInt(item.dataset.charId);
                navigateTo('forum-screen', { charId });
            });
        });
    }

    async function renderForumScreen(charId) {
        const screen = get('forum-screen');
        screen.dataset.charId = charId;

        const character = await db.characters.get(charId);
        if (!character) {
            alert('角色不存在');
            navigateBack();
            return;
        }
currentLikability = character.initialLikability || 0
        const categories = [
            { id: 'daily', name: '日常吐槽' },
            { id: 'rules', name: '规则怪谈' },
            { id: 'cp', name: 'CP产文' },
            { id: 'nsfw', name: '搞点色色' },
            { id: 'hot', name: '头条热搜' }
        ];

        const tabsContainer = screen.querySelector('.forum-tabs');
        const contentContainer = screen.querySelector('.forum-content');
        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = '';

        categories.forEach((cat, index) => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'forum-tab-btn';
            tabBtn.dataset.categoryId = cat.id;
            tabBtn.textContent = cat.name;
            if (index === 0) tabBtn.classList.add('active');
            tabsContainer.appendChild(tabBtn);

            const postList = document.createElement('div');
            postList.id = `forum-list-${cat.id}`;
            postList.className = 'forum-post-list';
            if (index === 0) postList.classList.add('active');
            contentContainer.appendChild(postList);
        });

        tabsContainer.querySelectorAll('.forum-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                tabsContainer.querySelectorAll('.forum-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                contentContainer.querySelectorAll('.forum-post-list').forEach(list => list.classList.remove('active'));
                get(`forum-list-${btn.dataset.categoryId}`).classList.add('active');
            });
        });

        screen.querySelector('.refresh-btn').onclick = () => {
            const activeTab = tabsContainer.querySelector('.forum-tab-btn.active');
            if (activeTab) {
                generateForumPosts(charId, activeTab.dataset.categoryId);
            }
        };

        // 加载所有分类的已有数据
        for (const cat of categories) {
            await renderForumPostList(charId, cat.id);
        }
    }

    async function renderForumPostList(charId, categoryId) {
        const listContainer = get(`forum-list-${categoryId}`);
        if (!listContainer) return;

        const character = await db.characters.get(charId);
        const posts = character.forumData?.[categoryId] || [];

        if (posts.length === 0) {
            listContainer.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--secondary-text);">这里空空如也，点击右上角刷新看看吧。</p>`;
        } else {
            listContainer.innerHTML = posts.map(post => `
                <div class="forum-post-item" data-post-id="${post.id}">
                    <h3 class="forum-post-title">${post.title}</h3>
                    <p class="forum-post-author">由 ${post.author} 发布</p>
                    <p class="forum-post-content">${post.content}</p>
                    <div class="forum-post-footer">
                        <span><svg class="svg-icon"><use href="#icon-comment"/></svg> ${post.comments.length}</span>
                        <span><svg class="svg-icon"><use href="#icon-heart"/></svg> ${post.likes}</span>
                    </div>
                </div>
            `).join('');
        }

        listContainer.querySelectorAll('.forum-post-item').forEach(item => {
            item.addEventListener('click', () => {
                navigateTo('forum-post-detail-screen', { charId, categoryId, postId: item.dataset.postId });
            });
        });
    }

    async function generateForumPosts(charId, categoryId) {
        if (!state.api.url || !state.api.key || !state.api.model) {
            alert("API未配置，无法生成帖子。");
            return;
        }

        const refreshBtn = get('forum-screen').querySelector('.refresh-btn');
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = `<svg class="svg-icon spinner" style="display:block; width:24px; height:24px;"><use href="#icon-reset"/></svg>`;

        try {
            const character = await db.characters.get(charId);
            const user = state.user;
            const categoryName = document.querySelector(`.forum-tab-btn[data-category-id="${categoryId}"]`).textContent;

            const systemPrompt = `你是一个论坛内容生成器。你将为“${user.name}”和“${character.name}”生成一个匿名论坛上的帖子列表。这些帖子必须围绕他们两人的关系和互动展开，但以匿名网友的视角进行讨论、八卦或创作。

【核心规则】:
1.  **主题聚焦**: 所有帖子都必须与当前论坛分区“${categoryName}”的主题紧密相关。
2.  **人设一致性**: 虽然是网友视角，但帖子内容中涉及的“${user.name}”和“${character.name}”的行为、性格必须与他们的人设（User: ${user.persona}, Char: ${character.persona}）和关系（${character.initialRelation}）保持高度一致。
3.  **真人感**: 帖子和作者名要像真人会发的内容，充满生活气息、八卦感或创作热情。使用网络流行语、缩写、emoji等。
4.  **JSON格式输出**: 你的回复必须是一个严格的、不包含任何额外解释的JSON数组。每个对象代表一个帖子，必须包含 id(唯一字符串), title, author, content, likes(数字), comments(一个评论对象数组，每个对象包含id, author, content, char_reply(可以为null或字符串)) 字段。
5.  **多样性**: 生成 3 到 5 个内容和风格各不相同的帖子。其中至少有一个帖子的评论区，char_reply字段不能为null，即角色必须有回复。`;

            const userPrompt = `为论坛的“${categoryName}”分区生成一些关于“${user.name}”和“${character.name}”的帖子。请严格遵循JSON格式输出。`;

            const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];
            const apiResponse = await sendApiRequest(messages);

            let newPosts;
            try {
                // 尝试从Markdown代码块中提取JSON
                const jsonMatch = apiResponse.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch && jsonMatch[1]) {
                    newPosts = JSON.parse(jsonMatch[1]);
                } else {
                    // 如果没有代码块，直接解析
                    newPosts = JSON.parse(apiResponse);
                }
                if (!Array.isArray(newPosts)) throw new Error("API返回的不是一个数组。");
            } catch (e) {
                console.error("Failed to parse forum posts JSON:", e, "Response was:", apiResponse);
                throw new Error("API返回格式错误，无法解析。");
            }

            const charToUpdate = await db.characters.get(charId);
            if (!charToUpdate.forumData) charToUpdate.forumData = {};
            charToUpdate.forumData[categoryId] = newPosts;
            await db.characters.update(charId, { forumData: charToUpdate.forumData });

            await renderForumPostList(charId, categoryId);

        } catch (error) {
            alert(`生成失败: ${error.message}`);
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `<svg class="svg-icon"><use href="#icon-reset"/></svg>`;
        }
    }

    // --- 新增：论坛详情页功能 ---
    async function renderForumPostDetailScreen(charId, categoryId, postId) {
        const screen = get('forum-post-detail-screen');
        const character = await db.characters.get(charId);
        const post = character.forumData?.[categoryId]?.find(p => p.id === postId);

        if (!post) {
            screen.innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon"><use href="#icon-back"/></svg></div></div><p style="padding:20px; text-align:center;">帖子未找到。</p>`;
            return;
        }

        const now = new Date();
        const postTime = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        screen.innerHTML = `
            <div class="settings-header">
                <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg></div>
                <h1 style="font-size: 18px; font-weight: 600;">帖子</h1>
                <div style="width: 40px;"></div>
            </div>
            <div class="settings-content">
                <div class="forum-detail-main-post">
                    <div class="forum-detail-author-info">
                        <img src="https://i.pravatar.cc/150?u=${post.author}" class="forum-detail-author-avatar">
                        <div class="forum-detail-author-name-block">
                            <span class="forum-detail-author-name">${post.author}</span>
                            <span class="forum-detail-author-handle">@${post.author.toLowerCase().replace(/\s/g, '')}</span>
                        </div>
                    </div>
                    <p class="forum-detail-content">${post.content}</p>
                    <div class="forum-detail-timestamp">${postTime}</div>
                    <div class="forum-detail-stats">
                        <span><strong>${post.comments.length}</strong> 评论</span>
                        <span><strong>${post.likes}</strong> 点赞</span>
                    </div>
                    <div class="forum-detail-actions">
                        <button class="forum-detail-action-btn"><svg class="svg-icon"><use href="#icon-comment"/></svg></button>
                        <button class="forum-detail-action-btn"><svg class="svg-icon"><use href="#icon-retweet"/></svg></button>
                        <button class="forum-detail-action-btn like-main-post-btn"><svg class="svg-icon"><use href="#icon-heart"/></svg></button>
                        <button class="forum-detail-action-btn"><svg class="svg-icon"><use href="#icon-share"/></svg></button>
                    </div>
                </div>
                <div class="forum-detail-comments-list"></div>
            </div>
            <div class="forum-comment-input-footer">
                <input type="text" id="forum-comment-input" placeholder="发布你的评论...">
                <button id="forum-comment-send-btn">发送</button>
            </div>
        `;

        const commentsList = screen.querySelector('.forum-detail-comments-list');
        post.comments.forEach(comment => {
            const commentEl = createForumCommentElement(comment, character.name);
            commentsList.appendChild(commentEl);
        });

        // 绑定事件
        screen.querySelector('.like-main-post-btn').addEventListener('click', (e) => toggleLike(e.currentTarget, true));
        screen.querySelectorAll('.like-comment-btn').forEach(btn => btn.addEventListener('click', (e) => toggleLike(e.currentTarget)));

        get('forum-comment-send-btn').addEventListener('click', () => handlePostComment(charId, categoryId, postId));
    }

    function createForumCommentElement(comment, charName) {
        const commentEl = document.createElement('div');
        commentEl.className = 'forum-detail-comment-item';
        const isChar = comment.author === charName;
        const authorHandle = `@${comment.author.toLowerCase().replace(/\s/g, '')}`;

        let replyHtml = '';
        if (comment.char_reply) {
            replyHtml = `<div class="forum-detail-comment-item" style="padding-top: 12px; padding-left: 0;">
                <img src="https://i.pravatar.cc/150?u=${charName}" class="forum-detail-comment-avatar">
                <div class="forum-detail-comment-main">
                    <div class="forum-detail-comment-header">
                        <span class="forum-detail-comment-author">${charName}</span>
                        <span class="forum-detail-comment-handle">@${charName.toLowerCase().replace(/\s/g, '')}</span>
                    </div>
                    <p class="forum-detail-comment-content">回复 ${authorHandle}: ${comment.char_reply}</p>
                </div>
            </div>`;
        }

        commentEl.innerHTML = `
            <img src="https://i.pravatar.cc/150?u=${comment.author}" class="forum-detail-comment-avatar">
            <div class="forum-detail-comment-main">
                <div class="forum-detail-comment-header">
                    <span class="forum-detail-comment-author">${comment.author}</span>
                    <span class="forum-detail-comment-handle">${authorHandle}</span>
                </div>
                <p class="forum-detail-comment-content">${comment.content}</p>
                <div class="forum-detail-comment-actions">
                    <button class="forum-detail-action-btn"><svg class="svg-icon"><use href="#icon-comment"/></svg></button>
                    <button class="forum-detail-action-btn"><svg class="svg-icon"><use href="#icon-retweet"/></svg></button>
                    <button class="forum-detail-action-btn like-comment-btn"><svg class="svg-icon"><use href="#icon-heart"/></svg></button>
                    <button class="forum-detail-action-btn"><svg class="svg-icon"><use href="#icon-share"/></svg></button>
                </div>
                ${replyHtml}
            </div>
        `;
        return commentEl;
    }

    function toggleLike(button, isMainPost = false) {
        button.classList.toggle('liked');
        const use = button.querySelector('use');
        const isLiked = button.classList.contains('liked');
        use.setAttribute('href', isLiked ? '#icon-heart-filled' : '#icon-heart');

        if (isMainPost) {
            const statsEl = document.querySelector('.forum-detail-stats strong:last-child');
            let likes = parseInt(statsEl.textContent);
            statsEl.textContent = isLiked ? likes + 1 : likes - 1;
        }
    }

    async function handlePostComment(charId, categoryId, postId) {
        const input = get('forum-comment-input');
        const content = input.value.trim();
        if (!content) return;

        const character = await db.characters.get(charId);
        const post = character.forumData[categoryId].find(p => p.id === postId);

        const newComment = {
            id: `comment_${Date.now()}`,
            author: state.user.name,
            content: content,
            char_reply: null // 初始无回复
        };

        // 模拟角色回复的概率
        if (Math.random() < 0.3) { // 30%概率回复
            const replyPrompt = `你扮演 ${character.name}。你在论坛上看到了你的伴侣 ${state.user.name} 在关于你们的帖子里发表了评论：“${content}”。请你以 ${character.name} 的身份，用符合人设的语气，对这条评论进行回复。回复要简短自然。`;
            const replyContent = await sendApiRequest([{ role: 'user', content: replyPrompt }]);
            newComment.char_reply = replyContent.trim();
        }

        post.comments.push(newComment);
        await db.characters.update(charId, { forumData: character.forumData });

        const commentsList = get('forum-post-detail-screen').querySelector('.forum-detail-comments-list');
        commentsList.appendChild(createForumCommentElement(newComment, character.name));

        input.value = '';
    }

// ▼▼▼ 使用这个【增强版】函数替换旧的 handleCharacterImport ▼▼▼
async function handleCharacterImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 创建一个 FileReader 来正确处理编码
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            if (file.type === 'image/png') {
                // 如果是PNG，直接把 ArrayBuffer 传给处理函数
                await processCharCardPng(e.target.result, file.name);
            } else if (file.type === 'application/json') {
                // 如果是JSON，e.target.result已经是正确解码的文本字符串
                const cardData = JSON.parse(e.target.result);
                // JSON文件没有内嵌头像，所以直接调用保存逻辑
                await processAndSaveImportedCard(cardData, file.name);
            } else {
                alert('不支持的文件类型。请选择 .json 或 .png 文件。');
            }
        } catch (error) {
            alert(`导入失败: ${error.message}`);
            console.error(error);
        } finally {
            event.target.value = ''; // 重置输入框
        }
    };
    
    reader.onerror = () => {
        alert('文件读取失败！');
        event.target.value = '';
    };

    // 核心修复：根据文件类型选择不同的读取方式
    if (file.type === 'image/png') {
        // PNG 需要以 ArrayBuffer 格式读取二进制数据
        reader.readAsArrayBuffer(file);
    } else if (file.type === 'application/json') {
        // JSON 文件需要以 Text 格式读取，并让 FileReader 自动处理 UTF-8 解码
        reader.readAsText(file, 'UTF-8');
    }
}
// ▲▲▲ 替换到此结束 ▲▲▲

// ▼▼▼ 使用这个【重构版】函数替换旧的 processCharCardPng ▼▼▼
async function processCharCardPng(buffer, fileName) {
    // 1. 将 ArrayBuffer 转换为 Blob，再生成 Data URL 作为头像
    const blob = new Blob([buffer], { type: 'image/png' });
    const avatarDataUrl = URL.createObjectURL(blob);

    try {
        // 2. 从 PNG 的 tEXt chunk 中提取名为 'chara' 的 Base64 数据
        const charaDataString = await extractCharaDataFromPng(buffer);

        if (!charaDataString) {
            throw new Error('未在此 PNG 文件中找到有效的角色卡数据。');
        }

        // 3. 对提取出的 Base64 字符串进行解码，并解析为 JSON 对象
        const decodedString = atob(charaDataString);
        // 再次用 TextDecoder 确保多字节字符（如中文）正确解析
        const utf8String = new TextDecoder('utf-8').decode(Uint8Array.from(decodedString, c => c.charCodeAt(0)));
        const cardData = JSON.parse(utf8String);

        // 4. 调用通用的处理函数来保存角色卡，同时传入头像和文件名
        await processAndSaveImportedCard(cardData, fileName, { avatar: avatarDataUrl });

    } catch (e) {
        console.error("解析或处理 PNG 角色卡数据时出错:", e);
        // 释放已创建的 Object URL，防止内存泄漏
        URL.revokeObjectURL(avatarDataUrl);
        throw new Error(`PNG 角色卡数据解析失败: ${e.message}`);
    }
}
// ▲▲▲ 替换到此结束 ▲▲▲
    async function extractCharaDataFromPng(buffer) {
        const dataView = new DataView(buffer);
        // PNG signature
        if (dataView.getUint32(0) !== 0x89504E47 || dataView.getUint32(4) !== 0x0D0A1A0A) {
            throw new Error("文件不是一个有效的PNG。");
        }

        let offset = 8;
        while (offset < dataView.byteLength) {
            const length = dataView.getUint32(offset);
            const type = String.fromCharCode(
                dataView.getUint8(offset + 4),
                dataView.getUint8(offset + 5),
                dataView.getUint8(offset + 6),
                dataView.getUint8(offset + 7)
            );

            if (type === 'tEXt') {
                const chunkData = new Uint8Array(buffer, offset + 8, length);
                const nullSeparatorIndex = chunkData.indexOf(0);
                const keyword = new TextDecoder("utf-8").decode(chunkData.slice(0, nullSeparatorIndex));

                if (keyword === 'chara') {
                    return new TextDecoder("utf-8").decode(chunkData.slice(nullSeparatorIndex + 1));
                }
            }

            if (type === 'IEND') break;

            offset += 12 + length; // length + type + crc
        }
        return null;
    }

// ▼▼▼ 使用这个【终极兼容版】函数，完整替换你旧的 processAndSaveImportedCard 函数 ▼▼▼
async function processAndSaveImportedCard(cardData, fileName = '导入的角色卡', options = {}) {
    // 兼容多种酒馆卡格式 (TavernAI / SillyTavern)
    const data = cardData.data || cardData;
    const charName = data.name || fileName.replace(/\.(json|png)$/i, '') || '未命名角色';

    let associatedWorldBookIds = [];
    let worldBookContent = [];

    // --- 全新：更强大的世界书处理逻辑 ---
    // 优先级 1: 检查 SillyTavern 的 character_book 格式
    if (data.character_book && data.character_book.entries && typeof data.character_book.entries === 'object') {
        console.log("检测到 'character_book' 格式世界书...");
        worldBookContent = Object.values(data.character_book.entries).map(entry => ({
            enabled: !entry.disable,
            comment: entry.comment || '无备注',
            keys: entry.key || [],
            content: entry.content || ''
        })).filter(entry => entry.content);
    } 
    // 优先级 2: 检查 TavernAI 的 'world' 字符串格式
    else if (data.world && typeof data.world === 'string' && data.world.trim() !== '') {
        console.log("检测到 'world' 字符串格式世界书，正在解析...");
        worldBookContent = parseWorldBookString(data.world);
    } 
    // 优先级 3: 兼容旧的 'entries' 格式 (通常用于预设文件)
    else if (data.entries && typeof data.entries === 'object' && Object.keys(data.entries).length > 0) {
        console.log("检测到 'entries' 格式世界书...");
        worldBookContent = Object.values(data.entries).map(entry => ({
            enabled: !entry.disable,
            comment: entry.comment || '无备注',
            keys: entry.key || [],
            content: entry.content || ''
        })).filter(entry => entry.content);
    }
    // --- 世界书处理逻辑结束 ---

    // 如果成功提取到了世界书内容，就创建对应的分类和世界书
    if (worldBookContent.length > 0) {
        const worldBookName = `${charName}的世界书`;

        // 1. 创建一个新的局部世界书分类（文件夹）
        const categoryId = await db.worldBookCategories.add({
            name: worldBookName,
            scope: 'local',
            isEnabled: true,
            lastModified: Date.now()
        });

        // 2. 创建一个包含所有条目的世界书
        const worldBookId = await db.worldBooks.add({
            name: worldBookName,
            categoryId: categoryId,
            content: worldBookContent,
            isEnabled: true,
            scope: 'local',
            lastModified: Date.now()
        });
        associatedWorldBookIds.push(worldBookId);
        console.log(`成功为角色创建了包含 ${worldBookContent.length} 个条目的世界书！`);
    }
    
    // 创建新角色的逻辑保持不变
    const newChar = {
        name: charName,
        avatar: options.avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        persona: [
            data.description,
            data.personality,
            data.scenario
        ].filter(Boolean).join('\n\n').trim(),
        initialRelation: data.first_mes || '',
        
        remark: data.creator || '',
        birthday: '',
        gender: (data.gender && ['男', '女', '其他'].includes(data.gender)) ? data.gender : '男',
        mbti: '',
        networkInfo: { insName: '', insBio: '' },
        initialLikability: 0,
        languageStyle: { noPunctuation: false, noToneWords: false, noEmoji: false, noEmoticon: false },
        associatedWorldBookIds: associatedWorldBookIds, // 这里现在会自动关联新建的世界书
        associatedUserPersonaId: null,
        history: [],
        offlineHistory: [],
        diaries: { normal: [], secret: [] },
        enableHtmlRendering: false,
        psiteData: { userId: null, notes: [], favorites: [], history: [] },
        forumData: {},
        timestamp: Date.now()
    };

    await db.characters.add(newChar);
    alert(`角色“${charName}”已成功导入！`);
    await renderChatList();
    await renderContactsList();
}
// ▲▲▲ 替换结束 ▲▲▲
    // --- 新增：自定义气泡功能核心函数 ---

    async function renderBubbleEditorScreen(charId) {
        const character = await db.characters.get(charId);
        const cssInput = get('bubble-css-input');

        // 1. 加载并显示已保存的CSS
        cssInput.value = character.customBubbleCss || '';
        updateBubblePreview(); // 初始化预览

        // 2. 绑定Tab切换事件
        get('bubble-editor-screen').querySelectorAll('.bubble-editor-tab').forEach(tab => {
            tab.onclick = () => {
                get('bubble-editor-screen').querySelectorAll('.bubble-editor-tab, .bubble-editor-pane').forEach(el => el.classList.remove('active'));
                tab.classList.add('active');
                get(tab.dataset.pane).classList.add('active');
            };
        });

        // 3. 绑定编辑器控件事件
        const editorControls = [
            'user-bubble-bg-picker', 'user-bubble-color-picker',
            'ai-bubble-bg-picker', 'ai-bubble-color-picker',
            'bubble-radius-slider'
        ];
        editorControls.forEach(id => {
            get(id).oninput = generateCssFromEditor;
        });

        // 4. 绑定代码输入区事件
        cssInput.oninput = updateBubblePreview;

        // 5. 绑定保存和重置按钮
        get('save-bubble-style-btn').onclick = () => saveCustomBubbleCss(charId);
        get('reset-bubble-style-btn').onclick = () => resetCustomBubbleCss();
    }

    // 从可视化编辑器生成CSS代码
    function generateCssFromEditor() {
        const userBg = get('user-bubble-bg-picker').value;
        const userColor = get('user-bubble-color-picker').value;
        const aiBg = get('ai-bubble-bg-picker').value;
        const aiColor = get('ai-bubble-color-picker').value;
        const radius = get('bubble-radius-slider').value;

        const css = `
    /* 由编辑器生成 */
    .chat-message.user .chat-bubble {
        background-color: ${userBg || 'var(--user-bubble-bg)'};
        color: ${userColor || '#000'};
        border-radius: ${radius}px;
    }

    .chat-message.ai .chat-bubble {
        background-color: ${aiBg || 'var(--ai-bubble-bg)'};
        color: ${aiColor || 'var(--primary-text)'};
        border-radius: ${radius}px;
    }
        `;

        get('bubble-css-input').value = css.trim();
        updateBubblePreview();
    }

    // 更新预览区域的样式 (V2 - 增强版)
    function updateBubblePreview() {
        const cssCode = get('bubble-css-input').value;
        const previewStyleTag = get('bubble-preview-style');

        // 使用更强大的方法为所有CSS规则添加作用域，确保只影响预览区
        // 这会找到所有的CSS选择器，并在它们前面加上父容器的ID
        const scopedCss = cssCode.replace(/([^\r\n,{}]+)(,(?=[^}]*{)|s*{)/g, (match, selector) => {
            // 避免为 @keyframes 等规则添加作用域
            if (selector.trim().startsWith('@')) {
                return match;
            }
            // 为每个选择器（包括用逗号分隔的）添加父级ID
            const scopedSelector = selector.split(',').map(part => {
                return `#bubble-editor-screen .bubble-preview-container ${part.trim()}`;
            }).join(', ');

            return `${scopedSelector} ${match.endsWith(',') ? ',' : '{'}`;
        });

        previewStyleTag.innerHTML = scopedCss;
    }

    // 保存自定义CSS到数据库
    async function saveCustomBubbleCss(charId) {
        const cssCode = get('bubble-css-input').value.trim();
        await db.characters.update(charId, { customBubbleCss: cssCode });
        await applyCustomBubbleStyles(charId); // 应用到全局
        alert('气泡样式已保存！');
        navigateBack();
    }

    // 重置编辑器和预览
    function resetCustomBubbleCss() {
        showIosConfirm('重置样式', '确定要清空所有自定义气泡样式吗？点击保存后生效。', () => {
            get('bubble-css-input').value = '';
            // 也可以重置可视化编辑器的值
            get('user-bubble-bg-picker').value = '#A9EA7A';
            get('user-bubble-color-picker').value = '#000000';
            get('ai-bubble-bg-picker').value = '#FFFFFF';
            get('ai-bubble-color-picker').value = '#000000';
            get('bubble-radius-slider').value = 8;
            updateBubblePreview();
        });
    }

    // 应用全局气泡样式的函数
    async function applyCustomBubbleStyles(charId) {
        const styleTag = get('custom-bubble-style');
        if (!charId) {
            styleTag.innerHTML = '';
            return;
        }
        const character = await db.characters.get(charId);
        if (character && character.customBubbleCss) {
            styleTag.innerHTML = character.customBubbleCss;
        } else {
            styleTag.innerHTML = '';
        }
    }


    // --- 初始化 ---
    async function init() {
        // --- 动态创建所有页面结构 ---
        get('home-screen').innerHTML = `<div class="home-screen-content"><div class="time-widget"><div id="home-time"></div><div id="home-date"></div></div><div class="app-swiper-container"><div class="app-page"></div><div class="app-page"></div></div><div class="home-dock"></div></div>`;
        get('settings-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</div><h1>设置</h1></div><div class="settings-content"><div class="settings-group"><div class="settings-item" onclick="navigateTo('user-profile-edit-screen')"><div class="settings-item-content"><span class="label">我的人设 (全局)</span><svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg></div></div><div class="settings-item" onclick="navigateTo('user-persona-management-screen')"><div class="settings-item-content"><span class="label">用户面具管理</span><svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg></div></div></div><div class="settings-group"><div class="settings-item" onclick="navigateTo('api-settings-screen')"><div class="icon-bg" style="background-color: #007AFF;"><svg class="svg-icon"><use href="#icon-key"/></svg></div><div class="settings-item-content"><span class="label">API 与模型设置</span><span id="api-status-value" class="value">未配置</span><svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg></div></div><div class="settings-item" onclick="navigateTo('global-beautification-screen')"><div class="icon-bg" style="background-color: #FF9500;"><svg class="svg-icon"><use href="#icon-paint-brush"/></svg></div><div class="settings-item-content"><span class="label">全局美化</span><svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg></div></div></div><div class="settings-group"><div class="settings-item"><div class="settings-item-content"><span class="label">暗色模式</span><label class="ios-switch"><input type="checkbox" id="dark-mode-switch"><span class="slider"></span></label></div></div></div><div class="settings-group"><div class="settings-item"><div class="icon-bg" style="background-color: #5856D6;"><svg class="svg-icon"><use href="#icon-data"/></svg></div><div class="settings-item-content"><span class="label">数据管理</span></div></div><div class="settings-item" onclick="exportAllData()"><div class="settings-item-content"><span class="label">导出全部数据</span></div></div><div class="settings-item" onclick="get('import-data-input').click()"><div class="settings-item-content"><span class="label">导入数据</span></div></div><div class="settings-item" onclick="handleClearAllData()"><div class="settings-item-content" style="border:none;"><span class="label destructive">清空所有数据</span></div></div></div></div>`;
        get('music-screen').innerHTML = `
            <div class="music-header">
                <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"></use></svg></div>
                <input type="text" class="music-search-bar" placeholder="搜索音乐、歌单">
                <img id="music-profile-btn" class="music-profile-btn">
            </div>
            <div class="music-content">
                <div class="music-categories">
                    <div class="music-category-item">
                        <div class="music-category-icon"><svg class="svg-icon"><use href="#icon-music-playlist"></use></svg></div>
                        <span class="music-category-label">我的歌单</span>
                    </div>
                    <div class="music-category-item">
                        <div class="music-category-icon"><svg class="svg-icon"><use href="#icon-music-recommend"></use></svg></div>
                        <span class="music-category-label">每日推荐</span>
                    </div>
                    <div class="music-category-item">
                        <div class="music-category-icon"><svg class="svg-icon"><use href="#icon-music-charts"></use></svg></div>
                        <span class="music-category-label">排行榜</span>
                    </div>
                    <div class="music-category-item">
                        <div class="music-category-icon"><svg class="svg-icon"><use href="#icon-music-radio"></use></svg></div>
                        <span class="music-category-label">电台</span>
                    </div>
                </div>
                <h2 class="music-section-title">为你推荐</h2>
                <div class="horizontal-scroll-container">
                    <div class="song-card">
                        <div class="song-card-cover" style="background-image: url('https://i.scdn.co/image/ab67616d0000b273b2b2b2b2b2b2b2b2b2b2b2b2')"></div>
                        <p class="song-card-title">深夜emo</p>
                        <p class="song-card-artist">精选歌单</p>
                    </div>
                    <div class="song-card">
                        <div class="song-card-cover" style="background-image: url('https://i.scdn.co/image/ab67616d0000b273a98f4b8a6e8b8a8a8a8a8a8a')"></div>
                        <p class="song-card-title">学习专注</p>
                        <p class="song-card-artist">白噪音</p>
                    </div>
                    <div class="song-card">
                        <div class="song-card-cover" style="background-image: url('https://i.scdn.co/image/ab67616d0000b273c8b8c8b8c8b8c8b8c8b8c8b8')"></div>
                        <p class="song-card-title">华语精选</p>
                        <p class="song-card-artist">热门流行</p>
                    </div>
                </div>
                 <h2 class="music-section-title">热门精选</h2>
                  <div class="horizontal-scroll-container">
                    <div class="song-card">
                        <div class="song-card-cover" style="background-image: url('https://i.scdn.co/image/ab67616d0000b273b2b2b2b2b2b2b2b2b2b2b2b2')"></div>
                        <p class="song-card-title">热门单曲1</p>
                        <p class="song-card-artist">歌手A</p>
                    </div>
                    <div class="song-card">
                        <div class="song-card-cover" style="background-image: url('https://i.scdn.co/image/ab67616d0000b273a98f4b8a6e8b8a8a8a8a8a8a')"></div>
                        <p class="song-card-title">热门单曲2</p>
                        <p class="song-card-artist">歌手B</p>
                    </div>
                </div>
            </div>
        `;
        get('user-profile-edit-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 设置</div><h1>全局人设</h1></div><div class="settings-content profile-edit-content"><div class="avatar-section" id="profile-edit-avatar-section"><img id="profile-edit-avatar" class="profile-edit-avatar"><span class="upload-avatar-text">编辑头像</span></div><div class="profile-form"><div class="form-group"><label for="profile-edit-name">昵称</label><input type="text" id="profile-edit-name"></div><div class="form-group"><label for="profile-edit-gender">性别</label><select id="profile-edit-gender"><option>男</option><option>女</option><option>其他</option></select></div><div class="form-group"><label for="profile-edit-birthday">生日</label><input type="date" id="profile-edit-birthday"><div id="birthday-info" style="font-size: 14px; color: var(--secondary-text); margin-top: 8px;"></div></div><div class="form-group"><label for="profile-edit-persona">我的人设</label><textarea id="profile-edit-persona"></textarea></div><button id="save-profile-btn" class="btn btn-primary">保存</button></div></div>`;
        get('user-persona-editor-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</div><h1>编辑面具</h1></div><div class="settings-content profile-edit-content"><div class="avatar-section" id="persona-edit-avatar-section"><img id="persona-edit-avatar" class="profile-edit-avatar"><span class="upload-avatar-text">编辑头像</span></div><div class="profile-form"><div class="form-group"><label for="persona-edit-name">面具名称</label><input type="text" id="persona-edit-name"></div><div class="form-group"><label for="persona-edit-gender">性别</label><select id="persona-edit-gender"><option>男</option><option>女</option><option>其他</option></select></div><div class="form-group"><label for="persona-edit-birthday">生日</label><input type="date" id="persona-edit-birthday"><div id="persona-birthday-info" style="font-size: 14px; color: var(--secondary-text); margin-top: 8px;"></div></div><div class="form-group"><label for="persona-edit-persona">人设</label><textarea id="persona-edit-persona"></textarea></div><button id="save-persona-btn" class="btn btn-primary">保存面具</button></div></div>`;
        get('user-persona-management-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 设置</div><h1>用户面具管理</h1></div><div class="settings-content"><div id="user-persona-list-container"></div><button id="add-new-persona-btn" class="btn btn-primary" style="margin-top: 20px;">添加新面具</button></div>`;
        get('api-settings-screen').innerHTML = `
    <div class="settings-header">
        <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 设置</div>
        <h1>API 与模型设置</h1>
    </div>
    <div class="settings-content">
        <!-- ▼▼▼ 新增的预设管理模块 ▼▼▼ -->
        <div class="settings-group">
            <div class="group-header">API 预设</div>
            <div class="form-group">
                <label for="api-preset-select">选择预设</label>
                <select id="api-preset-select">
                    <option value="">-- 手动配置 --</option>
                </select>
            </div>
            <div class="preset-actions" style="display: flex; gap: 10px; margin-top: 10px; padding: 0 16px 16px;">
                <button id="save-as-preset-btn" class="btn btn-secondary" style="flex:1;">另存为预设</button>
                <button id="update-preset-btn" class="btn btn-secondary" style="flex:1; display: none;">更新预设</button>
                <button id="delete-preset-btn" class="btn destructive" style="flex:1; display: none; background-color: var(--destructive-color);">删除预设</button>
            </div>
        </div>
        <!-- ▲▲▲ 新增结束 ▲▲▲ -->

        <div class="settings-group">
            <div class="group-header">API 连接</div>
            <div class="form-group"><label for="api-url-input">API URL</label><input type="text" id="api-url-input" placeholder="例如: https://api.openai.com"></div>
            <div class="form-group"><label for="api-key-input">API Key</label><input type="password" id="api-key-input"></div>
            <button id="connect-api-btn" class="btn btn-secondary">连接并获取模型</button>
            <div class="form-group" style="margin-top: 20px;"><label for="api-model-select">模型</label><select id="api-model-select" disabled><option>请先连接</option></select></div>
        </div>
        <div class="settings-group">
            <div class="group-header">模型参数</div>
            <div class="form-group slider-group"><div class="label-row"><label>Temperature</label><span id="temperature-value">1.0</span></div><div id="temperature-slider-container" class="svg-slider-container"></div></div>
            <div class="form-group slider-group"><div class="label-row"><label>Top P</label><span id="top-p-value">1.0</span></div><div id="top-p-slider-container" class="svg-slider-container"></div></div>
            <div class="form-group slider-group"><div class="label-row"><label>Frequency Penalty</label><span id="freq-penalty-value">0.0</span></div><div id="freq-penalty-slider-container" class="svg-slider-container"></div></div>
        </div>
        <div class="settings-group">
            <div class="group-header">线下模式设置</div>
            <div class="form-group slider-group"><div class="label-row"><label>字数限制</label><span id="word-count-value">800</span></div><div id="word-count-slider-container" class="svg-slider-container"></div></div>
            <div class="settings-item" style="padding-left: 0;"><div class="settings-item-content" style="border: none;"><span class="label">流式输出</span><label class="ios-switch"><input type="checkbox" id="streaming-output-switch"><span class="slider"></span></label></div></div>
        </div>
        <button id="save-api-settings-btn" class="btn btn-primary">保存当前设置</button>
    </div>
`;
        get('check-phone-char-list-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</div><h1>选择要查看的手机</h1></div><div class="settings-content" id="check-phone-char-list-container"></div>`;
        get('check-phone-home-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</div><h1 id="ai-phone-title">TA的手机</h1></div><div class="page-content"><div class="ai-phone-app-grid"></div></div>`;
        get('check-phone-diary-screen').innerHTML = `<div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;"><div class="back-bar" onclick="navigateBack()" style="position: static; margin: 0; flex-basis: 60px;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</div><h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">日记</h1><div class="header-actions"><div id="diary-lock-icon" style="cursor: pointer;"><svg class="svg-icon" width="24" height="24" style="color: var(--primary-text);"><use href="#icon-lock"/></svg></div><button id="generate-diary-btn" style="background:none; border:none; padding:0; cursor:pointer;"><svg class="svg-icon" width="24" height="24" style="color: var(--primary-text);"><use href="#icon-generate"/></svg></button><span class="action-btn" id="diary-manage-btn" style="padding:0;">管理</span></div></div><div class="settings-content" id="diary-list-container"></div>`;
        get('diary-view-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</div><h1 id="diary-view-title"></h1></div><div class="settings-content"><p id="diary-view-content"></p></div>`;
        get('diary-password-screen').innerHTML = `<div class="password-container"><span class="password-prompt">输入密码</span><div class="password-dots"><div class="password-dot"></div><div class="password-dot"></div><div class="password-dot"></div><div class="password-dot"></div><div class="password-dot"></div><div class="password-dot"></div></div><div class="numpad"></div><button id="cancel-password-btn" style="background:none; border:none; color:white; font-size: 16px; cursor:pointer;">取消</button></div>`;
        get('wechat-screen').innerHTML = `<div class="wechat-header"><div class="back-bar-container"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" viewBox="0 0 24 24"><use href="#icon-back"/></svg></div></div><div class="wechat-title">微信</div><div class="wechat-header-actions"><div style="cursor: pointer; display: flex; align-items: center; justify-content: center;"><svg class="svg-icon"><use href="#icon-search"/></svg></div><div id="wechat-add-btn-wrapper"><svg class="svg-icon"><use href="#icon-plus-circle"/></svg></div></div></div><div class="wechat-content"><div id="wechat-chat-list" class="active"></div><div id="wechat-contacts-list"></div></div><nav class="wechat-bottom-nav"><button id="wechat-nav-chat" class="wechat-nav-btn active"><svg class="svg-icon"><use href="#icon-wechat-chat"/></svg><span>微信</span></button><button id="wechat-nav-contacts" class="wechat-nav-btn"><svg class="svg-icon"><use href="#icon-wechat-contacts"/></svg><span>通讯录</span></button><button class="wechat-nav-btn"><svg class="svg-icon"><use href="#icon-wechat-discover"/></svg><span>发现</span></button><button class="wechat-nav-btn"><svg class="svg-icon"><use href="#icon-wechat-me"/></svg><span>我</span></button></nav>`;
        get('chat-conversation-screen').innerHTML = `<div class="wechat-header"><div class="back-bar-container"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" viewBox="0 0 24 24"><use href="#icon-back"/></svg></div></div><div id="chat-header-title" class="wechat-title"></div><div class="wechat-header-actions"><svg id="chat-settings-btn" class="svg-icon" style="cursor: pointer;"><use href="#icon-more-horizontal"/></svg></div></div><div class="chat-messages-container"></div><div class="chat-input-footer"><button id="chat-plus-btn" class="footer-icon-btn"><svg><use href="#icon-chat-plus"></use></svg></button><textarea id="chat-input-text" rows="1" placeholder=""></textarea><button id="chat-emoji-btn" class="footer-icon-btn"><svg><use href="#icon-chat-emoji"></use></svg></button><button id="chat-action-btn" class="footer-icon-btn"><svg><use href="#icon-chat-send"></use></svg></button></div><div id="chat-action-panel"><div class="panel-swiper-container" id="panel-swiper-wrapper"></div><div id="panel-pagination"></div><div id="panel-pagination"></div></div><div id="chat-sticker-panel"><div class="sticker-category-bar" id="sticker-category-bar"></div><div class="sticker-grid-container" id="sticker-grid-container"></div><div class="sticker-management-bar"><button id="sticker-delete-btn" class="btn destructive">删除</button><button id="sticker-group-btn" class="btn btn-secondary">分组</button></div></div>`;
        get('character-editor-screen').innerHTML = `<div class="settings-header"><span class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</span><span class="save-btn" id="save-character-btn">保存</span></div>
        <div class="settings-content" id="character-editor-content">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 15px; margin-bottom: 20px;">
                <img id="char-editor-avatar" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" class="profile-edit-avatar">
                <div class="avatar-upload-options">
                    <button id="char-avatar-upload-local" class="btn btn-secondary">本地上传</button>
                    <button id="char-avatar-upload-url" class="btn btn-secondary">URL上传</button>
                </div>
                <input type="file" id="char-avatar-file-input" accept="image/*" style="display:none">
            </div>
            <details class="collapsible-section" open>
                <summary>基础信息与人设 <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg></summary>
                <div class="section-content">
                    <div class="form-group"><label>姓名 (char的真实姓名)</label><input id="char-name"></div>
                    <div class="form-group"><label>备注 (显示在聊天列表)</label><input id="char-remark"></div>
                    <div class="form-group"><label>出生日期</label><input type="date" id="char-birthday"><div id="char-birthday-info" style="font-size: 14px; color: var(--secondary-text); margin-top: 8px;"></div></div>
                    <div class="form-group"><label>性别</label><select id="char-gender"><option>男</option><option>女</option><option>其他</option></select></div>
                    <div class="form-group"><label>MBTI</label><input id="char-mbti" placeholder="例如: INFP"></div>
                    <div class="form-group"><label>人设 (基础人设)</label><textarea id="char-persona" rows="10"></textarea></div>
                </div>
            </details>
            <details class="collapsible-section">
                <summary>网络信息 <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg></summary>
                <div class="section-content">
                    <div class="form-group"><label>Ins 网名</label><input id="char-ins-name"></div>
                    <div class="form-group"><label>Ins 简介</label><textarea id="char-ins-bio"></textarea></div>
                    <button id="generate-network-info" class="btn btn-primary">智能生成 <span class="spinner"></span></button>
                </div>
            </details>
            <details class="collapsible-section">
                <summary>初始关系设定 <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg></summary>
                <div class="section-content">
                    <div class="form-group"><label>初始关系</label><input id="char-relation" placeholder="例如: 兄妹, 主仆"></div>
                    <div class="form-group slider-group">
                        <div class="label-row"><label>初始好感度</label><span id="likability-value">0</span></div>
                         <div id="likability-slider-container" class="svg-slider-container"></div>
                    </div>
                </div>
            </details>
            <details class="collapsible-section" open>
                <summary>聊天与关联设置 <svg class="chevron" width="8" height="13"><use href="#icon-chevron-right"/></svg></summary>
                <div class="section-content">
                    <div class="form-group">
                        <label>线上语言风格</label>
                        <div class="language-style-options">
                            <label><input type="checkbox" data-style="noPunctuation">不发送句末标点符号</label>
                            <label><input type="checkbox" data-style="noToneWords">不发送语气短句 (哈？嗯)</label>
                            <label><input type="checkbox" data-style="noEmoji">不发送emoji</label>
                            <label><input type="checkbox" data-style="noEmoticon">不发送颜文字</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>世界书关联</label>
                        <button id="associate-wb-btn" class="btn btn-secondary">关联局部世界书</button>
                    </div>
                    <div class="form-group">
                        <label>关联用户面具</label>
                        <button id="associate-user-persona-btn" class="btn btn-secondary">选择或新建用户面具</button>
                        <div id="current-user-persona-info" style="font-size: 14px; color: var(--secondary-text); margin-top: 8px;">未关联</div>
                    </div>
                </div>
            </details>
        </div>`;
        get('world-book-screen').innerHTML = `<div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;"><span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</span><h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">世界书</h1><div class="header-actions"><span class="action-btn" id="world-book-manage-category-btn">管理分类</span><span class="action-btn" id="world-book-add-btn">添加</span></div></div><div class="world-book-tabs"><button id="world-book-tab-global" class="world-book-tab-btn active">全局世界书</button><button id="world-book-tab-local" class="world-book-tab-btn">局部世界书</button></div><div class="settings-content" id="world-book-list-container" style="padding-top:0;"></div>`;
        get('world-book-category-view-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 世界书</div><h1 id="world-book-category-view-title"></h1></div><div class="settings-content" id="world-book-category-view-list"></div>`;
        get('world-book-editor-screen').innerHTML = `<div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;"><span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 世界书</span><h1 id="world-book-editor-title" style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);"></h1><button id="save-world-book-btn">保存</button></div><div class="settings-content"><div class="form-group"><label for="world-book-name-input">书名</label><input type="text" id="world-book-name-input"></div><div class="form-group"><label for="world-book-category-select">分类</label><select id="world-book-category-select"></select></div><label>内容条目</label><div id="world-book-entries-container" style="margin-top: 8px;"></div><button id="add-world-book-entry-btn" class="btn btn-secondary">[+] 添加新条目</button></div>`;
        get('world-book-category-screen').innerHTML = `<div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;"><span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 世界书</span><h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">管理分类</h1><button id="save-world-book-categories-btn" style="font-size: 17px; font-weight: 600; color: var(--accent-color); cursor: pointer; background: none; border: none; padding: 0;">保存</button></div><div class="settings-content"><div id="world-book-category-list"></div><button id="add-world-book-category-btn" class="btn btn-secondary">[+] 添加新分类</button></div>`;
        get('preset-screen').innerHTML = `<div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;"><span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</span><h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">预设</h1><div class="header-actions"><span class="action-btn" id="preset-manage-btn">管理</span><span class="action-btn" id="preset-add-btn">添加</span></div></div><div class="settings-content" id="preset-list-container"></div>`;
        get('preset-editor-screen').innerHTML = `<div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;"><span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 预设</span><h1 id="preset-editor-title" style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);"></h1><div class="header-actions"><div id="search-preset-entries-btn" style="cursor: pointer;"><svg class="svg-icon" width="24" height="24" style="color: var(--accent-color);"><use href="#icon-search"/></svg></div><button id="save-preset-btn">保存</button></div></div><div class="settings-content"><div class="form-group"><label for="preset-name-input">预设名称</label><input type="text" id="preset-name-input"></div><label>内容条目</label><div id="preset-entries-container" style="margin-top: 8px;"></div><button id="add-preset-entry-btn" class="btn btn-secondary">[+] 添加新条目</button></div>`;
        get('chat-settings-screen').innerHTML = `<!-- 内容将由 renderChatSettingsScreen 动态生成 -->`;
        get('beautification-settings-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 聊天设置</div><h1>美化设置</h1></div>
            <div class="settings-content">
                <div class="settings-group">
                    <div class="settings-item"><div class="settings-item-content"><span class="label">聊天背景</span></div></div>
                    <div class="beautification-content">
                        <img id="chat-bg-preview" src="">
                        <div class="beautification-actions">
                            <button id="upload-chat-bg-btn" class="btn btn-secondary">上传背景</button>
                            <button id="reset-chat-bg-btn" class="btn btn-secondary">重置</button>
                        </div>
                    </div>
                </div>
                <button id="save-chat-bg-btn" class="btn btn-primary">保存</button>
            </div>`;
        get('global-beautification-screen').innerHTML = `<div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;"><span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 设置</span><h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">全局美化</h1><button id="save-global-beautification-btn" style="font-size: 17px; font-weight: 600; color: var(--accent-color); cursor: pointer; background: none; border: none; padding: 0;">保存</button></div>
            <div class="settings-content">
                <div class="settings-group">
                    <div class="settings-item">
                        <div class="settings-item-content" style="border: none;">
                            <span class="label">手机壁纸</span>
                            <button id="reset-wallpaper-btn" style="background: none; border: none; cursor: pointer; padding: 5px;">
                                <svg class="svg-icon" width="22" height="22" style="color: var(--secondary-text);"><use href="#icon-reset"/></svg>
                            </button>
                        </div>
                    </div>
                    <div id="wallpaper-preview"></div>
                    <div style="padding: 0 16px 16px;">
                         <button id="change-wallpaper-btn" class="btn btn-secondary">更换壁纸</button>
                    </div>
                </div>
                <div class="settings-group">
                    <div class="settings-item">
                        <div class="settings-item-content color-picker-wrapper">
                             <span class="label">主题色</span>
                             <input type="color" id="accent-color-input">
                        </div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-content color-picker-wrapper" style="border-top: 0.5px solid var(--border-color);">
                            <span class="label">充电颜色</span>
                            <input type="color" id="charging-color-input">
                        </div>
                    </div>
                </div>
                <div class="settings-group">
                    <div class="group-header">字体管理</div>
                    <div class="form-group slider-group" style="padding: 0 16px;">
                        <div class="label-row"><label>字体大小</label><span id="font-size-value">14px</span></div>
                        <div id="font-size-slider-container" class="svg-slider-container"></div>
                    </div>
                    <div id="font-preset-list"></div>
                    <div style="padding: 0 16px 16px;">
                        <button id="add-font-preset-btn" class="btn btn-secondary">添加字体</button>
                    </div>
                </div>
                 <div class="settings-group">
                    <div class="settings-item">
                         <div class="settings-item-content" style="border: none;">
                            <span class="label">App图标更换</span>
                            <button id="reset-icons-btn" style="background: none; border: none; cursor: pointer; padding: 5px;">
                                <svg class="svg-icon" width="22" height="22" style="color: var(--secondary-text);"><use href="#icon-reset"/></svg>
                            </button>
                        </div>
                    </div>
                    <div id="app-icon-preview-grid"></div>
                </div>
            </div>`;
        get('psite-screen').innerHTML = `
            <div class="psite-header">
                <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon"><use href="#icon-back"/></svg></div>
                <span class="title">P-Site</span>
                <div class="header-action"><svg class="svg-icon"><use href="#icon-settings-gear"/></svg></div>
            </div>
            <div class="psite-content">
                <div id="psite-discover-tab" class="psite-tab-content">
                    <p style="text-align:center; padding: 40px; color: var(--psite-secondary-text);">发现功能开发中...</p>
                </div>
                <div id="psite-messages-tab" class="psite-tab-content">
                    <p style="text-align:center; padding: 40px; color: var(--psite-secondary-text);">私信功能开发中...</p>
                </div>
                <div id="psite-profile-tab" class="psite-tab-content active">
                    <div class="psite-profile-header">
                        <img class="psite-profile-avatar">
                        <div class="psite-profile-info">
                            <div class="psite-profile-name"></div>
                            <div class="psite-profile-id"></div>
                        </div>
                    </div>
                    <div class="psite-profile-subnav">
                        <button class="psite-subnav-btn active" data-subtab="notes">笔记</button>
                        <button class="psite-subnav-btn" data-subtab="favorites">收藏</button>
                        <button class="psite-subnav-btn" data-subtab="history">历史</button>
                    </div>
                    <div id="psite-profile-content-list" class="psite-content-list"></div>
                </div>
            </div>
            <nav class="psite-bottom-nav">
                <button id="psite-nav-discover" class="psite-nav-btn" data-tab="discover"><svg class="svg-icon"><use href="#icon-psite-discover"/></svg><span>发现</span></button>
                <button id="psite-nav-messages" class="psite-nav-btn" data-tab="messages"><svg class="svg-icon"><use href="#icon-psite-messages"/></svg><span>私信</span></button>
                <button id="psite-nav-profile" class="psite-nav-btn active" data-tab="profile"><svg class="svg-icon"><use href="#icon-psite-profile"/></svg><span>个人</span></button>
            </nav>
        `;
        get('psite-post-view-screen').innerHTML = `<!-- 内容动态生成 -->`;
        get('offline-mode-screen').innerHTML = `
            <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon"><use href="#icon-back"/></svg></div>
            <div id="offline-mode-content"></div>
            <div id="offline-mode-sidebar" class="offline-mode-sidebar">
                <button class="sidebar-btn" title="预设"><svg class="svg-icon"><use href="#icon-sidebar-preset"/></svg></button>
                <button class="sidebar-btn" title="世界书"><svg class="svg-icon"><use href="#icon-sidebar-worldbook"/></svg></button>
                <button id="offline-regex-btn" class="sidebar-btn" title="正则替换"><svg class="svg-icon"><use href="#icon-sidebar-regex"/></svg></button>
                <button class="sidebar-btn" title="开场白"><svg class="svg-icon"><use href="#icon-sidebar-opening"/></svg></button>
                <button id="offline-persona-select-btn" class="sidebar-btn" title="人设切换"><svg class="svg-icon"><use href="#icon-sidebar-personas"/></svg></button>
                <button id="offline-char-select-btn" class="sidebar-btn" title="角色选择"><svg class="svg-icon"><use href="#icon-sidebar-character"/></svg></button>
                <button id="offline-other-settings-btn" class="sidebar-btn" title="其他设置"><svg class="svg-icon"><use href="#icon-settings-gear"/></svg></button>
            </div>
            <div id="offline-sidebar-toggle">
                 <svg class="svg-icon" width="16" height="16"><use href="#icon-sidebar-toggle"/></svg>
            </div>
            <div class="offline-mode-footer">
                <button id="offline-reroll-btn" class="footer-icon-btn" title="重新生成"><svg><use href="#icon-panel-reroll"></use></svg></button>
                <textarea id="offline-mode-input" rows="1" placeholder="输入你的行动..."></textarea>
                <button id="offline-send-btn" class="footer-icon-btn" title="发送"><svg><use href="#icon-chat-send"></use></svg></button>
            </div>`;
        get('regex-editor-screen').innerHTML = `
            <div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 线下模式</span>
                <h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">正则替换</h1>
                <div class="header-actions">
                    <button id="add-regex-rule-btn" style="background:none; border:none; padding:0; cursor:pointer;">
                        <svg class="svg-icon" width="24" height="24" style="color: var(--accent-color);"><use href="#icon-plus-circle"/></svg>
                    </button>
                </div>
            </div>
            <div class="settings-content" id="regex-rules-container"></div>
        `;
        get('forum-char-list-screen').innerHTML = `<div class="settings-header"><div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</div><h1>选择角色进入论坛</h1></div><div class="settings-content"></div>`;
        get('forum-screen').innerHTML = `<div class="forum-header">
                <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg></div>
                <span class="title">匿名论坛</span>
                <div class="header-actions">
                    <button class="refresh-btn"><svg class="svg-icon"><use href="#icon-reset"/></svg></button>
                </div>
            </div>
            <div class="forum-tabs"></div>
            <div class="forum-content"></div>`;
        get('forum-post-detail-screen').innerHTML = `<!-- 内容动态生成 -->`;
        get('bubble-editor-screen').innerHTML = `
            <style id="bubble-preview-style"></style> <!-- 仅用于此页面预览的样式 -->
            <div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 返回</span>
                <h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">自定义气泡</h1>
                <div class="header-actions">
                    <span class="action-btn" id="reset-bubble-style-btn">重置</span>
                    <span class="action-btn" id="save-bubble-style-btn">保存</span>
                </div>
            </div>
            <div class="settings-content" style="padding: 0; display: flex; flex-direction: column;">
                <div class="bubble-editor-tabs">
                    <button class="bubble-editor-tab active" data-pane="bubble-editor-pane">气泡编辑器</button>
                    <button class="bubble-editor-tab" data-pane="bubble-code-pane">代码输入区</button>
                </div>

                <div id="bubble-editor-pane" class="bubble-editor-pane active">
                    <!-- 气泡编辑器控件将在这里 -->
                    <div class="form-group"><label>用户气泡背景色</label><input type="color" id="user-bubble-bg-picker"></div>
                    <div class="form-group"><label>用户气泡文字颜色</label><input type="color" id="user-bubble-color-picker"></div>
                    <div class="form-group"><label>AI气泡背景色</label><input type="color" id="ai-bubble-bg-picker"></div>
                    <div class="form-group"><label>AI气泡文字颜色</label><input type="color" id="ai-bubble-color-picker"></div>
                    <div class="form-group"><label>圆角大小 (px)</label><input type="range" id="bubble-radius-slider" min="0" max="25" value="8"></div>
                </div>

                <div id="bubble-code-pane" class="bubble-editor-pane">
                    <textarea id="bubble-css-input" placeholder="在此输入自定义CSS代码...\n例如:\n.chat-message.user .chat-bubble {\n  background: linear-gradient(to right, #6a11cb, #2575fc);\n  color: white;\n  border-radius: 20px;\n}\n.chat-message.ai .chat-bubble {\n  background: #f0f0f0;\n}"></textarea>
                </div>

                <div class="bubble-preview-container">
                    <div class="preview-message user">
                        <div class="bubble-preview-container">
                    <div class="chat-message user">
                        <div class="chat-bubble">这是你的消息气泡样式预览。</div>
                    </div>
                    <div class="chat-message ai">
                        <div class="chat-bubble">这是对方的消息气泡样式预览，可以测试一下长文本换行的效果哦。</div>
                    </div>
                </div>
            </div>
        `;


        // --- SVG 滑块创建与初始化 ---
        createSvgSlider(get('temperature-slider-container'), { min: 0, max: 2, step: 0.1, value: 1.0 });
        createSvgSlider(get('top-p-slider-container'), { min: 0, max: 1, step: 0.05, value: 1.0 });
        createSvgSlider(get('freq-penalty-slider-container'), { min: -2, max: 2, step: 0.1, value: 0.0 });
        createSvgSlider(get('word-count-slider-container'), { min: 100, max: 2000, step: 50, value: 800 });
        createSvgSlider(get('likability-slider-container'), { min: -999, max: 999, step: 1, value: 0 });
        createSvgSlider(get('font-size-slider-container'), { min: 10, max: 20, step: 1, value: 14 });

        await loadState();
        updateTime();
        setInterval(updateTime, 30000);
        updateBattery();
        if (navigator.getBattery) {
            navigator.getBattery().then(bat => {
                bat.addEventListener('levelchange', () => updateBattery(bat));
                bat.addEventListener('chargingchange', () => updateBattery(bat));
            });
        }
        renderHomeScreenApps();
        setupSettingsListeners();
        setupPasswordScreen();
        setupWeChatListeners();
        renderChatActionPanel();

        document.querySelectorAll('.action-sheet-overlay .cancel-btn, .action-sheet-overlay').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('action-sheet-overlay') || e.target.classList.contains('cancel-btn')) {
                    const overlay = e.target.closest('.action-sheet-overlay');
                    if (overlay) overlay.classList.remove('active');
                }
            });
        });

        get('dark-mode-switch').addEventListener('change', async (e) => {
            state.isDarkMode = e.target.checked;
            document.body.classList.toggle('dark-mode', state.isDarkMode);
            await saveState();
        });

        // 世界书事件绑定
        get('world-book-tab-global').addEventListener('click', () => renderWorldBookScreen('global'));
        get('world-book-tab-local').addEventListener('click', () => renderWorldBookScreen('local'));
        get('world-book-add-btn').addEventListener('click', () => showActionSheet('add-world-book-sheet'));
        get('upload-from-file-btn').addEventListener('click', () => { get('add-world-book-sheet').classList.remove('active'); get('world-book-upload-input').click(); });
        get('add-new-book-btn').addEventListener('click', async () => {
            get('add-world-book-sheet').classList.remove('active');
            const currentScope = get('world-book-screen').dataset.currentScope || 'global';
            const id = await db.worldBooks.add({ name: '未命名世界书', content: [], isEnabled: true, scope: currentScope, categoryId: null, lastModified: Date.now() });
            openWorldBookEditor(id);
        });
        get('world-book-upload-input').addEventListener('change', handleWorldBookUpload);
        get('world-book-manage-category-btn').addEventListener('click', () => { renderWorldBookCategoryScreen(); navigateTo('world-book-category-screen'); });
        get('add-world-book-entry-btn').addEventListener('click', () => {
            const container = get('world-book-entries-container');
            if (container.querySelector('p')) container.innerHTML = '';
            container.appendChild(createWorldBookEntryBlock())
        });
        get('save-world-book-btn').addEventListener('click', saveWorldBook);
        get('add-world-book-category-btn').addEventListener('click', async () => {
            const name = prompt('请输入新分类名称');
            if (name && name.trim()) {
                const currentScope = get('world-book-screen').dataset.currentScope || 'global';
                await db.worldBookCategories.add({ name: name.trim(), isEnabled: true, scope: currentScope, lastModified: Date.now() });
                renderWorldBookCategoryScreen();
            }
        });
        get('save-world-book-categories-btn').addEventListener('click', saveWorldBookCategories);

        const categoryActionSheet = get('world-book-category-action-sheet');
        get('enable-all-in-category-btn').addEventListener('click', async () => {
            const catId = parseInt(categoryActionSheet.dataset.categoryId);
            if (catId) {
                await db.worldBooks.where('categoryId').equals(catId).modify({ isEnabled: true });
                await db.worldBookCategories.update(catId, { lastModified: Date.now() });
                alert('已全部启用');
            }
            categoryActionSheet.classList.remove('active');
        });
        get('disable-all-in-category-btn').addEventListener('click', async () => {
            const catId = parseInt(categoryActionSheet.dataset.categoryId);
            if (catId) {
                await db.worldBooks.where('categoryId').equals(catId).modify({ isEnabled: false });
                await db.worldBookCategories.update(catId, { lastModified: Date.now() });
                alert('已全部禁用');
            }
            categoryActionSheet.classList.remove('active');
        });


        // 预设功能事件绑定
        get('preset-add-btn').addEventListener('click', () => showActionSheet('add-preset-sheet'));
        get('upload-preset-from-file-btn').addEventListener('click', () => { get('add-preset-sheet').classList.remove('active'); get('preset-upload-input').click(); });
        get('add-new-preset-btn').addEventListener('click', async () => {
            get('add-preset-sheet').classList.remove('active');
            const newPresetData = { name: '未命名预设', content: [], isEnabled: true };
            const id = await db.presets.add(newPresetData);
            openPresetEditor(id);
        });
        get('preset-upload-input').addEventListener('change', handlePresetUpload);
        get('preset-manage-btn').addEventListener('click', togglePresetManagementMode);
        get('save-preset-btn').addEventListener('click', savePreset);
        get('add-preset-entry-btn').addEventListener('click', () => {
            const container = get('preset-entries-container');
            if (container.querySelector('p')) container.innerHTML = '';
            container.appendChild(createPresetEntryBlock());
        });
        get('search-preset-entries-btn').addEventListener('click', searchPresetEntries);

        // 添加角色 Action Sheet 事件绑定
        get('add-char-manual-btn').addEventListener('click', () => {
            get('add-character-sheet').classList.remove('active');
            navigateTo('character-editor-screen');
        });
        get('import-char-card-btn').addEventListener('click', () => {
            get('add-character-sheet').classList.remove('active');
            get('character-import-input').click();
        });
        // *** 新增：角色卡导入事件监听 ***
        get('character-import-input').addEventListener('change', handleCharacterImport);


        // 用户资料编辑页事件绑定
        get('profile-edit-avatar-section').addEventListener('click', () => get('profile-avatar-upload-input').click());
        get('profile-avatar-upload-input').addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { get('profile-edit-avatar').src = event.target.result; get('profile-edit-avatar').dataset.newAvatar = event.target.result; }; reader.readAsDataURL(file); } });
        get('profile-edit-birthday').addEventListener('change', (e) => updateBirthdayInfo(e.target.value, 'birthday-info'));
        get('save-profile-btn').addEventListener('click', saveUserProfile);

        // 用户面具编辑页事件绑定
        get('persona-edit-avatar-section').addEventListener('click', () => get('user-persona-avatar-upload-input').click());
        get('user-persona-avatar-upload-input').addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => get('persona-edit-avatar').src = event.target.result; reader.readAsDataURL(file); } });
        get('persona-edit-birthday').addEventListener('change', (e) => updateBirthdayInfo(e.target.value, 'persona-birthday-info'));
        get('add-new-persona-btn').addEventListener('click', () => navigateTo('user-persona-editor-screen'));

        // 角色编辑页事件绑定
        get('char-birthday').addEventListener('change', (e) => updateBirthdayInfo(e.target.value, 'char-birthday-info'));
        get('char-avatar-upload-local').onclick = () => get('char-avatar-file-input').click();
        get('char-avatar-file-input').onchange = (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => get('char-editor-avatar').src = event.target.result; reader.readAsDataURL(file); } };

        // 美化设置页面事件绑定
        get('upload-chat-bg-btn').onclick = () => get('chat-bg-upload-input').click();
        get('reset-chat-bg-btn').onclick = () => handleResetChatBackground(currentPageData.charId);
        get('save-chat-bg-btn').onclick = () => handleSaveChatBackground(currentPageData.charId);
        get('chat-bg-upload-input').addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { get('chat-bg-preview').src = event.target.result; get('chat-bg-preview').dataset.newBg = event.target.result; }; reader.readAsDataURL(file); } });

        // 全局美化页面事件绑定
        get('save-global-beautification-btn').addEventListener('click', saveGlobalBeautification);
        get('change-wallpaper-btn').addEventListener('click', () => showActionSheet('upload-wallpaper-sheet'));
        get('wallpaper-upload-local-btn').addEventListener('click', () => {
            get('upload-wallpaper-sheet').classList.remove('active');
            get('wallpaper-file-input').click();
        });
        get('wallpaper-upload-url-btn').addEventListener('click', () => {
            get('upload-wallpaper-sheet').classList.remove('active');
            const url = prompt('请输入壁纸图片的URL:');
            if (url) {
                const preview = get('wallpaper-preview');
                preview.style.backgroundImage = `url(${url})`;
                preview.dataset.newWallpaper = url;
            }
        });
        get('wallpaper-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = get('wallpaper-preview');
                    preview.style.backgroundImage = `url(${event.target.result})`;
                    preview.dataset.newWallpaper = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
        get('reset-wallpaper-btn').addEventListener('click', () => {
            const preview = get('wallpaper-preview');
            preview.style.backgroundImage = `url(${defaultState.wallpaperUrl})`;
            preview.dataset.newWallpaper = defaultState.wallpaperUrl;
            alert('壁纸已重置为默认。');
        });
        get('accent-color-input').addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--accent-color', e.target.value);
            // 实时更新所有SVG滑块的颜色
            document.querySelectorAll('.svg-slider-container svg .filled-track').forEach(track => {
                track.style.stroke = e.target.value;
            });
        });
        get('charging-color-input').addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--charging-color', e.target.value);
        });
        get('icon-upload-local-btn').addEventListener('click', () => {
            get('upload-icon-sheet').classList.remove('active');
            get('icon-file-input').click();
        });
        get('icon-upload-url-btn').addEventListener('click', () => {
            get('upload-icon-sheet').classList.remove('active');
            const url = prompt(`请输入“${currentAppToChange}”的新图标URL:`);
            if (url) {
                updatePreviewIcon(currentAppToChange, url);
            }
        });
        get('icon-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    updatePreviewIcon(currentAppToChange, event.target.result);
                };
                reader.readAsDataURL(file);
            }
            e.target.value = ''; // Reset input
        });
        get('reset-icons-btn').addEventListener('click', () => {
            if (confirm('确定要重置所有App图标为默认设置吗？')) {
                tempAppIcons = {};
                renderAppIconPreview();
                alert('图标已在预览中重置。');
            }
        });

        // 新增：字体管理事件绑定
        get('add-font-preset-btn').addEventListener('click', handleAddFontPreset);
        get('font-size-slider-container').addEventListener('input', (e) => {
            const newSize = e.currentTarget.value;
            get('font-size-value').textContent = `${Math.round(newSize)}px`;
            applyFontSize(newSize);
        });


        // 聊天功能面板交互
        get('chat-plus-btn').addEventListener('click', () => {
            const actionPanel = get('chat-action-panel');
            const stickerPanel = get('chat-sticker-panel');
            const messagesContainer = get('chat-conversation-screen').querySelector('.chat-messages-container');

            const isOpening = !actionPanel.classList.contains('active');
            stickerPanel.classList.remove('active'); // Always close sticker panel

            if (isOpening) {
                actionPanel.classList.add('active');
                messagesContainer.style.paddingBottom = `${actionPanel.offsetHeight}px`;
            } else {
                actionPanel.classList.remove('active');
                messagesContainer.style.paddingBottom = '10px';
            }
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });

        // 表情包面板交互
        get('chat-emoji-btn').addEventListener('click', toggleStickerPanel);
        get('add-sticker-local-btn').addEventListener('click', () => {
            get('add-sticker-sheet').classList.remove('active');
            get('sticker-local-upload-input').click();
        });
        get('sticker-local-upload-input').addEventListener('change', handleAddStickersViaLocal);
        get('add-sticker-url-btn').addEventListener('click', () => {
            get('add-sticker-sheet').classList.remove('active');
            handleAddStickersViaUrl();
        });
        get('sticker-delete-btn').addEventListener('click', handleDeleteSelectedStickers);
        get('sticker-group-btn').addEventListener('click', openStickerGroupingDialog);


        const panelSwiper = get('panel-swiper-wrapper');
        panelSwiper.addEventListener('scroll', () => {
            const dots = get('panel-pagination').querySelectorAll('.panel-dot');
            const pageIndex = Math.round(panelSwiper.scrollLeft / panelSwiper.clientWidth);
            dots.forEach((dot, index) => {
                dot.classList.toggle('active', index === pageIndex);
            });
        });

        // P站头像更换
        get('psite-screen').querySelector('.psite-profile-avatar').addEventListener('click', () => {
            get('psite-avatar-upload-input').click();
        });
        get('psite-avatar-upload-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                const charId = parseInt(get('psite-screen').dataset.charId);
                await db.characters.update(charId, { avatar: event.target.result });
                const updatedChar = await db.characters.get(charId);
                renderPSiteProfileTab(updatedChar); // 重新渲染以显示新头像
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        // 线下模式按钮事件绑定
        get('offline-char-select-btn').addEventListener('click', openOfflineCharSelectionDialog);
        get('offline-persona-select-btn').addEventListener('click', openOfflinePersonaSelectionDialog);
        get('offline-other-settings-btn').addEventListener('click', () => navigateTo('api-settings-screen'));
        get('offline-regex-btn').addEventListener('click', () => navigateTo('regex-editor-screen'));
        get('add-regex-rule-btn').addEventListener('click', () => get('regex-import-input').click());
        get('regex-import-input').addEventListener('change', handleRegexImport);

        const offlineSendBtn = get('offline-send-btn');
        offlineSendBtn.addEventListener('click', handleOfflineSend);
        get('offline-reroll-btn').addEventListener('click', handleOfflineReroll); // <-- 添加这一行

        get('offline-mode-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleOfflineSend();
            }
        });
        const sidebarToggle = get('offline-sidebar-toggle');
        const sidebar = get('offline-mode-sidebar');
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            sidebarToggle.classList.toggle('collapsed');
        });
        
        // --- ▼▼▼ 【修改】音乐相关事件绑定 ---
        setupMusicSearchListeners();
 // 在 init() 函数里，找到并替换 musicPlayer 的事件监听
const musicPlayer = get('music-player');

musicPlayer.addEventListener('play', async () => {
    musicPlayerState.isPlaying = true;
    const song = await db.songs.get(musicPlayerState.currentSongId);
    if(song) {
        updateIslandOnPlay(song);
    }
    if (musicPlayerState.currentButtonElement) {
        musicPlayerState.currentButtonElement.classList.add('playing');
        musicPlayerState.currentButtonElement.querySelector('use').setAttribute('href', '#icon-pause-circle-filled');
    }
    if (navHistory[navHistory.length - 1] === 'music-player-screen') {
        updatePlayPauseButton(true);
    }
});

musicPlayer.addEventListener('pause', () => {
    musicPlayerState.isPlaying = false;
    updateIslandOnPause();
    if (musicPlayerState.currentButtonElement) {
        musicPlayerState.currentButtonElement.classList.remove('playing');
        musicPlayerState.currentButtonElement.querySelector('use').setAttribute('href', '#icon-play-circle-filled');
    }
    if (navHistory[navHistory.length - 1] === 'music-player-screen') {
        updatePlayPauseButton(false);
    }
});

musicPlayer.addEventListener('ended', async () => {
    if (musicPlayerState.currentButtonElement) {
        musicPlayerState.currentButtonElement.classList.remove('playing');
        musicPlayerState.currentButtonElement.querySelector('use').setAttribute('href', '#icon-play-circle-filled');
    }
    
    const player = get('music-player');
    const { playMode } = musicPlayerState;

    if (playMode === 'repeat-one') {
        player.currentTime = 0;
        player.play();
    } else {
        await playNextSong();
    }
});

// 核心修复 #1: timeupdate 事件
musicPlayer.addEventListener('timeupdate', () => {
    const player = get('music-player');
    
    updateIslandProgress(); // 更新灵动岛

    if (navHistory[navHistory.length - 1] === 'music-player-screen') {
        const currentTimeEl = get('player-current-time');
        if(currentTimeEl) currentTimeEl.textContent = formatTime(player.currentTime);
        
        const progressSlider = get('player-progress-slider');
        if (progressSlider && player.duration > 0 && !progressSlider.matches(':active')) {
             progressSlider.value = (player.currentTime / player.duration) * 100;
        }
        
        updateLyricsHighlight(); // 调用歌词高亮函数
    }
});

// 核心修复 #2: loadedmetadata 事件
musicPlayer.addEventListener('loadedmetadata', () => {
    const player = get('music-player');
    if (navHistory[navHistory.length - 1] === 'music-player-screen') {
        if (player.duration && isFinite(player.duration)) {
            const durationEl = get('player-duration');
            if(durationEl) durationEl.textContent = formatTime(player.duration);

            const progressSlider = get('player-progress-slider');
            if(progressSlider) progressSlider.max = 100;
        }
    }
});

musicPlayer.addEventListener('ended', async () => {
    // 【核心修复】歌曲结束时，同样需要更新按钮状态
    if (musicPlayerState.currentButtonElement) {
        musicPlayerState.currentButtonElement.classList.remove('playing');
        musicPlayerState.currentButtonElement.querySelector('use').setAttribute('href', '#icon-play-circle-filled');
    }
    
    const player = get('music-player');
    const { playMode } = musicPlayerState;

    if (playMode === 'repeat-one') {
        player.currentTime = 0;
        player.play();
    } else {
        await playNextSong();
    }
});

// 【核心修复 #1】 timeupdate 事件
musicPlayer.addEventListener('timeupdate', () => {
    const player = get('music-player');
    
    // 1. 更新灵动岛进度 (保持不变)
    updateIslandProgress();

    // 2. 如果在播放器页面，则更新所有相关UI
    if (navHistory[navHistory.length - 1] === 'music-player-screen') {
        // 更新当前播放时间
        get('player-current-time').textContent = formatTime(player.currentTime);
        
        // 更新进度条滑块
        const progressSlider = get('player-progress-slider');
        if (progressSlider && player.duration > 0) {
            // 只有在用户没有拖动滑块时才更新，防止冲突
            if (!progressSlider.matches(':active')) {
                progressSlider.value = (player.currentTime / player.duration) * 100;
            }
        }
        
        // 【新增】调用歌词高亮和滚动函数！
        updateLyricsHighlight();
    }
});

// 【核心修复 #2】 loadedmetadata 事件
musicPlayer.addEventListener('loadedmetadata', () => {
    const player = get('music-player');
    if (navHistory[navHistory.length - 1] === 'music-player-screen') {
        // 【新增】健壮性检查，确保 duration 是一个有效的数字
        if (player.duration && isFinite(player.duration)) {
            get('player-duration').textContent = formatTime(player.duration);
            const progressSlider = get('player-progress-slider');
            if(progressSlider) progressSlider.max = 100;
        }
    }
});
// --- ▲▲▲ 替换结束 ▲▲▲ ---

setupDynamicIslandListeners();
setupMessageActionMenuListeners();
        setTimeout(() => get('home-screen').classList.add('active'), 100);
    }
// --- ▼▼▼ 照片小组件上传功能事件绑定 ▼▼▼ ---

// 1. 为 "照片小组件" 的 "本地上传" 按钮添加点击事件
get('photo-widget-upload-local-btn').addEventListener('click', () => {
    // a. 先关闭浮窗
    get('upload-photo-widget-sheet').classList.remove('active');
    // b. 触发隐藏的文件选择框
    get('photo-widget-input').click(); 
});

// 2. 为 "照片小组件" 的 "URL上传" 按钮添加点击事件
get('photo-widget-upload-url-btn').addEventListener('click', () => {
    // a. 先关闭浮窗
    get('upload-photo-widget-sheet').classList.remove('active');
    // b. 弹出一个输入框让用户输入URL
    const url = prompt('请输入图片的URL:');
    if (url) {
        // c. 更新状态和界面
        state.photoWidgetUrl = url;
        get('photo-widget-img').src = url;
        // d. 保存状态
        saveState();
    }
});

// 3. 监听隐藏的文件选择框 (photo-widget-input) 的变化事件
get('photo-widget-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
        return; // 用户取消了选择
    }

    // 使用 FileReader 将图片文件转换为 Data URL
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageUrl = e.target.result;

        // a. 更新 state 对象中的 URL
        state.photoWidgetUrl = imageUrl;
        // b. 更新主屏幕上小组件的图片 src
        get('photo-widget-img').src = imageUrl;
        // c. 保存状态到数据库，这样刷新后图片依然存在
        saveState();
    };
    reader.readAsDataURL(file);

    // 重置 input 的值，这样用户可以连续上传同一张图片
    event.target.value = '';
});

// --- ▲▲▲ 照片小组件上传功能事件绑定结束 ▲▲
    // --- SVG 滑块核心函数 ---
    function createSvgSlider(container, options) {
        const { min, max, step, value } = options;
        container.innerHTML = `
            <svg viewBox="0 0 300 24">
                <line class="track" x1="12" y1="12" x2="288" y2="12" stroke="var(--border-color)" stroke-width="6" stroke-linecap="round" />
                <line class="filled-track" x1="12" y1="12" x2="150" y2="12" stroke="var(--accent-color)" stroke-width="6" stroke-linecap="round" />
                <circle class="thumb" cx="150" cy="12" r="10" fill="white" style="filter:url(#thumb-shadow);" />
            </svg>
        `;

        const svg = container.querySelector('svg');
        const thumb = svg.querySelector('.thumb');
        const filledTrack = svg.querySelector('.filled-track');
        let isDragging = false;

        const trackStart = 12;
        const trackEnd = 288;
        const trackWidth = trackEnd - trackStart;

        // 在容器上存储滑块的值
        container.value = value;

        const updateSliderVisuals = (currentValue) => {
            const percentage = (currentValue - min) / (max - min);
            const newX = trackStart + (trackWidth * percentage);
            thumb.setAttribute('cx', newX);
            filledTrack.setAttribute('x2', newX);
        };

        const updateSliderValueFromPosition = (x) => {
            const clampedX = Math.max(trackStart, Math.min(trackEnd, x));
            const percentage = (clampedX - trackStart) / trackWidth;
            let rawValue = min + percentage * (max - min);
            let steppedValue = Math.round(rawValue / step) * step;
            // 确保值在范围内
            container.value = Math.max(min, Math.min(max, steppedValue));
            updateSliderVisuals(container.value);
            // 触发 input 事件，以便外部监听
            container.dispatchEvent(new Event('input'));
        };

        const getPointerPosition = (evt) => {
            const svgRect = svg.getBoundingClientRect();
            const clientX = evt.clientX || (evt.touches && evt.touches[0].clientX);
            const svgPoint = svg.createSVGPoint();
            svgPoint.x = clientX - svgRect.left;
            return svgPoint.matrixTransform(svg.getScreenCTM().inverse()).x;
        };

        const startDrag = (evt) => {
            evt.preventDefault();
            isDragging = true;
            svg.style.cursor = 'grabbing';
        };

        const endDrag = () => {
            if (isDragging) {
                isDragging = false;
                svg.style.cursor = 'pointer';
            }
        };

        const drag = (evt) => {
            if (isDragging) {
                evt.preventDefault();
                updateSliderValueFromPosition(getPointerPosition(evt));
            }
        };

        svg.addEventListener('mousedown', (e) => {
            updateSliderValueFromPosition(getPointerPosition(e));
            startDrag(e);
        });
        window.addEventListener('mousemove', drag);
        window.addEventListener('mouseup', endDrag);

        svg.addEventListener('touchstart', (e) => {
            updateSliderValueFromPosition(getPointerPosition(e));
            startDrag(e);
        });
        window.addEventListener('touchmove', drag);
        window.addEventListener('touchend', endDrag);

        updateSliderVisuals(value);
    }

    function setSvgSliderValue(containerId, newValue) {
        const container = get(containerId);
        if (!container) return;
        const svg = container.querySelector('svg');
        const thumb = svg.querySelector('.thumb');
        const filledTrack = svg.querySelector('.filled-track');

        const min = parseFloat(container.querySelector('svg').dataset.min || 0);
        const max = parseFloat(container.querySelector('svg').dataset.max || 1);

        const trackStart = 12;
        const trackEnd = 288;
        const trackWidth = trackEnd - trackStart;

        container.value = newValue; // 更新容器存储的值

        const percentage = (newValue - min) / (max - min);
        const newX = trackStart + (trackWidth * percentage);

        thumb.setAttribute('cx', newX);
        filledTrack.setAttribute('x2', newX);
    }

    // 将SVG滑块的配置与创建函数关联
    Node.prototype.createSvgSlider = function(options) {
        this.dataset.min = options.min;
        this.dataset.max = options.max;
        createSvgSlider(this, options);
    };
    // --- 新增：音乐歌单功能核心代码 ---

    let currentSongData = {}; // 用于暂存待上传的歌曲文件数据
// ▼▼▼ 在 script.js 中添加这个全新的辅助函数 ▼▼▼
function parseWorldBookString(worldString) {
    if (!worldString || typeof worldString !== 'string') return [];
    
    const entries = [];
    // 使用正则表达式按 "---" 分隔符（允许前后有空格和换行）来分割条目
    const entryBlocks = worldString.split(/\n\s*---\s*\n/); 

    for (const block of entryBlocks) {
        if (!block.trim()) continue; // 跳过空块

        const lines = block.trim().split('\n');
        const entry = { keys: [], comment: '', content: '', enabled: true };
        let contentStarted = false;
        let contentLines = [];

        for (const line of lines) {
            // 匹配 "Keys:" 或 "关键词:" 等
            const keyMatch = line.match(/^(?:Keys|关键词|关键字)\s*:\s*(.*)$/i);
            // 匹配 "Comment:" 或 "备注:" 等
            const commentMatch = line.match(/^(?:Comment|备注)\s*:\s*(.*)$/i);

            if (!contentStarted && keyMatch) {
                entry.keys = keyMatch[1].split(',').map(k => k.trim()).filter(Boolean);
            } else if (!contentStarted && commentMatch) {
                entry.comment = commentMatch[1].trim();
            } else {
                // 一旦遇到不匹配的行，就认为正文内容开始了
                contentStarted = true;
                contentLines.push(line);
            }
        }
        
        entry.content = contentLines.join('\n').trim();
        if (entry.content) {
            entries.push(entry);
        }
    }
    return entries;
}
// ▲▲▲ 新函数添加结束 ▲▲▲
 // ▼▼▼ 使用这个新函数替换旧的 renderMusicPlaylistScreen 函数 ▼▼▼
async function renderMusicPlaylistScreen() {
    isPlaylistManagementMode = false; // 每次进入页面时重置管理模式
    const screen = get('music-playlist-screen');
    screen.classList.remove('management-mode'); // 移除管理模式的样式

    screen.innerHTML = `
    <div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 音乐</span>
        <h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">我的歌单</h1>
        <div class="header-actions">
            <!-- 默认按钮 -->
            <span class="action-btn default-mode-btn" id="add-song-search-btn">搜索</span>
            <span class="action-btn default-mode-btn" id="add-song-btn">添加</span>
            <!-- 管理模式按钮 -->
            <span class="action-btn manage-mode-btn" id="clear-expired-songs-btn">一键清理</span>
            <!-- 通用管理按钮 -->
            <span class="action-btn" id="toggle-manage-btn">管理</span>
        </div>
    </div>
    <div class="music-playlist-content"></div>
    `;

    const content = screen.querySelector('.music-playlist-content');
    const songs = await db.songs.toArray();

    if (songs.length === 0) {
        content.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--secondary-text);">歌单是空的，点击右上角添加第一首歌吧。</p>`;
    } else {
        songs.forEach(song => {
            const item = document.createElement('div');
            item.className = 'song-list-item';
            item.dataset.songId = song.id;
            item.innerHTML = `
                <button class="song-delete-btn">
                    <svg class="svg-icon"><use href="#icon-delete-circle"></use></svg>
                </button>
                <img src="${song.coverUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="song-list-cover">
                <div class="song-list-info">
                    <div class="song-list-title">${song.title}</div>
                    <div class="song-list-artist">${song.artist}</div>
                </div>
                <div class="song-list-actions">
                    <button class="song-play-btn" data-song-id="${song.id}">
                        <svg class="svg-icon"><use href="#icon-play-circle-filled"></use></svg>
                    </button>
                </div>
            `;

            // 为整行（除了删除按钮）绑定播放器跳转/播放逻辑
            item.onclick = async (event) => {
                // 如果点击的是删除按钮，则不执行任何操作
                if (event.target.closest('.song-delete-btn')) {
                    return;
                }
                
                // 如果是管理模式，点击列表项也无效果
                if (isPlaylistManagementMode) {
                    return;
                }

                if (event.target.closest('.song-play-btn')) {
                    event.stopPropagation();
                    const button = event.target.closest('.song-play-btn');
                    
                    if (musicPlayerState.currentSongId === song.id) {
                        togglePlayPause();
                    } else {
                        if (musicPlayerState.currentButtonElement) {
                            musicPlayerState.currentButtonElement.classList.remove('playing');
                            musicPlayerState.currentButtonElement.querySelector('use').setAttribute('href', '#icon-play-circle-filled');
                        }
                        musicPlayerState.currentButtonElement = button;
                        await playSongById(song.id);
                    }
                } else {
                    musicPlayerState.songQueue = await db.songs.toArray();
                    const songIndex = musicPlayerState.songQueue.findIndex(s => s.id === song.id);
                    musicPlayerState.currentQueueIndex = songIndex;
                    navigateTo('music-player-screen', { songId: song.id });
                }
            };
            
            // 为删除按钮绑定单独的删除事件
            item.querySelector('.song-delete-btn').onclick = (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                handleDeleteSong(song.id, song.title);
            };

            content.appendChild(item);
        });
    }

    // 绑定顶部按钮事件
    get('add-song-btn').onclick = () => navigateTo('music-add-song-screen', {});
    get('add-song-search-btn').onclick = addSongFromSearch;
    get('toggle-manage-btn').onclick = togglePlaylistManagementMode;
    get('clear-expired-songs-btn').onclick = handleClearExpiredSongs;
}
// ▲▲▲ 替换结束 ▲▲▲
// ▼▼▼ 将这些新函数粘贴到 script.js 中 ▼▼▼

/**
 * 切换歌单管理模式
 */
function togglePlaylistManagementMode() {
    isPlaylistManagementMode = !isPlaylistManagementMode;
    const screen = get('music-playlist-screen');
    const manageBtn = get('toggle-manage-btn');

    screen.classList.toggle('management-mode', isPlaylistManagementMode);

    if (isPlaylistManagementMode) {
        manageBtn.textContent = '完成';
    } else {
        manageBtn.textContent = '管理';
    }
}

/**
 * 处理单首歌曲的删除
 * @param {number} songId - 要删除的歌曲ID
 * @param {string} songTitle - 歌曲标题，用于确认提示
 */
function handleDeleteSong(songId, songTitle) {
    showIosConfirm(
        '删除歌曲',
        `确定要从歌单中删除《${songTitle}》吗？`,
        async () => {
            await db.songs.delete(songId);
            // 如果删除的是当前正在播放的歌曲，则停止播放
            if (musicPlayerState.currentSongId === songId) {
                const player = get('music-player');
                player.pause();
                player.src = '';
                musicPlayerState.currentSongId = null;
                hideDynamicIsland(); // 隐藏灵动岛
            }
            await renderMusicPlaylistScreen(); // 重新渲染列表
        }
    );
}

/**
 * 一键清理所有失效的在线歌曲
 */
async function handleClearExpiredSongs() {
    showIosAlert("请稍候...", "正在检测失效的歌曲链接...");
    
    const songs = await db.songs.toArray();
    const onlineSongs = songs.filter(song => song.songUrl && !song.songBlob); // 筛选出通过API添加的歌曲

    if (onlineSongs.length === 0) {
        get('ios-confirm-dialog').classList.remove('active'); // 关闭加载提示
        showIosAlert("无需清理", "你的歌单中没有需要检测的在线歌曲。");
        return;
    }

    const validityChecks = onlineSongs.map(async (song) => {
        const isValid = await checkAudioAvailability(song.songUrl);
        return { id: song.id, title: song.title, isValid: isValid };
    });

    const results = await Promise.all(validityChecks);
    const expiredSongs = results.filter(res => !res.isValid);
    get('ios-confirm-dialog').classList.remove('active'); // 关闭加载提示

    if (expiredSongs.length === 0) {
        showIosAlert("状态良好", "所有在线歌曲链接均有效，无需清理！");
    } else {
        const songTitles = expiredSongs.map(s => `《${s.title}》`).join('\n');
        showIosConfirm(
            `发现 ${expiredSongs.length} 首失效歌曲`,
            `以下歌曲链接已过期，是否要将它们从歌单中移除？\n\n${songTitles}`,
            async () => {
                const expiredSongIds = expiredSongs.map(s => s.id);
                await db.songs.bulkDelete(expiredSongIds);
                alert(`${expiredSongs.length} 首失效歌曲已清理完毕。`);
                await renderMusicPlaylistScreen(); // 重新渲染列表
            }
        );
    }
}

// ▲▲▲ 新函数粘贴到这里结束 ▲▲▲
// 打开“添加歌曲”页面 (V2 - 包含手动输入功能)
function openMusicAddSongScreen(songId = null) {
    currentSongData = {}; // 重置临时数据
    const isEditing = songId !== null;
    const screen = get('music-add-song-screen');

    screen.innerHTML = `
    <div class="settings-header" style="display: flex; justify-content: space-between; align-items: center;">
        <span class="back-bar" onclick="navigateBack()" style="position: static; margin: 0;"><svg class="svg-icon" width="12" height="21"><use href="#icon-back"/></svg> 歌单</span>
        <h1 style="padding: 0; font-size: 18px; font-weight: 600; position: absolute; left: 50%; transform: translateX(-50%);">${isEditing ? '编辑歌曲' : '添加歌曲'}</h1>
        <div style="width: 60px;"></div>
    </div>
    <div class="settings-content profile-edit-content">
        <div id="song-cover-preview">
            <svg class="svg-icon"><use href="#icon-music-recommend"></use></svg>
        </div>
        <div class="profile-form">
            <div class="form-group"><label>歌曲名</label><input type="text" id="song-title-input"></div>
            <div class="form-group"><label>歌手</label><input type="text" id="song-artist-input"></div>
            <button id="import-song-file-btn" class="btn btn-secondary">导入音乐文件</button>
            <div class="music-add-form-buttons" style="margin-top: 12px;">
                <button id="import-lyrics-file-btn" class="btn btn-secondary" style="flex:1;">导入歌词文件</button>
                <button id="manual-lyrics-btn" class="btn btn-secondary" style="flex:1;">手动输入歌词</button>
            </div>
        </div>
        <div class="music-add-form-buttons">
            <button onclick="navigateBack()" class="btn btn-secondary">取消</button>
            <button id="save-song-btn" class="btn btn-primary">保存</button>
        </div>
    </div>
    `;

    // 绑定事件
    get('song-cover-preview').addEventListener('click', () => get('song-cover-input').click());
    get('import-song-file-btn').addEventListener('click', () => get('song-file-input').click());
    get('save-song-btn').addEventListener('click', handleSaveSong);
    get('import-lyrics-file-btn').addEventListener('click', () => get('song-lyrics-input').click());
    
    // ▼▼▼ 新增：手动输入歌词按钮事件 ▼▼▼
    get('manual-lyrics-btn').addEventListener('click', () => {
        const dialog = get('manual-lyrics-dialog');
        const input = get('manual-lyrics-input');
        input.value = currentSongData.lyrics || ''; // 回填已有的歌词
        dialog.classList.add('active');

        get('manual-lyrics-cancel-btn').onclick = () => dialog.classList.remove('active');
        get('manual-lyrics-confirm-btn').onclick = () => {
            currentSongData.lyrics = input.value;
            get('import-lyrics-file-btn').textContent = "已手动输入"; // 更新按钮文本提示
            dialog.classList.remove('active');
        };
    });

    get('song-cover-input').onchange = (e) => handleFileSelect(e, 'coverUrl', '#song-cover-preview');
    get('song-file-input').onchange = (e) => handleFileSelect(e, 'songUrl', '#import-song-file-btn');
    get('song-lyrics-input').onchange = (e) => handleFileSelect(e, 'lyrics', '#import-lyrics-file-btn');
}
// 通用文件处理函数 (V3 - 终极兼容版)
function handleFileSelect(event, key, indicatorSelector) {
    const file = event.target.files[0];
    if (!file) return;

    // 如果是歌曲文件，直接存储File对象，不读取
    if (key === 'songUrl') {
        currentSongData.songUrl = file; 
        const indicator = document.querySelector(indicatorSelector);
        indicator.textContent = `已选择: ${file.name}`;
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        let result = e.target.result;

        if (key === 'lyrics' && result instanceof ArrayBuffer) {
            try {
                result = new TextDecoder('utf-8', { fatal: true }).decode(result);
            } catch (err) {
                console.warn("UTF-8 decoding failed, trying GBK as fallback...");
                try {
                    result = new TextDecoder('gbk').decode(result);
                } catch (err2) {
                    console.error("GBK decoding also failed.", err2);
                    alert("歌词文件编码无法识别，请尝试转换为UTF-8格式再上传。");
                    result = ''; // 清空结果
                }
            }
        }
        
        currentSongData[key] = result;
        
        const indicator = document.querySelector(indicatorSelector);
        if (key === 'coverUrl' && result) {
            indicator.innerHTML = `<img src="${result}" style="width:100%; height:100%; object-fit:cover;">`;
        } else if (result) {
            indicator.textContent = `已选择: ${file.name}`;
        }
    };

    reader.onerror = () => {
        alert(`读取文件 "${file.name}" 失败！`);
    };

    if (key === 'lyrics') {
        reader.readAsArrayBuffer(file); // 强制用二进制模式读取歌词
    } else {
        reader.readAsDataURL(file); // 封面图片用DataURL
    }
    
    event.target.value = '';
}
// 保存歌曲到数据库的核心函数 (V2 - 兼容Blob存储)
async function handleSaveSong() {
    const title = get('song-title-input').value.trim();
    const artist = get('song-artist-input').value.trim();

    if (!title || !artist) {
        alert('歌曲名和歌手不能为空！');
        return;
    }
    if (!currentSongData.songUrl) {
        alert('请导入音乐文件！');
        return;
    }

    const songObject = {
        title: title,
        artist: artist,
        coverUrl: currentSongData.coverUrl || null,
        songBlob: currentSongData.songUrl, // 存储的是File/Blob对象
        lyrics: currentSongData.lyrics || null, 
    };

    try {
        await db.songs.add(songObject);
        alert('歌曲已成功保存！');
        navigateBack();
    } catch (error) {
        console.error("保存歌曲失败:", error);
        alert("保存歌曲失败，请查看控制台。");
    }
}
  // 渲染音乐播放器页面 (V2 - 带歌词功能)
async function renderMusicPlayerScreen(songId) {
    const song = await db.songs.get(songId);
    if (!song) {
        alert('歌曲信息不存在！');
        navigateBack();
        return;
    }

    const modeIcons = {
        'repeat': '#icon-player-repeat',
        'repeat-one': '#icon-player-repeat-one',
        'shuffle': '#icon-player-shuffle'
    };
    const currentModeIcon = modeIcons[musicPlayerState.playMode] || '#icon-player-repeat';

    const screen = get('music-player-screen');
    // ▼▼▼ 用下面这段【修正后】的代码，完整替换你原来的那一整块 ▼▼▼
    screen.innerHTML = `
    <div class="player-header">
        <div class="back-bar" onclick="navigateBack()"><svg class="svg-icon" width="24" height="24"><use href="#icon-back"/></svg></div>
        <span class="player-header-title">正在播放</span>
        <div style="width: 40px;"></div>
    </div>
    <div class="player-main">
        
        <!-- 这是正确的、唯一的封面/歌词切换区域 -->
        <div id="player-view-flipper">
            <div class="player-record-container" id="player-record-container">
                <img src="${song.coverUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="player-record-cover" id="player-cover">
            </div>
            <div id="player-lyrics-container">
                <p>... 歌词加载中 ...</p>
            </div>
        </div>
        
        <!-- 这是正确的、唯一的底部控制区域 -->
        <div class="player-bottom-controls-group">
            <div class="player-song-info" style="margin-top: auto;">
                <h2 class="player-song-title" id="player-title">${song.title}</h2>
                <p class="player-song-artist" id="player-artist">${song.artist}</p>
            </div>
            <div class="player-progress-bar">
                <input type="range" id="player-progress-slider" value="0" step="1">
                <div class="player-progress-time">
                    <span id="player-current-time">00:00</span>
                    <span id="player-duration">00:00</span>
                </div>
            </div>
             <div class="player-extra-controls">
                <button class="player-extra-btn"><svg class="svg-icon"><use href="#icon-heart"/></svg></button>
                <button class="player-extra-btn"><svg class="svg-icon"><use href="#icon-player-comment"/></svg></button>
                <button class="player-extra-btn" id="player-mode-btn"><svg class="svg-icon"><use href="${currentModeIcon}"/></svg></button>
            </div>
            <div class="player-main-controls">
                <button class="player-control-btn" id="player-prev-btn"><svg class="svg-icon"><use href="#icon-player-prev"/></svg></button>
                <button class="player-control-btn play-pause" id="player-play-pause-btn"><svg class="svg-icon"><use href="#icon-player-play"/></svg></button>
                <button class="player-control-btn" id="player-next-btn"><svg class="svg-icon"><use href="#icon-player-next"/></svg></button>
            </div>
        </div>

    </div>
`;
// ▲▲▲ 替换到这里结束 ▲▲▲


    // ▼▼▼ 渲染歌词 ▼▼▼
    renderLyrics(song.lyrics);

    setupPlayerEventListeners(song.id);

    if (musicPlayerState.currentSongId !== song.id || get('music-player').paused) {
        playSongById(song.id);
    } else {
        updatePlayerUI(song);
        updatePlayPauseButton(true);
        get('player-record-container').classList.add('playing');
    }
}
// --- ▼▼▼ 请将这段新代码粘贴到你的 script.js 中 ▼▼▼ ---

function setupPlayerEventListeners(songId) {
    const player = get('music-player');
    const playPauseBtn = get('player-play-pause-btn');
    const nextBtn = get('player-next-btn');
    const prevBtn = get('player-prev-btn');
    const modeBtn = get('player-mode-btn');
    const progressSlider = get('player-progress-slider');
    // ▼▼▼ 在这里添加新代码 ▼▼▼
    const flipper = get('player-view-flipper');
    if (flipper) {
        flipper.addEventListener('click', (e) => {
             // 确保点击的不是按钮或滑块
            if (e.target.closest('button, input[type="range"]')) return;
            flipper.classList.toggle('show-lyrics');
        });
    }
    // ▲▲▲ 新代码结束 ▲▲▲

    // 为播放/暂停按钮绑定事件
    if (playPauseBtn) {
        playPauseBtn.onclick = () => togglePlayPause(songId);
    }

    // 为下一曲/上一曲按钮绑定事件
    if (nextBtn) {
        nextBtn.onclick = playNextSong;
    }
    if (prevBtn) {
        prevBtn.onclick = playPreviousSong;
    }

    // 为播放模式按钮绑定事件
    if (modeBtn) {
        modeBtn.onclick = changePlayMode;
    }

    // 为进度条绑定事件，允许用户拖动改变播放进度
    if (progressSlider) {
        let wasPlaying = false;

        // 手机端和PC端开始拖动
        const startDrag = () => {
            wasPlaying = !player.paused;
            if (wasPlaying) player.pause();
        };

        // 手机端和PC端结束拖动
        const endDrag = () => {
            if (!isNaN(player.duration)) {
                player.currentTime = player.duration * (progressSlider.value / 100);
            }
            if (wasPlaying) player.play();
        };

        progressSlider.addEventListener('mousedown', startDrag);
        progressSlider.addEventListener('touchstart', startDrag);

        progressSlider.addEventListener('mouseup', endDrag);
        progressSlider.addEventListener('touchend', endDrag);
    }
}

// --- ▲▲▲ 代码粘贴到这里结束 ▲▲▲ ---
// 播放指定ID的歌曲 (V3 - 兼容Blob和URL，并增强错误处理)
async function playSongById(songId) {
    const player = get('music-player');
    const song = await db.songs.get(songId);

    if (!song || (!song.songBlob && !song.songUrl)) {
        alert("错误：找不到可播放的歌曲文件或链接！");
        return;
    }

    if (musicPlayerState.currentObjectUrl) {
        URL.revokeObjectURL(musicPlayerState.currentObjectUrl);
        musicPlayerState.currentObjectUrl = null;
    }

    let songSource = '';
    if (song.songBlob) {
        const objectUrl = URL.createObjectURL(song.songBlob);
        musicPlayerState.currentObjectUrl = objectUrl;
        songSource = objectUrl;
    } else {
        songSource = song.songUrl;
    }

    player.src = songSource;
    player.load(); // 关键：在更改src后调用load()
    
    try {
        await player.play();
        musicPlayerState.currentSongId = songId;
        showDynamicIsland(song); 

        if (navHistory[navHistory.length - 1] === 'music-player-screen') {
            updatePlayerUI(song);
            renderLyrics(song.lyrics);
        }
    } catch (error) {
        console.error("播放失败:", error);
        alert(`无法播放歌曲。\n浏览器错误: ${error.name}`);
    }
}

    function updatePlayerUI(song) {
        get('player-cover').src = song.coverUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        get('player-title').textContent = song.title;
        get('player-artist').textContent = song.artist;
    }

    function updatePlayPauseButton(isPlaying) {
        const btn = get('player-play-pause-btn');
        if (btn) {
            btn.querySelector('use').setAttribute('href', isPlaying ? '#icon-player-pause' : '#icon-player-play');
        }
    }
// 用这个更简洁的函数替换你原来的 togglePlayPause
function togglePlayPause() {
    const player = get('music-player');
    if (player.paused) {
        player.play();
    } else {
        player.pause();
    }
}

  // --- 找到这个旧函数 ---
// async function playNextSong() { ... }

// --- 用下面的新代码替换它 ---
async function playNextSong() {
    const queue = musicPlayerState.songQueue;
    if (queue.length === 0) return;

    if (musicPlayerState.playMode === 'shuffle') {
        musicPlayerState.currentQueueIndex = Math.floor(Math.random() * queue.length);
    } else {
        musicPlayerState.currentQueueIndex = (musicPlayerState.currentQueueIndex + 1) % queue.length;
    }

    const nextSong = queue[musicPlayerState.currentQueueIndex];

    // 【核心修复】: 切换歌曲后，重新渲染播放器页面以加载新歌词
    await renderMusicPlayerScreen(nextSong.id);
}

// --- 找到这个旧函数 ---
// async function playPreviousSong() { ... }

// --- 用下面的新代码替换它 ---
async function playPreviousSong() {
    const queue = musicPlayerState.songQueue;
    if (queue.length === 0) return;

    musicPlayerState.currentQueueIndex = (musicPlayerState.currentQueueIndex - 1 + queue.length) % queue.length;
    const prevSong = queue[musicPlayerState.currentQueueIndex];

    // 【核心修复】: 切换歌曲后，重新渲染播放器页面以加载新歌词
    await renderMusicPlayerScreen(prevSong.id);
}

    async function changePlayMode() {
        const modeBtn = get('player-mode-btn');
        const use = modeBtn.querySelector('use');

        switch (musicPlayerState.playMode) {
            case 'repeat':
                musicPlayerState.playMode = 'repeat-one';
                use.setAttribute('href', '#icon-player-repeat-one');
                break;
            case 'repeat-one':
                musicPlayerState.playMode = 'shuffle';
                use.setAttribute('href', '#icon-player-shuffle');
                break;
            case 'shuffle':
                default: // 使用 default 增强代码健壮性
            musicPlayerState.playMode = 'repeat';
            use.setAttribute('href', '#icon-player-repeat');
            break;
    }
    
    // 2. 新增这两行，将更改保存到数据库
    state.musicSettings.playMode = musicPlayerState.playMode;
    await saveState(); 
}
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
// 找到旧的 setupDynamicIslandListeners 函数，然后用下面的代码【完整替换】它

function setupDynamicIslandListeners() {
    const island = get('dynamic-island');
    const player = get('music-player');

    let longPressTimer = null;
    let isPressing = false;

    // 按下时启动计时器
    const handlePressStart = (e) => {
        // 因为CSS已经处理了事件穿透，这里不再需要检查 target
        isPressing = true;
        
        longPressTimer = setTimeout(() => {
            if (isPressing) {
                // 如果灵动岛是激活且未展开的状态，则展开它
                if (island.classList.contains('active') && !island.classList.contains('expanded')) {
                    island.classList.add('expanded');
                }
            }
        }, 500); // 500毫秒定义为长按
    };

    // 松开或移开时清除计时器
    const handlePressEnd = () => {
        isPressing = false;
        clearTimeout(longPressTimer);
    };

    // --- 绑定事件 ---
    island.addEventListener('mousedown', handlePressStart);
    island.addEventListener('touchstart', handlePressStart, { passive: true });

    island.addEventListener('mouseup', handlePressEnd);
    island.addEventListener('mouseleave', handlePressEnd);
    island.addEventListener('touchend', handlePressEnd);
    
    // --- 单击事件只用于收起 ---
    island.addEventListener('click', (e) => {
        // 仅当浮窗已展开，并且点击的是背景时，才收起
        if (island.classList.contains('expanded') && e.target === island) {
            island.classList.remove('expanded');
        }
    });

    // --- 内部按钮的事件监听（保持不变） ---
    get('island-player-play-pause-btn').onclick = (e) => {
        e.stopPropagation();
        togglePlayPause();
    };
    get('island-player-next-btn').onclick = (e) => {
        e.stopPropagation();
        playNextSong();
    };
    get('island-player-prev-btn').onclick = (e) => {
        e.stopPropagation();
        playPreviousSong();
    };

    const islandSlider = get('island-player-progress-slider');
    let islandWasPlaying = false;
    const startIslandDrag = (e) => {
        e.stopPropagation();
        islandWasPlaying = !player.paused;
        if (islandWasPlaying) player.pause();
    };
    const endIslandDrag = (e) => {
        e.stopPropagation();
        if (!isNaN(player.duration)) {
             player.currentTime = player.duration * (islandSlider.value / 100);
        }
        updateLyricsHighlight();
        if (islandWasPlaying) player.play();
    };
    islandSlider.addEventListener('mousedown', startIslandDrag);
    islandSlider.addEventListener('touchstart', startIslandDrag, { passive: true });
    islandSlider.addEventListener('change', endIslandDrag);
}

// ... 后面的函数 showDynamicIsland, hideDynamicIsland 等保持不变 ...

async function showDynamicIsland(song) {
    const island = get('dynamic-island');
    island.classList.add('active');

    // 更新收起状态的UI
    get('island-album-art').src = song.coverUrl || '';

    // 更新展开状态的UI
    get('island-player-album-art').src = song.coverUrl || '';
    get('island-player-title').textContent = song.title;
    get('island-player-artist').textContent = song.artist;
}

function hideDynamicIsland() {
    const island = get('dynamic-island');
    island.classList.remove('active', 'expanded');
}

function toggleDynamicIslandExpansion() {
    const island = get('dynamic-island');
    if (island.classList.contains('active')) {
        island.classList.toggle('expanded');
    }
}

function updateIslandOnPlay(song) {
    showDynamicIsland(song);
    const playPauseBtn = get('island-player-play-pause-btn').querySelector('use');
    playPauseBtn.setAttribute('href', '#icon-island-pause');
}

function updateIslandOnPause() {
    const playPauseBtn = get('island-player-play-pause-btn').querySelector('use');
    playPauseBtn.setAttribute('href', '#icon-island-play');
    // 如果你希望暂停时灵动岛也收起，可以在这里调用 hideDynamicIsland()
    // hideDynamicIsland();
}

function updateIslandProgress() {
    const player = get('music-player');
    const currentTime = player.currentTime;
    const duration = player.duration;

    if (isNaN(duration)) return;

    // 更新展开视图的进度条和时间
    get('island-player-current-time').textContent = formatTime(currentTime);
    get('island-player-duration').textContent = formatTime(duration);
    get('island-player-progress-slider').value = (currentTime / duration) * 100;
}
// --- ▲▲▲ 灵动岛功能结束 ▲▲▲ ---
// --- ▼▼▼ 全新：歌词处理核心函数 ▼▼▼ ---

let parsedLyrics = []; // 存储解析后的歌词数组

// 解析LRC歌词文本
function parseLrc(lrcText) {
    if (!lrcText) return [];
    
    const lines = lrcText.split('\n');
    const result = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

    for (const line of lines) {
        const matches = [...line.matchAll(timeRegex)];
        const content = line.replace(timeRegex, '').trim();

        if (content && matches.length > 0) {
            for (const match of matches) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
                const time = minutes * 60 + seconds + milliseconds / 1000;
                result.push({ time, content });
            }
        }
    }
    
    return result.sort((a, b) => a.time - b.time);
}

// 在播放器界面渲染歌词
function renderLyrics(lrcText) {
    const container = get('player-lyrics-container');
    if (!container) return;

    parsedLyrics = parseLrc(lrcText);

    if (parsedLyrics.length > 0) {
        container.innerHTML = parsedLyrics.map(line => 
            `<p data-time="${line.time}">${line.content}</p>`
        ).join('');

        // 为歌词行添加点击跳转事件
        container.onclick = (e) => {
            if (e.target && e.target.tagName === 'P' && e.target.dataset.time) {
                const player = get('music-player');
                player.currentTime = parseFloat(e.target.dataset.time);
            }
        };

    } else {
        container.innerHTML = `<p style="opacity: 1;">暂无歌词</p>`;
    }
}
function handleClearAllData() {
    showIosConfirm(
        '清空所有数据',
        '警告：此操作将彻底删除所有角色、聊天记录、世界书、预设、设置和表情包。数据无法恢复，确定要继续吗？',
        async () => {
            try {
                // Dexie.js 提供了简单的方法来删除整个数据库
                await db.delete();
                alert('所有数据已清除。应用即将刷新。');
                // 刷新页面，让数据库重建
                location.reload();
            } catch (error) {
                console.error("删除数据库失败:", error);
                alert("清除数据失败，请查看控制台获取更多信息。");
            }
        }
    );
}
// 更新歌词高亮和滚动
function updateLyricsHighlight() {
    const player = get('music-player');
    const currentTime = player.currentTime;
    const lyricsLines = get('player-lyrics-container')?.querySelectorAll('p');

    if (!lyricsLines || lyricsLines.length === 0 || parsedLyrics.length === 0) return;

    let currentLineIndex = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
        if (currentTime >= parsedLyrics[i].time) {
            currentLineIndex = i;
        } else {
            break;
        }
    }

    if (currentLineIndex !== -1) {
        const activeLine = lyricsLines[currentLineIndex];
        if (activeLine && !activeLine.classList.contains('active-lyric')) {
            lyricsLines.forEach(line => line.classList.remove('active-lyric'));
            activeLine.classList.add('active-lyric');
            
            // 平滑滚动到视图中央
            activeLine.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }
    } else {
        // 如果还没到第一句歌词时间，清除所有高亮
        lyricsLines.forEach(line => line.classList.remove('active-lyric'));
    }
}
// --- ▼▼▼ 【全新】聊天消息操作菜单核心函数 ▼▼▼ ---

/**
 * 处理消息气泡的双击事件
 * @param {MouseEvent} event - 鼠标事件对象
 */
function handleMessageDoubleClick(event) {
    const bubble = event.target.closest('.chat-bubble');
    if (!bubble) return;

    event.preventDefault(); 
    currentlySelectedMessageElement = bubble.parentElement;

    const menuOverlay = get('message-action-menu-overlay');
    const menu = get('message-action-menu');

    // 关键修复：先让遮罩层显示出来，这样内部的菜单才能被正确测量
    menuOverlay.style.display = 'block'; 
    
    // 现在 menu.offsetWidth 和 menu.offsetHeight 将会返回正确的值
    const bubbleRect = bubble.getBoundingClientRect();
    const containerRect = get('phone-container').getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    let top = bubbleRect.top - containerRect.top;
    let left = bubbleRect.left - containerRect.left + (bubbleRect.width / 2) - (menuWidth / 2);

    if (top < menuHeight + 20) { 
        top += bubbleRect.height + 8;
        menu.style.transformOrigin = 'top center';
    } else { 
        top -= (menuHeight + 8);
        menu.style.transformOrigin = 'bottom center';
    }

    left = Math.max(10, Math.min(left, containerRect.width - menuWidth - 10));

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    // 最后再播放动画
    menu.classList.add('show');
}

/**
 * 隐藏消息操作菜单
 */
function hideMessageActionMenu() {
    const menuOverlay = get('message-action-menu-overlay');
    if (menuOverlay.style.display === 'block') {
        const menu = get('message-action-menu');
        menu.classList.remove('show');
        menuOverlay.style.display = 'none';
        currentlySelectedMessageElement = null; // 清除引用
    }
}

/**
 * 初始化菜单的事件监听
 */
function setupMessageActionMenuListeners() {
    const menuOverlay = get('message-action-menu-overlay');
    const menu = get('message-action-menu');

    // 点击覆盖层空白处，关闭菜单
    menuOverlay.addEventListener('click', (e) => {
        if (e.target === menuOverlay) {
            hideMessageActionMenu();
        }
    });

    // 使用事件委托处理菜单项的点击
    menu.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const action = e.target.dataset.action;
            
            if (!currentlySelectedMessageElement) return;

            // 这里是占位逻辑，后续可以替换为真实功能
            switch (action) {
                case 'quote':
                    alert('你点击了“引用”');
                    break;
                case 'delete':
                    alert('你点击了“删除”');
                    // 在这里可以调用真实的删除函数，例如：
                    // deleteChatMessage(currentlySelectedMessageElement);
                    break;
                case 'forward':
                    alert('你点击了“转发”');
                    break;
                case 'translate':
                    alert('你点击了“翻译”');
                    break;
                case 'edit':
                    alert('你点击了“编辑”');
                    break;
            }
            
            // 操作后隐藏菜单
            hideMessageActionMenu();
        }
    });
}
// --- ▲▲▲ 聊天消息操作菜单核心函数结束 ▲▲▲ ---
    init();
});
