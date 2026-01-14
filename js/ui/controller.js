/**
 * PixelGameKit - ゲームコントローラー（Start/Select対応）
 */

const GameController = {
    buttons: {
        up: false,
        down: false,
        left: false,
        right: false,
        a: false,
        b: false
    },

    // Startボタン長押し検出
    startPressTimer: null,
    startLongPressThreshold: 800, // ミリ秒

    init() {
        this.initDpad();
        this.initActionButtons();
        this.initSystemButtons();
        this.initKeyboard();
    },

    initDpad() {
        const container = document.getElementById('dpad-container');
        if (!container) return;

        // タッチ操作（仮想D-Pad）
        const handleTouch = (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            if (!touch) return;

            const rect = container.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const x = touch.clientX - rect.left - centerX;
            const y = touch.clientY - rect.top - centerY;

            // デッドゾーン判定（中心から10px以内は入力なし）
            const distance = Math.sqrt(x * x + y * y);
            if (distance < 10) {
                this.releaseAllDpad();
                return;
            }

            // 角度計算 (-PI ~ PI)
            const angle = Math.atan2(y, x);
            // 度数法に変換 (-180 ~ 180)
            const deg = angle * (180 / Math.PI);

            // 全方向リセット
            this.releaseAllDpad();

            // 8方向判定 (22.5度ずつずらして45度刻み)
            // 右: -22.5 ~ 22.5
            // 右下: 22.5 ~ 67.5
            // 下: 67.5 ~ 112.5
            // 左下: 112.5 ~ 157.5
            // 左: 157.5 ~ 180, -180 ~ -157.5
            // 左上: -157.5 ~ -112.5
            // 上: -112.5 ~ -67.5
            // 右上: -67.5 ~ -22.5

            if (deg > -67.5 && deg <= -22.5) { // 右上
                this.press('up');
                this.press('right');
            } else if (deg > -112.5 && deg <= -67.5) { // 上
                this.press('up');
            } else if (deg > -157.5 && deg <= -112.5) { // 左上
                this.press('up');
                this.press('left');
            } else if (deg > 157.5 || deg <= -157.5) { // 左
                this.press('left');
            } else if (deg > 112.5 && deg <= 157.5) { // 左下
                this.press('down');
                this.press('left');
            } else if (deg > 67.5 && deg <= 112.5) { // 下
                this.press('down');
            } else if (deg > 22.5 && deg <= 67.5) { // 右下
                this.press('down');
                this.press('right');
            } else { // 右
                this.press('right');
            }
        };

        container.addEventListener('touchstart', handleTouch, { passive: false });
        container.addEventListener('touchmove', handleTouch, { passive: false });

        const stopTouch = (e) => {
            e.preventDefault();
            this.releaseAllDpad();
        };

        container.addEventListener('touchend', stopTouch, { passive: false });
        container.addEventListener('touchcancel', stopTouch, { passive: false });
        container.addEventListener('mouseleave', stopTouch);

        // PCでのデバッグ用（マウス操作）: マウスダウン中のみ追従
        let isMouseDown = false;
        container.addEventListener('mousedown', (e) => {
            isMouseDown = true;
            handleTouch({ padding: true, preventDefault: () => { }, touches: [{ clientX: e.clientX, clientY: e.clientY }] });
        });
        container.addEventListener('mousemove', (e) => {
            if (isMouseDown) {
                handleTouch({ padding: true, preventDefault: () => { }, touches: [{ clientX: e.clientX, clientY: e.clientY }] });
            }
        });
        container.addEventListener('mouseup', () => {
            isMouseDown = false;
            this.releaseAllDpad();
        });
    },

    releaseAllDpad() {
        this.release('up');
        this.release('down');
        this.release('left');
        this.release('right');
    },

    initActionButtons() {
        ['a', 'b'].forEach(btn => {
            const el = document.getElementById('btn-' + btn);
            if (!el) return;

            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.press(btn);
            });
            el.addEventListener('mouseup', () => this.release(btn));
            el.addEventListener('mouseleave', () => this.release(btn));

            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.press(btn);
            }, { passive: false });

            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.release(btn);
            }, { passive: false });

            el.addEventListener('touchcancel', () => this.release(btn));
        });
    },

    initSystemButtons() {
        const startBtn = document.getElementById('btn-start');

        if (startBtn) {
            // マウス操作
            startBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.onStartPress();
            });
            startBtn.addEventListener('mouseup', () => this.onStartRelease());
            startBtn.addEventListener('mouseleave', () => this.onStartRelease());

            // タッチ操作
            startBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.onStartPress();
            }, { passive: false });
            startBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.onStartRelease();
            }, { passive: false });
            startBtn.addEventListener('touchcancel', () => this.onStartRelease());
        }
    },

    onStartPress() {
        // 長押しタイマー開始
        this.startPressTimer = setTimeout(() => {
            // 長押し: ゲームをリスタート
            if (typeof GameEngine !== 'undefined') {
                GameEngine.restart();
            }
            this.startPressTimer = null;
        }, this.startLongPressThreshold);
    },

    onStartRelease() {
        // タイマーがまだ実行中 = 短押し
        if (this.startPressTimer) {
            clearTimeout(this.startPressTimer);
            this.startPressTimer = null;

            // 短押し: トグル動作（開始/一時停止/再開）
            if (typeof GameEngine !== 'undefined') {
                GameEngine.togglePause();
            }
        }
    },

    initKeyboard() {
        const keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            'KeyZ': 'a',
            'KeyX': 'b',
            'Space': 'a'
        };

        document.addEventListener('keydown', (e) => {
            const btn = keyMap[e.code];
            if (btn && App.currentScreen === 'play') {
                e.preventDefault();
                this.press(btn);
            }

            // Enterキー = Startボタン
            if (e.code === 'Enter' && App.currentScreen === 'play') {
                e.preventDefault();
                if (typeof GameEngine !== 'undefined') {
                    GameEngine.togglePause();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            const btn = keyMap[e.code];
            if (btn) {
                e.preventDefault();
                this.release(btn);
            }
        });
    },

    press(button) {
        this.buttons[button] = true;
    },

    release(button) {
        this.buttons[button] = false;
    },

    isPressed(button) {
        return this.buttons[button];
    },

    releaseAll() {
        Object.keys(this.buttons).forEach(key => {
            this.buttons[key] = false;
        });
    }
};
