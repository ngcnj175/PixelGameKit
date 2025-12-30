/**
 * PixelGameKit - スプライトエディタ
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

    // キャンバスサイズ
    SPRITE_SIZE: 16,
    pixelSize: 20, // 表示上のピクセルサイズ

    init() {
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.initPalette();
        this.initTools();
        this.initCanvasEvents();
        this.resize();

        window.addEventListener('resize', () => this.resize());
    },

    resize() {
        const container = document.getElementById('canvas-area');
        const size = Math.min(container.clientWidth, container.clientHeight) - 32;
        this.pixelSize = Math.floor(size / this.SPRITE_SIZE);

        const canvasSize = this.pixelSize * this.SPRITE_SIZE;
        this.canvas.width = canvasSize;
        this.canvas.height = canvasSize;

        this.render();
    },

    initPalette() {
        const container = document.getElementById('current-palette');
        container.innerHTML = '';

        const palette = App.projectData.palette;
        palette.forEach((color, index) => {
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
        document.querySelectorAll('#drawing-tools .tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentTool = btn.dataset.tool;
                document.querySelectorAll('#drawing-tools .tool-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });

                // コピペ処理
                if (this.currentTool === 'copy') {
                    this.copySprite();
                    this.currentTool = 'pen';
                } else if (this.currentTool === 'paste') {
                    this.pasteSprite();
                    this.currentTool = 'pen';
                }
            });
        });

        document.getElementById('new-sprite')?.addEventListener('click', () => this.newSprite());
        document.getElementById('save-sprite')?.addEventListener('click', () => this.saveSprite());
    },

    initCanvasEvents() {
        // タッチ/マウスイベント
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
        const x = Math.floor((e.clientX - rect.left) / this.pixelSize);
        const y = Math.floor((e.clientY - rect.top) / this.pixelSize);
        return { x, y };
    },

    onPointerDown(e) {
        if (App.currentMode !== 'sprite') return;

        this.isDrawing = true;
        const pixel = this.getPixelFromEvent(e);
        this.processPixel(pixel.x, pixel.y);
    },

    onPointerMove(e) {
        if (!this.isDrawing || App.currentMode !== 'sprite') return;

        const pixel = this.getPixelFromEvent(e);
        if (pixel.x !== this.lastPixel.x || pixel.y !== this.lastPixel.y) {
            this.processPixel(pixel.x, pixel.y);
        }
    },

    onPointerUp() {
        this.isDrawing = false;
        this.lastPixel = { x: -1, y: -1 };
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
                console.log('Sprite pasted');
            }
        }
    },

    newSprite() {
        const id = App.projectData.sprites.length;
        App.projectData.sprites.push({
            id: id,
            name: 'sprite_' + id,
            data: App.create2DArray(16, 16, -1)
        });
        this.currentSprite = id;
        this.render();
    },

    saveSprite() {
        App.saveProject();
        alert('スプライトを保存しました！');
    },

    render() {
        if (App.currentMode !== 'sprite') return;

        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        const palette = App.projectData.palette;

        // クリア
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // グリッド描画
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;

        for (let y = 0; y < this.SPRITE_SIZE; y++) {
            for (let x = 0; x < this.SPRITE_SIZE; x++) {
                const colorIndex = sprite.data[y][x];

                // ピクセル描画
                if (colorIndex >= 0 && colorIndex < palette.length) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(
                        x * this.pixelSize,
                        y * this.pixelSize,
                        this.pixelSize,
                        this.pixelSize
                    );
                }

                // グリッド線
                this.ctx.strokeRect(
                    x * this.pixelSize,
                    y * this.pixelSize,
                    this.pixelSize,
                    this.pixelSize
                );
            }
        }
    }
};
