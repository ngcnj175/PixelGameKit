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
    }
};
