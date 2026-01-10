/**
 * PixelGameKit - URL共有ユーティリティ（Firebase対応）
 */

const Share = {
    // 短縮ID生成（8文字）
    generateShortId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    },

    // Firebaseにゲームデータを保存
    async saveGame(data) {
        if (!window.firebaseDB) {
            console.error('Firebase not initialized');
            return null;
        }

        try {
            const id = this.generateShortId();
            const encoded = this.encode(data);

            await window.firebaseDB.ref('games/' + id).set({
                data: encoded,
                createdAt: Date.now()
            });

            console.log('Game saved with ID:', id);
            return id;
        } catch (e) {
            console.error('Failed to save game:', e);
            return null;
        }
    },

    // Firebaseからゲームデータを読み込み
    async loadGame(id) {
        if (!window.firebaseDB) {
            console.error('Firebase not initialized');
            return null;
        }

        try {
            const snapshot = await window.firebaseDB.ref('games/' + id).once('value');
            const record = snapshot.val();

            if (record && record.data) {
                return this.decode(record.data);
            }
            return null;
        } catch (e) {
            console.error('Failed to load game:', e);
            return null;
        }
    },

    // プロジェクトデータをURLエンコード
    encode(data) {
        try {
            const json = JSON.stringify(data);
            const compressed = pako.deflate(json);
            const base64 = btoa(String.fromCharCode.apply(null, compressed));
            // URL safe Base64
            return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (e) {
            console.error('Encode failed:', e);
            return null;
        }
    },

    // URLからプロジェクトデータをデコード
    decode(encoded) {
        try {
            // URL safe Base64を戻す
            let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            // パディング追加
            while (base64.length % 4) {
                base64 += '=';
            }

            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            const decompressed = pako.inflate(bytes, { to: 'string' });
            return JSON.parse(decompressed);
        } catch (e) {
            console.error('Decode failed:', e);
            return null;
        }
    },

    // 短縮共有URL生成（Firebase ID使用）
    createShortUrl(id) {
        return window.location.origin + window.location.pathname + '?g=' + id;
    },

    // クリップボードにコピー
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            // フォールバック
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (e2) {
                document.body.removeChild(textarea);
                return false;
            }
        }
    },

    // X (Twitter) 共有URL生成
    createTwitterUrl(shareUrl, text = 'PixelGameKitでゲームを作ったよ！🎮\nプレイしてみてね！') {
        const tweetText = encodeURIComponent(text);
        const encodedUrl = encodeURIComponent(shareUrl);
        return `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodedUrl}`;
    },

    // 共有ダイアログを開く（Firebase保存）
    async openDialog(data) {
        const dialog = document.getElementById('share-dialog');
        const urlInput = document.getElementById('share-url-input');
        const copySuccess = document.getElementById('copy-success');

        if (!dialog || !urlInput) return;

        // ローディング表示
        urlInput.value = '共有URL生成中...';
        copySuccess.classList.add('hidden');
        dialog.classList.remove('hidden');

        // Firebaseに保存
        const id = await this.saveGame(data);

        if (!id) {
            urlInput.value = 'エラー：保存に失敗しました';
            return;
        }

        const shareUrl = this.createShortUrl(id);
        urlInput.value = shareUrl;
    },

    // 共有ダイアログを閉じる
    closeDialog() {
        const dialog = document.getElementById('share-dialog');
        if (dialog) {
            dialog.classList.add('hidden');
        }
    },

    // 共有ダイアログのイベントリスナー初期化
    initDialogEvents() {
        const copyBtn = document.getElementById('copy-url-btn');
        const shareXBtn = document.getElementById('share-x-btn');
        const closeBtn = document.getElementById('share-close-btn');
        const urlInput = document.getElementById('share-url-input');
        const copySuccess = document.getElementById('copy-success');
        const dialog = document.getElementById('share-dialog');

        if (copyBtn && urlInput) {
            copyBtn.addEventListener('click', async () => {
                if (urlInput.value.startsWith('http')) {
                    const success = await this.copyToClipboard(urlInput.value);
                    if (success && copySuccess) {
                        copySuccess.classList.remove('hidden');
                        setTimeout(() => copySuccess.classList.add('hidden'), 2000);
                    }
                }
            });
        }

        if (shareXBtn && urlInput) {
            shareXBtn.addEventListener('click', () => {
                if (urlInput.value.startsWith('http')) {
                    const twitterUrl = this.createTwitterUrl(urlInput.value);
                    window.open(twitterUrl, '_blank');
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDialog());
        }

        // モーダル背景クリックで閉じる
        if (dialog) {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    this.closeDialog();
                }
            });
        }
    }
};
