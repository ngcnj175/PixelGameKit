/**
 * PixelGameKit - スプライトエディタ（新UI対応）
 */

const SpriteEditor = {
    canvas: null,
    ctx: null,
    currentSprite: 0,
    selectedColor: 0,
    currentTool: 'pen',
    isDrawing: false,
    lastPixel: { x: -1, y: -1 },
    clipboard: null,

    SPRITE_SIZE: 16,
    pixelSize: 20,

    init() {
        this.canvas = document.getElementById('paint-canvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');

        this.initColorPalette();
        this.initTools();
        this.initSpriteGallery();
        this.initCanvasEvents();
    },

    refresh() {
        this.initColorPalette();
        this.initSpriteGallery();
        this.resize();
        this.render();
    },

    resize() {
        // 固定サイズ（16x16 スプライト、各ピクセル20px）
        const canvasSize = 320;
        this.pixelSize = 20;

        this.canvas.width = canvasSize;
        this.canvas.height = canvasSize;

        this.render();
    },

    initColorPalette() {
        const container = document.getElementById('color-palette');
        if (!container) return;

        container.innerHTML = '';

        // ファミコン52色から選択可能
        const palette = App.nesPalette;
        palette.forEach((color, index) => {
            if (color === '#000000' && index > 13) return; // 重複黒をスキップ

            const div = document.createElement('div');
            div.className = 'palette-color' + (index === this.selectedColor ? ' selected' : '');
            div.style.backgroundColor = color;
            div.addEventListener('click', () => this.selectColor(index));
            container.appendChild(div);
        });
    },

    selectColor(index) {
        this.selectedColor = index;
        document.querySelectorAll('.palette-color').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
    },

    initTools() {
        document.querySelectorAll('.paint-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;

                switch (tool) {
                    case 'copy':
                        this.copySprite();
                        return;
                    case 'paste':
                        this.pasteSprite();
                        return;
                    case 'clear':
                        this.clearSprite();
                        return;
                    default:
                        this.currentTool = tool;
                        document.querySelectorAll('.paint-tool-btn').forEach(b => {
                            b.classList.toggle('active', b === btn);
                        });
                }
            });
        });
    },

    initSpriteGallery() {
        const container = document.getElementById('sprite-list');
        if (!container) return;

        container.innerHTML = '';

        App.projectData.sprites.forEach((sprite, index) => {
            const div = document.createElement('div');
            div.className = 'sprite-item' + (index === this.currentSprite ? ' selected' : '');

            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 16;
            miniCanvas.height = 16;
            this.renderSpriteToMiniCanvas(sprite, miniCanvas);
            div.appendChild(miniCanvas);

            div.addEventListener('click', () => {
                this.currentSprite = index;
                this.initSpriteGallery();
                this.render();
            });

            container.appendChild(div);
        });

        // 追加ボタン
        document.getElementById('add-sprite-btn')?.addEventListener('click', () => {
            this.addNewSprite();
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

    addNewSprite() {
        const id = App.projectData.sprites.length;
        App.projectData.sprites.push({
            id: id,
            name: 'sprite_' + id,
            data: App.create2DArray(16, 16, -1)
        });
        this.currentSprite = id;
        this.initSpriteGallery();
        this.render();
    },

    initCanvasEvents() {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
        this.canvas.addEventListener('mouseup', () => this.onPointerUp());
        this.canvas.addEventListener('mouseleave', () => this.onPointerUp());

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onPointerDown(e.touches[0]);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.onPointerMove(e.touches[0]);
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => this.onPointerUp());
    },

    getPixelFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = Math.floor((e.clientX - rect.left) * scaleX / this.pixelSize);
        const y = Math.floor((e.clientY - rect.top) * scaleY / this.pixelSize);
        return { x, y };
    },

    onPointerDown(e) {
        if (App.currentScreen !== 'paint') return;

        this.isDrawing = true;
        const pixel = this.getPixelFromEvent(e);
        this.processPixel(pixel.x, pixel.y);
    },

    onPointerMove(e) {
        if (!this.isDrawing || App.currentScreen !== 'paint') return;

        const pixel = this.getPixelFromEvent(e);
        if (pixel.x !== this.lastPixel.x || pixel.y !== this.lastPixel.y) {
            this.processPixel(pixel.x, pixel.y);
        }
    },

    onPointerUp() {
        this.isDrawing = false;
        this.lastPixel = { x: -1, y: -1 };
        // ギャラリーのサムネイル更新
        this.initSpriteGallery();
    },

    processPixel(x, y) {
        if (x < 0 || x >= this.SPRITE_SIZE || y < 0 || y >= this.SPRITE_SIZE) return;

        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        this.lastPixel = { x, y };

        switch (this.currentTool) {
            case 'pen':
                // 同じ色をタップしたら削除
                if (sprite.data[y][x] === this.selectedColor) {
                    sprite.data[y][x] = -1;
                } else {
                    sprite.data[y][x] = this.selectedColor;
                }
                break;
            case 'eraser':
                sprite.data[y][x] = -1;
                break;
            case 'fill':
                this.floodFill(x, y, sprite.data[y][x], this.selectedColor);
                break;
        }

        this.render();
    },

    floodFill(x, y, targetColor, newColor) {
        if (targetColor === newColor) return;

        const sprite = App.projectData.sprites[this.currentSprite];
        const stack = [[x, y]];
        const visited = new Set();

        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const key = `${cx},${cy}`;

            if (visited.has(key)) continue;
            if (cx < 0 || cx >= this.SPRITE_SIZE || cy < 0 || cy >= this.SPRITE_SIZE) continue;
            if (sprite.data[cy][cx] !== targetColor) continue;

            visited.add(key);
            sprite.data[cy][cx] = newColor;

            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
    },

    copySprite() {
        const sprite = App.projectData.sprites[this.currentSprite];
        if (sprite) {
            this.clipboard = JSON.parse(JSON.stringify(sprite.data));
            console.log('Sprite copied');
        }
    },

    pasteSprite() {
        if (this.clipboard) {
            const sprite = App.projectData.sprites[this.currentSprite];
            if (sprite) {
                sprite.data = JSON.parse(JSON.stringify(this.clipboard));
                this.render();
                this.initSpriteGallery();
                console.log('Sprite pasted');
            }
        }
    },

    clearSprite() {
        const sprite = App.projectData.sprites[this.currentSprite];
        if (sprite) {
            sprite.data = App.create2DArray(16, 16, -1);
            this.render();
            this.initSpriteGallery();
        }
    },

    render() {
        if (!this.canvas || !this.ctx) return;
        if (App.currentScreen !== 'paint') return;

        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        const palette = App.nesPalette;

        // クリア（透明グリッド表示）
        this.ctx.fillStyle = '#2a2a3e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // チェッカーボード背景
        this.ctx.fillStyle = '#3a3a4e';
        for (let y = 0; y < this.SPRITE_SIZE; y++) {
            for (let x = 0; x < this.SPRITE_SIZE; x++) {
                if ((x + y) % 2 === 0) {
                    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
                }
            }
        }

        // ピクセル描画
        for (let y = 0; y < this.SPRITE_SIZE; y++) {
            for (let x = 0; x < this.SPRITE_SIZE; x++) {
                const colorIndex = sprite.data[y][x];

                if (colorIndex >= 0 && colorIndex < palette.length) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(
                        x * this.pixelSize,
                        y * this.pixelSize,
                        this.pixelSize,
                        this.pixelSize
                    );
                }
            }
        }

        // グリッド線
        this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        this.ctx.lineWidth = 1;

        for (let i = 0; i <= this.SPRITE_SIZE; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.pixelSize, 0);
            this.ctx.lineTo(i * this.pixelSize, this.canvas.height);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.pixelSize);
            this.ctx.lineTo(this.canvas.width, i * this.pixelSize);
            this.ctx.stroke();
        }
    }
};
