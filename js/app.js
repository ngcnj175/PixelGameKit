/**
 * PixelGameKit - メインアプリケーション
 */

// グローバル状態
const App = {
    currentMode: 'sprite',
    projectData: null,

    // ファミコンパレット（52色 + 透明）
    nesPalette: [
        '#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084', '#A80020', '#A81000', '#881400',
        '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000',
        '#BCBCBC', '#0078F8', '#0058F8', '#6844FC', '#D800CC', '#E40058', '#F83800', '#E45C10',
        '#AC7C00', '#00B800', '#00A800', '#00A844', '#008888', '#000000', '#000000', '#000000',
        '#F8F8F8', '#3CBCFC', '#6888FC', '#9878F8', '#F878F8', '#F85898', '#F87858', '#FCA044',
        '#F8B800', '#B8F818', '#58D854', '#58F898', '#00E8D8', '#787878', '#000000', '#000000',
        '#FCFCFC', '#A4E4FC', '#B8B8F8', '#D8B8F8', '#F8B8F8', '#F8A4C0', '#F0D0B0', '#FCE0A8',
        '#F8D878', '#D8F878', '#B8F8B8', '#B8F8D8', '#00FCFC', '#D8D8D8', '#000000', '#000000'
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
            objects: [],
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
            data: this.create2DArray(16, 16, -1) // -1 = 透明
        };
    },

    create2DArray(width, height, fillValue) {
        return Array(height).fill(null).map(() => Array(width).fill(fillValue));
    },

    // 初期化
    init() {
        console.log('PixelGameKit initializing...');

        // Service Worker登録
        this.registerServiceWorker();

        // プロジェクトデータロードまたは新規作成
        this.loadOrCreateProject();

        // モードタブ初期化
        this.initModeTabs();

        // メニュー初期化
        this.initMenu();

        // URLからデータ読み込み
        this.checkUrlData();

        // 各エディタ初期化
        if (typeof SpriteEditor !== 'undefined') SpriteEditor.init();
        if (typeof StageEditor !== 'undefined') StageEditor.init();
        if (typeof BgmEditor !== 'undefined') BgmEditor.init();
        if (typeof GameController !== 'undefined') GameController.init();

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
                    // URLをクリア
                    history.replaceState(null, '', window.location.pathname);
                }
            } catch (e) {
                console.warn('Failed to load from URL:', e);
            }
        }
    },

    initModeTabs() {
        const tabs = document.querySelectorAll('.tab');
        const contents = document.querySelectorAll('.tool-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                this.switchMode(mode);
            });
        });
    },

    switchMode(mode) {
        this.currentMode = mode;

        // タブ更新
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.mode === mode);
        });

        // コンテンツ更新
        const contentMap = {
            'sprite': 'sprite-tools',
            'stage': 'stage-tools',
            'bgm': 'bgm-tools',
            'play': 'game-controller'
        };

        document.querySelectorAll('.tool-content').forEach(c => {
            c.classList.toggle('active', c.id === contentMap[mode]);
        });

        // キャンバス更新
        this.updateCanvas();
    },

    updateCanvas() {
        switch (this.currentMode) {
            case 'sprite':
                if (typeof SpriteEditor !== 'undefined') SpriteEditor.render();
                break;
            case 'stage':
                if (typeof StageEditor !== 'undefined') StageEditor.render();
                break;
            case 'bgm':
                // BGMモードでは何も描画しない
                break;
            case 'play':
                if (typeof GameEngine !== 'undefined') GameEngine.start();
                break;
        }
    },

    initMenu() {
        const menuBtn = document.getElementById('menu-btn');
        const menuPanel = document.getElementById('menu-panel');
        const closeMenu = document.getElementById('close-menu');

        menuBtn.addEventListener('click', () => {
            menuPanel.classList.remove('hidden');
        });

        closeMenu.addEventListener('click', () => {
            menuPanel.classList.add('hidden');
        });

        menuPanel.addEventListener('click', (e) => {
            if (e.target === menuPanel) {
                menuPanel.classList.add('hidden');
            }
        });

        // メニューアクション
        document.getElementById('share-btn')?.addEventListener('click', () => {
            const url = Share.createUrl(this.projectData);
            if (navigator.share) {
                navigator.share({
                    title: 'PixelGameKit - ' + this.projectData.meta.name,
                    url: url
                });
            } else {
                navigator.clipboard.writeText(url).then(() => {
                    alert('URLをコピーしました！');
                });
            }
            menuPanel.classList.add('hidden');
        });

        document.getElementById('save-local-btn')?.addEventListener('click', () => {
            Storage.save('currentProject', this.projectData);
            alert('保存しました！');
            menuPanel.classList.add('hidden');
        });

        document.getElementById('load-local-btn')?.addEventListener('click', () => {
            const data = Storage.load('currentProject');
            if (data) {
                this.projectData = data;
                this.updateCanvas();
                alert('読み込みました！');
            }
            menuPanel.classList.add('hidden');
        });

        document.getElementById('new-project-btn')?.addEventListener('click', () => {
            if (confirm('現在のプロジェクトを破棄して新規作成しますか？')) {
                this.projectData = this.createDefaultProject();
                this.updateCanvas();
            }
            menuPanel.classList.add('hidden');
        });
    },

    // プロジェクトデータを保存
    saveProject() {
        Storage.save('currentProject', this.projectData);
    }
};

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
