/**
 * PixelGameKit - ストレージユーティリティ
 */

const Storage = {
    // LocalStorageに保存
    save(key, data) {
        try {
            const json = JSON.stringify(data);
            localStorage.setItem('pgk_' + key, json);
            return true;
        } catch (e) {
            console.error('Storage save failed:', e);
            return false;
        }
    },

    // LocalStorageから読み込み
    load(key) {
        try {
            const json = localStorage.getItem('pgk_' + key);
            if (json) {
                return JSON.parse(json);
            }
            return null;
        } catch (e) {
            console.error('Storage load failed:', e);
            return null;
        }
    },

    // 削除
    remove(key) {
        try {
            localStorage.removeItem('pgk_' + key);
            return true;
        } catch (e) {
            return false;
        }
    },

    // プロジェクトリスト管理
    getProjectList() {
        return this.load('projectList') || [];
    },

    saveProject(name, data) {
        const list = this.getProjectList();
        const index = list.findIndex(p => p.name === name);
        const entry = {
            name: name,
            updatedAt: Date.now()
        };

        if (index >= 0) {
            list[index] = entry;
        } else {
            list.push(entry);
        }

        this.save('projectList', list);
        this.save('project_' + name, data);
    },

    loadProject(name) {
        return this.load('project_' + name);
    },

    deleteProject(name) {
        const list = this.getProjectList();
        const index = list.findIndex(p => p.name === name);
        if (index >= 0) {
            list.splice(index, 1);
            this.save('projectList', list);
            this.remove('project_' + name);
        }
    }
};
