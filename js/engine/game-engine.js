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
    gimmickBlocks: [],

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
    bossSequencePhase: null,   // 'fadeout', 'silence', null (出現演出)
    bossSequenceTimer: 0,      // 演出タイマー
    bossEnemy: null,           // ボスエネミー参照
    bossDefeatPhase: null,     // 'silence', 'clear', null (撃破演出)
    bossDefeatTimer: 0,        // 撃破演出タイマー

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
        // ステージデータのディープコピーを作成（実行中の変更が元データに影響しないように）
        this.stageData = JSON.parse(JSON.stringify(App.projectData.stage));
        const stage = this.stageData;
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
        this.bossDefeatPhase = null;
        this.bossDefeatTimer = 0;
        this.bossEnemy = null;
        this.enemies.forEach(enemy => {
            // ボスは初期状態frozen（出現演出で解除）
            if (enemy.template?.config?.isBoss) {
                enemy.frozen = true;
            } else {
                // 通常敵：BGまたはFGレイヤーにブロック（material）がある場合はfrozen
                const ex = Math.floor(enemy.x);
                const ey = Math.floor(enemy.y);
                const stage = this.stageData;
                let isCovered = false;

                // Helper to check if a tile is a blocking material
                const isBlock = (tileId) => {
                    if (tileId === undefined || tileId < 0) return false;
                    const { template } = getTemplateFromTileId(tileId);
                    // materialタイプ、あるいは破壊可能（life設定あり）ならブロックとみなす
                    // BGレイヤーの場合はテンプレートが見つからない（ただのタイル）場合もブロックとみなす？
                    // しかし破壊可能ブロックは通常テンプレート化されている。
                    if (template) {
                        return template.type === 'material';
                    }
                    // テンプレートがない場合（ただのタイル）、BGならブロックとみなす（安全策）
                    return true;
                };

                // Check BG
                if (stage.layers.bg && isBlock(stage.layers.bg[ey]?.[ex])) {
                    isCovered = true;
                }

                // Check FG (only if material, do not freeze if covered by item)
                if (!isCovered && stage.layers.fg && isBlock(stage.layers.fg[ey]?.[ex])) {
                    isCovered = true;
                }

                if (isCovered) {
                    enemy.frozen = true;
                    // console.log('Enemy frozen at', ex, ey, '(covered)');
                }
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
        // ギミックブロック初期化
        this.gimmickBlocks = [];
        if (stage && stage.layers && stage.layers.fg) {
            for (let y = 0; y < stage.height; y++) {
                for (let x = 0; x < stage.width; x++) {
                    const tileId = stage.layers.fg[y][x];
                    if (tileId >= 0) {
                        const { template, templateIdx } = getTemplateFromTileId(tileId);
                        if (template && template.type === 'material' && template.config?.gimmick && template.config.gimmick !== 'none') {
                            this.gimmickBlocks.push({
                                tileX: x,
                                tileY: y,
                                x: x, // 実際の位置（小数）
                                y: y,
                                tileId: tileId,
                                template: template,
                                templateIdx: templateIdx,
                                gimmick: template.config.gimmick,
                                vx: template.config.gimmick === 'moveH' ? 0.02 : 0,
                                vy: template.config.gimmick === 'moveV' ? 0.02 : 0,
                                state: 'normal', // 'normal', 'triggered', 'shaking', 'falling'
                                timer: 0
                            });
                            // 実行用ステージデータから元タイルを削除（二重当たり判定防止）
                            stage.layers.fg[y][x] = -1;
                            console.log(`Gimmick block initialized at ${x},${y}. Original tile cleared.`);
                        }
                    }
                }
            }
        }

        // デバッグログ
        console.log('=== Game Initialized ===');
        console.log('totalClearItems:', this.totalClearItems);
        console.log('items array length:', this.items.length);
        console.log('gimmickBlocks:', this.gimmickBlocks.length);
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
        if (!this.player) return;

        // 背景色
        const bgColor = App.projectData.stage.bgColor || App.projectData.stage.backgroundColor || '#3CBCFC';
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // カメラ更新（線形補間なしでシンプルに追従）
        const centerX = this.canvas.width / 2 / this.TILE_SIZE;
        const centerY = this.canvas.height / 2 / this.TILE_SIZE;
        // プレイヤー中心
        let targetX = this.player.x + this.player.width / 2 - centerX;
        let targetY = this.player.y + this.player.height / 2 - centerY;

        // ステージ端制限
        const stage = App.projectData.stage;
        const viewWidth = this.canvas.width / this.TILE_SIZE;
        const viewHeight = this.canvas.height / this.TILE_SIZE;

        targetX = Math.max(0, Math.min(targetX, stage.width - viewWidth));
        targetY = Math.max(0, Math.min(targetY, stage.height - viewHeight));

        this.camera.x = targetX;
        this.camera.y = targetY;

        // ワイプ中は更新しない（見た目を固定）
        if (this.titleState === 'wipe' || this.titleState === 'gameover' || this.titleState === 'clear') {
            // そのまま描画
        }

        const camX = this.camera.x;
        const camY = this.camera.y;
        const viewTilesX = Math.ceil(this.canvas.width / this.TILE_SIZE) + 1;
        const viewTilesY = Math.ceil(this.canvas.height / this.TILE_SIZE) + 1;
        const startX = Math.floor(camX);
        const startY = Math.floor(camY);
        const endX = startX + viewTilesX;
        const endY = startY + viewTilesY;
        const palette = App.nesPalette;

        // 1. 背景レイヤー (BG)
        if (stage.layers.bg) {
            this.renderLayer(stage.layers.bg, startX, startY, endX, endY);
        }

        // 2. アイテム (blocksの後ろにある場合は隠す)
        // ブロックがある位置 = layers.bg にタイルがある位置（0以上）
        // ただし、destroyTileで破壊された場所は breakableTiles から消えるわけではなく、
        // 描画上は消える必要がある。
        // renderLayerは destroyedTiles をチェックしていない（stageデータしか見ていない）。
        // 破壊されたタイルは、stageデータ自体は消さない実装だったが、
        // 可視性チェックでは「BGレイヤーにタイルがあり、かつ破壊されていないか」を見る必要がある。

        this.items.forEach(item => {
            if (item.collected) return;

            // ブロックで隠れているかチェック
            const itemTileX = Math.floor(item.x);
            const itemTileY = Math.floor(item.y);
            let isHidden = false;

            if (stage.layers.bg) {
                // 壁（衝突判定あり）がある場合のみ隠す
                if (this.getCollision(itemTileX, itemTileY) === 1) {
                    isHidden = true;
                }
            }

            if (!isHidden) {
                this.renderProjectileOrItem(item);
            }
        });

        // 3. ギミックブロック（FGレイヤーのmaterial）
        // FGレイヤーの静的タイルを描画する代わりに、ギミックブロックとして描画
        // 静的ブロックもここで描画？
        // 元の実装では FGレイヤーを renderLayer で描画していた。
        // ギミックブロックは動くので、元の位置のタイルは描画しないようにする必要がある。
        // しかし renderLayer は単純に配列を描画する。
        // ここでは「BG→Items→Enemies→FG(ブロック)」ではなく、
        // 「BG→Items→Enemies→FG（プレイヤーより奥）→Player→FG（プレイヤーより手前）」のような順序はない。
        // NES風なのでシンプルに「BG → Obj → FG」で良いが、
        // ブロックに隠れる敵を実現するためには、
        // 「BG(ブロック含む)」→「隠れるObj(Item/Enemy)」→「FG」としたいが、
        // ユーザー指定は「BGにブロック、FGにアイテム」で「ブロックを壊すとアイテム」。
        // つまりアイテムはBGブロックの【後ろ】にあるべき。
        // 描画順: Item -> BG Block.
        // しかしアイテムはFGレイヤー(entities)で配置される。
        // 通常はBG -> FG(Items/Blocks) -> Player.
        // 今回の要件: BG(Block) covers FG(Item).
        // 描画順: FG(Item) -> BG(Block) ?? 逆？
        // BGレイヤーが手前にあるということはない。
        // ユーザー「FGレイヤーに壊れるブロック」→ブロックは奥。
        // 「FGレイヤーにアイテム」→アイテムは手前。
        // 普通ならアイテムが手前に見える。
        // ユーザーは「ブロックの後ろにアイテム」と言っている。
        // なので、アイテムを描画する際に「その位置にBGブロックがあれば描画しない」というロジックで対応する（隠蔽）。

        // 4. エネミー（生存中のみ、死亡中はFGの後で描画）
        this.enemies.forEach(enemy => {
            // 死亡中の敵は後で描画（FGレイヤーの手前に表示するため）
            if (enemy.isDying) return;

            // 隠れているエネミー（frozenかつブロックがある）は描画しない
            if (enemy.frozen) {
                const ex = Math.floor(enemy.x);
                const ey = Math.floor(enemy.y);
                // BGブロックがあるか確認
                let covered = false;
                if (stage.layers.bg) {
                    // 壁（衝突判定あり）がある場合のみ隠す
                    if (this.getCollision(ex, ey) === 1) {
                        covered = true;
                    }
                }
                if (covered) return;
            }
            enemy.render(this.ctx, this.TILE_SIZE, this.camera);
        });

        // 5. プレイヤー
        if (this.player) {
            this.player.render(this.ctx, this.TILE_SIZE, this.camera);
        }

        // 6. FGレイヤー (障害物など)
        if (stage.layers.fg) {
            // updateGimmickBlocksで移動したブロックは個別に描画が必要
            // ここでは静的なFGを描画
            // ただし、ギミックブロックや破壊されたブロックは除外する必要がある？
            // destroyTileは破壊済みリストに追加するが、layerデータは書き換えない（以前の実装）。
            // renderLayer内でdestroyedTilesをチェックするように修正する必要がある。
            this.renderLayer(stage.layers.fg, startX, startY, endX, endY);
        }

        // 7. ギミックブロック（動くブロック）
        this.gimmickBlocks.forEach(block => {
            if (block.template) {
                // gimmickBlocks have template property, use main sprite
                const spriteIdx = block.template.sprites?.main?.frames?.[0];
                if (spriteIdx !== undefined) {
                    const obj = {
                        x: block.x, y: block.y,
                        spriteIdx: spriteIdx,
                        facingRight: true
                    };
                    // renderProjectileOrItem (renderObject replacement)
                    this.renderProjectileOrItem(obj);
                }
            }
        });

        // 8. 死亡中の敵（FGレイヤーより手前に表示）
        this.enemies.forEach(enemy => {
            if (enemy.isDying) {
                enemy.render(this.ctx, this.TILE_SIZE, this.camera);
            }
        });

        // 9. プロジェクタイル
        this.projectiles.forEach(proj => {
            this.renderProjectileOrItem(proj);
        });

        // 10. パーティクル
        this.renderParticles();

        // 11. UI
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
                // 無音（1秒=60フレーム）
                if (this.bossSequenceTimer >= 60) {
                    this.playBgm('boss');
                    if (this.bossEnemy) {
                        this.bossEnemy.frozen = false; // ボス活性化
                    }
                    this.bossSequencePhase = null;
                    this.bossSequenceTimer = 0;
                }
            }
            // シーケンス中もプレイヤーと敵を更新（ボスはfrozenで動かないが、deathTimerは更新される）
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
            // 敵も更新
            this.enemies.forEach(enemy => enemy.update(this));
            // アイテムも更新（重力など）
            this.updateItems();

            this.checkClearCondition();
            return;
        }

        // ボス撃破シーケンス処理
        if (this.bossDefeatPhase) {
            this.bossDefeatTimer++;
            if (this.bossDefeatPhase === 'silence') {
                // 無音（1秒=60フレーム）
                if (this.bossDefeatTimer >= 60) {
                    this.bossDefeatPhase = 'waitfall';
                    this.bossDefeatTimer = 0;
                }
            } else if (this.bossDefeatPhase === 'waitfall') {
                // ボスが落ちるのを待つ（deathTimer > 120 または画面外に落下）
                const bossFallen = !this.bossEnemy ||
                    this.bossEnemy.deathTimer > 120 ||
                    this.bossEnemy.y > App.projectData.stage.height + 5;
                if (bossFallen) {
                    this.bossDefeatPhase = null;
                    this.bossDefeatTimer = 0;
                    this.triggerClear(); // クリアシーケンス開始（内部でクリアBGM再生）
                }
            }
            // プレイヤーと敵を更新（落下演出のため）
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
            // ボスの落下アニメーション更新
            this.enemies.forEach(enemy => enemy.update(this));
            this.updateItems();
            return;
        }

        if (this.isPaused) return;

        // メイン更新ループ
        this.tileAnimationFrame++;

        // ボス出現・撃破管理
        // 1. 中ボス撃破判定（ボス撃破シーケンス中でない時）
        if (this.bossEnemy && this.bossEnemy.isDying && !this.bossDefeatPhase) {
            // 他にボスが残っているか？
            const remainingBosses = this.enemies.filter(e =>
                e.template?.config?.isBoss && !e.isDying && e !== this.bossEnemy
            );

            if (remainingBosses.length > 0) {
                // 中ボス撃破：BGMをステージ曲に戻す
                console.log('Intermediate boss defeated.');
                this.bossEnemy = null; // ボス戦状態解除
                this.bossSpawned = false; // 次のボス用に出現フラグリセット
                this.playBgm('stage');
            } else {
                // 最後のボスは checkClearCondition で処理されるためここでは何もしない
            }
        }

        // 2. ボス出現検知（まだスポーンしていない場合のみ）
        if (!this.bossSpawned && !this.bossEnemy) {
            // 画面内にいて、まだ死んでいないfrozen状態のボスを探す
            const viewWidth = this.canvas.width / this.TILE_SIZE;
            const viewHeight = this.canvas.height / this.TILE_SIZE;

            const nextBoss = this.enemies.find(e =>
                e.template?.config?.isBoss &&
                e.frozen &&
                !e.isDying &&
                e.x >= this.camera.x && e.x < this.camera.x + viewWidth &&
                e.y >= this.camera.y && e.y < this.camera.y + viewHeight
            );

            if (nextBoss) {
                // ボス出現！シーケンス開始
                console.log('Boss encountered!');
                this.bossEnemy = nextBoss;
                this.bossSpawned = true;
                this.bossSequencePhase = 'fadeout';
                this.bossSequenceTimer = 0;
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
            const stage = this.stageData || App.projectData.stage;
            this.camera.x = Math.max(0, Math.min(this.camera.x, stage.width - viewWidth));
            this.camera.y = Math.max(0, Math.min(this.camera.y, stage.height - viewHeight));
        }

        this.enemies.forEach(enemy => enemy.update(this));

        // プロジェクタイル更新
        this.updateProjectiles();

        // パーティクル更新
        this.updateParticles();

        // アイテム更新（衝突判定含む）
        this.updateItems();

        // ギミックブロック更新
        this.updateGimmickBlocks();

        this.checkCollisions();
        this.checkClearCondition();
    },

    updateItems() {
        this.items.forEach(item => {
            if (item.collected) return;

            // ドロップアイテムには重力を適用
            if (item.isDropped) {
                item.vy = (item.vy || 0) + 0.02; // 重力
                if (item.vy > 0.4) item.vy = 0.4; // 最大落下速度

                item.y += item.vy;

                // 着地判定
                const footY = Math.floor(item.y + item.height);
                const tileX = Math.floor(item.x + item.width / 2);
                if (this.getCollision(tileX, footY) === 1) {
                    item.y = footY - item.height;
                    item.vy = 0;
                }
            }

            // プレイヤーとの当たり判定
            if (this.player && !this.player.isDead && !item.collected) {
                if (this.projectileHits(item, this.player)) {
                    this.player.collectItem(item.itemType);
                    item.collected = true;
                    if (this.player.template?.config?.seItemGet !== undefined) {
                        // プレイヤー設定のSE
                        // this.player.playSE('itemGet'); // player.js handles this in collectItem?
                        // game-engine doesn't play sound here directly typically, assume player.collectItem handles?
                        // Actually player.collectItem plays sound.
                    }
                    // クリアアイテムカウント
                    if (item.itemType === 'clear') {
                        this.collectedClearItems = (this.collectedClearItems || 0) + 1;
                        // UI表示更新などの必要があれば
                    }
                }
            }
        });
    },

    updateProjectiles() {
        this.projectiles = this.projectiles.filter(proj => {
            const shotType = proj.shotType || 'straight';

            // 寿命(duration)があれば減少
            if (proj.duration !== undefined) {
                proj.duration--;
                if (proj.duration <= 0) return false;
            }

            // タイプ別の移動処理
            switch (shotType) {
                case 'arc':
                    // やまなり: 重力影響
                    proj.x += proj.vx;
                    proj.vy += 0.01; // 重力
                    proj.y += proj.vy;
                    break;
                case 'drop':
                    // 鳥のフン: 真下に落下
                    proj.y += proj.vy;
                    break;
                case 'boomerang':
                    // ブーメラン: 3タイルで戻る
                    proj.x += proj.vx;
                    proj.y += proj.vy;
                    const boomerangDist = Math.abs(proj.x - proj.startX);
                    if (!proj.returning && boomerangDist >= 3) {
                        proj.returning = true;
                        proj.vx = -proj.vx;
                    }
                    // 戻ってきたら消える
                    if (proj.returning && boomerangDist < 0.5) {
                        return false;
                    }
                    break;
                case 'pinball':
                    // ピンポン: 壁で反射
                    proj.x += proj.vx;
                    proj.y += proj.vy;
                    break;
                default:
                    // straight, spread: 通常移動
                    proj.x += proj.vx;
                    proj.y += proj.vy;
            }

            // 飛距離チェック（ブーメラン以外）
            if (shotType !== 'boomerang') {
                const dx = proj.x - proj.startX;
                const dy = proj.y - (proj.startY ?? proj.startX);
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance >= proj.maxRange) {
                    return false;
                }
            }

            const cx = 0.5;
            const cy = 0.5;

            // 壁との衝突
            if (this.getCollision(Math.floor(proj.x + cx), Math.floor(proj.y + cy))) {
                if (shotType === 'pinball' && proj.bounceCount < 4) {
                    // ピンポン: 反射
                    // 壁のどちら側に当たったか判定して反射
                    const tileX = Math.floor(proj.x + cx);
                    const tileY = Math.floor(proj.y + cy);
                    const prevX = proj.x - proj.vx;
                    const prevY = proj.y - proj.vy;

                    // X方向から衝突
                    if (this.getCollision(tileX, Math.floor(prevY + cy)) === 1) {
                        proj.vx = -proj.vx;
                    }
                    // Y方向から衝突
                    if (this.getCollision(Math.floor(prevX + cx), tileY) === 1) {
                        proj.vy = -proj.vy;
                    }
                    proj.bounceCount++;
                    proj.x += proj.vx;
                    proj.y += proj.vy;
                } else if (shotType === 'boomerang') {
                    // ブーメラン: 壁にダメージを与えて反転
                    this.damageTile(Math.floor(proj.x + cx), Math.floor(proj.y + cy));
                    if (!proj.returning) {
                        proj.returning = true;
                        proj.vx = -proj.vx;
                    } else {
                        return false;
                    }
                } else {
                    // 通常: 壁にダメージ
                    this.damageTile(Math.floor(proj.x + cx), Math.floor(proj.y + cy));
                    return false;
                }
            }

            // プレイヤーのSHOT → 敵との衝突
            if (proj.owner === 'player') {
                if (this.player && this.player.invincible && !this.player.starPower) {
                    // ダメージ無敵中はスキップ
                } else {
                    for (const enemy of this.enemies) {
                        if (!enemy.isDying && this.projectileHits(proj, enemy)) {
                            const fromRight = proj.vx > 0;
                            enemy.takeDamage(fromRight);
                            if (shotType !== 'pinball' && shotType !== 'boomerang') {
                                return false;
                            }
                            // ピンポン・ブーメランは貫通
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

            // 画面外チェック（ピンポン用）
            if (proj.y > 20 || proj.y < -5 || proj.x < -5 || proj.x > 100) {
                return false;
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

    updateGimmickBlocks() {
        const stage = this.stageData || App.projectData.stage;
        if (!stage) return;

        this.gimmickBlocks = this.gimmickBlocks.filter(block => {
            const gimmick = block.gimmick;

            // 横移動
            if (gimmick === 'moveH') {
                block.x += block.vx;
                // 障害物チェック
                const nextTileX = block.vx > 0 ? Math.floor(block.x + 1) : Math.floor(block.x);
                if (nextTileX < 0 || nextTileX >= stage.width || this.getCollision(nextTileX, Math.floor(block.y)) === 1) {
                    block.vx = -block.vx;
                    block.x += block.vx * 2;
                }
            }

            // 縦移動
            if (gimmick === 'moveV') {
                block.y += block.vy;
                // 障害物チェック
                const nextTileY = block.vy > 0 ? Math.floor(block.y + 1) : Math.floor(block.y);
                if (nextTileY < 0 || nextTileY >= stage.height || this.getCollision(Math.floor(block.x), nextTileY) === 1) {
                    block.vy = -block.vy;
                    block.y += block.vy * 2;
                }
            }

            // 落下ブロック
            if (gimmick === 'fall') {
                // プレイヤーが上に乗っているかチェック
                if (block.state === 'normal' && this.player) {
                    const playerOnTop =
                        this.player.x + this.player.width > block.x &&
                        this.player.x < block.x + 1 &&
                        Math.abs((this.player.y + this.player.height) - block.y) < 0.15 &&
                        this.player.vy >= 0;
                    if (playerOnTop) {
                        block.state = 'triggered';
                        block.timer = 60; // 1秒待機
                    }
                }

                if (block.state === 'triggered') {
                    block.timer--;
                    if (block.timer <= 0) {
                        block.state = 'shaking';
                        block.timer = 30; // 0.5秒震える
                    }
                }

                if (block.state === 'shaking') {
                    block.timer--;
                    if (block.timer <= 0) {
                        block.state = 'falling';
                        block.vy = 0;
                    }
                }

                if (block.state === 'falling') {
                    block.vy += 0.02; // 重力
                    block.y += block.vy;
                    // 画面外で削除
                    if (block.y > stage.height + 5) {
                        return false;
                    }
                }
            }

            return true;
        });
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
                if (item.itemType === 'star' || item.itemType === 'muteki') pts = 500;
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
            // ボスが落下で消える場合の特別処理
            if (e.template?.config?.isBoss && e.y > App.projectData.stage.height + 5) {
                // 落下による死亡もボス撃破として扱う
                if (this.bossEnemy === e) {
                    // 他の生存ボスがいるか確認
                    const remainingBosses = this.enemies.filter(other =>
                        other !== e && other.template?.config?.isBoss && !other.isDying && other.y <= App.projectData.stage.height + 5
                    );
                    if (remainingBosses.length > 0) {
                        // 中ボス撃破：BGMをステージ曲に戻す
                        console.log('Intermediate boss fell off stage.');
                        this.bossEnemy = null;
                        this.bossSpawned = false;
                        this.playBgm('stage');
                    } else {
                        // 最終ボス撃破
                        const stage = App.projectData.stage;
                        const clearCondition = stage.clearCondition || 'none';
                        // クリア条件が'boss'の場合のみクリアシーケンス開始
                        if (clearCondition === 'boss' && !this.bossDefeatPhase && !this.isCleared) {
                            console.log('Final boss fell off stage. Triggering clear.');
                            this.bossEnemy = null;
                            this.triggerClear();
                        } else {
                            console.log('Final boss fell off stage. (clear condition not boss)');
                            this.bossEnemy = null;
                        }
                    }
                }
                // ボスもドロップアイテムを出す
                this.spawnDropItem(e);
                return false; // このボスを配列から削除
            }
            if (e.isDying && e.deathTimer > 120) {
                // 死亡演出完了時にドロップアイテムを出現
                this.spawnDropItem(e);
                return false;
            }
            // 画面外に落下した敵
            if (e.y > App.projectData.stage.height + 5) {
                // 死亡中の敵が落下した場合もドロップアイテムを出す
                if (e.isDying) {
                    this.spawnDropItem(e);
                }
                return false;
            }
            return true;
        });

        // 死亡判定はgameLoopで処理（ここでは何もしない）
    },

    // 敵がドロップするアイテムを出現させる
    spawnDropItem(enemy) {
        const dropItem = enemy.template?.config?.dropItem;
        console.log('spawnDropItem called for enemy:', enemy.template?.name, 'dropItem:', dropItem);
        if (!dropItem || dropItem === 'none') {
            console.log('No drop item configured');
            return;
        }

        // アイテムテンプレートを探す
        const templates = App.projectData.templates || [];
        console.log('Searching for item template with itemType:', dropItem);

        // muteki/star の互換性対応
        const searchTypes = [dropItem];
        if (dropItem === 'muteki') searchTypes.push('star');
        if (dropItem === 'star') searchTypes.push('muteki');

        let itemTemplate = templates.find(t =>
            t.type === 'item' && searchTypes.includes(t.config?.itemType)
        );

        // 見つからない場合、名前で検索
        if (!itemTemplate) {
            itemTemplate = templates.find(t =>
                t.type === 'item' && t.name?.toLowerCase().includes(dropItem.toLowerCase())
            );
        }

        // 見つからない場合、任意のitemタイプテンプレートを使う
        if (!itemTemplate) {
            itemTemplate = templates.find(t => t.type === 'item');
        }

        let templateIdx = -1;
        let spriteIdx = 0; // デフォルトスプライト

        if (itemTemplate) {
            templateIdx = templates.indexOf(itemTemplate);
            spriteIdx = itemTemplate.sprites?.idle?.frames?.[0] ?? itemTemplate.sprites?.main?.frames?.[0] ?? 0;
        } else {
            // アイテムテンプレートがない場合、最初のスプライトを使用（フォールバック）
            console.log('No item template found, using fallback sprite for:', dropItem);
            // スプライト0番を使用（通常は何かが存在する）
            spriteIdx = 0;
        }

        // 死亡時の位置を使用（記録されていなければ現在位置）
        const spawnX = enemy.deathX !== undefined ? enemy.deathX : enemy.x;
        const spawnY = enemy.deathY !== undefined ? enemy.deathY : enemy.y;

        const item = {
            x: spawnX,
            y: spawnY,
            width: 0.8,
            height: 0.8,
            template: itemTemplate,
            templateIdx: templateIdx,
            spriteIdx: spriteIdx,
            itemType: dropItem,
            collected: false,
            isDropped: true, // ドロップアイテムフラグ（重力適用用）
            vy: -0.15 // 少し跳ねる
        };

        this.items.push(item);
        console.log('Spawned drop item:', dropItem, 'at', spawnX, spawnY, 'spriteIdx:', spriteIdx);

        // クリアアイテムの場合はカウント
        if (dropItem === 'clear') {
            this.totalClearItems++;
        }
    },

    // 指定位置の休眠敵を起こす（ブロック破壊時に呼ばれる）
    wakeEnemiesAt(tileX, tileY) {
        this.enemies.forEach(e => {
            if (e.frozen) {
                const ex = Math.floor(e.x);
                const ey = Math.floor(e.y);
                if (ex === tileX && ey === tileY) {
                    e.frozen = false;
                    console.log('Enemy woke up at', tileX, tileY);
                }
            }
        });
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
                // 全てのボスを倒したらクリア（複数ボス対応）
                // 生存中のボス（isDyingでない）をカウント
                const aliveBosses = this.enemies.filter(e =>
                    e.template?.config?.isBoss && !e.isDying
                );
                const dyingBosses = this.enemies.filter(e =>
                    e.template?.config?.isBoss && e.isDying
                );

                // ボスが全て倒された（生存ボスがいない、かつ死亡演出中のボスがいる）
                if (aliveBosses.length === 0 && dyingBosses.length > 0 && !this.bossDefeatPhase) {
                    console.log('Last boss defeated! Starting defeat sequence.');
                    // 最後のボスを撃破演出用に記録
                    this.bossEnemy = dyingBosses[0];
                    // ボス撃破演出開始：BGM停止→1秒無音→ボス落下→クリアBGM
                    this.stopBgm();
                    this.bossDefeatPhase = 'silence';
                    this.bossDefeatTimer = 0;
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
        // ステージデータ参照（ギミックブロック削除済みコピーを使用）
        const stage = this.stageData || App.projectData.stage;
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

        // 重なっている敵がいれば起こす
        this.wakeEnemiesAt(tileX, tileY);
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
        const stage = this.stageData || App.projectData.stage;
        const sprites = App.projectData.sprites;
        const palette = App.nesPalette;

        // FGレイヤーのみ描画（BGは単色背景としてrender()で処理済み）
        if (stage.layers.fg) {
            this.renderLayer(stage.layers.fg, sprites, palette);
        }
    },

    renderLayer(layer, sprites, palette) {
        const stage = this.stageData || App.projectData.stage;
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

        // ギミックブロック位置をセットに登録
        const gimmickPositions = new Set();
        if (this.gimmickBlocks) {
            this.gimmickBlocks.forEach(block => {
                gimmickPositions.add(`${block.tileX},${block.tileY}`);
            });
        }

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

                // ギミックブロックは別途描画するのでスキップ
                if (gimmickPositions.has(`${x},${y}`)) {
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

    renderLayer(layer, startX, startY, endX, endY) {
        if (!layer) return;
        const templates = App.projectData.templates || [];
        const stage = App.projectData.stage;

        for (let y = startY; y < endY; y++) {
            if (y < 0 || y >= stage.height) continue;
            for (let x = startX; x < endX; x++) {
                if (x < 0 || x >= stage.width) continue;

                // 破壊済みタイルはスキップ
                if (this.destroyedTiles.has(`${x},${y}`)) continue;

                const tileId = layer[y][x];
                if (tileId >= 0) {
                    let spriteIdx = -1;
                    if (tileId >= 100) {
                        const template = templates[tileId - 100];
                        // アイテム、敵、プレイヤーは個別のループで描画するためここではスキップ
                        if (template && (template.type === 'item' || template.type === 'enemy' || template.type === 'player')) continue;

                        // マテリアル（ブロック）などはここで描画
                        spriteIdx = template?.sprites?.idle?.frames?.[0] ?? template?.sprites?.main?.frames?.[0];
                    } else {
                        // 旧形式または単純タイル
                        spriteIdx = tileId;
                    }

                    if (spriteIdx !== undefined && spriteIdx >= 0) {
                        const screenX = (x - this.camera.x) * this.TILE_SIZE;
                        const screenY = (y - this.camera.y) * this.TILE_SIZE;
                        this.renderSprite(App.projectData.sprites[spriteIdx], screenX, screenY, App.nesPalette);
                    }
                }
            }
        }
    },

    renderSprite(sprite, x, y, palette) {
        if (!sprite) return;
        const pixelSize = this.TILE_SIZE / 16;

        for (let py = 0; py < 16; py++) {
            for (let px = 0; px < 16; px++) {
                const colorIndex = sprite.data[py][px];
                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(
                        x + px * pixelSize,
                        y + py * pixelSize,
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

        const playNote = (freq, waveType, duration, pitch, trackIdx, tone) => {
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

                // 音量とディケイ
                const baseVolume = 0.35;
                const volume = baseVolume - (pitch / maxPitch) * 0.15;

                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005);
                const sustainTime = duration * 0.5;
                gain.gain.setValueAtTime(volume, ctx.currentTime + 0.005 + sustainTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                noise.start();
                noise.stop(ctx.currentTime + duration);

                activeNodes[trackIdx] = noise;
                return;
            }

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            // tone に応じた波形タイプ設定
            if (waveType === 'triangle') {
                if (tone === 1) osc.type = 'sine';
                else if (tone === 2) osc.type = 'sawtooth';
                else osc.type = 'triangle';
            } else {
                osc.type = waveType; // square
            }
            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            // 音量設定（toneによるバリエーション）
            let volume = 0.2; // 全波形タイプで統一
            const isShort = (tone === 1 || tone === 4);
            const isFadeIn = (tone === 2 || tone === 5);

            if (isShort) {
                // Short: 短くスタッカート
                gain.gain.setValueAtTime(volume, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration * 0.5);
            } else if (isFadeIn) {
                // FadeIn: フェードイン
                gain.gain.setValueAtTime(0.01, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + duration * 0.7);
                gain.gain.setValueAtTime(volume, ctx.currentTime + duration * 0.9);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            } else {
                // Normal
                gain.gain.setValueAtTime(volume, ctx.currentTime);
                const sustainTime = duration * 0.8;
                gain.gain.setValueAtTime(volume, ctx.currentTime + sustainTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            }

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);

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
                        const tone = track.tone || 0;
                        playNote(freq, trackTypes[trackIdx], stepDuration * note.length, note.pitch, trackIdx, tone);
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
