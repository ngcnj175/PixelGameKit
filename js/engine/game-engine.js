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
        const objects = App.projectData.objects;

        const playerObj = objects.find(o => o.type === 'player');
        if (playerObj) {
            this.player = new Player(playerObj.x, playerObj.y);
        } else {
            this.player = new Player(1, 1);
        }

        this.enemies = objects
            .filter(o => o.type === 'enemy')
            .map(o => new Enemy(o.x, o.y, o.behavior || 'patrol'));
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
        if (!this.player) return;

        this.enemies.forEach((enemy, index) => {
            if (this.player.collidesWith(enemy)) {
                if (this.player.vy > 0 && this.player.y < enemy.y) {
                    this.enemies.splice(index, 1);
                    this.player.vy = -8;
                } else {
                    this.stop();
                    setTimeout(() => {
                        alert('ゲームオーバー！');
                        this.start();
                    }, 100);
                }
            }
        });
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
        const tileX = Math.floor(x);
        const tileY = Math.floor(y);

        if (tileX < 0 || tileX >= stage.width || tileY < 0 || tileY >= stage.height) {
            return 1;
        }

        return stage.layers.collision[tileY][tileX];
    },

    render() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.renderStage();
        this.enemies.forEach(enemy => enemy.render(this.ctx, this.TILE_SIZE, this.camera));

        if (this.player) {
            this.player.render(this.ctx, this.TILE_SIZE, this.camera);
        }
    },

    renderStage() {
        const stage = App.projectData.stage;
        const sprites = App.projectData.sprites;
        const palette = App.nesPalette;

        this.renderLayer(stage.layers.bg, sprites, palette);
        this.renderLayer(stage.layers.fg, sprites, palette);
    },

    renderLayer(layer, sprites, palette) {
        const stage = App.projectData.stage;

        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const tileId = layer[y][x];
                if (tileId >= 0 && tileId < sprites.length) {
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
