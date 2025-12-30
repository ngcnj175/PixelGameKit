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

    playNote(trackType, note, octave, duration) {
        this.ensureContext();

        const freq = this.getFrequency(note, octave);
        const now = this.ctx.currentTime;

        switch (trackType) {
            case 'pulse1':
            case 'pulse2':
                this.playPulse(freq, duration, trackType === 'pulse1' ? 0.5 : 0.25);
                break;
            case 'triangle':
                this.playTriangle(freq, duration);
                break;
            case 'noise':
                this.playNoise(duration);
                break;
        }
    },

    playPulse(freq, duration, duty = 0.5) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // 矩形波を近似
        osc.type = 'square';
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    playTriangle(freq, duration) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    playNoise(duration) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // ホワイトノイズ生成
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();

        source.buffer = buffer;
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        source.connect(gain);
        gain.connect(this.masterGain);

        source.start();
    }
};
