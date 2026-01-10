/**
 * PixelGameKit - URL共有ユーティリティ
 */

const Share = {
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

    // 共有URL生成
    createUrl(data) {
        const encoded = this.encode(data);
        if (encoded) {
            return window.location.origin + window.location.pathname + '#' + encoded;
        }
        return null;
    },

    // データサイズ確認（URL長さ制限チェック用）
    checkSize(data) {
        const encoded = this.encode(data);
        if (encoded) {
            const url = this.createUrl(data);
            return {
                dataLength: encoded.length,
                urlLength: url.length,
                isValid: url.length < 8000 // 安全なURL長さ
            };
        }
        return { dataLength: 0, urlLength: 0, isValid: false };
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
    createTwitterUrl(shareUrl, text = 'PixelGameKitでゲームを作りました！🎮') {
        const tweetText = encodeURIComponent(text);
        const encodedUrl = encodeURIComponent(shareUrl);
        return `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodedUrl}`;
    },

    // 共有ダイアログを開く
    openDialog(data) {
        const dialog = document.getElementById('share-dialog');
        const urlInput = document.getElementById('share-url-input');
        const copySuccess = document.getElementById('copy-success');

        if (!dialog || !urlInput) return;

        // URL生成
        const sizeInfo = this.checkSize(data);
        if (!sizeInfo.isValid) {
            alert('ゲームデータが大きすぎるため共有できません。\nスプライト数やノート数を減らしてください。');
            return;
        }

        const shareUrl = this.createUrl(data);
        urlInput.value = shareUrl;
        copySuccess.classList.add('hidden');
        dialog.classList.remove('hidden');
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
                const success = await this.copyToClipboard(urlInput.value);
                if (success && copySuccess) {
                    copySuccess.classList.remove('hidden');
                    setTimeout(() => copySuccess.classList.add('hidden'), 2000);
                }
            });
        }

        if (shareXBtn && urlInput) {
            shareXBtn.addEventListener('click', () => {
                const twitterUrl = this.createTwitterUrl(urlInput.value);
                window.open(twitterUrl, '_blank');
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
