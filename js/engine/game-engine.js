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
    titleState: 'title', // 'title', 'wipe', 'playing', 'gameover'
    wipeTimer: 0,
    titleBlinkTimer: 0,
    gameOverTimer: 0,

    // タイルアニメーション用フレームカウンター
    tileAnimationFrame: 0,

    // BGM再生
    bgmAudioCtx: null,
    bgmPlayInterval: null,
    currentBgmType: null, // 'stage', 'invincible', 'clear', 'gameover'

    init() {
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
    },

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.isPaused = false;
        this.hasStarted = true;
        this.startMessageTimer = 90; // START!表示時間（1.5秒）
        this.resize();
        this.initGame();
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

        // プロジェクタイルとアイテムをリセット
        this.projectiles = [];
        this.items = [];

        // ゲームオーバー待機状態をリセット
        this.gameOverPending = false;
        this.gameOverWaitTimer = 0;

        // ステージ上のアイテムを検索
        if (stage && stage.layers && stage.layers.fg) {
            for (let y = 0; y < stage.height; y++) {
                for (let x = 0; x < stage.width; x++) {
                    const tileId = stage.layers.fg[y][x];
                    if (tileId >= 0) {
                        const { template, templateIdx } = getTemplateFromTileId(tileId);
                        if (template && template.type === 'item') {
                            const spriteIdx = template.sprites?.idle?.frames?.[0] ?? template.sprites?.main?.frames?.[0];
                            this.items.push({
                                x: x,
                                y: y,
                                width: 0.8,
                                height: 0.8,
                                template: template,
                                templateIdx: templateIdx, // アニメーション用にtemplateIdxを追加
                                spriteIdx: spriteIdx,
                                itemType: template.config?.itemType || 'star',
                                collected: false
                            });
                        }
                    }
                }
            }
        }
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
            // フェーズ3: タイトルに戻る
            else {
                this.restart();
                return;
            }

            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        // 一時停止中はupdateをスキップ（描画は続行）
        if (!this.isPaused) {
            this.update();
            // タイルアニメーションフレームカウンターを更新
            this.tileAnimationFrame++;
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
                this.playBgm('gameover'); // ゲームオーバーBGM
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

            // 壁との衝突
            if (this.getCollision(Math.floor(proj.x), Math.floor(proj.y)) === 1) {
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

        this.items.forEach(item => {
            if (item.collected) return;

            if (this.player.collidesWith(item)) {
                item.collected = true;
                this.player.collectItem(item.itemType);
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
                    // SE再生
                    this.player.playSE('enemyDefeat');
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
        const objects = App.projectData.objects;
        const goal = objects.find(o => o.type === 'goal');

        if (goal && this.player) {
            const tileX = Math.floor(this.player.x);
            const tileY = Math.floor(this.player.y);

            if (tileX === goal.x && tileY === goal.y) {
                this.stop();
                setTimeout(() => {
                    alert('クリア！');
                }, 100);
            }
        }
    },

    getCollision(x, y) {
        const stage = App.projectData.stage;
        const templates = App.projectData.templates || [];
        const tileX = Math.floor(x);
        const tileY = Math.floor(y);

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
                if (tileId < 0) continue;

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
        const pixelSize = this.TILE_SIZE / 16;
        const screenX = (tileX - this.camera.x) * this.TILE_SIZE;
        const screenY = (tileY - this.camera.y) * this.TILE_SIZE;

        // 画面外スキップ
        if (screenX + this.TILE_SIZE < 0 || screenX > this.canvas.width ||
            screenY + this.TILE_SIZE < 0 || screenY > this.canvas.height) {
            return;
        }

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
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
    playBgm(type) {
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

        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const trackTypes = ['square', 'square', 'triangle', 'noise'];

        const getFrequency = (pitch) => {
            const octave = Math.floor(pitch / 12) + 1;
            const noteIdx = pitch % 12;
            const semitone = (octave - 4) * 12 + noteIdx - 9;
            return 440 * Math.pow(2, semitone / 12);
        };

        const playNote = (freq, waveType, duration, pitch) => {
            const ctx = this.bgmAudioCtx;

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

                // ピッチ0-59を周波数100Hz-12000Hzにマッピング（指数的）
                const minFreq = 100;
                const maxFreq = 12000;
                const freqRatio = Math.pow(maxFreq / minFreq, pitch / 59);
                const filterFreq = minFreq * freqRatio;

                if (pitch < 20) {
                    filter.type = 'lowpass';
                    filter.frequency.value = filterFreq;
                } else if (pitch < 40) {
                    filter.type = 'bandpass';
                    filter.frequency.value = filterFreq;
                    filter.Q.value = 2;
                } else {
                    filter.type = 'highpass';
                    filter.frequency.value = filterFreq * 0.5;
                }

                // 音量とディケイ（durationに応じて）
                const volume = 0.3 - (pitch / 59) * 0.15;
                gain.gain.setValueAtTime(volume, ctx.currentTime);
                // 70%の時間は音量維持、残り30%で減衰
                const sustainTime = duration * 0.7;
                gain.gain.setValueAtTime(volume, ctx.currentTime + sustainTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                noise.start();
                noise.stop(ctx.currentTime + duration);
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
                        playNote(freq, trackTypes[trackIdx], stepDuration * note.length, note.pitch);
                    }
                });
            });

            step++;
            if (step >= maxSteps) {
                step = 0; // ループ
            }
        }, stepDuration * 1000);
    },

    stopBgm() {
        if (this.bgmPlayInterval) {
            clearInterval(this.bgmPlayInterval);
            this.bgmPlayInterval = null;
        }
        this.currentBgmType = null;
    }
};
