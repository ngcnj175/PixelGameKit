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
    titleState: 'title', // 'title', 'wipe', 'playing'
    wipeTimer: 0,
    titleBlinkTimer: 0,

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
        // showPreviewで既に初期化済み、即座にワイプ開始
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
        console.log('Templates:', templates);

        // プレイヤーとエネミーの位置をテンプレートとステージから検索
        let playerPos = null;
        const enemyPositions = [];

        // 各テンプレートのスプライトインデックスとタイプのマッピング
        const spriteToTemplate = {};
        templates.forEach((template, index) => {
            const spriteIdx = template?.sprites?.idle?.frames?.[0] ?? template?.sprites?.main?.frames?.[0];
            console.log(`Template ${index}:`, template.name, 'type:', template.type, 'spriteIdx:', spriteIdx);
            if (spriteIdx !== undefined) {
                spriteToTemplate[spriteIdx] = template;
            }
        });
        console.log('spriteToTemplate:', spriteToTemplate);

        // ステージ上のタイルからプレイヤー・エネミーを検索
        if (stage && stage.layers && stage.layers.fg) {
            for (let y = 0; y < stage.height; y++) {
                for (let x = 0; x < stage.width; x++) {
                    const spriteIdx = stage.layers.fg[y][x];
                    if (spriteIdx >= 0) {
                        const template = spriteToTemplate[spriteIdx];
                        if (template) {
                            if (template.type === 'player' && !playerPos) {
                                playerPos = { x, y, template };
                            } else if (template.type === 'enemy') {
                                enemyPositions.push({ x, y, template, behavior: template.config?.move || 'idle' });
                            }
                        }
                    }
                }
            }
        }

        // プレイヤー初期化（ステージ上に配置されている場合のみ）
        if (playerPos) {
            this.player = new Player(playerPos.x, playerPos.y, playerPos.template);
            console.log('Player created at', playerPos.x, playerPos.y);
        } else {
            // プレイヤーがステージ上にいない場合は生成しない
            this.player = null;
            console.log('No player found on stage');
        }

        // エネミー初期化
        this.enemies = enemyPositions.map(pos =>
            new Enemy(pos.x, pos.y, pos.template, pos.behavior)
        );

        // プロジェクタイルとアイテムをリセット
        this.projectiles = [];
        this.items = [];

        // ステージ上のアイテムを検索
        if (stage && stage.layers && stage.layers.fg) {
            for (let y = 0; y < stage.height; y++) {
                for (let x = 0; x < stage.width; x++) {
                    const spriteIdx = stage.layers.fg[y][x];
                    if (spriteIdx >= 0) {
                        const template = spriteToTemplate[spriteIdx];
                        if (template && template.type === 'item') {
                            this.items.push({
                                x: x,
                                y: y,
                                width: 0.8,
                                height: 0.8,
                                template: template,
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
            }
            this.renderWipe();
            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        // 一時停止中はupdateをスキップ（描画は続行）
        if (!this.isPaused) {
            this.update();
        }
        this.render();

        this.animationId = requestAnimationFrame(() => this.gameLoop());
    },

    renderTitleScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.titleBlinkTimer++;
        if (Math.floor(this.titleBlinkTimer / 30) % 2 === 0) {
            ctx.font = '12px Arial';
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
        const bgColor = App.projectData.stage?.backgroundColor || App.projectData.backgroundColor || '#3CBCFC';
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
        const sprite = App.projectData.sprites[obj.spriteIdx];
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

            // プレイヤーのSHOT → 敵との衝突
            if (proj.owner === 'player') {
                for (const enemy of this.enemies) {
                    if (!enemy.isDying && this.projectileHits(proj, enemy)) {
                        const fromRight = proj.vx > 0;
                        enemy.takeDamage(fromRight);
                        return false;
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
                    return;
                }

                // 上から踏みつけ判定
                if (this.player.vy > 0 && this.player.y + this.player.height < enemy.y + enemy.height * 0.5) {
                    const fromRight = this.player.x > enemy.x;
                    enemy.takeDamage(fromRight);
                    this.player.vy = -0.25;
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

        // 死亡判定
        if (this.player.isDead && this.player.deathParticles.length === 0) {
            // パーティクルが消えたらゲームオーバー
            this.stop();
            setTimeout(() => {
                alert('ゲームオーバー！');
                this.hasStarted = false;
                this.restart();
            }, 500);
        }
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

        // fgレイヤーからスプライトインデックスを取得
        const spriteIdx = stage.layers.fg?.[tileY]?.[tileX];
        if (spriteIdx === undefined || spriteIdx < 0) {
            return 0; // 衝突なし（空タイル）
        }

        // テンプレートからタイルの種類と衝突設定を判定
        const template = templates.find(t => {
            const idx = t?.sprites?.idle?.frames?.[0] ?? t?.sprites?.main?.frames?.[0];
            return idx === spriteIdx;
        });

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
            const spriteIdx = lifeSprites?.frames?.[0];
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

        // スプライトIDからテンプレートを検索するマップ
        const spriteToTemplate = {};
        templates.forEach(template => {
            const spriteIdx = template?.sprites?.idle?.frames?.[0] ?? template?.sprites?.main?.frames?.[0];
            if (spriteIdx !== undefined) {
                spriteToTemplate[spriteIdx] = template;
            }
        });

        // Collisionなしの素材を先に描画（後ろ）
        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const tileId = layer[y][x];
                if (tileId >= 0 && tileId < sprites.length) {
                    const template = spriteToTemplate[tileId];
                    if (template && (template.type === 'player' || template.type === 'enemy' || template.type === 'item')) {
                        continue;
                    }
                    // Collisionなしの素材のみ描画
                    if (template && template.type === 'material' && template.config?.collision === false) {
                        this.renderSprite(sprites[tileId], x, y, palette);
                    }
                }
            }
        }

        // その他のタイルを描画（前）
        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const tileId = layer[y][x];
                if (tileId >= 0 && tileId < sprites.length) {
                    const template = spriteToTemplate[tileId];
                    if (template && (template.type === 'player' || template.type === 'enemy' || template.type === 'item')) {
                        continue;
                    }
                    // Collisionなし素材はスキップ（既に描画済み）
                    if (template && template.type === 'material' && template.config?.collision === false) {
                        continue;
                    }
                    this.renderSprite(sprites[tileId], x, y, palette);
                }
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
    }
};
