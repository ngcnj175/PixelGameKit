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
    drawMode: 'draw',
    lastPixel: { x: -1, y: -1 },
    clipboard: null,

    // Undo履歴
    history: [],
    maxHistory: 20,

    SPRITE_SIZE: 16,
    pixelSize: 20,

    // 32x32用の追加プロパティ
    viewportOffsetX: 0,
    viewportOffsetY: 0,
    panStartX: 0,
    panStartY: 0,
    isPanning: false,

    // ダブルクリック検出用
    lastSpriteClickTime: 0,
    lastSpriteClickIndex: -1,

    // 範囲選択・ペーストモード
    selectionMode: false,
    selectionStart: null,
    selectionEnd: null,
    rangeClipboard: null,  // 範囲コピー用クリップボード
    pasteMode: false,
    pasteData: null,
    pasteOffset: { x: 0, y: 0 },
    pasteDragStart: null,

    init() {
        this.canvas = document.getElementById('paint-canvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');

        this.initColorPalette();
        this.initAddColorButton(); // ＋ボタンのイベント設定（1回だけ）
        this.initTools();
        this.initSpriteGallery();
        this.initCanvasEvents();
        this.initPresetDialogEvents();
    },

    refresh() {
        this.initColorPalette();
        this.initSpriteGallery();
        this.resize();
        this.render();
    },

    resize() {
        const dimension = this.getCurrentSpriteDimension();
        this.pixelSize = 320 / 16;  // 常に16x16分の表示サイズを維持
        this.canvas.width = 320;
        this.canvas.height = 320;
        this.render();
    },

    // 現在のスプライトのサイズを取得
    getCurrentSpriteSize() {
        const sprite = App.projectData.sprites[this.currentSprite];
        return sprite?.size || 1;
    },

    // 現在のスプライトの実ピクセル数を取得
    getCurrentSpriteDimension() {
        return this.getCurrentSpriteSize() === 2 ? 32 : 16;
    },

    // ========== Undo機能 ==========
    saveHistory() {
        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        // 現在の状態をディープコピーしてスタックに追加
        const snapshot = JSON.parse(JSON.stringify(sprite.data));
        this.history.push({
            spriteIndex: this.currentSprite,
            data: snapshot
        });

        // 最大履歴数を超えたら古いものを削除
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    },

    undo() {
        if (this.history.length === 0) {
            return;
        }

        const lastState = this.history.pop();
        const sprite = App.projectData.sprites[lastState.spriteIndex];

        if (sprite) {
            sprite.data = lastState.data;
            this.currentSprite = lastState.spriteIndex;
            this.render();
            this.initSpriteGallery();
        }
    },

    // ========== カラーパレット ==========
    initColorPalette() {
        const container = document.getElementById('color-list');
        if (!container) return;

        container.innerHTML = '';

        const palette = App.nesPalette;

        palette.forEach((color, index) => {
            const div = document.createElement('div');
            div.className = 'palette-color' + (index === this.selectedColor ? ' selected' : '');
            div.style.backgroundColor = color;

            // 長押しで削除
            let longPressTimer;
            let isLongPress = false;

            const startLongPress = () => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.deleteColor(index);
                }, 600);
            };

            const cancelLongPress = () => {
                clearTimeout(longPressTimer);
            };

            div.addEventListener('mousedown', startLongPress);
            div.addEventListener('mouseup', cancelLongPress);
            div.addEventListener('mouseleave', cancelLongPress);
            div.addEventListener('touchstart', startLongPress, { passive: true });
            div.addEventListener('touchend', cancelLongPress);

            // ダブルタップで編集、シングルタップで選択
            let lastTapTime = 0;

            div.addEventListener('click', () => {
                if (isLongPress) return;
                const now = Date.now();
                if (now - lastTapTime < 300) {
                    // ダブルタップ → 編集
                    this.editColor(index);
                    lastTapTime = 0;
                } else {
                    // シングルタップ → 選択
                    this.selectColor(index);
                    lastTapTime = now;
                }
            });

            container.appendChild(div);
        });
    },

    // ＋ボタンのイベント設定（init時に1回だけ呼ばれる）
    initAddColorButton() {
        const addBtn = document.getElementById('add-color-btn');
        if (!addBtn || addBtn.dataset.initialized) return; // 既に初期化済みならスキップ
        addBtn.dataset.initialized = 'true';

        let longPressTimer = null;
        let isLongPress = false;

        const startPress = () => {
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                this.openPresetDialog();
            }, 800);
        };

        const endPress = () => {
            clearTimeout(longPressTimer);
            if (!isLongPress) {
                // 短押し: 色追加
                App.nesPalette.push('#000000');
                this.initColorPalette();
            }
        };

        addBtn.addEventListener('mousedown', startPress);
        addBtn.addEventListener('mouseup', endPress);
        addBtn.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
        addBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startPress(); }, { passive: false });
        addBtn.addEventListener('touchend', (e) => { e.preventDefault(); endPress(); }, { passive: false });
        addBtn.addEventListener('touchcancel', () => clearTimeout(longPressTimer));
    },

    // プリセット選択ダイアログを開く
    openPresetDialog() {
        const dialog = document.getElementById('palette-preset-dialog');
        if (dialog) {
            // デフォルトでパステルを選択
            const pastelRadio = document.querySelector('input[name="palette-preset"][value="pastel"]');
            if (pastelRadio) pastelRadio.checked = true;
            dialog.classList.remove('hidden');
        }
    },

    // プリセット選択ダイアログを閉じる
    closePresetDialog() {
        const dialog = document.getElementById('palette-preset-dialog');
        if (dialog) {
            dialog.classList.add('hidden');
        }
    },

    // プリセットを適用（追加モード）
    applyPresetAdd() {
        const selected = document.querySelector('input[name="palette-preset"]:checked');
        if (!selected) {
            alert('プリセットを選択してください');
            return;
        }
        const preset = App.PALETTE_PRESETS[selected.value];
        if (preset) {
            // 既存パレットに追加
            preset.colors.forEach(color => {
                if (!App.nesPalette.includes(color)) {
                    App.nesPalette.push(color);
                }
            });
            this.initColorPalette();
            this.closePresetDialog();
        }
    },

    // プリセットを適用（置換モード）
    applyPresetReplace() {
        const selected = document.querySelector('input[name="palette-preset"]:checked');
        if (!selected) {
            alert('プリセットを選択してください');
            return;
        }
        if (!confirm('現在のパレットを置換しますか？\nスプライトの色が変わる可能性があります。')) {
            return;
        }
        const preset = App.PALETTE_PRESETS[selected.value];
        if (preset) {
            App.nesPalette = preset.colors.slice();
            this.initColorPalette();
            this.closePresetDialog();
        }
    },

    // プリセットダイアログのイベント初期化
    initPresetDialogEvents() {
        const addBtn = document.getElementById('preset-add-btn');
        const replaceBtn = document.getElementById('preset-replace-btn');
        const closeBtn = document.getElementById('preset-close-btn');
        const dialog = document.getElementById('palette-preset-dialog');

        if (addBtn) addBtn.addEventListener('click', () => this.applyPresetAdd());
        if (replaceBtn) replaceBtn.addEventListener('click', () => this.applyPresetReplace());
        if (closeBtn) closeBtn.addEventListener('click', () => this.closePresetDialog());

        // 背景クリックで閉じる
        if (dialog) {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) this.closePresetDialog();
            });
        }
    },

    // 色を削除（確認あり）
    deleteColor(index) {
        if (App.nesPalette.length <= 1) {
            alert('最低1色は必要です');
            return;
        }
        if (!confirm('この色を削除しますか？')) {
            return;
        }
        App.nesPalette.splice(index, 1);
        if (this.selectedColor >= App.nesPalette.length) {
            this.selectedColor = App.nesPalette.length - 1;
        }
        this.initColorPalette();
    },

    editColor(index) {
        const currentColor = App.nesPalette[index];

        // よく使う色プリセット
        const recentColors = [
            '#000000', '#ffffff', '#ff0000', '#00ff00',
            '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'
        ];

        // 状態
        let hue = 0, saturation = 100, brightness = 100;
        let r = 255, g = 0, b = 0;

        // カラー変換関数
        const hsvToRgb = (h, s, v) => {
            s /= 100; v /= 100;
            const c = v * s;
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            const m = v - c;
            let r1, g1, b1;
            if (h < 60) { r1 = c; g1 = x; b1 = 0; }
            else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
            else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
            else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
            else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
            else { r1 = c; g1 = 0; b1 = x; }
            return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
        };

        const rgbToHsv = (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const d = max - min;
            let h = 0;
            if (d !== 0) {
                if (max === r) h = ((g - b) / d) % 6;
                else if (max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h *= 60; if (h < 0) h += 360;
            }
            return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
        };

        const rgbToHex = (r, g, b) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();

        const hexToRgb = (hex) => {
            hex = hex.replace('#', '');
            return { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16) };
        };

        // 初期値をcurrentColorから設定
        const initRgb = hexToRgb(currentColor);
        r = initRgb.r; g = initRgb.g; b = initRgb.b;
        const initHsv = rgbToHsv(r, g, b);
        hue = initHsv.h; saturation = initHsv.s; brightness = initHsv.v;

        // bodyスクロール無効化
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // モーダルオーバーレイを作成
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;touch-action:none;';

        // モーダルコンテンツ
        const modal = document.createElement('div');
        modal.style.cssText = 'background:#2d2d44;padding:20px;border-radius:16px;width:90%;max-width:320px;box-shadow:0 10px 40px rgba(0,0,0,0.4);';

        modal.innerHTML = `
            <div style="color:#fff;font-size:16px;font-weight:600;margin-bottom:16px;">カラー編集</div>
            <div style="display:flex;gap:12px;margin-bottom:16px;">
                <div style="flex:1;text-align:center;">
                    <div style="color:#8888aa;font-size:11px;margin-bottom:6px;">現在</div>
                    <div id="cp-current" style="width:100%;height:50px;border-radius:8px;border:2px solid #444466;background:${currentColor};opacity:0.7;"></div>
                </div>
                <div style="flex:1;text-align:center;">
                    <div style="color:#8888aa;font-size:11px;margin-bottom:6px;">編集中</div>
                    <div id="cp-new" style="width:100%;height:50px;border-radius:8px;border:2px solid #444466;background:${currentColor};"></div>
                </div>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:12px;background:#1a1a2e;padding:4px;border-radius:8px;">
                <button id="cp-tab-hsv" style="flex:1;padding:8px;border:none;background:#4a4a6a;color:#fff;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;">HSV</button>
                <button id="cp-tab-rgb" style="flex:1;padding:8px;border:none;background:transparent;color:#8888aa;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;">RGB</button>
            </div>
            <div id="cp-picker-area" style="height:200px;position:relative;margin-bottom:12px;">
                <div id="cp-hsv" style="position:absolute;top:0;left:0;right:0;bottom:0;">
                    <div id="cp-sb-box" style="position:relative;width:100%;height:160px;border-radius:8px;cursor:crosshair;margin-bottom:12px;overflow:hidden;background:#ff0000;">
                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to right,#fff,transparent);"></div>
                        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to bottom,transparent,#000);"></div>
                        <div id="cp-sb-cursor" style="position:absolute;width:16px;height:16px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.5);pointer-events:none;z-index:10;transform:translate(-50%,-50%);left:100%;top:0%;"></div>
                    </div>
                    <div id="cp-hue-slider" style="position:relative;height:24px;border-radius:12px;background:linear-gradient(to right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000);cursor:pointer;">
                        <div id="cp-hue-cursor" style="position:absolute;top:50%;width:8px;height:28px;background:#fff;border-radius:4px;box-shadow:0 0 4px rgba(0,0,0,0.5);pointer-events:none;transform:translate(-50%,-50%);left:0%;"></div>
                    </div>
                </div>
                <div id="cp-rgb" style="position:absolute;top:0;left:0;right:0;bottom:0;display:none;flex-direction:column;justify-content:center;gap:20px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="color:#ff6b6b;font-size:14px;font-weight:600;width:24px;">R</span>
                        <input type="range" id="cp-slider-r" min="0" max="255" value="${r}" style="flex:1;height:28px;border-radius:14px;-webkit-appearance:none;appearance:none;outline:none;cursor:pointer;background:linear-gradient(to right,#000,#ff0000);">
                        <span id="cp-value-r" style="color:#fff;font-size:13px;width:36px;text-align:right;">${r}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="color:#6bff6b;font-size:14px;font-weight:600;width:24px;">G</span>
                        <input type="range" id="cp-slider-g" min="0" max="255" value="${g}" style="flex:1;height:28px;border-radius:14px;-webkit-appearance:none;appearance:none;outline:none;cursor:pointer;background:linear-gradient(to right,#000,#00ff00);">
                        <span id="cp-value-g" style="color:#fff;font-size:13px;width:36px;text-align:right;">${g}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="color:#6b6bff;font-size:14px;font-weight:600;width:24px;">B</span>
                        <input type="range" id="cp-slider-b" min="0" max="255" value="${b}" style="flex:1;height:28px;border-radius:14px;-webkit-appearance:none;appearance:none;outline:none;cursor:pointer;background:linear-gradient(to right,#000,#0000ff);">
                        <span id="cp-value-b" style="color:#fff;font-size:13px;width:36px;text-align:right;">${b}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                <label style="color:#8888aa;font-size:12px;">HEX</label>
                <input type="text" id="cp-hex" value="${currentColor}" maxlength="7" style="flex:1;padding:10px 12px;border:2px solid #444466;border-radius:8px;background:#1a1a2e;color:#fff;font-family:monospace;font-size:14px;text-transform:uppercase;">
            </div>
            <div style="margin-bottom:16px;">
                <div style="color:#8888aa;font-size:11px;margin-bottom:6px;">よく使う色</div>
                <div id="cp-recent" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
            </div>
            <div style="display:flex;gap:10px;">
                <button id="cp-cancel" style="flex:1;padding:14px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#444466;color:#fff;">キャンセル</button>
                <button id="cp-ok" style="flex:1;padding:14px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#4a7dff;color:#fff;">OK</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // DOM要素取得
        const newColorEl = modal.querySelector('#cp-new');
        const sbBox = modal.querySelector('#cp-sb-box');
        const sbCursor = modal.querySelector('#cp-sb-cursor');
        const hueSlider = modal.querySelector('#cp-hue-slider');
        const hueCursor = modal.querySelector('#cp-hue-cursor');
        const hexInput = modal.querySelector('#cp-hex');
        const hsvPanel = modal.querySelector('#cp-hsv');
        const rgbPanel = modal.querySelector('#cp-rgb');
        const tabHsv = modal.querySelector('#cp-tab-hsv');
        const tabRgb = modal.querySelector('#cp-tab-rgb');
        const sliderR = modal.querySelector('#cp-slider-r');
        const sliderG = modal.querySelector('#cp-slider-g');
        const sliderB = modal.querySelector('#cp-slider-b');
        const valueR = modal.querySelector('#cp-value-r');
        const valueG = modal.querySelector('#cp-value-g');
        const valueB = modal.querySelector('#cp-value-b');
        const recentColorsEl = modal.querySelector('#cp-recent');

        // UI更新
        const updateUI = () => {
            const rgb = hsvToRgb(hue, saturation, brightness);
            r = rgb.r; g = rgb.g; b = rgb.b;
            const hex = rgbToHex(r, g, b);
            newColorEl.style.backgroundColor = hex;
            hexInput.value = hex;
            sbBox.style.backgroundColor = rgbToHex(...Object.values(hsvToRgb(hue, 100, 100)));
            sbCursor.style.left = `${saturation}%`;
            sbCursor.style.top = `${100 - brightness}%`;
            hueCursor.style.left = `${(hue / 360) * 100}%`;
            sliderR.value = r; sliderG.value = g; sliderB.value = b;
            valueR.textContent = r; valueG.textContent = g; valueB.textContent = b;
        };

        const updateFromRGB = () => {
            const hsv = rgbToHsv(r, g, b);
            hue = hsv.h; saturation = hsv.s; brightness = hsv.v;
            updateUI();
        };

        // タブ切り替え
        tabHsv.addEventListener('click', () => {
            tabHsv.style.background = '#4a4a6a'; tabHsv.style.color = '#fff';
            tabRgb.style.background = 'transparent'; tabRgb.style.color = '#8888aa';
            hsvPanel.style.display = 'block'; rgbPanel.style.display = 'none';
        });
        tabRgb.addEventListener('click', () => {
            tabRgb.style.background = '#4a4a6a'; tabRgb.style.color = '#fff';
            tabHsv.style.background = 'transparent'; tabHsv.style.color = '#8888aa';
            rgbPanel.style.display = 'flex'; hsvPanel.style.display = 'none';
        });

        // SBボックス操作
        let sbDrag = false;
        const updateSB = (e) => {
            const rect = sbBox.getBoundingClientRect();
            saturation = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            brightness = Math.max(0, Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100));
            updateUI();
        };
        sbBox.addEventListener('mousedown', e => { sbDrag = true; updateSB(e); });
        sbBox.addEventListener('touchstart', e => { e.preventDefault(); sbDrag = true; updateSB(e.touches[0]); }, { passive: false });
        document.addEventListener('mousemove', e => { if (sbDrag) updateSB(e); });
        document.addEventListener('touchmove', e => { if (sbDrag) { e.preventDefault(); updateSB(e.touches[0]); } }, { passive: false });
        document.addEventListener('mouseup', () => sbDrag = false);
        document.addEventListener('touchend', () => sbDrag = false);

        // Hueスライダー
        let hueDrag = false;
        const updateHue = (e) => {
            const rect = hueSlider.getBoundingClientRect();
            hue = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
            updateUI();
        };
        hueSlider.addEventListener('mousedown', e => { hueDrag = true; updateHue(e); });
        hueSlider.addEventListener('touchstart', e => { e.preventDefault(); hueDrag = true; updateHue(e.touches[0]); }, { passive: false });
        document.addEventListener('mousemove', e => { if (hueDrag) updateHue(e); });
        document.addEventListener('touchmove', e => { if (hueDrag) { e.preventDefault(); updateHue(e.touches[0]); } }, { passive: false });
        document.addEventListener('mouseup', () => hueDrag = false);
        document.addEventListener('touchend', () => hueDrag = false);

        // RGBスライダー
        [sliderR, sliderG, sliderB].forEach(slider => {
            slider.addEventListener('input', () => {
                r = +sliderR.value; g = +sliderG.value; b = +sliderB.value;
                updateFromRGB();
            });
        });

        // HEX入力
        hexInput.addEventListener('input', () => {
            let v = hexInput.value;
            if (!v.startsWith('#')) v = '#' + v;
            if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                const rgb = hexToRgb(v);
                r = rgb.r; g = rgb.g; b = rgb.b;
                updateFromRGB();
            }
        });

        // よく使う色
        recentColors.forEach(color => {
            const div = document.createElement('div');
            div.style.cssText = `width:28px;height:28px;border-radius:6px;border:2px solid #444466;cursor:pointer;background:${color};`;
            div.addEventListener('click', () => {
                const rgb = hexToRgb(color);
                r = rgb.r; g = rgb.g; b = rgb.b;
                updateFromRGB();
            });
            recentColorsEl.appendChild(div);
        });

        // 初期UI更新
        updateUI();

        // ボタン
        const closeModal = () => {
            document.body.style.overflow = originalOverflow;
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        };

        modal.querySelector('#cp-ok').addEventListener('click', () => {
            App.nesPalette[index] = rgbToHex(r, g, b);
            this.initColorPalette();
            this.render();
            this.initSpriteGallery();
            closeModal();
        });

        modal.querySelector('#cp-cancel').addEventListener('click', closeModal);

        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    },

    selectColor(index) {
        this.selectedColor = index;
        document.querySelectorAll('.palette-color').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
    },

    // ========== ツール ==========
    initTools() {
        // PIXEL画面専用のツールボタンのみ選択
        document.querySelectorAll('#paint-tools .paint-tool-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            if (btn.parentNode) btn.parentNode.replaceChild(newBtn, btn);

            // 消しゴム長押し検知用
            let pressTimer;
            const startPress = () => {
                if (newBtn.dataset.tool === 'eraser') {
                    pressTimer = setTimeout(() => this.clearSprite(), 800);
                }
            };
            const cancelPress = () => {
                clearTimeout(pressTimer);
            };

            newBtn.addEventListener('mousedown', startPress);
            newBtn.addEventListener('mouseup', cancelPress);
            newBtn.addEventListener('mouseleave', cancelPress);
            newBtn.addEventListener('touchstart', startPress, { passive: true });
            newBtn.addEventListener('touchend', cancelPress);

            newBtn.addEventListener('click', () => {
                const tool = newBtn.dataset.tool;

                switch (tool) {
                    case 'undo':
                        this.undo();
                        break;
                    case 'copy':
                        this.copySprite();
                        break;
                    case 'paste':
                        this.pasteSprite();
                        break;
                    case 'flip-v':
                        this.saveHistory();
                        this.flipVertical();
                        break;
                    case 'flip-h':
                        this.saveHistory();
                        this.flipHorizontal();
                        break;
                    default:
                        this.currentTool = tool;
                        // PIXEL画面のツールのみアクティブ切替
                        document.querySelectorAll('#paint-tools .paint-tool-btn').forEach(b => {
                            b.classList.toggle('active', b.dataset.tool === tool);
                        });
                        break;
                }
            });
        });
    },

    // ========== スプライトギャラリー（ドラッグ並替え対応） ==========
    initSpriteGallery() {
        const container = document.getElementById('sprite-list');
        if (!container) return;

        container.innerHTML = '';

        App.projectData.sprites.forEach((sprite, index) => {
            const div = document.createElement('div');
            div.className = 'sprite-item' + (index === this.currentSprite ? ' selected' : '');
            div.draggable = true;
            div.dataset.index = index;

            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 16;
            miniCanvas.height = 16;
            this.renderSpriteToMiniCanvas(sprite, miniCanvas);
            div.appendChild(miniCanvas);

            // 長押しで削除
            let longPressTimer;
            let isLongPress = false;

            const startLongPress = () => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.deleteSprite(index);
                }, 800);
            };

            const cancelLongPress = () => {
                clearTimeout(longPressTimer);
            };

            div.addEventListener('mousedown', startLongPress);
            div.addEventListener('mouseup', cancelLongPress);
            div.addEventListener('mouseleave', cancelLongPress);
            div.addEventListener('touchstart', startLongPress, { passive: true });
            div.addEventListener('touchend', (e) => {
                cancelLongPress();
                // タッチ用ダブルタップ検出
                if (!isLongPress) {
                    const now = Date.now();
                    if (now - this.lastSpriteClickTime < 300 && this.lastSpriteClickIndex === index) {
                        // ダブルタップ → サイズ切り替え
                        e.preventDefault();
                        this.toggleSpriteSize(index);
                        this.lastSpriteClickTime = 0;
                        this.lastSpriteClickIndex = -1;
                    } else {
                        // シングルタップ → 選択
                        this.currentSprite = index;
                        this.history = [];
                        this.viewportOffsetX = 0;
                        this.viewportOffsetY = 0;
                        this.lastSpriteClickTime = now;
                        this.lastSpriteClickIndex = index;
                        this.initSpriteGallery();
                        this.render();
                    }
                }
            });

            // PC用クリック（マウス）
            div.addEventListener('click', (e) => {
                // タッチデバイスでは touchend で処理するのでスキップ
                if (e.pointerType === 'touch' || 'ontouchstart' in window) return;

                if (!isLongPress) {
                    const now = Date.now();
                    if (now - this.lastSpriteClickTime < 300 && this.lastSpriteClickIndex === index) {
                        // ダブルクリック → サイズ切り替え
                        this.toggleSpriteSize(index);
                        this.lastSpriteClickTime = 0;
                        this.lastSpriteClickIndex = -1;
                    } else {
                        // シングルクリック → 選択
                        this.currentSprite = index;
                        this.history = [];
                        this.viewportOffsetX = 0;
                        this.viewportOffsetY = 0;
                        this.lastSpriteClickTime = now;
                        this.lastSpriteClickIndex = index;
                        this.initSpriteGallery();
                        this.render();
                    }
                }
            });

            // ドラッグ並べ替え
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                div.classList.add('dragging');
            });

            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
            });

            div.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            div.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;

                if (fromIndex !== toIndex) {
                    this.reorderSprites(fromIndex, toIndex);
                }
            });

            container.appendChild(div);
        });

        // 追加ボタン
        const addBtn = document.getElementById('add-sprite-btn');
        if (addBtn) {
            const newAddBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(newAddBtn, addBtn);
            newAddBtn.addEventListener('click', () => {
                this.addNewSprite();
            });
        }
    },

    reorderSprites(fromIndex, toIndex) {
        const sprites = App.projectData.sprites;
        const [moved] = sprites.splice(fromIndex, 1);
        sprites.splice(toIndex, 0, moved);

        // ID振り直し
        sprites.forEach((s, i) => s.id = i);

        // 選択中のスプライトを追跡
        if (this.currentSprite === fromIndex) {
            this.currentSprite = toIndex;
        } else if (fromIndex < this.currentSprite && toIndex >= this.currentSprite) {
            this.currentSprite--;
        } else if (fromIndex > this.currentSprite && toIndex <= this.currentSprite) {
            this.currentSprite++;
        }

        this.initSpriteGallery();
        this.render();
    },

    // ========== 描画 ==========
    render() {
        if (!this.ctx) return;
        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        const palette = App.nesPalette;
        // 背景色を動的に取得
        const bgColor = App.projectData.stage?.bgColor || App.projectData.stage?.backgroundColor || '#3CBCFC';

        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const dimension = this.getCurrentSpriteDimension();

        // 表示範囲（ビューポート）は常に16x16ピクセル分
        try {
            // オフセットが不正な値の場合はリセット
            if (!Number.isFinite(this.viewportOffsetX)) this.viewportOffsetX = 0;
            if (!Number.isFinite(this.viewportOffsetY)) this.viewportOffsetY = 0;

            // オフセットをピクセル単位からタイル単位に変換
            const offsetX = Math.floor(this.viewportOffsetX / this.pixelSize);
            const offsetY = Math.floor(this.viewportOffsetY / this.pixelSize);

            for (let vy = 0; vy < 16; vy++) {
                for (let vx = 0; vx < 16; vx++) {
                    const sx = vx + offsetX;  // スプライト内の実座標
                    const sy = vy + offsetY;

                    // 範囲チェックと配列の存在チェックを厳密に行う
                    if (sx >= 0 && sx < dimension && sy >= 0 && sy < dimension) {
                        // 行データが存在するか確認
                        if (sprite.data[sy] && typeof sprite.data[sy][sx] !== 'undefined') {
                            const colorIndex = sprite.data[sy][sx];
                            if (colorIndex >= 0) {
                                this.ctx.fillStyle = palette[colorIndex];
                                this.ctx.fillRect(vx * this.pixelSize, vy * this.pixelSize, this.pixelSize, this.pixelSize);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Render error:', e);
        }

        // ペーストプレビュー（確定前）
        if (this.pasteMode && this.pasteData) {
            const dataH = this.pasteData.length;
            const dataW = this.pasteData[0].length;
            for (let dy = 0; dy < dataH; dy++) {
                for (let dx = 0; dx < dataW; dx++) {
                    const tx = this.pasteOffset.x + dx;
                    const ty = this.pasteOffset.y + dy;
                    if (tx >= 0 && tx < 16 && ty >= 0 && ty < 16) {
                        const val = this.pasteData[dy][dx];
                        if (val >= 0) {
                            this.ctx.fillStyle = palette[val];
                            this.ctx.globalAlpha = 0.7;
                            this.ctx.fillRect(tx * this.pixelSize, ty * this.pixelSize, this.pixelSize, this.pixelSize);
                            this.ctx.globalAlpha = 1.0;
                        }
                    }
                }
            }
        }

        // グリッド線（白）
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 1;
        for (let i = 1; i < 16; i++) {
            // 縦線
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.pixelSize, 0);
            this.ctx.lineTo(i * this.pixelSize, this.canvas.height);
            this.ctx.stroke();
            // 横線
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.pixelSize);
            this.ctx.lineTo(this.canvas.width, i * this.pixelSize);
            this.ctx.stroke();
        }

        // 範囲選択表示（点線）
        if (this.selectionMode && this.selectionStart && this.selectionEnd) {
            const x1 = Math.min(this.selectionStart.x, this.selectionEnd.x);
            const y1 = Math.min(this.selectionStart.y, this.selectionEnd.y);
            const x2 = Math.max(this.selectionStart.x, this.selectionEnd.x);
            const y2 = Math.max(this.selectionStart.y, this.selectionEnd.y);

            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 4]);
            this.ctx.strokeRect(
                x1 * this.pixelSize,
                y1 * this.pixelSize,
                (x2 - x1 + 1) * this.pixelSize,
                (y2 - y1 + 1) * this.pixelSize
            );
            this.ctx.setLineDash([]);
        }

        // ペースト範囲表示（点線）
        if (this.pasteMode && this.pasteData) {
            const dataH = this.pasteData.length;
            const dataW = this.pasteData[0].length;

            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([4, 4]);
            this.ctx.strokeRect(
                this.pasteOffset.x * this.pixelSize,
                this.pasteOffset.y * this.pixelSize,
                dataW * this.pixelSize,
                dataH * this.pixelSize
            );
            this.ctx.setLineDash([]);
        }

        this.canvas.style.backgroundColor = bgColor;
    },

    renderSpriteToMiniCanvas(sprite, canvas) {
        const spriteSize = sprite.size || 1;
        const dimension = spriteSize === 2 ? 32 : 16;

        // スプライトサイズに合わせてキャンバスサイズを設定（CSSでスケーリング）
        canvas.width = dimension;
        canvas.height = dimension;

        const ctx = canvas.getContext('2d');
        const palette = App.nesPalette;

        // 背景色を動的に取得
        const bgColor = App.projectData.stage?.bgColor || App.projectData.stage?.backgroundColor || '#3CBCFC';
        canvas.style.backgroundColor = bgColor;
        ctx.clearRect(0, 0, dimension, dimension);

        for (let y = 0; y < dimension; y++) {
            for (let x = 0; x < dimension; x++) {
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
            data: App.create2DArray(16, 16, -1),
            size: 1  // デフォルトは16x16
        });
        this.currentSprite = id;
        this.history = [];
        this.initSpriteGallery();
        this.render();
    },

    // スプライトのサイズを切り替え（16x16 ↔ 32x32）
    toggleSpriteSize(index) {
        const sprite = App.projectData.sprites[index];
        if (!sprite) return;

        const currentSize = sprite.size || 1;
        const newSize = currentSize === 1 ? 2 : 1;
        const currentDim = currentSize === 2 ? 32 : 16;
        const newDim = newSize === 2 ? 32 : 16;

        // 新しいデータ配列を作成
        const newData = App.create2DArray(newDim, newDim, -1);

        // データをコピー（縮小の場合は左上のみ、拡大の場合は左上に配置）
        const copyDim = Math.min(currentDim, newDim);
        for (let y = 0; y < copyDim; y++) {
            for (let x = 0; x < copyDim; x++) {
                newData[y][x] = sprite.data[y][x];
            }
        }

        sprite.data = newData;
        sprite.size = newSize;

        // 現在編集中のスプライトなら、オフセットをリセット
        if (index === this.currentSprite) {
            this.viewportOffsetX = 0;
            this.viewportOffsetY = 0;
        }

        this.initSpriteGallery();
        this.render();
    },

    deleteSprite(index) {
        if (App.projectData.sprites.length <= 1) {
            alert('これ以上削除できません');
            return;
        }

        if (!confirm('このスプライトを削除しますか？')) {
            return;
        }

        App.projectData.sprites.splice(index, 1);
        App.projectData.sprites.forEach((s, i) => s.id = i);

        this.currentSprite = Math.max(0, index - 1);
        this.history = [];
        this.initSpriteGallery();
        this.render();
    },

    // ========== キャンバスイベント ==========
    initCanvasEvents() {
        if (!this.canvas) return;

        const newCanvas = this.canvas.cloneNode(true);
        if (this.canvas.parentNode) this.canvas.parentNode.replaceChild(newCanvas, this.canvas);
        this.canvas = newCanvas;
        this.ctx = this.canvas.getContext('2d');

        this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
        document.addEventListener('mouseup', () => this.onPointerUp());

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();

            // 2本指の場合はパン開始
            if (e.touches.length === 2 && this.getCurrentSpriteSize() === 2) {
                this.isPanning = true;
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                this.panStartX = (touch1.clientX + touch2.clientX) / 2;
                this.panStartY = (touch1.clientY + touch2.clientY) / 2;
            } else if (e.touches.length === 1) {
                this.onPointerDown(e.touches[0]);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();

            // 2本指パン処理
            if (e.touches.length === 2 && this.isPanning && this.getCurrentSpriteSize() === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const centerX = (touch1.clientX + touch2.clientX) / 2;
                const centerY = (touch1.clientY + touch2.clientY) / 2;

                // ピアノロールと同じ方式: ピクセル単位でスクロール
                // 開始位置が不正ならリセット
                if (!Number.isFinite(this.panStartX) || !Number.isFinite(this.panStartY)) {
                    this.panStartX = centerX;
                    this.panStartY = centerY;
                    return;
                }

                const deltaX = this.panStartX - centerX;
                const deltaY = this.panStartY - centerY;

                // ピクセル単位でオフセットを更新（16ピクセル分 = 16タイル分 = 320pxが最大）
                const maxScroll = 16 * this.pixelSize;  // 320px

                // 現在のオフセットの正当性チェック
                if (!Number.isFinite(this.viewportOffsetX)) this.viewportOffsetX = 0;
                if (!Number.isFinite(this.viewportOffsetY)) this.viewportOffsetY = 0;

                this.viewportOffsetX = Math.max(0, Math.min(maxScroll, this.viewportOffsetX + deltaX));
                this.viewportOffsetY = Math.max(0, Math.min(maxScroll, this.viewportOffsetY + deltaY));

                this.panStartX = centerX;
                this.panStartY = centerY;

                this.render();
            } else if (e.touches.length === 1) {
                this.onPointerMove(e.touches[0]);
            }
        }, { passive: false });

        document.addEventListener('touchend', () => {
            this.isPanning = false;
            this.onPointerUp();
        });
    },

    getPixelFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();

        // CSSによる拡大縮小を考慮してスケールを計算
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        // オフセットをピクセル単位からタイル単位に変換
        const offsetX = Math.floor(this.viewportOffsetX / this.pixelSize);
        const offsetY = Math.floor(this.viewportOffsetY / this.pixelSize);

        // クライアント座標 → 内部キャンバス座標に変換してタイル計算
        const x = Math.floor((e.clientX - rect.left) * scaleX / this.pixelSize) + offsetX;
        const y = Math.floor((e.clientY - rect.top) * scaleY / this.pixelSize) + offsetY;
        return { x, y };
    },

    onPointerDown(e) {
        if (App.currentScreen !== 'paint') return;

        const pixel = this.getPixelFromEvent(e);
        const dimension = this.getCurrentSpriteDimension();

        if (pixel.x < 0 || pixel.x >= dimension || pixel.y < 0 || pixel.y >= dimension) {
            return;
        }

        // 範囲選択モード
        if (this.selectionMode) {
            this.isDrawing = true;
            this.selectionStart = { x: pixel.x, y: pixel.y };
            this.selectionEnd = { x: pixel.x, y: pixel.y };
            this.render();
            return;
        }

        // ペーストモード（どこでもドラッグ開始、指を離すと確定）
        if (this.pasteMode && this.pasteData) {
            this.isDrawing = true;
            this.pasteDragStart = { x: pixel.x, y: pixel.y };
            return;
        }

        this.isDrawing = true;

        // 描画開始時に履歴を保存
        this.saveHistory();

        const sprite = App.projectData.sprites[this.currentSprite];
        const currentVal = sprite.data[pixel.y][pixel.x];

        if (this.currentTool === 'pen') {
            if (currentVal === this.selectedColor) {
                this.drawMode = 'erase';
            } else {
                this.drawMode = 'draw';
            }
        } else {
            this.drawMode = 'draw';
        }

        this.processPixel(pixel.x, pixel.y);
    },

    onPointerMove(e) {
        if (!this.isDrawing || App.currentScreen !== 'paint') return;

        const pixel = this.getPixelFromEvent(e);

        // 範囲選択モード
        if (this.selectionMode) {
            const dimension = this.getCurrentSpriteDimension();
            this.selectionEnd = {
                x: Math.max(0, Math.min(dimension - 1, pixel.x)),
                y: Math.max(0, Math.min(dimension - 1, pixel.y))
            };
            this.render();
            return;
        }

        // ペーストモード（ドラッグ移動）
        if (this.pasteMode && this.pasteDragStart) {
            const dx = pixel.x - this.pasteDragStart.x;
            const dy = pixel.y - this.pasteDragStart.y;
            this.pasteOffset.x += dx;
            this.pasteOffset.y += dy;
            this.pasteDragStart = { x: pixel.x, y: pixel.y };
            this.render();
            return;
        }

        if (pixel.x !== this.lastPixel.x || pixel.y !== this.lastPixel.y) {
            this.processPixel(pixel.x, pixel.y);
        }
    },

    onPointerUp() {
        if (!this.isDrawing) return;

        this.isDrawing = false;
        this.lastPixel = { x: -1, y: -1 };

        // 範囲選択モード確定
        if (this.selectionMode && this.selectionStart && this.selectionEnd) {
            this.confirmRangeCopy();
            return;
        }

        // ペーストモード：指を離すと確定
        if (this.pasteMode && this.pasteData) {
            this.confirmPaste();
            this.pasteDragStart = null;
            return;
        }

        this.initSpriteGallery();
    },

    processPixel(x, y) {
        const dimension = this.getCurrentSpriteDimension();
        if (x < 0 || x >= dimension || y < 0 || y >= dimension) return;

        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        this.lastPixel = { x, y };

        switch (this.currentTool) {
            case 'pen':
                if (this.drawMode === 'erase') {
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
            case 'eyedropper':
                const pickedColor = sprite.data[y][x];
                if (pickedColor >= 0) {
                    this.selectColor(pickedColor);
                }
                break;
        }

        this.render();
    },

    floodFill(x, y, targetColor, newColor) {
        if (targetColor === newColor) return;

        const sprite = App.projectData.sprites[this.currentSprite];
        const dimension = this.getCurrentSpriteDimension();
        const q = [[x, y]];
        let iterations = 0;

        while (q.length && iterations < 1000) {
            iterations++;
            const [cx, cy] = q.pop();

            if (cx >= 0 && cx < dimension && cy >= 0 && cy < dimension) {
                if (sprite.data[cy][cx] === targetColor) {
                    sprite.data[cy][cx] = newColor;
                    q.push([cx + 1, cy]);
                    q.push([cx - 1, cy]);
                    q.push([cx, cy + 1]);
                    q.push([cx, cy - 1]);
                }
            }
        }
    },

    clearSprite() {
        if (!confirm('スプライトをクリアしますか？')) return;

        this.saveHistory();
        const sprite = App.projectData.sprites[this.currentSprite];
        const dimension = this.getCurrentSpriteDimension();
        for (let y = 0; y < dimension; y++) {
            for (let x = 0; x < dimension; x++) {
                sprite.data[y][x] = -1;
            }
        }
        this.render();
        this.initSpriteGallery();
    },

    // 範囲選択モード開始
    copySprite() {
        this.selectionMode = true;
        this.pasteMode = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.currentTool = 'copy';
        // ツールボタンのアクティブ状態を更新
        document.querySelectorAll('#paint-tools .paint-tool-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === 'copy');
        });
    },

    // ペーストモード開始
    pasteSprite() {
        if (!this.rangeClipboard || this.rangeClipboard.length === 0) {
            alert('先にコピーする範囲を選択してください');
            return;
        }
        this.pasteMode = true;
        this.selectionMode = false;
        this.pasteData = JSON.parse(JSON.stringify(this.rangeClipboard));
        // 2×2右下にオフセットして配置
        this.pasteOffset = {
            x: 2,
            y: 2
        };
        this.currentTool = 'paste';
        document.querySelectorAll('#paint-tools .paint-tool-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === 'paste');
        });
        this.render();
    },

    // 範囲コピー確定
    confirmRangeCopy() {
        if (!this.selectionStart || !this.selectionEnd) return;

        const sprite = App.projectData.sprites[this.currentSprite];
        const x1 = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const y1 = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const x2 = Math.max(this.selectionStart.x, this.selectionEnd.x);
        const y2 = Math.max(this.selectionStart.y, this.selectionEnd.y);

        // 範囲内のデータをコピー
        const data = [];
        for (let y = y1; y <= y2; y++) {
            const row = [];
            for (let x = x1; x <= x2; x++) {
                row.push(sprite.data[y][x]);
            }
            data.push(row);
        }
        this.rangeClipboard = data;

        // 選択モード終了
        this.selectionMode = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.currentTool = 'pen';
        document.querySelectorAll('#paint-tools .paint-tool-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === 'pen');
        });
        this.render();
    },

    // ペースト確定
    confirmPaste() {
        if (!this.pasteData) return;

        this.saveHistory();
        const sprite = App.projectData.sprites[this.currentSprite];
        const dataH = this.pasteData.length;
        const dataW = this.pasteData[0].length;

        for (let dy = 0; dy < dataH; dy++) {
            for (let dx = 0; dx < dataW; dx++) {
                const tx = this.pasteOffset.x + dx;
                const ty = this.pasteOffset.y + dy;
                const dimension = this.getCurrentSpriteDimension();
                if (tx >= 0 && tx < dimension && ty >= 0 && ty < dimension) {
                    const val = this.pasteData[dy][dx];
                    if (val >= 0) { // 透明以外を上書き
                        sprite.data[ty][tx] = val;
                    }
                }
            }
        }

        // ペーストモード終了
        this.pasteMode = false;
        this.pasteData = null;
        this.currentTool = 'pen';
        document.querySelectorAll('#paint-tools .paint-tool-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === 'pen');
        });
        this.render();
        this.initSpriteGallery();
    },

    flipVertical() {
        // ペーストモード時はペーストデータを反転
        if (this.pasteMode && this.pasteData) {
            this.pasteData.reverse();
            this.render();
            return;
        }
        const sprite = App.projectData.sprites[this.currentSprite];
        sprite.data.reverse();
        this.render();
        this.initSpriteGallery();
    },

    flipHorizontal() {
        // ペーストモード時はペーストデータを反転
        if (this.pasteMode && this.pasteData) {
            this.pasteData.forEach(row => row.reverse());
            this.render();
            return;
        }
        const sprite = App.projectData.sprites[this.currentSprite];
        sprite.data.forEach(row => row.reverse());
        this.render();
        this.initSpriteGallery();
    }
};
