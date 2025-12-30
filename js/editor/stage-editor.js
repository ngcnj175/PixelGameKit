/**
 * PixelGameKit - ステージエディタ（新UI対応）
 */

const StageEditor = {
    canvas: null,
    ctx: null,
    selectedTile: 0,
    selectedLayer: 'bg',
    selectedObject: null,
    tileSize: 16,

    init() {
        this.canvas = document.getElementById('stage-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.initLayerControls();
        this.initObjectTools();
        this.initCanvasEvents();
    },

    refresh() {
        this.initTileGallery();
        this.resize();
        this.render();
    },

    resize() {
        const container = document.getElementById('stage-area');
        if (!container) return;

        const stage = App.projectData.stage;
        const maxWidth = container.clientWidth - 16;
        const maxHeight = container.clientHeight - 16;

        const tileCount = Math.max(stage.width, stage.height);
        this.tileSize = Math.min(
            Math.floor(maxWidth / stage.width),
            Math.floor(maxHeight / stage.height)
        );

        this.canvas.width = this.tileSize * stage.width;
        this.canvas.height = this.tileSize * stage.height;

        this.render();
    },

    initTileGallery() {
        const container = document.getElementById('tile-list');
        if (!container) return;

        container.innerHTML = '';

        App.projectData.sprites.forEach((sprite, index) => {
            const div = document.createElement('div');
            div.className = 'tile-item' + (index === this.selectedTile ? ' selected' : '');

            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 16;
            miniCanvas.height = 16;
            this.renderSpriteToMiniCanvas(sprite, miniCanvas);
            div.style.backgroundImage = `url(${miniCanvas.toDataURL()})`;
            div.style.backgroundSize = 'cover';
            div.style.imageRendering = 'pixelated';

            div.addEventListener('click', () => {
                this.selectedTile = index;
                this.selectedObject = null;
                document.querySelectorAll('.obj-btn').forEach(b => b.classList.remove('active'));
                this.initTileGallery();
            });

            container.appendChild(div);
        });
    },

    renderSpriteToMiniCanvas(sprite, canvas) {
        const ctx = canvas.getContext('2d');
        const palette = App.nesPalette;

        ctx.clearRect(0, 0, 16, 16);

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

    initLayerControls() {
        document.querySelectorAll('.layer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedLayer = btn.dataset.layer;
                document.querySelectorAll('.layer-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });
                this.render();
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

    initCanvasEvents() {
        if (!this.canvas) return;

        this.canvas.addEventListener('click', (e) => this.onClick(e));
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onClick(e.touches[0]);
        }, { passive: false });
    },

    onClick(e) {
        if (App.currentScreen !== 'stage') return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);

        const stage = App.projectData.stage;
        if (x < 0 || x >= stage.width || y < 0 || y >= stage.height) return;

        if (this.selectedObject) {
            this.placeObject(x, y);
        } else {
            this.placeTile(x, y);
        }

        this.render();
    },

    placeTile(x, y) {
        const stage = App.projectData.stage;
        const layer = stage.layers[this.selectedLayer];

        if (this.selectedLayer === 'collision') {
            layer[y][x] = (layer[y][x] + 1) % 3;
        } else {
            if (layer[y][x] === this.selectedTile) {
                layer[y][x] = -1;
            } else {
                layer[y][x] = this.selectedTile;
            }
        }
    },

    placeObject(x, y) {
        const objects = App.projectData.objects;

        const existingIndex = objects.findIndex(obj => obj.x === x && obj.y === y);

        if (existingIndex >= 0) {
            objects.splice(existingIndex, 1);
        } else {
            objects.push({
                type: this.selectedObject,
                x: x,
                y: y,
                sprite: 0,
                behavior: this.selectedObject === 'enemy' ? 'patrol' : null
            });
        }
    },

    render() {
        if (!this.canvas || !this.ctx) return;
        if (App.currentScreen !== 'stage') return;

        const stage = App.projectData.stage;

        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.renderLayer('bg', 1);
        this.renderLayer('fg', 1);

        if (this.selectedLayer === 'collision') {
            this.renderCollisionLayer();
        }

        this.renderObjects();
        this.renderGrid();
    },

    renderLayer(layerName, alpha) {
        const stage = App.projectData.stage;
        const layer = stage.layers[layerName];
        const sprites = App.projectData.sprites;
        const palette = App.nesPalette;

        this.ctx.globalAlpha = alpha;

        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const tileId = layer[y][x];
                if (tileId >= 0 && tileId < sprites.length) {
                    this.renderSprite(sprites[tileId], x, y, palette);
                }
            }
        }

        this.ctx.globalAlpha = 1;
    },

    renderSprite(sprite, tileX, tileY, palette) {
        const pixelSize = this.tileSize / 16;

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(
                        tileX * this.tileSize + x * pixelSize,
                        tileY * this.tileSize + y * pixelSize,
                        pixelSize + 0.5,
                        pixelSize + 0.5
                    );
                }
            }
        }
    },

    renderCollisionLayer() {
        const stage = App.projectData.stage;
        const layer = stage.layers.collision;

        this.ctx.globalAlpha = 0.5;

        const colors = ['transparent', '#ff0000', '#00ff00'];

        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const value = layer[y][x];
                if (value > 0) {
                    this.ctx.fillStyle = colors[value];
                    this.ctx.fillRect(
                        x * this.tileSize,
                        y * this.tileSize,
                        this.tileSize,
                        this.tileSize
                    );
                }
            }
        }

        this.ctx.globalAlpha = 1;
    },

    renderObjects() {
        const objects = App.projectData.objects;
        const icons = {
            'player': '👤',
            'enemy': '👾',
            'goal': '🚩',
            'item': '⭐'
        };

        this.ctx.font = `${this.tileSize * 0.7}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        objects.forEach(obj => {
            const icon = icons[obj.type] || '?';
            this.ctx.fillText(
                icon,
                obj.x * this.tileSize + this.tileSize / 2,
                obj.y * this.tileSize + this.tileSize / 2
            );
        });
    },

    renderGrid() {
        const stage = App.projectData.stage;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= stage.width; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.tileSize, 0);
            this.ctx.lineTo(x * this.tileSize, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= stage.height; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.tileSize);
            this.ctx.lineTo(this.canvas.width, y * this.tileSize);
            this.ctx.stroke();
        }
    }
};
