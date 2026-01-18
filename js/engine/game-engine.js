/**
 * PixelGameKit - ゲームエンジン（Start/Pause対応）
 */

const GameEngine = {
    canvas: null,
    ctx: null,
    animationId: null,
    isRunning: false,
    isPaused: false,
    hasStarted: false,

    player: null,
    enemies: [],
    projectiles: [],
    items: [],

    GRAVITY: 0.5,
    TILE_SIZE: 16,

    // カメラ
    camera: { x: 0, y: 0 },

    // タイトル画面
    titleState: 'title', // 'title', 'wipe', 'playing', 'clear', 'gameover'
    wipeTimer: 0,
    titleBlinkTimer: 0,
    gameOverTimer: 0,
    clearTimer: 0,

    // タイルアニメーション用フレームカウンター
    tileAnimationFrame: 0,

    // BGM再生
    bgmAudioCtx: null,
    bgmPlayInterval: null,
    currentBgmType: null, // 'stage', 'invincible', 'clear', 'gameover', 'boss'

    // ボス演出
    bossSpawned: false,        // ボスが画面に出現したか
    bossSequencePhase: null,   // 'fadeout', 'silence', 'bossbgm', null
    bossSequenceTimer: 0,      // 演出タイマー
    bossEnemy: null,           // ボスエネミー参照

    init() {
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
    },

    start() {
        if (this.isRunning) return;

        // サバイバルモードで制限時間が0の場合はエラー
        const stage = App.projectData.stage;
        if (stage.clearCondition === 'survival' && (!stage.timeLimit || stage.timeLimit <= 0)) {
            alert('サバイバルモードでは制限時間を設定してください');
            return;
        }

        this.isRunning = true;
        this.isPaused = false;
        this.hasStarted = true;
        this.startMessageTimer = 90; // START!表示時間（1.5秒）
        this.resize();
        this.initGame();

        // 既存のループがあればキャンセル（重複防止）
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.gameLoop();
    },

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.stopBgm();
    },

    // 一時停止トグル（Startボタン用）
    togglePause() {
        if (this.titleState === 'title') {
            // タイトル画面から開始
            this.startFromTitle();
            return;
        }

        if (!this.hasStarted) {
            this.start();
            return;
        }

        if (this.isPaused) {
            this.isPaused = false;
            if (!this.isRunning) {
                this.isRunning = true;
                // 既存のループがあればキャンセル（重複防止）
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }
                this.gameLoop();
            }
        } else if (this.isRunning) {
            this.isPaused = true;
            this.render(); // PAUSE表示のため再描画
        }
    },

    startFromTitle() {
        // ゲーム状態を完全リセット
        this.initGame();

        // カメラをプレイヤー初期位置に設定
        if (this.player) {
            const stage = App.projectData.stage;
            const viewWidth = this.canvas.width / this.TILE_SIZE;
            const viewHeight = this.canvas.height / this.TILE_SIZE;
            this.camera.x = this.player.x - viewWidth / 2 + 0.5;
            this.camera.y = this.player.y - viewHeight / 2 + 0.5;
            this.camera.x = Math.max(0, Math.min(this.camera.x, stage.width - viewWidth));
            this.camera.y = Math.max(0, Math.min(this.camera.y, stage.height - viewHeight));
        }

        // ワイプ開始
        this.titleState = 'wipe';
        this.wipeTimer = 0;
        this.isRunning = true;
        this.hasStarted = true;
        this.gameLoop();
    },

    renderLoading() {
        const ctx = this.ctx;
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Loading...', this.canvas.width / 2, this.canvas.height / 2);
    },

    // リスタート（Startボタン長押し用）
    restart() {
        this.stop();
        this.hasStarted = false;
        this.isPaused = false;
        this.titleState = 'title';
        this.wipeTimer = 0;
        this.initGame();
        this.resize();
        this.renderTitleScreen();
        console.log('Game restarted');
    },

    // プレビュー表示（ゲーム開始前）
    showPreview() {
        this.titleState = 'title';
        this.resize();
        this.initGame();

        // カメラをプレイヤー位置に設定（残像防止）
        if (this.player) {
            const stage = App.projectData.stage;
            const viewWidth = this.canvas.width / this.TILE_SIZE;
            const viewHeight = this.canvas.height / this.TILE_SIZE;
            this.camera.x = this.player.x - viewWidth / 2 + 0.5;
            this.camera.y = this.player.y - viewHeight / 2 + 0.5;
            this.camera.x = Math.max(0, Math.min(this.camera.x, stage.width - viewWidth));
            this.camera.y = Math.max(0, Math.min(this.camera.y, stage.height - viewHeight));
        }

        // ゲーム画面を一度レンダリングしてキャッシュ（残像防止）
        this.renderGameScreen();

        // タイトル画面表示
        this.renderTitleScreen();
    },

    resize() {
        const container = document.getElementById('game-viewport');
        if (!container) return;

        const stage = App.projectData.stage;
        const maxWidth = container.clientWidth - 16;
        const maxHeight = container.clientHeight - 16;

        // 2倍表示でフィット
        const scale = 2;
        const viewTilesX = Math.floor(maxWidth / (this.TILE_SIZE * scale));
        const viewTilesY = Math.floor(maxHeight / (this.TILE_SIZE * scale));

        this.canvas.width = viewTilesX * this.TILE_SIZE * scale;
        this.canvas.height = viewTilesY * this.TILE_SIZE * scale;

        this.TILE_SIZE = 16 * scale; // 2倍スケール
    },

    initGame() {
        const stage = App.projectData.stage;
        const templates = App.projectData.templates || [];

        console.log('=== initGame Debug ===');
        console.log('Templates count:', templates.length);

        // プレイヤーとエネミーの位置をテンプレートとステージから検索
        let playerPos = null;
        const enemyPositions = [];

        // スプライトIDからテンプレートを検索するマップ（旧形式互換）
        const spriteToTemplate = {};
        templates.forEach((template, index) => {
            const spriteIdx = template?.sprites?.idle?.frames?.[0] ?? template?.sprites?.main?.frames?.[0];
            if (spriteIdx !== undefined) {
                spriteToTemplate[spriteIdx] = template;
            }
        });

        // ヘルパー: tileIdからテンプレートを取得
        const getTemplateFromTileId = (tileId) => {
            if (tileId >= 100) {
                // テンプレートIDベース（新形式）
                const idx = tileId - 100;
                return { template: templates[idx], templateIdx: idx };
            } else if (tileId >= 0) {
                // スプライトIDベース（旧形式）
                const template = spriteToTemplate[tileId];
                const idx = templates.indexOf(template);
                return { template, templateIdx: idx >= 0 ? idx : undefined };
            }
            return { template: null, templateIdx: undefined };
        };

        // ステージ上のタイルからプレイヤー・エネミーを検索
        // 1. Entities配列から検索（推奨）
        if (stage.entities) {
            stage.entities.forEach(ent => {
                const template = templates[ent.templateId];
                if (template) {
                    if (template.type === 'player' && !playerPos) {
                        playerPos = { x: ent.x, y: ent.y, template, templateIdx: ent.templateId };
                    } else if (template.type === 'enemy') {
                        enemyPositions.push({ x: ent.x, y: ent.y, template, templateIdx: ent.templateId, behavior: template.config?.move || 'idle' });
                    }
                }
            });
        }

        if (stage && stage.layers && stage.layers.fg) {
            for (let y = 0; y < stage.height; y++) {
                for (let x = 0; x < stage.width; x++) {
                    const tileId = stage.layers.fg[y][x];
                    if (tileId >= 0) {
                        const { template, templateIdx } = getTemplateFromTileId(tileId);
                        if (template) {
                            if (template.type === 'player' && !playerPos) {
                                playerPos = { x, y, template, templateIdx };
                            } else if (template.type === 'enemy') {
                                enemyPositions.push({ x, y, template, templateIdx, behavior: template.config?.move || 'idle' });
                            }
                        }
                    }
                }
            }
        }

        // プレイヤー初期化（ステージ上に配置されている場合のみ）
        if (playerPos) {
            this.player = new Player(playerPos.x, playerPos.y, playerPos.template, playerPos.templateIdx);
            console.log('Player created at', playerPos.x, playerPos.y, 'templateIdx:', playerPos.templateIdx);
        } else {
            // プレイヤーがステージ上にいない場合は生成しない
            this.player = null;
            console.log('No player found on stage');
        }

        // エネミー初期化（templateIdxを渡す）
        this.enemies = enemyPositions.map(pos =>
            new Enemy(pos.x, pos.y, pos.template, pos.behavior, pos.templateIdx)
        );

        // ボス状態リセット＆ボス敵をfrozen状態に
        this.bossSpawned = false;
        this.bossSequencePhase = null;
        this.bossSequenceTimer = 0;
        this.bossEnemy = null;
        this.enemies.forEach(enemy => {
            if (enemy.template?.config?.isBoss) {
                enemy.frozen = true; // ボスは最初動かない
                this.bossEnemy = enemy;
            }
        });

        // プロジェクタイルとアイテムをリセット
        this.projectiles = [];
        this.items = [];
        this.particles = []; // パーティクルシステム
        this.breakableTiles = new Map(); // 耐久度管理 (key: "x,y", value: life)
        this.breakableTiles = new Map(); // 耐久度管理 (key: "x,y", value: life)
        this.destroyedTiles = new Set(); // 破壊されたタイルの一時管理 (key: "x,y")

        // スコア初期化
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('pgk_highscore') || '0', 10);
        this.newHighScore = false; // 今回のプレイで更新したか

        // ゲームオーバー待機状態をリセット
        this.gameOverPending = false;
        this.gameOverWaitTimer = 0;

        // クリア条件関連
        this.isCleared = false;
        this.allEnemiesSpawned = true; // 初期状態では全敵がスポーン済みとみなす
        this.totalClearItems = 0; // クリアアイテム総数
        this.collectedClearItems = 0; // 取得済みクリアアイテム数

        // タイマー関連
        const timeLimit = stage.timeLimit || 0;
        this.remainingTime = timeLimit; // 残り時間（秒）
        this.frameCounter = 0; // フレームカウンター（60FPSで1秒）
        this.hasTimeLimit = timeLimit > 0;

        // ステージ上のアイテムを検索
        // 重複防止用のSet（座標をキーとして使用）
        const processedItemPositions = new Set();

        // 1. Entities配列から（優先）
        if (stage.entities) {
            stage.entities.forEach(ent => {
                const template = templates[ent.templateId];
                if (template && template.type === 'item') {
                    const spriteIdx = template.sprites?.idle?.frames?.[0] ?? template.sprites?.main?.frames?.[0];
                    const itemType = template.config?.itemType || 'star';

                    // 座標をキーとして記録
                    const posKey = `${Math.floor(ent.x)},${Math.floor(ent.y)}`;
                    processedItemPositions.add(posKey);

                    this.items.push({
                        x: ent.x,
                        y: ent.y,
                        width: 1,
                        height: 1,
                        spriteIdx: spriteIdx,
                        itemType: itemType,
                        collected: false
                    });
                    // クリア条件アイテムカウント
                    if (itemType === 'clear') {
                        this.totalClearItems++;
                    }
                }
            });
        }

        // 2. layers.fgから（エンティティで未処理の位置のみ）
        if (stage && stage.layers && stage.layers.fg) {
            for (let y = 0; y < stage.height; y++) {
                for (let x = 0; x < stage.width; x++) {
                    const posKey = `${x},${y}`;
                    // 既にentitiesで処理済みならスキップ
                    if (processedItemPositions.has(posKey)) {
                        continue;
                    }

                    const tileId = stage.layers.fg[y][x];
                    if (tileId >= 0) {
                        const { template, templateIdx } = getTemplateFromTileId(tileId);
                        if (template && template.type === 'item') {
                            const spriteIdx = template.sprites?.idle?.frames?.[0] ?? template.sprites?.main?.frames?.[0];
                            const itemType = template.config?.itemType || 'star';
                            this.items.push({
                                x: x,
                                y: y,
                                width: 0.8,
                                height: 0.8,
                                template: template,
                                templateIdx: templateIdx,
                                spriteIdx: spriteIdx,
                                itemType: itemType,
                                collected: false
                            });
                            // クリアアイテムをカウント
                            if (itemType === 'clear') {
                                this.totalClearItems++;
                            }
                        }
                    }
                }
            }
        }

        // デバッグログ
        console.log('=== Game Initialized ===');
        console.log('totalClearItems:', this.totalClearItems);
        console.log('items array length:', this.items.length);
        console.log('Clear items detail:');
        this.items.filter(i => i.itemType === 'clear').forEach((item, idx) => {
            console.log(`  [${idx}] x=${item.x}, y=${item.y}, type=${item.itemType}`);
        });
        console.log('processedItemPositions:', [...processedItemPositions]);
    },

    gameLoop() {
        if (!this.isRunning) return;

        // ワイプ演出中
        if (this.titleState === 'wipe') {
            this.wipeTimer++;
            if (this.wipeTimer >= 30) {
                this.titleState = 'playing';
                this.playBgm('stage'); // ステージBGM開始
            }
            this.renderWipe();
            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        // STAGE CLEAR演出中
        if (this.titleState === 'clear') {
            this.clearTimer++;

            // プレイヤーの喜びジャンプ（最初の30フレームで発動）
            if (this.player && this.clearTimer === 1) {
                this.player.startJoyJump();
            }

            // プレイヤーのジャンプ更新（重力と位置のみ）
            if (this.player) {
                this.player.updateJoyJump();
            }

            // ゲーム画面を描画（敵やアイテムは静止）
            this.render();

            // STAGE CLEARテキストと暗転エフェクト
            this.renderClearEffect();

            // フェーズ終了: 210フレーム（2秒テキスト + 0.5秒暗転 + 1秒待機）後にリザルトへ
            if (this.clearTimer >= 210) {
                this.titleState = 'result';
                this.renderResultScreen();
                return;
            }

            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        // GAME OVER演出中（ワイプ閉じ→GAME OVER→PUSH START）
        if (this.titleState === 'gameover') {
            this.gameOverTimer++;

            // フェーズ1: 閉じるワイプ（0-30フレーム）
            if (this.gameOverTimer <= 30) {
                this.renderCloseWipe();
            }
            // フェーズ2: GAME OVER表示（30-150フレーム）
            else if (this.gameOverTimer <= 150) {
                this.renderGameOverText();
            }
            // フェーズ3: リザルトへ
            else {
                this.titleState = 'result';
                this.renderResultScreen(); // DOM表示
                // リザルト中はループ停止（またはresultステートでループ継続して描画のみ？）
                // ここではループを継続させて、resultステート処理に任せる
                this.animationId = requestAnimationFrame(() => this.gameLoop());
                return;
            }

            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        // リザルト画面
        if (this.titleState === 'result') {
            // ゲーム画面は静止画として描画し続ける（背景）
            this.render();
            // 特に更新処理はなし（DOMオーバーレイ操作待ち）
            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        // 一時停止中はupdateをスキップ（描画は続行）
        if (!this.isPaused) {
            this.update();
            // タイルアニメーションフレームカウンターを更新
            this.tileAnimationFrame++;

            // タイマー更新（playingの時のみ）
            if (this.titleState === 'playing' && this.hasTimeLimit && !this.isCleared) {
                this.frameCounter++;
                if (this.frameCounter >= 60) { // 60FPSで1秒
                    this.frameCounter = 0;
                    this.remainingTime--;

                    // タイムアウト処理
                    if (this.remainingTime <= 0) {
                        this.remainingTime = 0;
                        const clearCondition = App.projectData.stage.clearCondition || 'none';
                        if (clearCondition === 'survival') {
                            // サバイバルモード: 時間経過でクリア
                            // サバイバルモード: 時間経過でクリア
                            this.triggerClear();
                        } else {
                            // 通常モード: 時間切れでゲームオーバー
                            this.gameOverPending = true;
                            this.gameOverWaitTimer = 30;
                        }
                    }
                }
            }
        }
        this.render();

        // プレイヤー落下チェック（画面外に出たらゲームオーバーへ）
        // titleStateがplayingの時のみ判定
        // デバッグ: 毎フレームログ出力
        if (this.titleState === 'playing' && this.player) {
            // 30フレームごとにログ出力（多すぎるのを防ぐ）
            if (this.tileAnimationFrame % 30 === 0) {
                console.log('Player y:', this.player.y, 'Stage height:', App.projectData.stage.height);
            }
            // +0.5に変更: ステージ下端を少し超えたらゲームオーバー
            if (this.player.y > App.projectData.stage.height + 0.5) {
                // 落下演出のため少し待機してからゲームオーバー
                if (!this.gameOverPending) {
                    console.log('GAME OVER pending! Player y:', this.player.y, 'Stage height:', App.projectData.stage.height);
                    this.gameOverPending = true;
                    this.gameOverWaitTimer = 60; // 約1秒待機
                }
            }
        }

        // ゲームオーバー待機タイマー処理
        if (this.gameOverPending && this.titleState === 'playing') {
            this.gameOverWaitTimer--;
            if (this.gameOverWaitTimer <= 0) {
                console.log('GAME OVER triggered!');
                this.titleState = 'gameover';
                this.gameOverTimer = 0;
                this.gameOverPending = false;
                this.playBgm('gameover', false); // ゲームオーバーBGM（ループなし）
            }
        }

        this.animationId = requestAnimationFrame(() => this.gameLoop());
    },

    renderCloseWipe() {
        const ctx = this.ctx;
        const progress = this.gameOverTimer / 30;

        // 全体をゲーム画面で描画
        this.renderGameScreen();

        // 外側から中央に閉じる正方形
        const maxSize = Math.max(this.canvas.width, this.canvas.height);
        // Math.floorで整数化して白線のギャップを防ぐ
        const size = Math.floor(maxSize * (1 - progress));
        const x = Math.floor((this.canvas.width - size) / 2);
        const y = Math.floor((this.canvas.height - size) / 2);

        // 外側をダークグレーで塗りつぶし（少し余分に塗ってギャップを防ぐ）
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, this.canvas.width, y + 1); // 上（+1で隙間を埋める）
        ctx.fillRect(0, y + size - 1, this.canvas.width, this.canvas.height - y - size + 2); // 下
        ctx.fillRect(0, y, x + 1, size); // 左
        ctx.fillRect(x + size - 1, y, this.canvas.width - x - size + 2, size); // 右
    },

    renderGameOverText() {
        const ctx = this.ctx;
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2);
    },

    renderGameOver() {
        // 互換性のため残す
        this.renderGameOverText();
    },

    renderTitleScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.titleBlinkTimer++;
        if (Math.floor(this.titleBlinkTimer / 30) % 2 === 0) {
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('PUSH START', this.canvas.width / 2, this.canvas.height / 2);
        }

        // タイトル画面のループ
        if (this.titleState === 'title') {
            requestAnimationFrame(() => this.renderTitleScreen());
        }
    },

    renderWipe() {
        const ctx = this.ctx;
        const progress = this.wipeTimer / 30;

        // まず全体をダークグレーで塗りつぶし（残像防止）
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // ワイプ効果（中央から広がる正方形）
        const maxSize = Math.max(this.canvas.width, this.canvas.height);
        const size = maxSize * progress;
        const x = (this.canvas.width - size) / 2;
        const y = (this.canvas.height - size) / 2;

        // クリップ領域として正方形を設定
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, size, size);
        ctx.clip();

        // ゲーム画面を描画
        this.renderGameScreen();

        ctx.restore();
    },

    renderGameScreen() {
        const bgColor = App.projectData.stage?.bgColor || App.projectData.stage?.backgroundColor || '#3CBCFC';
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.renderStage();

        // アイテム描画
        this.items.forEach(item => {
            if (!item.collected) {
                this.renderProjectileOrItem(item);
            }
        });

        this.enemies.forEach(enemy => enemy.render(this.ctx, this.TILE_SIZE, this.camera));

        if (this.player) {
            this.player.render(this.ctx, this.TILE_SIZE, this.camera);
        }

        // プロジェクタイル描画
        this.projectiles.forEach(proj => {
            this.renderProjectileOrItem(proj);
        });

        // パーティクル描画
        this.renderParticles();

        this.renderUI();
    },

    renderProjectileOrItem(obj) {
        // アニメーション対応: templateからフレームを取得
        let spriteIdx = obj.spriteIdx;
        if (obj.templateIdx !== undefined) {
            const template = App.projectData.templates[obj.templateIdx];
            if (template) {
                // animationSlotが指定されている場合はそのスロットを優先
                const spriteSlots = template.sprites || {};
                let frames = [];

                if (obj.animationSlot && spriteSlots[obj.animationSlot]?.frames?.length > 0) {
                    frames = spriteSlots[obj.animationSlot].frames;
                } else {
                    // 指定がない場合は全スロットから検索
                    const slotNames = ['idle', 'main', 'walk', 'jump', 'attack', 'shot', 'life'];
                    for (const slotName of slotNames) {
                        if (spriteSlots[slotName]?.frames?.length > 0) {
                            frames = spriteSlots[slotName].frames;
                            break;
                        }
                    }
                }
                if (frames.length > 1) {
                    // アニメーション速度: 10フレームごとにスプライトを切り替え
                    const frameSpeed = 10;
                    const frameIndex = Math.floor(this.tileAnimationFrame / frameSpeed) % frames.length;
                    spriteIdx = frames[frameIndex];
                } else if (frames.length === 1) {
                    spriteIdx = frames[0];
                }
            }
        }

        const sprite = App.projectData.sprites[spriteIdx];
        if (!sprite) return;

        const screenX = (obj.x - this.camera.x) * this.TILE_SIZE;
        const screenY = (obj.y - this.camera.y) * this.TILE_SIZE;
        const palette = App.nesPalette;
        const pixelSize = this.TILE_SIZE / 16;
        const flipX = obj.facingRight === false;

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    const drawX = flipX ? screenX + (15 - x) * pixelSize : screenX + x * pixelSize;
                    this.ctx.fillRect(drawX, screenY + y * pixelSize, pixelSize + 0.5, pixelSize + 0.5);
                }
            }
        }
    },

    update() {
        // ボス演出シーケンス処理
        if (this.bossSequencePhase) {
            this.bossSequenceTimer++;
            if (this.bossSequencePhase === 'fadeout') {
                // フェードアウト（約1秒=60フレーム）
                if (this.bossSequenceTimer >= 60) {
                    this.stopBgm();
                    this.bossSequencePhase = 'silence';
                    this.bossSequenceTimer = 0;
                }
            } else if (this.bossSequencePhase === 'silence') {
                // 無音（3秒=180フレーム）
                if (this.bossSequenceTimer >= 180) {
                    this.playBgm('boss');
                    if (this.bossEnemy) {
                        this.bossEnemy.frozen = false; // ボス活性化
                    }
                    this.bossSequencePhase = null;
                    this.bossSequenceTimer = 0;
                }
            }
            // シーケンス中はプレイヤーのみ更新（ボスは静止）
            if (this.player) {
                this.player.update(this);
                const viewWidth = this.canvas.width / this.TILE_SIZE;
                const viewHeight = this.canvas.height / this.TILE_SIZE;
                this.camera.x = this.player.x - viewWidth / 2 + 0.5;
                this.camera.y = this.player.y - viewHeight / 2 + 0.5;
                const stage = App.projectData.stage;
                this.camera.x = Math.max(0, Math.min(this.camera.x, stage.width - viewWidth));
                this.camera.y = Math.max(0, Math.min(this.camera.y, stage.height - viewHeight));
            }
            return; // シーケンス中は他の更新をスキップ
        }

        // ボス出現検知（まだスポーンしていない場合のみ）
        if (this.bossEnemy && !this.bossSpawned && !this.bossEnemy.isDying) {
            const viewWidth = this.canvas.width / this.TILE_SIZE;
            const viewHeight = this.canvas.height / this.TILE_SIZE;
            const bossX = this.bossEnemy.x;
            const bossY = this.bossEnemy.y;
            // ボスが画面内にいるか
            if (bossX >= this.camera.x && bossX < this.camera.x + viewWidth &&
                bossY >= this.camera.y && bossY < this.camera.y + viewHeight) {
                // ボス出現！シーケンス開始
                this.bossSpawned = true;
                this.bossSequencePhase = 'fadeout';
                this.bossSequenceTimer = 0;
                // BGMフェードアウトは通常のstopBgmで代用（シンプル化）
            }
        }

        if (this.player) {
            this.player.update(this);

            // カメラをプレイヤー中心に
            // ビューのタイル数を計算（スケール適用済みTILE_SIZEを使用）
            const viewWidth = this.canvas.width / this.TILE_SIZE;
            const viewHeight = this.canvas.height / this.TILE_SIZE;

            this.camera.x = this.player.x - viewWidth / 2 + 0.5;
            this.camera.y = this.player.y - viewHeight / 2 + 0.5;

            // カメラ範囲制限
            const stage = App.projectData.stage;
            this.camera.x = Math.max(0, Math.min(this.camera.x, stage.width - viewWidth));
            this.camera.y = Math.max(0, Math.min(this.camera.y, stage.height - viewHeight));
        }

        this.enemies.forEach(enemy => enemy.update(this));

        // プロジェクタイル更新
        this.updateProjectiles();

        // パーティクル更新
        this.updateParticles();

        // アイテム衝突判定
        this.checkItemCollisions();

        this.checkCollisions();
        this.checkClearCondition();
    },

    updateProjectiles() {
        this.projectiles = this.projectiles.filter(proj => {
            // 移動
            proj.x += proj.vx;
            proj.y += proj.vy;

            // 飛距離チェック
            const distance = Math.abs(proj.x - proj.startX);
            if (distance >= proj.maxRange) {
                return false;
            }

            const cx = 0.5;
            const cy = 0.5;

            // 壁との衝突
            if (this.getCollision(proj.x + cx, proj.y + cy)) {
                // 壁にダメージを与える
                this.damageTile(Math.floor(proj.x + cx), Math.floor(proj.y + cy));
                return false;
            }

            // プレイヤーのSHOT → 敵との衝突（ダメージ無敵中は無効）
            if (proj.owner === 'player') {
                // ダメージ無敵中（starPowerでない）は敵に当たらない
                if (this.player && this.player.invincible && !this.player.starPower) {
                    // スキップ（ショットは残る）
                } else {
                    for (const enemy of this.enemies) {
                        if (!enemy.isDying && this.projectileHits(proj, enemy)) {
                            const fromRight = proj.vx > 0;
                            enemy.takeDamage(fromRight);
                            return false;
                        }
                    }
                }
            }

            // 敵のSHOT → プレイヤーとの衝突
            if (proj.owner === 'enemy' && this.player && !this.player.isDead) {
                if (this.projectileHits(proj, this.player)) {
                    const fromRight = proj.vx > 0;
                    this.player.takeDamage(fromRight);
                    return false;
                }
            }

            return true;
        });
    },

    projectileHits(proj, target) {
        return proj.x < target.x + target.width &&
            proj.x + proj.width > target.x &&
            proj.y < target.y + target.height &&
            proj.y + proj.height > target.y;
    },

    checkItemCollisions() {
        if (!this.player || this.player.isDead) return;

        this.items.forEach((item, idx) => {
            if (item.collected) return;

            if (this.player.collidesWith(item)) {
                console.log(`>>> Collecting item[${idx}] at (${item.x}, ${item.y}), type=${item.itemType}, player at (${this.player.x.toFixed(2)}, ${this.player.y.toFixed(2)})`);
                item.collected = true;
                this.player.collectItem(item.itemType);

                // CLEARアイテムの場合、取得数をカウント
                if (item.itemType === 'clear') {
                    this.collectedClearItems++;
                    console.log(`Clear Item Collected: ${this.collectedClearItems} / ${this.totalClearItems}`);
                    // アイテムクリア条件チェック
                    if (App.projectData.stage.clearCondition === 'item' || App.projectData.stage.clearCondition === 'none') {
                        this.checkClearCondition();
                    }
                }

                // スコア加算（アイテムタイプに応じて変えることも可能）
                let pts = 100;
                if (item.itemType === 'star') pts = 500;
                if (item.itemType === 'weapon') pts = 200;
                if (item.itemType === 'clear') pts = 1000;
                this.addScore(pts);
            }
        });
    },

    checkCollisions() {
        if (!this.player || this.player.isDead) return;

        this.enemies.forEach((enemy, index) => {
            if (enemy.isDying) return;

            if (this.player.collidesWith(enemy)) {
                // スターパワー中は敵即死
                if (this.player.starPower) {
                    const fromRight = this.player.x > enemy.x;
                    enemy.takeDamage(fromRight);
                    enemy.lives = 0;
                    enemy.die(fromRight);
                    enemy.die(fromRight);
                    // SE再生
                    this.player.playSE('enemyDefeat');
                    // スコア加算
                    this.addScore(100);
                    return;
                }

                // ダメージ無敵中（starPowerでない）は踏み攻撃も無効
                if (this.player.invincible && !this.player.starPower) {
                    return;
                }

                // 上から踏みつけ判定
                if (this.player.vy > 0 && this.player.y + this.player.height < enemy.y + enemy.height * 0.5) {
                    const fromRight = this.player.x > enemy.x;
                    enemy.takeDamage(fromRight);
                    this.player.vy = -0.25;
                    // SE再生（敵がダメージを受けた時）
                    this.player.playSE('enemyDefeat');
                    // スコア加算（倒した時のみにすべきか？とりあえず踏み成功で加算、倒したらさらに加算も検討だが、ここでは倒した判定はenemy側で管理）
                    // 敵のHPが0になったら加算すべき。enemy.livesを確認
                    if (enemy.lives <= 0) {
                        this.addScore(100);
                    }
                } else if (!this.player.invincible) {
                    const fromRight = enemy.x > this.player.x;
                    this.player.takeDamage(fromRight);
                }
            }
        });

        // 消滅した敵を削除（画面外に落下した敵）
        this.enemies = this.enemies.filter(e => {
            if (e.isDying && e.deathTimer > 120) return false;
            if (e.y > App.projectData.stage.height + 5) return false;
            return true;
        });

        // 死亡判定はgameLoopで処理（ここでは何もしない）
    },

    checkClearCondition() {
        if (this.isCleared) return;

        const stage = App.projectData.stage;
        const clearCondition = stage.clearCondition || 'none';

        switch (clearCondition) {
            case 'item':
                // CLEARアイテムを全て取得したらクリア
                if (this.collectedClearItems >= this.totalClearItems && this.totalClearItems > 0) {
                    this.triggerClear();
                }
                break;

            case 'enemies':
                // すべての敵を倒したらクリア
                if (this.enemies.length === 0 && this.allEnemiesSpawned) {
                    this.triggerClear();
                }
                break;

            case 'boss':
                // ボスを倒したらクリア（雑魚敵が残っていてもOK）
                if (this.bossEnemy && this.bossEnemy.isDying) {
                    this.triggerClear();
                }
                break;

            case 'survival':
                // サバイバル時間経過でクリア（updateTimerで処理）
                break;

            case 'none':
            default:
                // 従来のゴールタイル方式（存在する場合）
                const objects = App.projectData.objects;
                const goal = objects.find(o => o.type === 'goal');
                if (goal && this.player) {
                    const tileX = Math.floor(this.player.x);
                    const tileY = Math.floor(this.player.y);
                    if (tileX === goal.x && tileY === goal.y) {
                        this.triggerClear();
                    }
                }
                break;
        }
    },

    triggerClear() {
        if (this.isCleared) return;
        this.isCleared = true;
        this.clearTimer = 0;
        this.titleState = 'clear';
        this.playBgm('clear', false); // クリアBGM開始（ループなし）

        // タイムボーナス
        const timeBonus = Math.floor(this.remainingTime) * 10;
        if (timeBonus > 0) {
            this.addScore(timeBonus);
        }
    },

    renderClearEffect() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // フェーズ1: 最初の120フレーム（2秒）はテキストのみ
        // フェーズ2: 120〜150フレーム（30フレーム）で両サイドから暗転

        // 両サイドからの暗転（120フレーム後から開始、30フレームで完了）
        if (this.clearTimer > 120) {
            const wipeProgress = Math.min((this.clearTimer - 120) / 30, 1);
            const darkWidth = (w / 2) * wipeProgress;

            ctx.fillStyle = '#333333'; // GAME OVERと同じ色
            ctx.fillRect(0, 0, darkWidth, h); // 左から
            ctx.fillRect(w - darkWidth, 0, darkWidth, h); // 右から
        }

        // STAGE CLEAR テキスト（点滅、GAME OVERと同じフォント）
        if (Math.floor(this.clearTimer / 10) % 2 === 0) {
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('STAGE CLEAR', w / 2, h / 2);
        }

        // 3.5秒後にリザルトへ
        if (this.clearTimer > 210) {
            this.titleState = 'result';
            this.renderResultScreen();
        }
    },

    renderGameOver() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.gameOverTimer++;

        // 暗転
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(this.gameOverTimer / 60, 0.6)})`;
        ctx.fillRect(0, 0, w, h);

        // テキスト表示
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff4444';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText('GAME OVER', w / 2, h / 2);
        ctx.shadowBlur = 0;

        // 3秒後にリザルトへ
        if (this.gameOverTimer > 180) {
            this.titleState = 'result';
            this.renderResultScreen(); // 初回描画（DOM表示）
            // ループを止めるためにisRunningをfalseにするか、ステートで止めるか
            // resultステートならgameLoop内で処理が止まるようにする
        }
    },

    getCollision(x, y) {
        const stage = App.projectData.stage;
        const templates = App.projectData.templates || [];
        const tileX = Math.floor(x);
        const tileY = Math.floor(y);

        // 破壊されたタイルは衝突なし
        if (this.destroyedTiles && this.destroyedTiles.has(`${tileX},${tileY}`)) {
            return 0;
        }

        // 左右と上は壁として扱う、下は衝突なし（落下可能）
        if (tileX < 0 || tileX >= stage.width) {
            return 1; // 左右は壁
        }
        if (tileY < 0) {
            return 1; // 上は壁
        }
        if (tileY >= stage.height) {
            return 0; // 下は衝突なし（落下）
        }

        // fgレイヤーからtileIdを取得
        const tileId = stage.layers.fg?.[tileY]?.[tileX];
        if (tileId === undefined || tileId < 0) {
            return 0; // 衝突なし（空タイル）
        }

        // テンプレートからタイルの種類と衝突設定を判定
        let template;
        if (tileId >= 100) {
            // テンプレートIDベース（新形式）
            template = templates[tileId - 100];
        } else {
            // スプライトIDベース（旧形式）- 互換性
            template = templates.find(t => {
                const idx = t?.sprites?.idle?.frames?.[0] ?? t?.sprites?.main?.frames?.[0];
                return idx === tileId;
            });
        }

        if (!template) {
            return 0; // テンプレートが見つからない
        }

        // 素材タイルで衝突がオン = 壁
        if (template.type === 'material' && template.config?.collision !== false) {
            return 1;
        }

        return 0; // 衝突なし
    },

    damageTile(tileX, tileY) {
        const stage = App.projectData.stage;
        const templates = App.projectData.templates || [];

        // 範囲チェック
        if (tileX < 0 || tileX >= stage.width || tileY < 0 || tileY >= stage.height) {
            return;
        }

        const tileId = stage.layers.fg?.[tileY]?.[tileX];
        if (tileId === undefined || tileId < 0) return;

        // テンプレート取得（ヘルパーがあればそれを使うが、ここでも簡易実装）
        let template;
        if (tileId >= 100) {
            template = templates[tileId - 100];
        } else {
            template = templates.find(t => {
                const idx = t?.sprites?.idle?.frames?.[0] ?? t?.sprites?.main?.frames?.[0];
                return idx === tileId;
            });
        }

        if (!template) return;

        // LIFE設定確認
        const maxLife = template.config?.life;
        // lifeが未設定、または-1（無限）の場合は破壊不可
        if (maxLife === undefined || maxLife === -1) return;

        // 耐久度管理
        const key = `${tileX},${tileY}`;
        let currentLife = this.breakableTiles.get(key);

        if (currentLife === undefined) {
            currentLife = maxLife;
        }

        // ダメージ処理
        currentLife--;
        this.breakableTiles.set(key, currentLife);

        if (currentLife <= 0) {
            this.destroyTile(tileX, tileY, tileId);
        } else {
            // ダメージ音（SE設定があれば詳細化可、ここでは共通音）
            // this.player.playSE('damage');
        }
    },

    destroyTile(tileX, tileY, tileId) {
        const stage = App.projectData.stage;
        const key = `${tileX},${tileY}`;

        // 元データは変更せず、破壊済みリストに追加
        // stage.layers.fg[tileY][tileX] = -1; 
        this.destroyedTiles.add(key);

        this.breakableTiles.delete(key);

        // パーティクル生成
        this.createTileParticles(tileX, tileY, tileId);

        // 破壊音（EnemyDefeat音などで代用、あるいは専用音が必要なら追加）
        // 破壊音（EnemyDefeat音などで代用、あるいは専用音が必要なら追加）
        if (this.player) {
            this.player.playSE('enemyDefeat');
        }

        // スコア加算
        this.addScore(10);
    },

    createTileParticles(tileX, tileY, tileId) {
        const templates = App.projectData.templates || [];
        const sprites = App.projectData.sprites || [];

        let spriteIdx;
        if (tileId >= 100) {
            const template = templates[tileId - 100];
            spriteIdx = template?.sprites?.idle?.frames?.[0] ?? template?.sprites?.main?.frames?.[0];
        } else {
            spriteIdx = tileId;
        }

        const sprite = sprites[spriteIdx];
        if (!sprite) return;

        const palette = App.nesPalette;
        const startX = tileX;
        const startY = tileY;

        // 4x4ピクセルごとにパーティクル化
        for (let py = 0; py < 16; py += 4) {
            for (let px = 0; px < 16; px += 4) {
                let color = null;
                // 4x4ブロック内の代表色を探す（あるいは平均色）
                for (let dy = 0; dy < 4 && !color; dy++) {
                    for (let dx = 0; dx < 4 && !color; dx++) {
                        const ci = sprite.data[py + dy]?.[px + dx];
                        if (ci !== undefined && ci >= 0) {
                            color = palette[ci];
                        }
                    }
                }

                if (color) {
                    this.particles.push({
                        x: startX + px / 16 + 0.125, // 中心補正
                        y: startY + py / 16 + 0.125,
                        vx: (Math.random() - 0.5) * 0.15, // 飛び散り
                        vy: -Math.random() * 0.2 - 0.1, // 上に跳ねる
                        color: color,
                        size: 4, // 4x4ピクセル
                        life: 60 + Math.random() * 30
                    });
                }
            }
        }
    },

    updateParticles() {
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.015; // 重力
            p.life--;
        });
        this.particles = this.particles.filter(p => p.life > 0);
    },

    renderParticles() {
        const ctx = this.ctx;
        const camX = this.camera.x;
        const camY = this.camera.y;
        const tileSize = this.TILE_SIZE;
        const pixelScale = tileSize / 16;

        this.particles.forEach(p => {
            const screenX = (p.x - camX) * tileSize;
            const screenY = (p.y - camY) * tileSize;
            const size = p.size * pixelScale;

            ctx.fillStyle = p.color;
            ctx.fillRect(screenX, screenY, size, size);
        });
    },

    render() {
        this.renderGameScreen();
    },

    renderUI() {
        // ライフ表示
        if (this.player && !this.player.isDead) {
            const lifeSprites = this.player.template?.sprites?.life;
            const frames = lifeSprites?.frames || [];

            // アニメーション対応: 複数フレームがある場合は切り替え
            let spriteIdx;
            if (frames.length > 1) {
                const frameSpeed = 10;
                const frameIndex = Math.floor(this.tileAnimationFrame / frameSpeed) % frames.length;
                spriteIdx = frames[frameIndex];
            } else if (frames.length === 1) {
                spriteIdx = frames[0];
            }

            const sprite = spriteIdx !== undefined ? App.projectData.sprites[spriteIdx] : null;

            const heartSize = 20;
            // スプライトが登録されている場合のみ表示
            if (sprite) {
                for (let i = 0; i < this.player.lives; i++) {
                    const posX = 10 + i * (heartSize + 2);
                    const posY = 10;

                    const palette = App.nesPalette;
                    const pixelSize = heartSize / 16;
                    for (let sy = 0; sy < 16; sy++) {
                        for (let sx = 0; sx < 16; sx++) {
                            const colorIndex = sprite.data[sy][sx];
                            if (colorIndex >= 0) {
                                this.ctx.fillStyle = palette[colorIndex];
                                this.ctx.fillRect(
                                    posX + sx * pixelSize,
                                    posY + sy * pixelSize,
                                    pixelSize + 0.5,
                                    pixelSize + 0.5
                                );
                            }
                        }
                    }
                }
            }
        }

        // PAUSE表示
        if (this.isPaused) {
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;

            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText('PAUSE', centerX, centerY);
        }

        // タイマー表示（右上）
        if (this.hasTimeLimit && this.titleState === 'playing') {
            const min = Math.floor(this.remainingTime / 60);
            const sec = this.remainingTime % 60;
            const timeText = `${min}:${sec.toString().padStart(2, '0')}`;

            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'top';

            // 残り10秒以下は赤、それ以外は白
            if (this.remainingTime <= 10) {
                this.ctx.fillStyle = '#ff4444';
            } else {
                this.ctx.fillStyle = '#ffffff';
            }

            // 影
            this.ctx.fillStyle = '#000000';
            this.ctx.fillText(timeText, this.canvas.width - 9, 11);

            // 本体
            if (this.remainingTime <= 10) {
                this.ctx.fillStyle = '#ff4444';
            } else {
                this.ctx.fillStyle = '#ffffff';
            }
            if (this.remainingTime <= 10) {
                this.ctx.fillStyle = '#ff4444';
            } else {
                this.ctx.fillStyle = '#ffffff';
            }
            this.ctx.fillText(timeText, this.canvas.width - 10, 10);
        }

        // スコア表示（中央上）
        if (App.projectData.stage.showScore) {
            const scoreText = `SCORE: ${this.score.toString().padStart(6, '0')}`;
            // const hiText = `HI: ${this.highScore.toString().padStart(6, '0')}`; // スペースがあれば表示

            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';

            // 影
            this.ctx.fillStyle = '#000000';
            this.ctx.fillText(scoreText, this.canvas.width / 2 + 1, 11);

            // 本体
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText(scoreText, this.canvas.width / 2, 10);
        }
    },

    renderStage() {
        const stage = App.projectData.stage;
        const sprites = App.projectData.sprites;
        const palette = App.nesPalette;

        // FGレイヤーのみ描画（BGは単色背景としてrender()で処理済み）
        if (stage.layers.fg) {
            this.renderLayer(stage.layers.fg, sprites, palette);
        }
    },

    renderLayer(layer, sprites, palette) {
        const stage = App.projectData.stage;
        const templates = App.projectData.templates || [];

        // ヘルパー: tileIdからスプライトとテンプレートを取得（アニメーション対応）
        const getTileInfo = (tileId) => {
            if (tileId >= 100) {
                // テンプレートIDベース（新形式）
                const templateIdx = tileId - 100;
                const template = templates[templateIdx];
                if (template) {
                    // 全アニメーションスロットからframesを取得
                    const spriteSlots = template.sprites || {};
                    const slotNames = ['idle', 'main', 'walk', 'jump', 'attack', 'shot', 'life'];
                    let frames = [];
                    for (const slotName of slotNames) {
                        if (spriteSlots[slotName]?.frames?.length > 0) {
                            frames = spriteSlots[slotName].frames;
                            break; // 最初に見つかったスロットを使用
                        }
                    }
                    if (frames.length > 0) {
                        // アニメーション速度: 10フレームごとにスプライトを切り替え
                        const frameSpeed = 10;
                        const frameIndex = Math.floor(this.tileAnimationFrame / frameSpeed) % frames.length;
                        const spriteIdx = frames[frameIndex];
                        const sprite = spriteIdx !== undefined ? sprites[spriteIdx] : null;
                        return { template, sprite, spriteIdx };
                    }
                }
            } else if (tileId >= 0) {
                // スプライトIDベース（旧形式）- 互換性
                const sprite = sprites[tileId];
                if (sprite) {
                    const template = templates.find(t =>
                        (t.sprites?.idle?.frames?.[0] === tileId) || (t.sprites?.main?.frames?.[0] === tileId)
                    );
                    return { template, sprite, spriteIdx: tileId };
                }
            }
            return { template: null, sprite: null, spriteIdx: -1 };
        };

        // 全タイルを描画（player/enemy/itemタイプは除外）
        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const tileId = layer[y][x];
                // 空タイル(-1)および2x2マーカータイル(-1000以下)はスキップ
                if (tileId < 0) continue;

                // 破壊されたタイルは描画しない
                if (this.destroyedTiles && this.destroyedTiles.has(`${x},${y}`)) {
                    continue;
                }

                const { template, sprite } = getTileInfo(tileId);
                if (!sprite) continue;

                // player/enemy/itemタイプはゲームオブジェクトとして別途描画
                if (template && (template.type === 'player' || template.type === 'enemy' || template.type === 'item')) {
                    continue;
                }

                this.renderSprite(sprite, x, y, palette);
            }
        }
    },

    renderSprite(sprite, tileX, tileY, palette) {
        // スプライトサイズを判定
        const spriteSize = sprite.size || 1;
        const dimension = spriteSize === 2 ? 32 : 16;
        const tileCount = spriteSize === 2 ? 2 : 1;  // 占有するタイル数
        const renderSize = this.TILE_SIZE * tileCount;
        const pixelSize = renderSize / dimension;

        const screenX = (tileX - this.camera.x) * this.TILE_SIZE;
        const screenY = (tileY - this.camera.y) * this.TILE_SIZE;

        // 画面外スキップ（2x2の場合は拡大領域を考慮）
        if (screenX + renderSize < 0 || screenX > this.canvas.width ||
            screenY + renderSize < 0 || screenY > this.canvas.height) {
            return;
        }

        for (let y = 0; y < dimension; y++) {
            for (let x = 0; x < dimension; x++) {
                const colorIndex = sprite.data[y]?.[x];
                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(
                        screenX + x * pixelSize,
                        screenY + y * pixelSize,
                        pixelSize + 0.5,
                        pixelSize + 0.5
                    );
                }
            }
        }
    },

    // ========== BGM再生 ==========
    playBgm(type, loop = true) {
        // 同じBGMが再生中なら何もしない
        if (this.currentBgmType === type && this.bgmPlayInterval) return;

        this.stopBgm();

        const stage = App.projectData.stage;
        const bgm = stage?.bgm || {};
        const songIdx = parseInt(bgm[type], 10);

        if (isNaN(songIdx) || songIdx < 0) return;

        const songs = App.projectData.songs || [];
        const song = songs[songIdx];
        if (!song) return;

        // Web Audio初期化
        if (!this.bgmAudioCtx) {
            this.bgmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        // iOSでsuspendedの場合にresume
        if (this.bgmAudioCtx.state === 'suspended') {
            this.bgmAudioCtx.resume();
        }

        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const trackTypes = ['square', 'square', 'triangle', 'noise'];

        // 各トラックのアクティブな発音を追跡（同時発音数1制限用）
        const activeNodes = [null, null, null, null];

        const getFrequency = (pitch) => {
            const octave = Math.floor(pitch / 12) + 1;
            const noteIdx = pitch % 12;
            const semitone = (octave - 4) * 12 + noteIdx - 9;
            return 440 * Math.pow(2, semitone / 12);
        };

        const playNote = (freq, waveType, duration, pitch, trackIdx) => {
            const ctx = this.bgmAudioCtx;

            // 前の音を停止（同時発音数1制限）
            if (activeNodes[trackIdx]) {
                try {
                    activeNodes[trackIdx].stop();
                } catch (e) { }
                activeNodes[trackIdx] = null;
            }

            if (waveType === 'noise') {
                // ドラム音（ピッチに応じた連続的なフィルター周波数）
                const bufferSize = ctx.sampleRate * Math.max(duration, 0.05);
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }

                const noise = ctx.createBufferSource();
                noise.buffer = buffer;

                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();

                // ピッチ0-71を周波数80Hz-15000Hzにマッピング（指数的）
                const minFreq = 80;
                const maxFreq = 15000;
                const maxPitch = 71;
                const freqRatio = Math.pow(maxFreq / minFreq, pitch / maxPitch);
                const filterFreq = minFreq * freqRatio;

                // 低音はローパス（バスドラム）、中音はバンドパス（スネア）、高音はハイパス（ハイハット）
                if (pitch < 24) {
                    filter.type = 'lowpass';
                    filter.frequency.value = filterFreq;
                    filter.Q.value = 1;
                } else if (pitch < 48) {
                    filter.type = 'bandpass';
                    filter.frequency.value = filterFreq;
                    filter.Q.value = 3;
                } else {
                    filter.type = 'highpass';
                    filter.frequency.value = filterFreq * 0.4;
                    filter.Q.value = 1;
                }

                // 音量とディケイ（durationに応じて）- より強いアタック
                const baseVolume = 0.35;
                const volume = baseVolume - (pitch / maxPitch) * 0.15;

                // アタックを強調
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005);

                // 50%の時間は音量維持、残り50%で減衰
                const sustainTime = duration * 0.5;
                gain.gain.setValueAtTime(volume, ctx.currentTime + 0.005 + sustainTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                noise.start();
                noise.stop(ctx.currentTime + duration);

                // アクティブノードを記録
                activeNodes[trackIdx] = noise;
                return;
            }

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = waveType;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            // 矩形波は音量を下げる（0.10）、三角波は維持（0.15）
            const volume = (waveType === 'square') ? 0.10 : 0.15;
            gain.gain.setValueAtTime(volume, ctx.currentTime);
            // 80%の時間は音量維持、残り20%で減衰
            const sustainTime = duration * 0.8;
            gain.gain.setValueAtTime(volume, ctx.currentTime + sustainTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);

            // アクティブノードを記録
            activeNodes[trackIdx] = osc;
        };

        // BGM再生ループ
        this.currentBgmType = type;
        const stepDuration = 60 / song.bpm / 4; // 16分音符
        let step = 0;
        const maxSteps = song.bars * 16;

        this.bgmPlayInterval = setInterval(() => {
            if (this.isPaused) return;

            song.tracks.forEach((track, trackIdx) => {
                track.notes.forEach(note => {
                    if (note.step === step) {
                        const freq = getFrequency(note.pitch);
                        playNote(freq, trackTypes[trackIdx], stepDuration * note.length, note.pitch, trackIdx);
                    }
                });
            });

            step++;
            if (step >= maxSteps) {
                if (loop) {
                    step = 0; // ループ再生
                } else {
                    this.stopBgm(); // 1回再生のみで終了
                }
            }
        }, stepDuration * 1000);
    },

    stopBgm() {
        if (this.bgmPlayInterval) {
            clearInterval(this.bgmPlayInterval);
            this.bgmPlayInterval = null;
        }
        this.currentBgmType = null;
    },

    // ========== スコア管理 ==========
    addScore(points) {
        // デフォルトはON
        if (App.projectData.stage.showScore === false) return;

        this.score += points;

        // ハイスコア更新
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.newHighScore = true;
            localStorage.setItem('pgk_highscore', this.highScore);
        }
    },

    // リザルト画面のイベント初期化（一度だけ呼ぶ）
    initResultEvents() {
        const shareBtn = document.getElementById('result-share-btn');
        const retryBtn = document.getElementById('result-retry-btn');
        const editBtn = document.getElementById('result-edit-btn');
        const overlay = document.getElementById('result-overlay');

        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                if (App.projectData) {
                    Share.openDialog(App.projectData, {
                        score: this.score,
                        title: App.projectData.meta?.title || 'Game',
                        isNewRecord: this.newHighScore
                    });
                }
            });
        }

        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                if (overlay) overlay.classList.add('hidden');
                this.restart();
            });
        }

        if (editBtn) {
            editBtn.addEventListener('click', () => {
                if (overlay) overlay.classList.add('hidden');
                this.stop();
                App.switchScreen('stage');
            });
        }
    },

    // リザルト画面表示
    renderResultScreen() {
        // 背景は最後のゲーム画面のまま（再描画しない）

        const overlay = document.getElementById('result-overlay');
        const scoreContainer = document.getElementById('result-score-container');
        const scoreVal = document.getElementById('result-score-value');
        const highVal = document.getElementById('result-highscore-value');
        const shareBtn = document.getElementById('result-share-btn');
        const title = document.getElementById('result-title');

        if (!overlay) return;

        // タイトル設定
        if (this.isCleared) {
            title.textContent = 'STAGE CLEAR!';
            title.style.color = '#ffd700'; // Gold
        } else {
            title.textContent = 'GAME OVER';
            title.style.color = '#ff4444'; // Red
        }

        // スコア表示設定 (デフォルトON)
        const showScore = App.projectData.stage.showScore !== false;
        if (showScore && scoreContainer) {
            scoreContainer.classList.remove('hidden');
            if (scoreVal) scoreVal.textContent = this.score.toString().padStart(6, '0');
            if (highVal) highVal.textContent = this.highScore.toString().padStart(6, '0');
            if (shareBtn) shareBtn.classList.remove('hidden');
        } else {
            if (scoreContainer) scoreContainer.classList.add('hidden');
            if (shareBtn) shareBtn.classList.add('hidden');
        }

        overlay.classList.remove('hidden');
    }
};
