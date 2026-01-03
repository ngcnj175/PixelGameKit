/**
 * PixelGameKit - ゲームエンジン（Start/Pause対応）
 */

const GameEngine = {
    canvas: null,
    ctx: null,
    animationId: null,
    isRunning: false,
    isPaused: false,
    hasStarted: false,  // 初回スタートしたかどうか

    player: null,
    enemies: [],

    GRAVITY: 0.5,
    TILE_SIZE: 16,

    // カメラ（プレイヤー中心スクロール）
    camera: { x: 0, y: 0 },

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
        if (!this.hasStarted) {
            // 初回はゲームを開始
            this.start();
            return;
        }

        if (this.isPaused) {
            // 再開
            this.isPaused = false;
            if (!this.isRunning) {
                this.isRunning = true;
                this.gameLoop();
            }
        } else if (this.isRunning) {
            // 一時停止
            this.isPaused = true;
        }
    },

    // リスタート（Startボタン長押し用）
    restart() {
        this.stop();
        this.hasStarted = false;
        this.isPaused = false;
        this.initGame();
        this.resize();
        this.render();
        console.log('Game restarted');
    },

    // プレビュー表示（ゲーム開始前）
    showPreview() {
        this.resize();
        this.initGame();
        this.render();
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
    },

    gameLoop() {
        if (!this.isRunning) return;

        // 一時停止中はupdateをスキップ（描画は続行）
        if (!this.isPaused) {
            this.update();
        }
        this.render();

        this.animationId = requestAnimationFrame(() => this.gameLoop());
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
        this.checkCollisions();
        this.checkClearCondition();
    },

    checkCollisions() {
        if (!this.player || this.player.isDead) return;

        this.enemies.forEach((enemy, index) => {
            if (enemy.isDying) return; // 死亡中の敵はスキップ

            if (this.player.collidesWith(enemy)) {
                // 上から踏みつけ判定
                if (this.player.vy > 0 && this.player.y + this.player.height < enemy.y + enemy.height * 0.5) {
                    // 敵にダメージ
                    const fromRight = this.player.x > enemy.x;
                    enemy.takeDamage(fromRight);
                    this.player.vy = -0.25; // 小さくバウンス
                } else if (!this.player.invincible) {
                    // プレイヤーがダメージを受ける
                    const fromRight = enemy.x > this.player.x;
                    this.player.takeDamage(fromRight);
                }
            }
        });

        // 消滅した敵を削除
        this.enemies = this.enemies.filter(e => !e.update(this));

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

        // 範囲外は壁として扱う
        if (tileX < 0 || tileX >= stage.width || tileY < 0 || tileY >= stage.height) {
            return 1;
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
        // 背景色（Pixel画面の背景色を使用）
        const bgColor = App.projectData.stage?.backgroundColor || App.projectData.backgroundColor || '#3CBCFC';
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.renderStage();
        this.enemies.forEach(enemy => enemy.render(this.ctx, this.TILE_SIZE, this.camera));

        if (this.player) {
            this.player.render(this.ctx, this.TILE_SIZE, this.camera);
        }

        // UI描画
        this.renderUI();
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

        // START表示
        if (this.startMessageTimer > 0) {
            this.startMessageTimer--;

            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;

            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText('START', centerX, centerY);
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
                    if (template && (template.type === 'player' || template.type === 'enemy')) {
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
                    if (template && (template.type === 'player' || template.type === 'enemy')) {
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
