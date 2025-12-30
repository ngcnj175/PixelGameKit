/**
 * PixelGameKit - ゲームエンジン
 */

const GameEngine = {
    canvas: null,
    ctx: null,
    animationId: null,
    isRunning: false,

    // ゲーム状態
    player: null,
    enemies: [],

    // 物理定数
    GRAVITY: 0.5,
    TILE_SIZE: 16,

    init() {
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
    },

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
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

    resize() {
        const container = document.getElementById('canvas-area');
        const stage = App.projectData.stage;
        const maxSize = Math.min(container.clientWidth, container.clientHeight) - 32;

        const aspectRatio = stage.width / stage.height;
        let width, height;

        if (aspectRatio > 1) {
            width = maxSize;
            height = maxSize / aspectRatio;
        } else {
            height = maxSize;
            width = maxSize * aspectRatio;
        }

        this.canvas.width = width;
        this.canvas.height = height;

        this.TILE_SIZE = width / stage.width;
    },

    initGame() {
        const objects = App.projectData.objects;

        // プレイヤー初期化
        const playerObj = objects.find(o => o.type === 'player');
        if (playerObj) {
            this.player = new Player(playerObj.x, playerObj.y);
        } else {
            this.player = new Player(1, 1);
        }

        // 敵初期化
        this.enemies = objects
            .filter(o => o.type === 'enemy')
            .map(o => new Enemy(o.x, o.y, o.behavior || 'patrol'));
    },

    gameLoop() {
        if (!this.isRunning) return;

        this.update();
        this.render();

        this.animationId = requestAnimationFrame(() => this.gameLoop());
    },

    update() {
        // プレイヤー更新
        if (this.player) {
            this.player.update(this);
        }

        // 敵更新
        this.enemies.forEach(enemy => enemy.update(this));

        // 衝突判定
        this.checkCollisions();

        // クリア判定
        this.checkClearCondition();
    },

    checkCollisions() {
        if (!this.player) return;

        // 敵との衝突
        this.enemies.forEach((enemy, index) => {
            if (this.player.collidesWith(enemy)) {
                // プレイヤーが上から踏んだ場合
                if (this.player.vy > 0 && this.player.y < enemy.y) {
                    this.enemies.splice(index, 1);
                    this.player.vy = -8;
                } else {
                    // ゲームオーバー
                    this.stop();
                    alert('ゲームオーバー！');
                    this.start();
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
                alert('クリア！');
            }
        }
    },

    getCollision(x, y) {
        const stage = App.projectData.stage;
        const tileX = Math.floor(x);
        const tileY = Math.floor(y);

        if (tileX < 0 || tileX >= stage.width || tileY < 0 || tileY >= stage.height) {
            return 1; // 画面外は壁
        }

        return stage.layers.collision[tileY][tileX];
    },

    render() {
        // クリア
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // ステージ描画
        this.renderStage();

        // 敵描画
        this.enemies.forEach(enemy => enemy.render(this.ctx, this.TILE_SIZE));

        // プレイヤー描画
        if (this.player) {
            this.player.render(this.ctx, this.TILE_SIZE);
        }
    },

    renderStage() {
        const stage = App.projectData.stage;
        const sprites = App.projectData.sprites;
        const palette = App.projectData.palette;

        // 背景レイヤー
        this.renderLayer(stage.layers.bg, sprites, palette);

        // 前景レイヤー
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

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(
                        tileX * this.TILE_SIZE + x * pixelSize,
                        tileY * this.TILE_SIZE + y * pixelSize,
                        pixelSize + 0.5,
                        pixelSize + 0.5
                    );
                }
            }
        }
    }
};
