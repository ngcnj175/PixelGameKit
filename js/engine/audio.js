/**
 * PixelGameKit - ファミコン風オーディオエンジン
 */

const NesAudio = {
    ctx: null,
    masterGain: null,

    // 音階周波数テーブル
    noteFrequencies: {
        'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
        'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
        'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88
    },

    init() {
        // AudioContextは初回ユーザー操作後に初期化
    },

    ensureContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
        }

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    getFrequency(note, octave) {
        const baseFreq = this.noteFrequencies[note];
        if (!baseFreq) return 440;

        // オクターブ4を基準に計算
        const octaveDiff = octave - 4;
        return baseFreq * Math.pow(2, octaveDiff);
    },

    // 波形キャッシュ
    waveCache: {},

    playNote(trackType, note, octave, duration, tone = 0) {
        this.ensureContext();

        const freq = this.getFrequency(note, octave);

        switch (trackType) {
            case 'pulse1':
            case 'pulse2':
                this.playPulse(freq, duration, tone);
                break;
            case 'triangle':
                this.playTriangle(freq, duration, tone);
                break;
            case 'noise':
                this.playNoise(duration, tone);
                break;
        }
    },

    // 矩形波 (tone: 0=Square50%, 1=Square25%, 2=Square12.5%)
    playPulse(freq, duration, tone) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Duty比の決定
        let duty = 0.5;
        if (tone === 1) duty = 0.25;
        if (tone === 2) duty = 0.125;

        if (duty === 0.5) {
            osc.type = 'square';
        } else {
            // PeriodicWaveでDuty比の異なる矩形波を生成
            const cacheKey = `pulse_${duty}`;
            if (!this.waveCache[cacheKey]) {
                const n = 4096;
                const real = new Float32Array(n);
                const imag = new Float32Array(n);
                for (let i = 1; i < n; i++) {
                    imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
                }
                this.waveCache[cacheKey] = this.ctx.createPeriodicWave(real, imag);
            }
            osc.setPeriodicWave(this.waveCache[cacheKey]);
        }

        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    // 三角波 (tone: 0=Triangle, 1=Sine, 2=Sawtooth)
    playTriangle(freq, duration, tone) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        if (tone === 1) {
            osc.type = 'sine'; // 丸い音
        } else if (tone === 2) {
            osc.type = 'sawtooth'; // 拡張音源風
            gain.gain.value = 0.2; // Sawtoothは音が大きいので下げる
        } else {
            osc.type = 'triangle'; // 標準
        }

        osc.frequency.value = freq;

        if (tone !== 2) {
            gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        } else {
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        }
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    // ノイズ (tone: 0=White, 1=Short(Metal), 2=Kick(Low))
    playNoise(duration, tone) {
        let bufferSize;

        if (tone === 1) {
            // 短周期ノイズ（金属音）
            // 非常に短いバッファを繰り返すことで金属的な響きを作る
            // 93サンプル程度でC#4〜D4付近のピッチ感が出る (44100Hzの場合)
            bufferSize = 128;
        } else {
            bufferSize = this.ctx.sampleRate * duration;
        }

        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // ノイズ生成
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        if (tone === 1) {
            source.loop = true;
            source.loopEnd = buffer.duration;
            // 短周期の場合はdurationで停止させるためstopが必要
            // pitch調整用にplaybackRateを少し変えるのもありだが今回は固定
        }

        const gain = this.ctx.createGain();

        // フィルタ（Kick用）
        let filter = null;
        if (tone === 2) {
            filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 200; // 低域のみ通す
            filter.Q.value = 1;

            source.connect(filter);
            filter.connect(gain);
        } else {
            source.connect(gain);
        }

        const volume = (tone === 2) ? 0.8 : 0.2; // Kickは音量大きめ
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        gain.connect(this.masterGain);

        source.start();
        source.stop(this.ctx.currentTime + duration);
    },

    // ========== SE再生 ==========
    playSE(seType) {
        this.ensureContext();

        switch (seType) {
            case 'jump':
                this.playSE_Jump();
                break;
            case 'attack':
                this.playSE_Attack();
                break;
            case 'damage':
                this.playSE_Damage();
                break;
            case 'itemGet':
                this.playSE_ItemGet();
                break;
            case 'enemyDefeat':
                this.playSE_EnemyDefeat();
                break;
        }
    },

    // SE: ジャンプ（上昇する音）
    playSE_Jump() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    },

    // SE: 攻撃（短い衝撃音）
    playSE_Attack() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },

    // SE: ダメージ（下降する音）
    playSE_Damage() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    },

    // SE: アイテム取得（キラキラ音）
    playSE_ItemGet() {
        const playNote = (freq, startTime, duration) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.2, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        playNote(523, this.ctx.currentTime, 0.1);        // C5
        playNote(659, this.ctx.currentTime + 0.08, 0.1); // E5
        playNote(784, this.ctx.currentTime + 0.16, 0.15); // G5
    },

    // SE: 敵を倒す（短い「ポン」音）
    playSE_EnemyDefeat() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
};
