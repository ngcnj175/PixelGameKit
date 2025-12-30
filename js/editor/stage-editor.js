/**
 * PixelGameKit - ステージエディタ
 */

const StageEditor = {
    canvas: null,
    ctx: null,
    selectedTile: 0,
    selectedLayer: 'bg',
    selectedObject: null,
    tileSize: 16,
    viewScale: 1,

    init() {
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.initLayerControls();
        this.initObjectTools();
        this.initTileSelector();
        this.initCanvasEvents();
    },

    initLayerControls() {
        document.querySelectorAll('.layer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedLayer = btn.dataset.layer;
                document.querySelectorAll('.layer-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });
            });
        });
    },

    initObjectTools() {
        document.querySelectorAll('.obj-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.selectedObject === btn.dataset.obj) {
                    this.selectedObject = null;
                    btn.classList.remove('active');
                } else {
                    this.selectedObject = btn.dataset.obj;
                    document.querySelectorAll('.obj-btn').forEach(b => {
                        b.classList.toggle('active', b === btn);
                    });
                }
            });
        });
    },

    initTileSelector() {
        const container = document.getElementById('tile-selector');
        container.innerHTML = '';

        // スプライトをタイルとして表示
        App.projectData.sprites.forEach((sprite, index) => {
            const div = document.createElement('div');
            div.className = 'tile-item' + (index === this.selectedTile ? ' selected' : '');
            div.addEventListener('click', () => {
                this.selectedTile = index;
                document.querySelectorAll('.tile-item').forEach((el, i) => {
                    el.classList.toggle('selected', i === index);
                });
            });

            // サムネイル描画
            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 16;
            miniCanvas.height = 16;
            this.renderSpriteToCanvas(sprite, miniCanvas);
            div.appendChild(miniCanvas);

            container.appendChild(div);
        });
    },

    renderSpriteToCanvas(sprite, canvas) {
        const ctx = canvas.getContext('2d');
        const palette = App.projectData.palette;

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                if (colorIndex >= 0) {
                    ctx.fillStyle = palette[colorIndex];
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
    },

    initCanvasEvents() {
        this.canvas.addEventListener('click', (e) => this.onClick(e));
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onClick(e.touches[0]);
        }, { passive: false });
    },

    onClick(e) {
        if (App.currentMode !== 'stage') return;

        const rect = this.canvas.getBoundingClientRect();
        const stage = App.projectData.stage;
        const displayTileSize = this.canvas.width / stage.width;

        const x = Math.floor((e.clientX - rect.left) / displayTileSize);
        const y = Math.floor((e.clientY - rect.top) / displayTileSize);

        if (x < 0 || x >= stage.width || y < 0 || y >= stage.height) return;

        if (this.selectedObject) {
            // オブジェクト配置
            this.placeObject(x, y);
        } else {
            // タイル配置
            this.placeTile(x, y);
        }

        this.render();
    },

    placeTile(x, y) {
        const stage = App.projectData.stage;
        const layer = stage.layers[this.selectedLayer];

        if (this.selectedLayer === 'collision') {
            // 当たり判定は0/1/2をトグル
            layer[y][x] = (layer[y][x] + 1) % 3;
        } else {
            // 同じタイルなら消す
            if (layer[y][x] === this.selectedTile) {
                layer[y][x] = -1;
            } else {
                layer[y][x] = this.selectedTile;
            }
        }
    },

    placeObject(x, y) {
        const objects = App.projectData.objects;

        // 同じ位置のオブジェクトを検索
        const existingIndex = objects.findIndex(obj => obj.x === x && obj.y === y);

        if (existingIndex >= 0) {
            // 削除
            objects.splice(existingIndex, 1);
        } else {
            // 追加
            objects.push({
                type: this.selectedObject,
                x: x,
                y: y,
                sprite: 0,
                behavior: this.selectedObject === 'enemy' ? 'patrol' : null
            });
        }
    },

    resize() {
        const container = document.getElementById('canvas-area');
        const stage = App.projectData.stage;
        const maxSize = Math.min(container.clientWidth, container.clientHeight) - 32;

        const tileCount = Math.max(stage.width, stage.height);
        const displayTileSize = Math.floor(maxSize / tileCount);

        this.canvas.width = displayTileSize * stage.width;
        this.canvas.height = displayTileSize * stage.height;

        this.render();
    },

    render() {
        if (App.currentMode !== 'stage') return;

        // タイルセレクタ更新
        this.initTileSelector();

        const stage = App.projectData.stage;
        const displayTileSize = this.canvas.width / stage.width;

        // クリア
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 背景レイヤー描画
        this.renderLayer('bg', displayTileSize, 1);

        // 前景レイヤー描画
        this.renderLayer('fg', displayTileSize, 1);

        // 当たり判定レイヤー（選択時のみ半透明表示）
        if (this.selectedLayer === 'collision') {
            this.renderCollisionLayer(displayTileSize);
        }

        // オブジェクト描画
        this.renderObjects(displayTileSize);

        // グリッド
        this.renderGrid(displayTileSize);
    },

    renderLayer(layerName, tileSize, alpha) {
        const stage = App.projectData.stage;
        const layer = stage.layers[layerName];
        const sprites = App.projectData.sprites;
        const palette = App.projectData.palette;

        this.ctx.globalAlpha = alpha;

        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const tileId = layer[y][x];
                if (tileId >= 0 && tileId < sprites.length) {
                    this.renderSprite(sprites[tileId], x * tileSize, y * tileSize, tileSize);
                }
            }
        }

        this.ctx.globalAlpha = 1;
    },

    renderSprite(sprite, dx, dy, size) {
        const palette = App.projectData.palette;
        const pixelSize = size / 16;

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(dx + x * pixelSize, dy + y * pixelSize, pixelSize + 0.5, pixelSize + 0.5);
                }
            }
        }
    },

    renderCollisionLayer(tileSize) {
        const stage = App.projectData.stage;
        const layer = stage.layers.collision;

        this.ctx.globalAlpha = 0.5;

        const colors = ['transparent', '#ff0000', '#00ff00']; // 0=通過, 1=壁, 2=床のみ

        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const value = layer[y][x];
                if (value > 0) {
                    this.ctx.fillStyle = colors[value];
                    this.ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }

        this.ctx.globalAlpha = 1;
    },

    renderObjects(tileSize) {
        const objects = App.projectData.objects;
        const icons = {
            'player': '👤',
            'enemy': '👾',
            'goal': '🚩',
            'item': '⭐'
        };

        this.ctx.font = `${tileSize * 0.8}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        objects.forEach(obj => {
            const icon = icons[obj.type] || '?';
            this.ctx.fillText(
                icon,
                obj.x * tileSize + tileSize / 2,
                obj.y * tileSize + tileSize / 2
            );
        });
    },

    renderGrid(tileSize) {
        const stage = App.projectData.stage;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= stage.width; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * tileSize, 0);
            this.ctx.lineTo(x * tileSize, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= stage.height; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * tileSize);
            this.ctx.lineTo(this.canvas.width, y * tileSize);
            this.ctx.stroke();
        }
    }
};
