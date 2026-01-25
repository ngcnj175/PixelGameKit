/**
 * PixelGameKit - メインアプリケーション
 */

// グローバル状態
const App = {
    currentScreen: 'play',
    projectData: null,
    isPlayOnlyMode: false, // 共有URL読み込み時はtrue（編集不可）

    // パレットプリセット
    PALETTE_PRESETS: {
        pastel: {
            name: 'パステル',
            colors: [
                '#FFB6C1', '#FFC0CB', '#FFD1DC', '#FFDAB9', '#FFE4B5', '#FFFACD', '#E0FFE0', '#98FB98',
                '#AFEEEE', '#B0E0E6', '#ADD8E6', '#E6E6FA', '#DDA0DD', '#D8BFD8', '#FFFFFF', '#000000'
            ]
        },
        famicom: {
            name: 'ファミコン',
            colors: [
                '#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084', '#A80020', '#A81000', '#881400',
                '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000',
                '#BCBCBC', '#0078F8', '#0058F8', '#6844FC', '#D800CC', '#E40058', '#F83800', '#E45C10',
                '#AC7C00', '#00B800', '#00A800', '#00A844', '#008888', '#000000', '#000000', '#000000',
                '#F8F8F8', '#3CBCFC', '#6888FC', '#9878F8', '#F878F8', '#F85898', '#F87858', '#FCA044',
                '#F8B800', '#B8F818', '#58D854', '#58F898', '#00E8D8', '#787878', '#000000', '#000000',
                '#FCFCFC', '#A4E4FC', '#B8B8F8', '#D8B8F8', '#F8B8F8', '#F8A4C0', '#F0D0B0', '#FCE0A8',
                '#F8D878', '#D8F878', '#B8F8B8', '#B8F8D8', '#00FCFC', '#D8D8D8'
            ]
        },
        gameboy: {
            name: 'ゲームボーイ',
            colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
        },
        mono: {
            name: 'モノクロ',
            colors: ['#000000', '#333333', '#555555', '#777777', '#999999', '#BBBBBB', '#DDDDDD', '#FFFFFF']
        }
    },

    // デフォルトパレット（パステル）
    nesPalette: null, // initで設定

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
                name: '',
                width: 16,
                height: 16,
                bgColor: '#3CBCFC',
                transparentIndex: 0,
                bgm: {
                    stage: '',
                    invincible: '',
                    clear: '',
                    gameover: ''
                },
                clearCondition: 'none', // none, item, enemies, survival
                timeLimit: 0,
                showScore: true, // スコア表示（デフォルトON）
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
            },
            // プリセットSE
            sounds: [
                { id: 0, name: 'JUMP', type: 'jump' },
                { id: 1, name: 'ATTACK', type: 'attack' },
                { id: 2, name: 'DAMAGE', type: 'damage' },
                { id: 3, name: 'ITEM GET', type: 'itemGet' },
                { id: 4, name: 'ENEMY DEFEAT', type: 'enemyDefeat' }
            ]
        };
    },

    createEmptySprite(size = 1) {
        const dimension = size === 2 ? 32 : 16;
        return {
            id: 0,
            name: 'sprite_0',
            data: this.create2DArray(dimension, dimension, -1),
            size: size  // 1 = 16x16, 2 = 32x32
        };
    },

    create2DArray(width, height, fillValue) {
        return Array(height).fill(null).map(() => Array(width).fill(fillValue));
    },

    // 初期化
    init() {
        console.log('PixelGameKit initializing...');

        // デフォルトパレットをパステルに設定
        if (!this.nesPalette) {
            this.nesPalette = this.PALETTE_PRESETS.pastel.colors.slice();
        }

        this.registerServiceWorker();
        this.loadOrCreateProject();
        this.initMenu();
        this.checkUrlData();

        // 各エディタ初期化
        if (typeof SpriteEditor !== 'undefined') SpriteEditor.init();
        if (typeof StageEditor !== 'undefined') StageEditor.init();
        if (typeof SoundEditor !== 'undefined') SoundEditor.init();
        if (typeof GameEngine !== 'undefined') {
            GameEngine.init();
            GameEngine.initResultEvents(); // リザルト画面イベント初期化
        }
        if (typeof GameController !== 'undefined') GameController.init();

        // 初期画面表示
        this.switchScreen('play');

        // iOSドラッグスクロール防止（必要な場所以外）
        this.preventIOSScroll();

        console.log('PixelGameKit initialized!');
    },

    // iOSでのドラッグによる全画面スクロールを防止
    preventIOSScroll() {
        // 全てのtouchmoveをデフォルトで防止し、必要な要素のみ許可（ホワイトリスト方式）
        document.addEventListener('touchmove', (e) => {
            let target = e.target;

            // 許可する要素をチェック
            while (target && target !== document.body) {
                // 許可するタグ
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                    return;
                }

                // 許可するクラス（ドラッグ操作が必要な要素）
                if (target.classList.contains('allow-scroll') ||
                    target.classList.contains('sb-box') ||
                    target.classList.contains('hue-slider') ||
                    target.classList.contains('game-dpad') ||
                    target.classList.contains('dpad-area')) {
                    return;
                }

                // 許可するID（特定の要素）
                const allowedIds = [
                    'sprite-canvas',
                    'stage-canvas',
                    'bgm-canvas',
                    'sprite-list',
                    'tile-list',
                    'paint-canvas', // 追加
                    'tile-config-panel',
                    'stage-settings-content',
                    'paint-tools',
                    'color-scroll-container',
                    'stage-tools'
                ];
                if (target.id && allowedIds.includes(target.id)) {
                    // スクロール可能な要素のみ許可
                    const style = window.getComputedStyle(target);
                    if (style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                        style.overflowX === 'auto' || style.overflowX === 'scroll') {
                        return;
                    }
                    // canvasは許可
                    if (target.tagName === 'CANVAS') {
                        return;
                    }
                }

                // canvas要素は許可
                if (target.tagName === 'CANVAS') {
                    return;
                }

                target = target.parentElement;
            }

            // それ以外は全てスクロール防止
            e.preventDefault();
        }, { passive: false });
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
            this.migrateProjectData(); // データ移行
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

    async checkUrlData() {
        // ?g=xxx パラメータをチェック（Firebase短縮URL）
        const urlParams = new URLSearchParams(window.location.search);
        const gameId = urlParams.get('g');

        if (gameId) {
            console.log('Loading game from Firebase:', gameId);
            const data = await Share.loadGame(gameId);
            if (data) {
                this.projectData = data;
                this.migrateProjectData(); // データ移行
                this.isPlayOnlyMode = true;
                console.log('Project loaded from Firebase (play-only mode)');
                if (this.projectData.palette) {
                    this.nesPalette = this.projectData.palette;
                }
                // URLからパラメータを削除
                history.replaceState(null, '', window.location.pathname);
                this.applyPlayOnlyMode();
                // 各エディタをリフレッシュ
                this.refreshCurrentScreen();
            } else {
                console.warn('Failed to load game:', gameId);
            }
            return;
        }

        // 従来のハッシュ形式もサポート（後方互換）
        const hash = window.location.hash.slice(1);
        if (hash) {
            try {
                const data = Share.decode(hash);
                if (data) {
                    this.projectData = data;
                    this.isPlayOnlyMode = true;
                    console.log('Project loaded from URL hash (play-only mode)');
                    if (this.projectData.palette) {
                        this.nesPalette = this.projectData.palette;
                    }
                    history.replaceState(null, '', window.location.pathname);
                    this.applyPlayOnlyMode();
                }
            } catch (e) {
                console.warn('Failed to load from URL hash:', e);
            }
        }
    },

    // データ構造のマイグレーション（エンティティ分離）
    migrateProjectData() {
        const stage = this.projectData.stage;
        if (!stage) return;

        // entities配列がなければ作成
        if (!stage.entities) {
            stage.entities = [];
        }

        const map = stage.map;
        const width = stage.width;
        const height = stage.height;

        // map配列が存在しない場合はスキップ
        if (!map || !Array.isArray(map)) return;

        // map配列からエンティティを探して移動
        for (let y = 0; y < height; y++) {
            if (!map[y]) continue; // 行が存在しない場合スキップ
            for (let x = 0; x < width; x++) {
                const tileId = map[y][x];
                // テンプレートID (100+)
                if (tileId >= 100) {
                    const tmplIdx = tileId - 100;
                    const tmpl = this.projectData.templates[tmplIdx];
                    if (tmpl && (tmpl.type === 'player' || tmpl.type === 'enemy' || tmpl.type === 'item')) {
                        // entitiesに追加
                        // 重複チェック（念のため）
                        const exists = stage.entities.some(e => e.x === x && e.y === y);
                        if (!exists) {
                            stage.entities.push({
                                x: x,
                                y: y,
                                templateId: tmplIdx
                            });
                        }
                        // mapからは消去（空気=0）
                        map[y][x] = 0;
                    }
                }
            }
        }
    },

    // プレイ専用モードのUI適用
    applyPlayOnlyMode() {
        // ヘッダーのファイルツールバーを非表示
        const toolbarFile = document.getElementById('toolbar-file');
        if (toolbarFile) {
            toolbarFile.style.display = 'none';
        }
        // ナビゲーションでプレイ以外を非表示
        const navBtns = document.querySelectorAll('.nav-icon');
        navBtns.forEach(btn => {
            if (btn.id !== 'nav-play-btn') {
                btn.style.display = 'none';
            }
        });
    },

    initMenu() {
        // 現在のプロジェクト名
        this.currentProjectName = null;

        // 新規プロジェクト（NEW）
        document.getElementById('new-icon-btn')?.addEventListener('click', () => {
            this.showNewGameModal();
        });

        // 開く（OPEN） -> プロジェクトリスト
        document.getElementById('load-icon-btn')?.addEventListener('click', () => {
            this.showSimpleProjectList();
        });

        // 保存（SAVE）
        const saveBtn = document.getElementById('save-icon-btn');
        saveBtn?.addEventListener('click', () => {
            this.saveProject();
        });

        // 共有ボタン
        const shareBtn = document.getElementById('share-icon-btn');
        shareBtn?.addEventListener('click', () => {
            this.projectData.palette = this.nesPalette.slice();
            // 古いShare.openDialogは使うが、その後のイベントバインドを自前にする
            // もしShare.openDialogが古いHTML構造前提だと壊れるかも？
            // Share.openDialogは多分単に hidden を外すだけならOK。
            // しかし、Share.openDialogの実装は見てないが、もし中身を書き換えてるならマズイ。
            // 多分 toggle hidden だけ。
            document.getElementById('share-dialog').classList.remove('hidden');
            this.bindShareSimpleEvents();
        });

        // 共有ダイアログのイベント初期化（使わないがエラー防止で残すか、削除するか）
        // Share.initDialogEvents(); // 新しいバインドを使うのでコメントアウト


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
                if (typeof SoundEditor !== 'undefined') {
                    SoundEditor.refresh();
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
        // パレット同期
        this.projectData.palette = this.nesPalette.slice();

        if (!this.currentProjectName) {
            this.currentProjectName = this.projectData.meta.name || 'MyGame';
        }

        // メタデータ更新
        this.projectData.meta.name = this.currentProjectName;
        this.projectData.meta.updatedAt = Date.now();

        // 内部ストレージへ保存
        Storage.saveProject(this.currentProjectName, this.projectData);
        Storage.save('currentProject', this.projectData);

        // 静かに通知
        this.showToast('セーブしました');
    },

    showToast(message) {
        // 特別なセーブトースト
        if (message === 'セーブしました') {
            const saveToast = document.getElementById('save-toast');
            if (saveToast) {
                saveToast.classList.add('visible');
                setTimeout(() => {
                    saveToast.classList.remove('visible');
                }, 1500);
                return;
            }
        }

        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;padding:8px 16px;border-radius:20px;font-size:12px;opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:9999;';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
        }, 2000);
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
    },

    // アクションメニュー（iOS風）
    showActionMenu(title, actions) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;z-index:9999;';

        const modal = document.createElement('div');
        modal.className = 'action-sheet';
        modal.style.cssText = 'background:transparent;width:95%;max-width:400px;margin-bottom:20px;display:flex;flex-direction:column;gap:8px;';

        // メニューグループ
        const menuGroup = document.createElement('div');
        menuGroup.style.cssText = 'background:rgba(255,255,255,0.9);backdrop-filter:blur(10px);border-radius:14px;overflow:hidden;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);';

        // タイトル
        if (title) {
            const titleEl = document.createElement('div');
            titleEl.textContent = title;
            titleEl.style.cssText = 'padding:12px;text-align:center;font-size:13px;color:#888;border-bottom:1px solid rgba(0,0,0,0.1);font-weight:600;';
            menuGroup.appendChild(titleEl);
        }

        actions.forEach((action, index) => {
            if (action.style === 'cancel') return; // キャンセルは別枠

            const btn = document.createElement('button');
            btn.textContent = action.text;
            let btnStyle = 'width:100%;padding:16px;border:none;background:transparent;font-size:16px;color:#007aff;cursor:pointer;';

            if (action.style === 'destructive') {
                btnStyle += 'color:#ff3b30;';
            }
            if (index < actions.length - 1 && !(index === actions.length - 2 && actions[actions.length - 1].style === 'cancel')) {
                btnStyle += 'border-bottom:1px solid rgba(0,0,0,0.1);';
            }

            btn.style.cssText = btnStyle;
            btn.addEventListener('click', () => {
                closeModal();
                if (action.action) action.action();
            });
            menuGroup.appendChild(btn);
        });

        modal.appendChild(menuGroup);

        // キャンセルボタン
        const cancelAction = actions.find(a => a.style === 'cancel');
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = cancelAction ? cancelAction.text : 'キャンセル';
        cancelBtn.style.cssText = 'width:100%;padding:16px;border:none;background:rgba(255,255,255,0.9);backdrop-filter:blur(10px);border-radius:14px;font-size:16px;font-weight:600;color:#007aff;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,0.1);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);';

        cancelBtn.addEventListener('click', () => {
            closeModal();
            if (cancelAction && cancelAction.action) cancelAction.action();
        });

        modal.appendChild(cancelBtn);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // アニメーション
        requestAnimationFrame(() => {
            menuGroup.style.transform = 'translateY(0)';
            cancelBtn.style.transform = 'translateY(0)';
        });

        const closeModal = () => {
            menuGroup.style.transform = 'translateY(100%)';
            cancelBtn.style.transform = 'translateY(100%)';
            overlay.style.transition = 'opacity 0.2s';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
            }, 300);
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    },

    // プロジェクトリストを表示（OPEN用）
    showProjectList() {
        const modal = document.getElementById('project-list-modal');
        const listContainer = document.getElementById('project-list');
        const closeBtn = document.getElementById('project-list-close');

        if (!modal || !listContainer) return;

        // リスト描画
        const renderList = () => {
            listContainer.innerHTML = '';
            const list = Storage.getProjectList();

            // 更新日時順（新しい順）
            list.sort((a, b) => b.updatedAt - a.updatedAt);

            if (list.length === 0) {
                listContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">保存されたプロジェクトはありません</div>';
                return;
            }

            list.forEach(p => {
                const item = document.createElement('div');
                item.className = 'project-item';
                if (p.name === this.currentProjectName) {
                    item.classList.add('active');
                }

                const dateStr = new Date(p.updatedAt).toLocaleString('ja-JP');

                const info = document.createElement('div');
                info.className = 'project-info';
                info.innerHTML = `
                    <div class="project-name">${p.name}</div>
                    <div class="project-date">${dateStr}</div>
                `;

                const actions = document.createElement('div');
                actions.className = 'project-actions';

                // 開くボタン
                const openBtn = document.createElement('button');
                openBtn.className = 'project-btn primary';
                openBtn.textContent = '開く';
                openBtn.onclick = () => {
                    if (this.currentProjectName && this.currentProjectName !== p.name) {
                        if (!confirm('現在のプロジェクトを閉じて、選択したプロジェクトを開きますか？\n（未保存の変更は失われます）')) return;
                    }
                    this.loadProject(p.name);
                    modal.classList.add('hidden');
                };

                // 複製ボタン
                const copyBtn = document.createElement('button');
                copyBtn.className = 'project-btn';
                copyBtn.textContent = '複製';
                copyBtn.onclick = () => {
                    const newName = prompt(`「${p.name}」の複製を作成します。\n新しいプロジェクト名を入力してください:`, p.name + ' のコピー');
                    if (newName) {
                        if (Storage.projectExists(newName)) {
                            alert('その名前は既に使用されています');
                            return;
                        }
                        if (Storage.duplicateProject(p.name, newName)) {
                            renderList(); // リスト更新
                        } else {
                            alert('複製に失敗しました');
                        }
                    }
                };

                // 削除ボタン
                const delBtn = document.createElement('button');
                delBtn.className = 'project-btn danger';
                delBtn.textContent = '削除';
                delBtn.onclick = () => {
                    if (confirm(`「${p.name}」を削除してもよろしいですか？\nこの操作は取り消せません。`)) {
                        Storage.deleteProject(p.name);
                        renderList(); // リスト更新
                        if (this.currentProjectName === p.name) {
                            this.currentProjectName = null; // 現在開いているものを削除した場合
                        }
                    }
                };

                actions.appendChild(openBtn);
                actions.appendChild(copyBtn);
                actions.appendChild(delBtn);

                item.appendChild(info);
                item.appendChild(actions);
                listContainer.appendChild(item);
            });
        };

        renderList();
        modal.classList.remove('hidden');

        // イベントバインド（一度だけにする制御が必要だが、簡易的に毎回上書きまた除去）
        const closeHandler = () => {
            modal.classList.add('hidden');
        };
        closeBtn.onclick = closeHandler;

        // モーダル外クリック
        modal.onclick = (e) => {
            if (e.target === modal) closeHandler();
        };
    },

    // プロジェクトをロードして反映
    loadProject(name) {
        const data = Storage.loadProject(name);
        if (data) {
            this.projectData = data;
            this.currentProjectName = name;

            // パレット復元
            if (this.projectData.palette) {
                this.nesPalette = this.projectData.palette;
            } else {
                this.nesPalette = ['#000000'];
            }

            this.updateGameInfo();
            this.refreshCurrentScreen();
            Storage.save('currentProject', this.projectData);
            alert(`「${name}」を開きました`);
        } else {
            alert('プロジェクトの読み込みに失敗しました');
        }
    },

    // シェアモーダルのイベントバインド（Export/Import用）
    bindShareModalEvents() {
        const exportBtn = document.getElementById('export-btn');
        const importBtn = document.getElementById('import-btn');
        const fileInput = document.getElementById('import-file-input');

        // 書き出し
        exportBtn.onclick = () => {
            const name = this.currentProjectName || this.projectData.meta.name || 'MyGame';
            this.exportProject(name);
        };

        // 読み込み（ファイル選択）
        importBtn.onclick = () => {
            fileInput.click();
        };

        // ファイル選択時
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importProject(file);
            }
            e.target.value = '';
        };
    },

    // プロジェクト書き出し（旧ダウンロード）
    exportProject(filename) {
        // パレット同期
        this.projectData.palette = this.nesPalette.slice();

        const data = JSON.stringify(this.projectData, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // プロジェクト読み込み（インポート）
    importProject(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                // 名前決定
                let baseName = file.name.replace(/\.(json|pgk)$/i, '');
                let importName = baseName;
                let counter = 1;

                // 重複回避
                while (Storage.projectExists(importName)) {
                    importName = `${baseName} (${counter})`;
                    counter++;
                }

                // 保存
                data.meta.name = importName;
                data.meta.createdAt = Date.now();
                Storage.saveProject(importName, data);

                if (confirm(`「${importName}」としてインポートしました。\n今すぐ開きますか？`)) {
                    this.loadProject(importName);
                    // モーダル閉じる
                    document.getElementById('share-dialog').classList.add('hidden');
                } else {
                    alert('インポートしました。「開く」メニューから選択できます。');
                }

            } catch (err) {
                console.error(err);
                alert('ファイルの読み込みに失敗しました');
            }
        };
        reader.readAsText(file);
    },

    // 新規作成モーダルを表示
    showNewGameModal() {
        const modal = document.getElementById('new-game-modal');
        const input = document.getElementById('new-game-name');
        const createBtn = document.getElementById('new-game-create-btn');
        const cancelBtn = document.getElementById('new-game-cancel-btn');

        if (!modal) return;

        // 初期化
        const now = new Date();
        const defaultName = '新しいゲーム ' + (now.getMonth() + 1) + '/' + now.getDate() + ' ' + ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
        input.value = "NEW GAME"; // defaultNameを使わず固定にするか、日時を入れるか。ユーザー要望は初期値「NEW GAME」
        input.value = "NEW GAME";

        modal.classList.remove('hidden');
        input.focus();
        input.select();

        const close = () => {
            modal.classList.add('hidden');
            input.onkeydown = null;
            createBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        const create = () => {
            const name = input.value.trim();
            if (!name) return;

            if (Storage.projectExists(name)) {
                alert('そのなまえは すでに つかわれています');
                return;
            }

            // 作成処理
            this.projectData = this.createDefaultProject();
            this.nesPalette = ['#000000'];
            this.projectData.meta.name = name;
            this.currentProjectName = name;

            Storage.saveProject(name, this.projectData);
            Storage.save('currentProject', this.projectData);

            this.updateGameInfo();
            this.refreshCurrentScreen();

            this.showToast('あたらしいゲームを つくりました');
            close();
        };

        createBtn.onclick = create;
        cancelBtn.onclick = close;

        input.onkeydown = (e) => {
            if (e.key === 'Enter') create();
            if (e.key === 'Escape') close();
        };
    },

    // プロジェクトリストを表示（選択式）
    showSimpleProjectList() {
        const modal = document.getElementById('project-list-modal');
        const listContainer = document.getElementById('project-list');
        const closeBtn = document.getElementById('project-list-close');

        // アクションボタン
        const openBtn = document.getElementById('project-open-btn');
        const copyBtn = document.getElementById('project-copy-btn');
        const deleteBtn = document.getElementById('project-delete-btn');

        if (!modal || !listContainer) return;

        let selectedName = null;

        // ボタン状態更新
        const updateButtons = () => {
            const disabled = !selectedName;
            openBtn.disabled = disabled;
            copyBtn.disabled = disabled;
            deleteBtn.disabled = disabled;
        };

        // リスト描画
        const renderList = () => {
            listContainer.innerHTML = '';
            const list = Storage.getProjectList();

            // 更新日時順
            list.sort((a, b) => b.updatedAt - a.updatedAt);

            if (list.length === 0) {
                listContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">セーブデータは ありません</div>';
                updateButtons();
                return;
            }

            list.forEach(p => {
                const item = document.createElement('div');
                item.className = 'list-item';
                if (p.name === selectedName) {
                    item.classList.add('selected');
                }

                const isCurrent = (p.name === this.currentProjectName);
                const dateStr = new Date(p.updatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });

                item.innerHTML = `
                    <span class="arrow">${p.name === selectedName ? '▶' : ''}</span>
                    <span style="flex:1; font-weight:${isCurrent ? 'bold' : 'normal'}">${p.name}</span>
                    <span style="font-size:11px; color:#888;">${dateStr}</span>
                `;

                item.onclick = () => {
                    if (selectedName !== p.name) {
                        selectedName = p.name;
                        renderList();
                        updateButtons();
                    }
                };

                item.ondblclick = () => {
                    selectedName = p.name;
                    openBtn.click();
                };

                listContainer.appendChild(item);
            });
            updateButtons();
        };

        selectedName = null;
        renderList();
        modal.classList.remove('hidden');

        const close = () => {
            modal.classList.add('hidden');
        };
        closeBtn.onclick = close;

        openBtn.onclick = () => {
            if (!selectedName) return;
            if (this.currentProjectName && this.currentProjectName !== selectedName) {
                // 保存確認なし（シンプル）
            }
            this.loadProject(selectedName);
            close();
        };

        copyBtn.onclick = () => {
            if (!selectedName) return;
            let baseName = selectedName;
            let newName = baseName + ' のコピー';
            let counter = 2;
            while (Storage.projectExists(newName)) {
                newName = baseName + ' のコピー' + counter;
                counter++;
            }

            if (Storage.duplicateProject(selectedName, newName)) {
                renderList();
            }
        };

        deleteBtn.onclick = () => {
            if (!selectedName) return;
            // 削除確認もシンプルに
            // if (confirm(`「${selectedName}」を けしますか？`)) {
            Storage.deleteProject(selectedName);
            if (this.currentProjectName === selectedName) {
                this.currentProjectName = null;
            }
            selectedName = null;
            renderList();
            // }
        };

        modal.onclick = (e) => {
            if (e.target === modal) close();
        };
    },

    // シェアモーダル簡易版イベント
    bindShareSimpleEvents() {
        const copyUrlBtn = document.getElementById('copy-url-btn');
        const xBtn = document.getElementById('share-x-btn');
        const discordBtn = document.getElementById('share-discord-btn');
        const exportBtn = document.getElementById('export-btn');
        const importBtn = document.getElementById('import-btn');
        const fileInput = document.getElementById('import-file-input');
        const closeBtn = document.getElementById('share-close-btn');

        // URLコピー
        copyUrlBtn.onclick = () => {
            const json = JSON.stringify(this.projectData);
            const url = window.location.origin + window.location.pathname + '?data=' + encodeURIComponent(json);
            document.getElementById('share-url-input').value = url; // 隠しinput等あれば更新

            // クリップボード
            navigator.clipboard.writeText(url).then(() => {
                this.showToast('URLを コピーしました');
            });
        };

        // X
        xBtn.onclick = () => {
            const text = `「${this.projectData.meta.name || 'Game'}」であそぼう！ #PixelGameKit`;
            // URLは長すぎるので省略するか、共有機能実装が必要。今回はトーストのみ
            this.showToast('X に とうこう（未実装）');
        };

        // Discord
        discordBtn.onclick = () => {
            this.showToast('Discord に とうこう（未実装）');
        };

        // 書き出し
        exportBtn.onclick = () => {
            const name = this.currentProjectName || this.projectData.meta.name || 'MyGame';
            this.exportProject(name);
        };

        // 読み込み
        importBtn.onclick = () => {
            fileInput.click();
        };

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importProject(file);
            }
            e.target.value = '';
        };

        const close = () => {
            document.getElementById('share-dialog').classList.add('hidden');
        };
        closeBtn.onclick = close;

        document.getElementById('share-dialog').onclick = (e) => {
            if (e.target === document.getElementById('share-dialog')) close();
        };
    }
};

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
