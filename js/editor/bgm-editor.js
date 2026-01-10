/**
 * PixelGameKit - サウンドエディタ（新UI）
 */

const SoundEditor = {
    // キャンバス
    canvas: null,
    ctx: null,

    // ソング管理
    songs: [],
    currentSongIdx: 0,

    // トラック
    currentTrack: 0, // 0-3: Tr1-Tr4
    trackTypes: ['square', 'square', 'triangle', 'noise'],

    // 再生状態
    isPlaying: false,
    isPaused: false,
    isStepRecording: false,
    playInterval: null,
    activeOscillators: [null, null, null, null], // トラックごとの再生中オシレーター（同時発音1制限用）

    // ピアノロール
    cellSize: 20,
    scrollX: 0, // 横スクロール位置
    scrollY: 480, // 縦スクロール位置（C4が下端に表示: (71-36)*20=700、表示領域を考慮して調整）
    highlightPitch: -1, // ハイライト中の音階

    // 編集ツール
    currentTool: 'pencil', // pencil, eraser, copy

    // 入力位置
    currentStep: 0,

    // 音階定義（5オクターブ = C1-B5）
    noteNames: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

    // Web Audio
    audioCtx: null,

    init() {
        this.canvas = document.getElementById('piano-roll-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // Web Audio初期化
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // ソングデータ初期化
        if (!App.projectData.songs) {
            App.projectData.songs = [];
        }
        this.songs = App.projectData.songs;
        if (this.songs.length === 0) {
            this.addSong();
        }

        this.initSongPalette();
        this.initTrackTabs();
        this.initBpmBarControls();
        this.initTools();
        this.initPlayerPanel();
        this.initKeyboard();
        this.initPianoRoll();
        this.resize();
    },

    refresh() {
        if (!App.projectData.songs) {
            App.projectData.songs = [];
        }
        this.songs = App.projectData.songs;
        if (this.songs.length === 0) {
            this.addSong();
        }
        this.initSongPalette();
        this.render();
    },

    resize() {
        if (!this.canvas) return;
        // ピアノロール: 16x16グリッド
        this.canvas.width = 320;
        this.canvas.height = 320;
        this.canvas.style.width = '320px';
        this.canvas.style.height = '320px';
        this.render();
    },

    // ========== ソングパレット ==========
    // ダブルタップ検出用状態
    songClickState: { index: null, count: 0, timer: null },

    initSongPalette() {
        const container = document.getElementById('song-gallery');
        if (!container) return;

        // 既存アイテム削除
        container.innerHTML = '';

        // ソングアイテム作成（ナンバリングなし）
        this.songs.forEach((song, idx) => {
            const item = document.createElement('div');
            item.className = 'song-item' + (idx === this.currentSongIdx ? ' active' : '');

            // 長押し検出用
            let longPressTimer = null;
            let isLongPress = false;

            // タップ/クリック処理（タイルパレット方式）
            const handleTap = () => {
                if (isLongPress) {
                    isLongPress = false;
                    return;
                }

                const state = this.songClickState;

                // 同じソングへの2回目のクリック（ダブルタップ）
                if (state.index === idx && state.count === 1) {
                    clearTimeout(state.timer);
                    state.count = 0;
                    state.index = null;

                    // ダブルタップ：設定パネル表示
                    this.openSongConfig(idx);
                } else {
                    // 最初のクリック：即座に選択
                    clearTimeout(state.timer);
                    state.index = idx;
                    state.count = 1;

                    // 即座に選択を反映
                    this.selectSong(idx);

                    // ダブルタップ用タイマー
                    state.timer = setTimeout(() => {
                        state.count = 0;
                        state.index = null;
                    }, 300);
                }
            };

            // 長押し開始
            const startLongPress = () => {
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.deleteSong(idx);
                }, 800);
            };

            // 長押しキャンセル
            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            };

            item.addEventListener('click', handleTap);
            item.addEventListener('mousedown', startLongPress);
            item.addEventListener('mouseup', cancelLongPress);
            item.addEventListener('mouseleave', cancelLongPress);
            item.addEventListener('touchstart', startLongPress, { passive: true });
            item.addEventListener('touchend', cancelLongPress);
            item.addEventListener('touchcancel', cancelLongPress);

            container.appendChild(item);
        });

        // 追加ボタン
        const addBtn = document.getElementById('add-song-btn');
        if (addBtn) {
            addBtn.onclick = () => this.addSong();
        }

        // 設定パネル初期化（一度だけ）
        this.initSongConfigPanel();
    },

    initSongConfigPanel() {
        const panel = document.getElementById('song-config-panel');
        if (!panel || this._songConfigInitialized) return;
        this._songConfigInitialized = true;

        // 閉じるボタン
        document.getElementById('song-config-close')?.addEventListener('click', () => {
            this.closeSongConfig();
        });

        // BPM調整
        document.getElementById('song-bpm-dec')?.addEventListener('click', () => {
            const song = this.songs[this._configSongIdx];
            if (song) {
                song.bpm = Math.max(60, song.bpm - 5);
                document.getElementById('song-bpm-value').textContent = song.bpm;
            }
        });
        document.getElementById('song-bpm-inc')?.addEventListener('click', () => {
            const song = this.songs[this._configSongIdx];
            if (song) {
                song.bpm = Math.min(240, song.bpm + 5);
                document.getElementById('song-bpm-value').textContent = song.bpm;
            }
        });

        // 小節数調整
        document.getElementById('song-bars-dec')?.addEventListener('click', () => {
            const song = this.songs[this._configSongIdx];
            if (song) {
                song.bars = Math.max(1, song.bars - 1);
                document.getElementById('song-bars-value').textContent = song.bars;
            }
        });
        document.getElementById('song-bars-inc')?.addEventListener('click', () => {
            const song = this.songs[this._configSongIdx];
            if (song) {
                song.bars = Math.min(16, song.bars + 1);
                document.getElementById('song-bars-value').textContent = song.bars;
            }
        });

        // 保存
        document.getElementById('song-config-save')?.addEventListener('click', () => {
            const song = this.songs[this._configSongIdx];
            if (song) {
                const nameInput = document.getElementById('song-name-input');
                song.name = nameInput.value || `Song${this._configSongIdx + 1}`;
            }
            this.closeSongConfig();
            this.initSongPalette(); // ソングパレット更新（名前反映）
            this.updateBpmBarDisplay();
            this.render();

            // ステージ設定のBGM選択肢も更新
            if (typeof StageEditor !== 'undefined' && StageEditor.updateBgmSelects) {
                StageEditor.updateBgmSelects();
            }
        });
    },

    openSongConfig(idx) {
        this._configSongIdx = idx;
        const song = this.songs[idx];
        if (!song) return;

        document.getElementById('song-name-input').value = song.name || `Song${idx + 1}`;
        document.getElementById('song-bpm-value').textContent = song.bpm;
        document.getElementById('song-bars-value').textContent = song.bars;

        const panel = document.getElementById('song-config-panel');
        panel?.classList.remove('hidden');
    },

    closeSongConfig() {
        const panel = document.getElementById('song-config-panel');
        panel?.classList.add('hidden');
    },

    deleteSong(idx) {
        if (this.songs.length <= 1) {
            alert('最後のソングは削除できません');
            return;
        }
        if (!confirm('このソングを削除しますか？')) {
            return;
        }
        this.songs.splice(idx, 1);
        if (this.currentSongIdx >= this.songs.length) {
            this.currentSongIdx = this.songs.length - 1;
        }
        this.initSongPalette();
        this.updateBpmBarDisplay();
        this.render();

        // ステージ設定のBGM選択肢も更新
        if (typeof StageEditor !== 'undefined' && StageEditor.updateBgmSelects) {
            StageEditor.updateBgmSelects();
        }
    },

    addSong() {
        const id = this.songs.length;
        const song = {
            id: id,
            name: `Song${id + 1}`,
            bpm: 120,
            bars: 1,
            tracks: [
                { type: 'square', notes: [] },
                { type: 'square', notes: [] },
                { type: 'triangle', notes: [] },
                { type: 'noise', notes: [] }
            ]
        };
        this.songs.push(song);
        this.currentSongIdx = id;
        this.initSongPalette();
        this.updateBpmBarDisplay();
        this.render();
    },

    selectSong(idx) {
        this.currentSongIdx = idx;
        this.scrollX = 0;
        this.currentStep = 0;
        this.initSongPalette();
        this.updateBpmBarDisplay();
        this.render();
    },

    getCurrentSong() {
        return this.songs[this.currentSongIdx] || this.songs[0];
    },

    // ========== トラックタブ ==========
    initTrackTabs() {
        const tabs = document.querySelectorAll('.track-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTrack = parseInt(tab.dataset.track);
                this.render();
            });
        });
    },

    // ========== BPM/BAR コントロール ==========
    initBpmBarControls() {
        // BPM
        document.getElementById('bpm-dec')?.addEventListener('click', () => {
            const song = this.getCurrentSong();
            song.bpm = Math.max(60, song.bpm - 5);
            this.updateBpmBarDisplay();
        });
        document.getElementById('bpm-inc')?.addEventListener('click', () => {
            const song = this.getCurrentSong();
            song.bpm = Math.min(200, song.bpm + 5);
            this.updateBpmBarDisplay();
        });

        // BAR
        document.getElementById('bar-dec')?.addEventListener('click', () => {
            const song = this.getCurrentSong();
            song.bars = Math.max(1, song.bars - 1);
            this.updateBpmBarDisplay();
            this.render();
        });
        document.getElementById('bar-inc')?.addEventListener('click', () => {
            const song = this.getCurrentSong();
            song.bars = Math.min(16, song.bars + 1);
            this.updateBpmBarDisplay();
            this.render();
        });

        this.updateBpmBarDisplay();
    },

    updateBpmBarDisplay() {
        const song = this.getCurrentSong();
        const bpmVal = document.getElementById('bpm-value');
        const barVal = document.getElementById('bar-value');
        if (bpmVal) bpmVal.textContent = song.bpm;
        if (barVal) barVal.textContent = song.bars;
    },

    // ========== 編集ツール ==========
    initTools() {
        const tools = document.querySelectorAll('.sound-tool-btn');
        tools.forEach(tool => {
            tool.addEventListener('click', () => {
                tools.forEach(t => t.classList.remove('active'));
                tool.classList.add('active');
                this.currentTool = tool.dataset.tool || 'pencil';
            });
        });
    },

    // ========== プレイヤーパネル ==========
    initPlayerPanel() {
        // DEL (UNDO) - 通常タップ: 直前のノート削除、長押し: トラック全削除
        const delBtn = document.getElementById('sound-del-btn');
        if (delBtn) {
            let longPressTimer = null;
            let isLongPress = false;

            const startLongPress = () => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.clearCurrentTrack();
                }, 800);
            };

            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            };

            delBtn.addEventListener('mousedown', startLongPress);
            delBtn.addEventListener('mouseup', cancelLongPress);
            delBtn.addEventListener('mouseleave', cancelLongPress);
            delBtn.addEventListener('touchstart', startLongPress, { passive: true });
            delBtn.addEventListener('touchend', cancelLongPress);
            delBtn.addEventListener('touchcancel', cancelLongPress);

            delBtn.addEventListener('click', () => {
                if (!isLongPress) {
                    this.deleteLastNote();
                }
            });
        }

        // REST
        document.getElementById('sound-rest-btn')?.addEventListener('click', () => {
            this.inputRest();
        });

        // TIE
        document.getElementById('sound-tie-btn')?.addEventListener('click', () => {
            this.inputTie();
        });

        // PLAY/PAUSE/STOP（シングル=一時停止/再生、ダブル=停止）
        const playBtn = document.getElementById('sound-play-btn');
        if (playBtn) {
            let lastClickTime = 0;
            playBtn.addEventListener('click', () => {
                const now = Date.now();
                if (now - lastClickTime < 300) {
                    // ダブルクリック: 停止（位置リセット）
                    this.stop();
                } else if (this.isPlaying) {
                    // 再生中シングルクリック: 一時停止
                    this.pause();
                } else if (this.isPaused) {
                    // 一時停止中シングルクリック: 再開
                    this.resume();
                } else {
                    // 停止中シングルクリック: 再生
                    this.play();
                }
                lastClickTime = now;
            });
        }

        // STEP REC（ステップ録音ON/OFF）
        const stepRecBtn = document.getElementById('sound-step-rec-btn');
        if (stepRecBtn) {
            stepRecBtn.addEventListener('click', () => {
                this.isStepRecording = !this.isStepRecording;
                stepRecBtn.classList.toggle('active', this.isStepRecording);
                if (this.isStepRecording) {
                    // ステップ録音ON: 現在位置をリセット
                    this.currentStep = 0;
                    this.render();
                }
            });
        }

        // COPY（現在トラックのノートをコピー）
        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyTrack());
        }

        // PASTE（コピーしたノートをペースト）
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) {
            pasteBtn.addEventListener('click', () => this.pasteTrack());
        }
    },

    // ========== 鍵盤 ==========
    initKeyboard() {
        const container = document.getElementById('piano-keyboard');
        const keyboardArea = document.getElementById('keyboard-area');
        if (!container || !keyboardArea) return;
        container.innerHTML = '';

        // 5オクターブ (C1-B5)
        const octaves = [1, 2, 3, 4, 5, 6];
        let whiteKeyIndex = 0;
        const whiteKeyWidth = 40; // CSS拡大版に合わせる

        octaves.forEach(oct => {
            this.noteNames.forEach((note, idx) => {
                const isBlack = note.includes('#');
                const key = document.createElement('div');
                key.className = 'piano-key ' + (isBlack ? 'black' : 'white');
                key.dataset.note = note;
                key.dataset.octave = oct;

                if (isBlack) {
                    // 黒鍵の位置を計算 (白鍵幅40pxに対応)
                    const prevWhiteKeys = whiteKeyIndex;
                    key.style.left = (prevWhiteKeys * whiteKeyWidth - 12) + 'px';
                } else {
                    whiteKeyIndex++;
                }

                // 鍵盤押下開始
                const startHandler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startKeySound(note, oct);
                };

                // 鍵盤離す
                const endHandler = (e) => {
                    this.stopKeySound();
                };

                key.addEventListener('touchstart', startHandler, { passive: false });
                key.addEventListener('mousedown', startHandler);
                key.addEventListener('touchend', endHandler);
                key.addEventListener('touchcancel', endHandler);
                key.addEventListener('mouseup', endHandler);
                key.addEventListener('mouseleave', endHandler);

                container.appendChild(key);
            });
        });

        // ドラッグスクロール機能
        let isDragging = false;
        let startX = 0;
        let scrollLeft = 0;

        keyboardArea.addEventListener('mousedown', (e) => {
            // 鍵盤自体のクリックは除外
            if (e.target.classList.contains('piano-key')) return;
            isDragging = true;
            startX = e.pageX - keyboardArea.offsetLeft;
            scrollLeft = keyboardArea.scrollLeft;
            keyboardArea.style.cursor = 'grabbing';
        });

        keyboardArea.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - keyboardArea.offsetLeft;
            const walk = (x - startX) * 1.5;
            keyboardArea.scrollLeft = scrollLeft - walk;
        });

        keyboardArea.addEventListener('mouseup', () => {
            isDragging = false;
            keyboardArea.style.cursor = 'grab';
        });

        keyboardArea.addEventListener('mouseleave', () => {
            isDragging = false;
            keyboardArea.style.cursor = 'grab';
        });

        // タッチスクロール
        let touchStartX = 0;
        let touchScrollLeft = 0;

        keyboardArea.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('piano-key')) return;
            touchStartX = e.touches[0].pageX;
            touchScrollLeft = keyboardArea.scrollLeft;
        }, { passive: true });

        keyboardArea.addEventListener('touchmove', (e) => {
            if (e.target.classList.contains('piano-key')) return;
            const x = e.touches[0].pageX;
            const walk = (touchStartX - x) * 1.5;
            keyboardArea.scrollLeft = touchScrollLeft + walk;
            this.updateScrollbar();
        }, { passive: true });

        // 初期カーソル
        keyboardArea.style.cursor = 'grab';

        // rangeスライダー連動
        this.initKeyboardScrollbar();

        // 初期スクロール位置（C4が左端に表示）
        // C1からC4まで白鍵は21個（C,D,E,F,G,A,B × 3オクターブ = 21個）
        // 白鍵幅40px × 21 = 840px
        const setInitialScroll = () => {
            const targetScroll = 840;
            if (keyboardArea.scrollWidth > keyboardArea.clientWidth) {
                keyboardArea.scrollLeft = targetScroll;

                // スクロールバーも同期
                const scrollbar = document.getElementById('keyboard-scrollbar');
                if (scrollbar) {
                    const maxScroll = keyboardArea.scrollWidth - keyboardArea.clientWidth;
                    if (maxScroll > 0) {
                        scrollbar.value = (targetScroll / maxScroll) * 100;
                    }
                }
            } else {
                // まだ描画されていない場合、再試行
                requestAnimationFrame(setInitialScroll);
            }
        };
        requestAnimationFrame(setInitialScroll);
    },

    initKeyboardScrollbar() {
        const scrollbar = document.getElementById('keyboard-scrollbar');
        const keyboardArea = document.getElementById('keyboard-area');
        if (!scrollbar || !keyboardArea) return;

        // スライダー操作時
        scrollbar.addEventListener('input', () => {
            const maxScroll = keyboardArea.scrollWidth - keyboardArea.clientWidth;
            keyboardArea.scrollLeft = (scrollbar.value / 100) * maxScroll;
        });

        // 鍵盤スクロール時
        keyboardArea.addEventListener('scroll', () => {
            this.updateScrollbar();
        });
    },

    updateScrollbar() {
        const scrollbar = document.getElementById('keyboard-scrollbar');
        const keyboardArea = document.getElementById('keyboard-area');
        if (!scrollbar || !keyboardArea) return;

        const maxScroll = keyboardArea.scrollWidth - keyboardArea.clientWidth;
        if (maxScroll > 0) {
            scrollbar.value = (keyboardArea.scrollLeft / maxScroll) * 100;
        }
    },

    onKeyPress(note, octave) {
        // 音再生
        this.playNote(note, octave);

        // ピアノロールのハイライト
        const pitch = this.noteToPitch(note, octave);
        this.highlightPitch = pitch;
        this.render();
        setTimeout(() => {
            this.highlightPitch = -1;
            this.render();
        }, 200);

        // ステップ録音ON時のみノート入力
        if (this.isStepRecording) {
            this.inputNote(note, octave);
        }
    },

    // 現在再生中のオシレーターとゲイン
    currentKeyOsc: null,
    currentKeyGain: null,

    startKeySound(note, octave) {
        // 既に再生中なら停止
        this.stopKeySound();

        if (!this.audioCtx) return;

        const trackType = this.trackTypes[this.currentTrack];
        const pitch = this.noteToPitch(note, octave);

        // ノイズトラックはドラム音を使用
        if (trackType === 'noise') {
            const result = this.playDrum(pitch, 0.5);
            if (result) {
                this.currentKeyOsc = result.noise;
                this.currentKeyGain = result.gain;
            }
        } else {
            const freq = this.getFrequency(note, octave);
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            gain.connect(this.audioCtx.destination);

            // 波形タイプ
            if (trackType === 'square') {
                osc.type = 'square';
            } else if (trackType === 'triangle') {
                osc.type = 'triangle';
            }

            osc.frequency.value = freq;
            gain.gain.value = 0.3;

            osc.connect(gain);
            osc.start();

            this.currentKeyOsc = osc;
            this.currentKeyGain = gain;
        }

        // ピアノロールのハイライト
        this.highlightPitch = pitch;
        this.render();

        // ステップ録音ON時のみノート入力
        if (this.isStepRecording) {
            this.inputNote(note, octave);
        }
    },

    stopKeySound() {
        if (this.currentKeyGain) {
            // フェードアウト
            this.currentKeyGain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
        }
        if (this.currentKeyOsc) {
            this.currentKeyOsc.stop(this.audioCtx.currentTime + 0.1);
            this.currentKeyOsc = null;
            this.currentKeyGain = null;
        }

        // ハイライト解除
        this.highlightPitch = -1;
        this.render();
    },

    playNote(note, octave, duration = 0.2) {
        if (!this.audioCtx) return;

        const trackType = this.trackTypes[this.currentTrack];

        // ノイズトラックはドラム音を使用
        if (trackType === 'noise') {
            const pitch = this.noteToPitch(note, octave);
            this.playDrum(pitch, duration);
        } else {
            const gain = this.audioCtx.createGain();
            gain.connect(this.audioCtx.destination);

            const freq = this.getFrequency(note, octave);
            const osc = this.audioCtx.createOscillator();

            if (trackType === 'square') {
                osc.type = 'square';
            } else if (trackType === 'triangle') {
                osc.type = 'triangle';
            }

            osc.frequency.value = freq;
            // Tr1/Tr2（矩形波）は音量を下げる、Tr3（三角波）は維持
            const volume = (trackType === 'square') ? 0.19 : 0.3;
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
            // 80%の時間は音量維持、残り20%で減衰
            const sustainTime = duration * 0.8;
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime + sustainTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

            osc.connect(gain);
            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        }
    },

    // 再生用（トラックごとに同時発音数1に制限）
    playNoteMonophonic(note, octave, duration, trackIdx) {
        if (!this.audioCtx) return;

        const trackType = this.trackTypes[trackIdx];

        // 前の音を停止
        if (this.activeOscillators[trackIdx]) {
            try {
                this.activeOscillators[trackIdx].osc.stop();
            } catch (e) { }
            this.activeOscillators[trackIdx] = null;
        }

        // ノイズトラックはドラム音を使用
        if (trackType === 'noise') {
            const pitch = this.noteToPitch(note, octave);
            const drumNodes = this.playDrum(pitch, duration);

            // アクティブノードを記録（同時発音数1制限用）
            if (drumNodes) {
                this.activeOscillators[trackIdx] = {
                    osc: drumNodes.noise,
                    gain: drumNodes.gain
                };

                // 停止後にクリア
                setTimeout(() => {
                    if (this.activeOscillators[trackIdx] &&
                        this.activeOscillators[trackIdx].osc === drumNodes.noise) {
                        this.activeOscillators[trackIdx] = null;
                    }
                }, duration * 1000);
            }
        } else {
            const gain = this.audioCtx.createGain();
            gain.connect(this.audioCtx.destination);

            const freq = this.getFrequency(note, octave);
            const osc = this.audioCtx.createOscillator();

            if (trackType === 'square') {
                osc.type = 'square';
            } else if (trackType === 'triangle') {
                osc.type = 'triangle';
            }

            osc.frequency.value = freq;
            const volume = (trackType === 'square') ? 0.19 : 0.3;
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
            const sustainTime = duration * 0.8;
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime + sustainTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

            osc.connect(gain);
            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);

            // アクティブオシレーターを記録
            this.activeOscillators[trackIdx] = { osc, gain };

            // 停止後にクリア
            setTimeout(() => {
                if (this.activeOscillators[trackIdx] && this.activeOscillators[trackIdx].osc === osc) {
                    this.activeOscillators[trackIdx] = null;
                }
            }, duration * 1000);
        }
    },

    getFrequency(note, octave) {
        const noteIdx = this.noteNames.indexOf(note);
        // A4 = 440Hz
        const semitone = (octave - 4) * 12 + noteIdx - 9;
        return 440 * Math.pow(2, semitone / 12);
    },

    noteToPitch(note, octave) {
        // C1 = 0, B5 = 59
        const noteIdx = this.noteNames.indexOf(note);
        return (octave - 1) * 12 + noteIdx;
    },

    pitchToNote(pitch) {
        const octave = Math.floor(pitch / 12) + 1;
        const noteIdx = pitch % 12;
        return { note: this.noteNames[noteIdx], octave };
    },

    // ドラム音生成（ピッチに応じた連続的なフィルター周波数）
    playDrum(pitch, duration, audioCtx) {
        const ctx = audioCtx || this.audioCtx;
        if (!ctx) return;

        // ノイズバッファ作成（durationを反映）
        const bufferSize = ctx.sampleRate * Math.max(duration, 0.05);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // ピッチ0-71を周波数80Hz-15000Hzにマッピング（指数的）
        const minFreq = 80;
        const maxFreq = 15000;
        const maxPitch = 71;
        const freqRatio = Math.pow(maxFreq / minFreq, pitch / maxPitch);
        const filterFreq = minFreq * freqRatio;

        // 低音はローパス（バスドラム）、中音はバンドパス（スネア）、高音はハイパス（ハイハット）
        if (pitch < 24) {
            // バスドラム: 強いローパス、低いQ値
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            filter.Q.value = 1;
        } else if (pitch < 48) {
            // スネア: バンドパス、適度なQ値
            filter.type = 'bandpass';
            filter.frequency.value = filterFreq;
            filter.Q.value = 3;
        } else {
            // ハイハット: ハイパス
            filter.type = 'highpass';
            filter.frequency.value = filterFreq * 0.4;
            filter.Q.value = 1;
        }

        // 音量とディケイ（durationに応じて）- より強いアタック
        const baseVolume = 0.5; // 音量アップ
        const volume = baseVolume - (pitch / maxPitch) * 0.2; // 低音ほど大きく

        // アタックを強調（急速に音量を上げる）
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005); // 5ms アタック

        // 50%の時間は音量維持、残り50%で減衰
        const sustainTime = duration * 0.5;
        gain.gain.setValueAtTime(volume, ctx.currentTime + 0.005 + sustainTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
        noise.stop(ctx.currentTime + duration);

        return { noise, gain };
    },

    // ========== ノート入力 ==========
    inputNote(note, octave, length = 1) {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const pitch = this.noteToPitch(note, octave);
        const maxSteps = song.bars * 16;

        if (this.currentStep < maxSteps) {
            track.notes.push({
                step: this.currentStep,
                pitch: pitch,
                length: length
            });
            this.currentStep++;
            this.render();
        }
    },

    inputRest() {
        const song = this.getCurrentSong();
        const maxSteps = song.bars * 16;
        if (this.currentStep < maxSteps) {
            this.currentStep++;
            this.render();
        }
    },

    inputTie() {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const maxSteps = song.bars * 16;

        if (track.notes.length > 0) {
            const lastNote = track.notes[track.notes.length - 1];
            lastNote.length++;
            // ノートを伸ばした分、currentStepも進める
            if (this.currentStep < maxSteps) {
                this.currentStep++;
            }
            this.render();
        }
    },

    deleteLastNote() {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        if (track.notes.length > 0) {
            track.notes.pop();
            if (this.currentStep > 0) this.currentStep--;
            this.render();
        }
    },

    clearCurrentTrack() {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        if (track.notes.length === 0) return;

        if (!confirm(`Tr${this.currentTrack + 1}の全ノートを削除しますか？`)) {
            return;
        }

        track.notes = [];
        this.currentStep = 0;
        this.render();
    },

    // ========== コピー/ペースト（範囲選択方式） ==========
    // コピー/ペースト用の状態
    selectionMode: false,
    pasteMode: false,
    selectionStart: null,
    selectionEnd: null,
    noteClipboard: null,
    pasteOffset: { step: 0, pitch: 0 },

    // コピーモード開始（範囲選択）
    copyTrack() {
        this.selectionMode = true;
        this.pasteMode = false;
        this.selectionStart = null;
        this.selectionEnd = null;

        // コピーボタンをアクティブに
        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) copyBtn.classList.add('active');
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) pasteBtn.classList.remove('active');

        this.render();
    },

    // 範囲コピー確定
    confirmRangeCopy() {
        if (!this.selectionStart || !this.selectionEnd) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];

        const step1 = Math.min(this.selectionStart.step, this.selectionEnd.step);
        const step2 = Math.max(this.selectionStart.step, this.selectionEnd.step);
        const pitch1 = Math.min(this.selectionStart.pitch, this.selectionEnd.pitch);
        const pitch2 = Math.max(this.selectionStart.pitch, this.selectionEnd.pitch);

        // 範囲内のノートをコピー（相対位置で保存）
        const copiedNotes = [];
        track.notes.forEach(note => {
            if (note.step >= step1 && note.step <= step2 &&
                note.pitch >= pitch1 && note.pitch <= pitch2) {
                copiedNotes.push({
                    relStep: note.step - step1,
                    relPitch: note.pitch - pitch1,
                    length: note.length
                });
            }
        });

        if (copiedNotes.length === 0) {
            // コピー対象なし
            this.selectionMode = false;
            this.selectionStart = null;
            this.selectionEnd = null;
            const copyBtn = document.getElementById('sound-copy-btn');
            if (copyBtn) copyBtn.classList.remove('active');
            this.render();
            return;
        }

        this.noteClipboard = {
            notes: copiedNotes,
            width: step2 - step1 + 1,
            height: pitch2 - pitch1 + 1
        };

        // 選択モード終了
        this.selectionMode = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) copyBtn.classList.remove('active');
        this.render();
    },

    // ペーストモード開始
    pasteTrack() {
        if (!this.noteClipboard || this.noteClipboard.notes.length === 0) {
            return;
        }

        this.pasteMode = true;
        this.selectionMode = false;
        // 2ステップ右、2ピッチ下にオフセット
        this.pasteOffset = { step: 2, pitch: 2 };

        // ペーストボタンをアクティブに
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) pasteBtn.classList.add('active');
        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) copyBtn.classList.remove('active');

        this.render();
    },

    // ペースト確定
    confirmPaste() {
        if (!this.noteClipboard) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const maxSteps = song.bars * 16;

        // ペーストデータを追加
        this.noteClipboard.notes.forEach(copyNote => {
            const newStep = this.pasteOffset.step + copyNote.relStep;
            const newPitch = this.pasteOffset.pitch + copyNote.relPitch;

            // 範囲チェック
            if (newStep >= 0 && newStep < maxSteps && newPitch >= 0 && newPitch < 72) {
                // 既存ノートとの重複チェック
                const exists = track.notes.some(n => n.step === newStep && n.pitch === newPitch);
                if (!exists) {
                    track.notes.push({
                        step: newStep,
                        pitch: newPitch,
                        length: copyNote.length
                    });
                }
            }
        });

        // ペーストモード終了
        this.pasteMode = false;
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) pasteBtn.classList.remove('active');
        this.render();
    },

    // コピー/ペーストのキャンセル
    cancelCopyPaste() {
        this.selectionMode = false;
        this.pasteMode = false;
        this.selectionStart = null;
        this.selectionEnd = null;

        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) copyBtn.classList.remove('active');
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) pasteBtn.classList.remove('active');

        this.render();
    },

    // ========== ピアノロール ==========
    initPianoRoll() {
        if (!this.canvas) return;

        let isDragging = false;
        let startX = 0, startY = 0;

        // 長押し＆ドラッグ用
        let longPressTimer = null;
        let isLongPress = false;
        let draggingNote = null;
        let originalStep = 0;
        let originalPitch = 0;

        // 新規ノート入力用（ドラッグで長さ設定）
        let isCreatingNote = false;
        let creatingNote = null;
        let createStartStep = 0;

        // 2本指スクロール用
        let isTwoFingerPan = false;
        let lastTouchX = 0;
        let lastTouchY = 0;

        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            return {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        };

        const getPosFromEvent = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            if (e.changedTouches) {
                return {
                    x: e.changedTouches[0].clientX - rect.left,
                    y: e.changedTouches[0].clientY - rect.top
                };
            }
            return getPos(e);
        };

        const getStepPitch = (pos) => {
            const scrollY = this.scrollY || 0;
            const step = Math.floor((pos.x + this.scrollX) / this.cellSize);
            // C1-B5（pitch 0-59）の60音範囲（noteToPitchと一致）
            // scrollYで縦スクロール、上が高音（B5=59）、下が低音（C1=0）
            const maxPitch = 71; // B6
            const row = Math.floor((pos.y + scrollY) / this.cellSize);
            const pitch = Math.max(0, Math.min(71, maxPitch - row));
            return { step, pitch };
        };

        // 2本指パン誤入力防止用
        let pendingInputTimer = null;
        let pendingInputData = null;

        // タッチスタート
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // 2本指パン開始 - 保留中の入力があればキャンセル
                if (pendingInputTimer) {
                    clearTimeout(pendingInputTimer);
                    pendingInputTimer = null;
                    pendingInputData = null;
                }
                // 作成中のノートがあれば削除
                if (isCreatingNote && creatingNote) {
                    const song = this.getCurrentSong();
                    const track = song.tracks[this.currentTrack];
                    const idx = track.notes.indexOf(creatingNote);
                    if (idx >= 0) {
                        track.notes.splice(idx, 1);
                        this.render();
                    }
                    isCreatingNote = false;
                    creatingNote = null;
                }
                isTwoFingerPan = true;
                lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                isDragging = false;
                e.preventDefault();
                return;
            }

            if (e.touches.length === 1) {
                e.preventDefault();
                const pos = getPos(e);
                const { step, pitch } = getStepPitch(pos);

                isDragging = true;
                startX = pos.x;
                startY = pos.y;

                // 選択モード中
                if (this.selectionMode) {
                    if (!this.selectionStart) {
                        this.selectionStart = { step, pitch };
                        this.selectionEnd = { step, pitch };
                    } else {
                        this.selectionEnd = { step, pitch };
                    }
                    this.render();
                    return;
                }

                // ペーストモード中
                if (this.pasteMode) {
                    this.pasteOffset = { step, pitch };
                    this.render();
                    return;
                }

                // ノートがあるかチェック
                const note = this.findNoteAt(step, pitch);

                if (note) {
                    // 長押し検出開始（既存ノートの移動用）
                    originalStep = note.step;
                    originalPitch = note.pitch;
                    longPressTimer = setTimeout(() => {
                        isLongPress = true;
                        draggingNote = note;
                    }, 300);
                } else {
                    // 空セル: 遅延してノート作成（2本指パン誤入力防止）
                    pendingInputData = { step, pitch, pos };
                    pendingInputTimer = setTimeout(() => {
                        // 選択モード/ペーストモード中はノート作成しない
                        if (this.selectionMode || this.pasteMode) {
                            pendingInputTimer = null;
                            pendingInputData = null;
                            return;
                        }
                        if (pendingInputData && !isTwoFingerPan) {
                            const newNote = { step: pendingInputData.step, pitch: pendingInputData.pitch, length: 1 };
                            const song = this.getCurrentSong();
                            song.tracks[this.currentTrack].notes.push(newNote);
                            isCreatingNote = true;
                            creatingNote = newNote;
                            createStartStep = pendingInputData.step;
                            const { note: noteName, octave } = this.pitchToNote(pendingInputData.pitch);
                            this.playNote(noteName, octave);
                            this.render();
                        }
                        pendingInputTimer = null;
                        pendingInputData = null;
                    }, 50);
                }
            }
        });

        this.canvas.addEventListener('mousedown', (e) => {
            const pos = getPos(e);
            const { step, pitch } = getStepPitch(pos);

            isDragging = true;
            startX = pos.x;
            startY = pos.y;

            // 選択モード中
            if (this.selectionMode) {
                if (!this.selectionStart) {
                    this.selectionStart = { step, pitch };
                    this.selectionEnd = { step, pitch };
                } else {
                    this.selectionEnd = { step, pitch };
                }
                this.render();
                return;
            }

            // ペーストモード中
            if (this.pasteMode) {
                this.pasteOffset = { step, pitch };
                this.render();
                return;
            }

            // ノートがあるかチェック
            const note = this.findNoteAt(step, pitch);

            if (note) {
                // 長押し検出開始（既存ノートの移動用）
                originalStep = note.step;
                originalPitch = note.pitch;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    draggingNote = note;
                }, 300);
            } else {
                // 空セル: 新規ノート作成（ドラッグで長さ設定）
                const newNote = { step, pitch, length: 1 };
                const song = this.getCurrentSong();
                song.tracks[this.currentTrack].notes.push(newNote);
                isCreatingNote = true;
                creatingNote = newNote;
                createStartStep = step;
                const { note: noteName, octave } = this.pitchToNote(pitch);
                this.playNote(noteName, octave);
                this.render();
            }
        });

        // タッチムーブ
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && isTwoFingerPan) {
                // 2本指パンスクロール
                const currentX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const deltaX = lastTouchX - currentX;
                const deltaY = lastTouchY - currentY;

                this.scrollX = Math.max(0, this.scrollX + deltaX);
                // 60音（pitch 12-71）× 20px = 1200px の縦スクロール範囲
                const maxScrollY = 60 * this.cellSize - this.canvas.height;
                this.scrollY = Math.max(0, Math.min(maxScrollY, this.scrollY + deltaY));

                lastTouchX = currentX;
                lastTouchY = currentY;
                this.render();
                e.preventDefault();
            } else if (isDragging && e.touches.length === 1) {
                e.preventDefault();

                const pos = getPos(e);
                const moved = Math.abs(pos.x - startX) > 5 || Math.abs(pos.y - startY) > 5;

                if (moved && !isLongPress && !isCreatingNote) {
                    clearTimeout(longPressTimer);
                }

                // 選択モード中のドラッグ
                if (this.selectionMode && this.selectionStart) {
                    const { step, pitch } = getStepPitch(pos);
                    this.selectionEnd = { step, pitch };
                    this.render();
                    return;
                }

                // ペーストモード中のドラッグ
                if (this.pasteMode) {
                    const { step, pitch } = getStepPitch(pos);
                    this.pasteOffset = { step, pitch };
                    this.render();
                    return;
                }

                // 長押しドラッグ中ならノート移動
                if (isLongPress && draggingNote) {
                    const { step, pitch } = getStepPitch(pos);
                    draggingNote.step = Math.max(0, step);
                    draggingNote.pitch = pitch;
                    this.render();
                }

                // 新規ノート作成中ならドラッグで長さ更新
                if (isCreatingNote && creatingNote) {
                    const { step } = getStepPitch(pos);
                    const length = Math.max(1, step - createStartStep + 1);
                    creatingNote.length = length;
                    this.render();
                }
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const pos = getPos(e);
                const moved = Math.abs(pos.x - startX) > 5 || Math.abs(pos.y - startY) > 5;

                if (moved && !isLongPress && !isCreatingNote) {
                    clearTimeout(longPressTimer);
                }

                // 選択モード中のドラッグ
                if (this.selectionMode && this.selectionStart) {
                    const { step, pitch } = getStepPitch(pos);
                    this.selectionEnd = { step, pitch };
                    this.render();
                    return;
                }

                // ペーストモード中のドラッグ
                if (this.pasteMode) {
                    const { step, pitch } = getStepPitch(pos);
                    this.pasteOffset = { step, pitch };
                    this.render();
                    return;
                }

                // 長押しドラッグ中ならノート移動
                if (isLongPress && draggingNote) {
                    const { step, pitch } = getStepPitch(pos);
                    draggingNote.step = Math.max(0, step);
                    draggingNote.pitch = pitch;
                    this.render();
                }

                // 新規ノート作成中ならドラッグで長さ更新
                if (isCreatingNote && creatingNote) {
                    const { step } = getStepPitch(pos);
                    const length = Math.max(1, step - createStartStep + 1);
                    creatingNote.length = length;
                    this.render();
                }
            }
        });

        // タッチエンド
        this.canvas.addEventListener('touchend', (e) => {
            // 2本指パン中に1本離れた場合は何もしない
            if (e.touches.length === 1 && isTwoFingerPan) {
                return;
            }

            if (e.touches.length === 0) {
                // 2本指パン中だった場合はフラグリセットのみ
                if (isTwoFingerPan) {
                    isTwoFingerPan = false;
                    isDragging = false;
                    return;
                }

                // 選択モード中：範囲コピー確定
                if (this.selectionMode && this.selectionStart && this.selectionEnd) {
                    this.confirmRangeCopy();
                    isDragging = false;
                    return;
                }

                // ペーストモード中：ペースト確定
                if (this.pasteMode) {
                    this.confirmPaste();
                    isDragging = false;
                    return;
                }

                // ノート作成中でない場合のみタップ処理（既存ノート削除）
                if (isDragging && !isLongPress && !isCreatingNote) {
                    clearTimeout(longPressTimer);
                    const pos = getPosFromEvent(e);
                    const { step, pitch } = getStepPitch(pos);
                    // 既存ノートがあれば削除
                    const existingNote = this.findNoteAt(step, pitch);
                    if (existingNote) {
                        const song = this.getCurrentSong();
                        const track = song.tracks[this.currentTrack];
                        const idx = track.notes.indexOf(existingNote);
                        if (idx >= 0) {
                            track.notes.splice(idx, 1);
                            this.render();
                        }
                    }
                }

                isDragging = false;
                isLongPress = false;
                draggingNote = null;
                isCreatingNote = false;
                creatingNote = null;
                clearTimeout(longPressTimer);
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            // 選択モード中：範囲コピー確定
            if (this.selectionMode && this.selectionStart && this.selectionEnd) {
                this.confirmRangeCopy();
                isDragging = false;
                return;
            }

            // ペーストモード中：ペースト確定
            if (this.pasteMode) {
                this.confirmPaste();
                isDragging = false;
                return;
            }

            // ノート作成中でない場合のみタップ処理（既存ノート削除）
            if (isDragging && !isLongPress && !isCreatingNote) {
                clearTimeout(longPressTimer);
                const pos = getPos(e);
                const { step, pitch } = getStepPitch(pos);
                // 既存ノートがあれば削除
                const existingNote = this.findNoteAt(step, pitch);
                if (existingNote) {
                    const song = this.getCurrentSong();
                    const track = song.tracks[this.currentTrack];
                    const idx = track.notes.indexOf(existingNote);
                    if (idx >= 0) {
                        track.notes.splice(idx, 1);
                        this.render();
                    }
                }
            }

            isDragging = false;
            isLongPress = false;
            draggingNote = null;
            isCreatingNote = false;
            creatingNote = null;
            clearTimeout(longPressTimer);
        });

        this.canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            isLongPress = false;
            draggingNote = null;
            clearTimeout(longPressTimer);
        });
    },

    handleTap(step, pitch) {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];

        // 既存ノートがあれば削除、なければ追加
        const existingNote = this.findNoteAt(step, pitch);

        if (existingNote) {
            // 削除
            const idx = track.notes.indexOf(existingNote);
            if (idx >= 0) {
                track.notes.splice(idx, 1);
            }
        } else {
            // 追加
            const { note, octave } = this.pitchToNote(pitch);
            this.playNote(note, octave);
            track.notes.push({ step, pitch, length: 1 });
        }
        this.render();
    },

    findNoteAt(step, pitch) {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        return track.notes.find(n =>
            n.step <= step && n.step + n.length > step && n.pitch === pitch
        );
    },

    deleteNoteAt(step, pitch) {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const idx = track.notes.findIndex(n =>
            n.step <= step && n.step + n.length > step && n.pitch === pitch
        );
        if (idx >= 0) {
            track.notes.splice(idx, 1);
            this.render();
        }
    },

    // ========== 再生 ==========
    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this.updatePlayButton('play');

        const song = this.getCurrentSong();
        const stepDuration = 60 / song.bpm / 4; // 16分音符
        const startStep = this.isPaused ? this.currentStep : 0;
        let step = startStep;
        const maxSteps = song.bars * 16;

        this.isPaused = false;
        this.playInterval = setInterval(() => {
            // 全トラック再生
            song.tracks.forEach((track, trackIdx) => {
                track.notes.forEach(note => {
                    if (note.step === step) {
                        const { note: noteName, octave } = this.pitchToNote(note.pitch);
                        // 同時発音数1に制限（トラックごと）
                        this.playNoteMonophonic(noteName, octave, stepDuration * note.length, trackIdx);
                    }
                });
            });

            this.currentStep = step;
            this.render();

            step++;
            if (step >= maxSteps) {
                step = 0;
            }
        }, stepDuration * 1000);
    },

    pause() {
        this.isPlaying = false;
        this.isPaused = true;
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        this.updatePlayButton('pause');
    },

    resume() {
        this.play();
    },

    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentStep = 0;
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        this.updatePlayButton('stop');
        this.render();
    },

    updatePlayButton(state) {
        const playBtn = document.getElementById('sound-play-btn');
        if (!playBtn) return;

        const svg = playBtn.querySelector('svg');
        if (!svg) return;

        if (state === 'play') {
            // 停止アイコン（■）
            svg.innerHTML = '<rect x="6" y="6" width="12" height="12" />';
        } else {
            // 再生アイコン（▶）
            svg.innerHTML = '<path d="M8 5v14l11-7z" />';
        }
    },

    // ========== レンダリング ==========
    render() {
        if (!this.ctx) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const maxSteps = song.bars * 16;

        // 背景（ステージ設定の背景色を使用）
        const bgColor = App.projectData?.stage?.bgColor || '#3CBCFC';
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 偶数拍（2拍、4拍）の背景を薄くする
        const beatWidth = 4 * this.cellSize; // 1拍 = 4ステップ
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        for (let bar = 0; bar < song.bars; bar++) {
            for (let beat = 0; beat < 4; beat++) {
                // 偶数拍（2拍目=beat1、4拍目=beat3）を暗くする
                if (beat === 1 || beat === 3) {
                    const x = (bar * 16 + beat * 4) * this.cellSize - this.scrollX;
                    if (x + beatWidth >= 0 && x <= this.canvas.width) {
                        this.ctx.fillRect(x, 0, beatWidth, this.canvas.height);
                    }
                }
            }
        }

        // グリッド（白色）
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 0.5;
        const scrollY = this.scrollY || 0;

        // 縦線
        for (let i = 0; i <= Math.ceil(this.canvas.width / this.cellSize) + 1; i++) {
            this.ctx.beginPath();
            const x = i * this.cellSize - this.scrollX % this.cellSize;
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        // 横線（scrollYを適用）
        for (let i = 0; i <= Math.ceil(this.canvas.height / this.cellSize) + 1; i++) {
            this.ctx.beginPath();
            const y = i * this.cellSize - scrollY % this.cellSize;
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }

        // オクターブ区切り（Cの音、白1px）
        const maxPitch = 71;
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        for (let octave = 1; octave <= 6; octave++) {
            const cPitch = (octave - 1) * 12; // C1=0, C2=12, C3=24, C4=36, C5=48
            const y = (maxPitch - cPitch + 1) * this.cellSize - scrollY;
            if (y >= 0 && y <= this.canvas.height) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
            }
        }

        // 小節区切り（白1px）
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        const barWidth = 16 * this.cellSize;
        for (let bar = 0; bar <= song.bars; bar++) {
            const x = bar * barWidth - this.scrollX;
            if (x >= 0 && x <= this.canvas.width) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
                this.ctx.stroke();
            }
        }

        // 指定小節数外の範囲をグレーアウト
        const maxX = maxSteps * this.cellSize - this.scrollX;
        if (maxX < this.canvas.width) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(maxX, 0, this.canvas.width - maxX, this.canvas.height);
        }

        // ハイライト行
        // maxPitchは既に宣言済み
        if (this.highlightPitch >= 0 && this.highlightPitch <= 71) {
            const y = (maxPitch - this.highlightPitch) * this.cellSize - scrollY;
            if (y + this.cellSize >= 0 && y < this.canvas.height) {
                this.ctx.fillStyle = 'rgba(74, 124, 89, 0.3)';
                this.ctx.fillRect(0, y, this.canvas.width, this.cellSize);
            }
        }

        // ノート描画（白色）
        this.ctx.fillStyle = '#fff';

        track.notes.forEach(note => {
            const x = note.step * this.cellSize - this.scrollX;
            const y = (maxPitch - note.pitch) * this.cellSize - scrollY;
            const w = note.length * this.cellSize - 2;

            if (x + w >= 0 && x <= this.canvas.width && y + this.cellSize >= 0 && y < this.canvas.height) {
                this.ctx.fillRect(x + 1, y + 1, w, this.cellSize - 2);
            }
        });

        // 選択範囲の描画
        if (this.selectionMode && this.selectionStart && this.selectionEnd) {
            const step1 = Math.min(this.selectionStart.step, this.selectionEnd.step);
            const step2 = Math.max(this.selectionStart.step, this.selectionEnd.step);
            const pitch1 = Math.min(this.selectionStart.pitch, this.selectionEnd.pitch);
            const pitch2 = Math.max(this.selectionStart.pitch, this.selectionEnd.pitch);

            const x = step1 * this.cellSize - this.scrollX;
            const y = (maxPitch - pitch2) * this.cellSize - scrollY;
            const w = (step2 - step1 + 1) * this.cellSize;
            const h = (pitch2 - pitch1 + 1) * this.cellSize;

            this.ctx.strokeStyle = '#FFFF00';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, w, h);
            this.ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
            this.ctx.fillRect(x, y, w, h);
        }

        // ペーストプレビューの描画
        if (this.pasteMode && this.noteClipboard) {
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.4)';
            this.noteClipboard.notes.forEach(copyNote => {
                const newStep = this.pasteOffset.step + copyNote.relStep;
                const newPitch = this.pasteOffset.pitch + copyNote.relPitch;
                const x = newStep * this.cellSize - this.scrollX;
                const y = (maxPitch - newPitch) * this.cellSize - scrollY;
                const w = copyNote.length * this.cellSize - 2;

                if (x + w >= 0 && x <= this.canvas.width && y + this.cellSize >= 0 && y < this.canvas.height) {
                    this.ctx.fillRect(x + 1, y + 1, w, this.cellSize - 2);
                }
            });
        }

        // 現在位置（再生中のみ表示、ビビッドグリーン）
        if (this.isPlaying) {
            const x = this.currentStep * this.cellSize - this.scrollX;
            this.ctx.strokeStyle = '#00FF00';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
    }
};
