/**
 * PixelGameKit - メインアプリケーション
 */

// グローバル状態
const App = {
    currentScreen: 'play',
    projectData: null,

    // デフォルトパレット（#000000のみ）
    nesPalette: [
        '#000000'
    ],

    // デフォルトプロジェクト
    createDefaultProject() {
        return {
            version: 1,
            meta: {
                name: '新規プロジェクト',
                author: '',
                locked: false,
                createdAt: Date.now()
            },
            palette: this.nesPalette.slice(0, 16),
            sprites: [this.createEmptySprite()],
            stage: {
                width: 16,
                height: 16,
                layers: {
                    bg: this.create2DArray(16, 16, -1),
                    fg: this.create2DArray(16, 16, -1),
                    collision: this.create2DArray(16, 16, 0)
                }
            },
            objects: [
                { type: 'player', x: 2, y: 14, sprite: 0 }
            ],
            bgm: {
                bpm: 120,
                steps: 16,
                tracks: {
                    pulse1: [],
                    pulse2: [],
                    triangle: [],
                    noise: []
                }
            }
        };
    },

    createEmptySprite() {
        return {
            id: 0,
            name: 'sprite_0',
            data: this.create2DArray(16, 16, -1)
        };
    },

    create2DArray(width, height, fillValue) {
        return Array(height).fill(null).map(() => Array(width).fill(fillValue));
    },

    // 初期化
    init() {
        console.log('PixelGameKit initializing...');

        this.registerServiceWorker();
        this.loadOrCreateProject();
        this.initMenu();
        this.checkUrlData();

        // 各エディタ初期化
        if (typeof SpriteEditor !== 'undefined') SpriteEditor.init();
        if (typeof StageEditor !== 'undefined') StageEditor.init();
        if (typeof BgmEditor !== 'undefined') BgmEditor.init();
        if (typeof GameEngine !== 'undefined') GameEngine.init();
        if (typeof GameController !== 'undefined') GameController.init();

        // 初期画面表示
        this.switchScreen('play');

        console.log('PixelGameKit initialized!');
    },

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered'))
                .catch(err => console.warn('SW registration failed:', err));
        }
    },

    loadOrCreateProject() {
        const saved = Storage.load('currentProject');
        if (saved) {
            this.projectData = saved;
            console.log('Project loaded from storage');
            // パレットを復元
            if (this.projectData.palette) {
                this.nesPalette = this.projectData.palette;
            }
        } else {
            this.projectData = this.createDefaultProject();
            console.log('New project created');
        }
    },

    checkUrlData() {
        const hash = window.location.hash.slice(1);
        if (hash) {
            try {
                const data = Share.decode(hash);
                if (data) {
                    this.projectData = data;
                    console.log('Project loaded from URL');
                    // パレットを復元
                    if (this.projectData.palette) {
                        this.nesPalette = this.projectData.palette;
                    }
                    history.replaceState(null, '', window.location.pathname);
                }
            } catch (e) {
                console.warn('Failed to load from URL:', e);
            }
        }
    },

    initMenu() {
        // 現在のプロジェクト名
        this.currentProjectName = null;

        // 新規プロジェクト
        document.getElementById('new-icon-btn')?.addEventListener('click', () => {
            if (!confirm('新規プロジェクトを開きます。')) {
                return; // キャンセル
            }
            // OKの場合 → 保存確認
            const defaultName = this.projectData?.meta?.name || 'MyGame';
            const name = prompt('現在のプロジェクトを保存します。\nファイル名を入力してください。', defaultName);
            if (name) {
                // OKの場合 → 保存後に初期化
                this.currentProjectName = name;
                this.projectData.palette = this.nesPalette.slice();
                Storage.save('currentProject', this.projectData);
                this.downloadProject(name);
            }
            // キャンセルでもOKでも初期化
            this.projectData = this.createDefaultProject();
            this.nesPalette = ['#000000'];
            this.currentProjectName = null;
            this.updateGameInfo();
            this.refreshCurrentScreen();
        });

        // ファイル読み込み（ファイル選択ダイアログ）
        const fileInput = document.getElementById('file-input');
        document.getElementById('load-icon-btn')?.addEventListener('click', () => {
            if (confirm('既存のプロジェクトを開きます。')) {
                fileInput?.click();
            }
        });

        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        this.projectData = data;
                        // パレットを復元
                        if (this.projectData.palette) {
                            this.nesPalette = this.projectData.palette;
                        }
                        this.currentProjectName = file.name.replace(/\.(json|pgk)$/i, '');
                        this.updateGameInfo();
                        this.refreshCurrentScreen();
                        alert(`${file.name} を読み込みました`);
                    } catch (err) {
                        alert('ファイルの読み込みに失敗しました');
                    }
                };
                reader.readAsText(file);
            }
            e.target.value = ''; // リセット
        });

        // 保存：ワンタップで上書き、長押しで名前を付けて保存
        let saveTimer;
        const saveBtn = document.getElementById('save-icon-btn');

        const startSavePress = () => {
            saveTimer = setTimeout(() => {
                // 長押し：名前を付けて保存
                this.saveAsNewFile();
            }, 800);
        };

        const cancelSavePress = () => {
            clearTimeout(saveTimer);
        };

        saveBtn?.addEventListener('mousedown', startSavePress);
        saveBtn?.addEventListener('mouseup', cancelSavePress);
        saveBtn?.addEventListener('mouseleave', cancelSavePress);
        saveBtn?.addEventListener('touchstart', startSavePress, { passive: true });
        saveBtn?.addEventListener('touchend', cancelSavePress);

        saveBtn?.addEventListener('click', () => {
            // 長押しでなければ通常保存
            this.saveProject();
        });

        // ナビゲーション切り替え
        const screens = ['play', 'paint', 'stage', 'sound'];
        screens.forEach(screen => {
            const btn = document.getElementById(`nav-${screen}-btn`);
            btn?.addEventListener('click', () => {
                this.switchScreen(screen);
                // アイコンのアクティブ状態更新
                document.querySelectorAll('#toolbar-nav .toolbar-icon').forEach(b => b.classList.remove('active-nav'));
                btn.classList.add('active-nav');
            });
        });

        // タイトル・サブタイトル編集
        const titleInput = document.getElementById('game-title');
        const subtitleInput = document.getElementById('game-subtitle');

        titleInput?.addEventListener('change', (e) => {
            if (this.projectData) {
                this.projectData.meta.name = e.target.value;
            }
        });

        subtitleInput?.addEventListener('change', (e) => {
            if (this.projectData) {
                // サブタイトルはauthor扱い（または拡張）
                this.projectData.meta.author = e.target.value;
            }
        });
    },

    updateGameInfo() {
        const titleInput = document.getElementById('game-title');
        const subtitleInput = document.getElementById('game-subtitle');

        if (titleInput && this.projectData) {
            titleInput.value = this.projectData.meta.name || 'My Game';
        }
        if (subtitleInput && this.projectData) {
            subtitleInput.value = this.projectData.meta.author || 'Stage 1';
        }
    },

    switchScreen(screenName) {
        this.currentScreen = screenName;

        // 画面切り替え
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.toggle('active', s.id === screenName + '-screen');
        });

        // 各画面の初期化/更新
        this.refreshCurrentScreen();
    },

    refreshCurrentScreen() {
        switch (this.currentScreen) {
            case 'play':
                this.updateGameInfo();
                if (typeof GameEngine !== 'undefined') {
                    if (!GameEngine.isRunning || GameEngine.isPaused) {
                        GameEngine.showPreview();
                    } else {
                        GameEngine.resize();
                    }
                }
                break;
            case 'paint':
                if (typeof SpriteEditor !== 'undefined') {
                    SpriteEditor.refresh();
                }
                break;
            case 'stage':
                if (typeof StageEditor !== 'undefined') {
                    StageEditor.refresh();
                }
                break;
            case 'sound':
                if (typeof BgmEditor !== 'undefined') {
                    BgmEditor.refresh();
                }
                break;
        }
    },

    hasUnsavedChanges() {
        const savedData = Storage.load('currentProject');
        if (!savedData) return true;
        return JSON.stringify(savedData) !== JSON.stringify(this.projectData);
    },

    saveProject() {
        // パレットをプロジェクトデータに同期
        this.projectData.palette = this.nesPalette.slice();

        // LocalStorageにも保存
        Storage.save('currentProject', this.projectData);

        if (this.currentProjectName) {
            // 上書き保存（ダウンロード）
            this.downloadProject(this.currentProjectName);
            alert(`${this.currentProjectName}.json を保存しました`);
        } else {
            // 新規の場合は名前を付けて保存
            this.saveAsNewFile();
        }
    },

    saveAsNewFile() {
        const defaultName = this.projectData?.meta?.name || 'MyGame';
        const name = prompt('現在のプロジェクトを保存します。\nファイル名を入力してください。', defaultName);
        if (name) {
            this.currentProjectName = name;
            // パレットをプロジェクトデータに同期
            this.projectData.palette = this.nesPalette.slice();
            Storage.save('currentProject', this.projectData);
            this.downloadProject(name);
        }
    },

    downloadProject(filename) {
        const data = JSON.stringify(this.projectData, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    showThreeChoiceDialog(message, onSave, onNoSave, onCancel) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:white;padding:20px;border-radius:8px;text-align:center;max-width:300px;';

        const msg = document.createElement('p');
        msg.style.cssText = 'margin:0 0 20px 0;white-space:pre-line;font-size:14px;';
        msg.textContent = message;

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '保存する';
        saveBtn.style.cssText = 'padding:12px;border:none;background:#4a4a4a;color:white;border-radius:4px;cursor:pointer;font-size:14px;';

        const noSaveBtn = document.createElement('button');
        noSaveBtn.textContent = '保存しない';
        noSaveBtn.style.cssText = 'padding:12px;border:1px solid #4a4a4a;background:white;border-radius:4px;cursor:pointer;font-size:14px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.style.cssText = 'padding:12px;border:1px solid #ccc;background:#f5f5f5;border-radius:4px;cursor:pointer;font-size:14px;';

        btnContainer.appendChild(saveBtn);
        btnContainer.appendChild(noSaveBtn);
        btnContainer.appendChild(cancelBtn);
        modal.appendChild(msg);
        modal.appendChild(btnContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeModal = () => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        };

        saveBtn.addEventListener('click', () => { closeModal(); onSave(); });
        noSaveBtn.addEventListener('click', () => { closeModal(); onNoSave(); });
        cancelBtn.addEventListener('click', () => { closeModal(); onCancel(); });
    }
};

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
