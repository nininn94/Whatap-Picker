/* WhaTap Picker - Admin 공통 유틸 */

const adminApi = (() => {
    function token() { return localStorage.getItem('jwt') || ''; }
    function headers(json = false) {
        const h = { 'Accept': 'application/json' };
        if (token()) h['Authorization'] = 'Bearer ' + token();
        if (json) h['Content-Type'] = 'application/json';
        return h;
    }
    async function handle(res) {
        const text = await res.text();
        if (!res.ok) {
            let msg = res.statusText;
            try { msg = JSON.parse(text).message || msg; } catch {}
            throw new Error(`[${res.status}] ${msg}`);
        }
        if (!text) return null;
        try { return JSON.parse(text); } catch { return text; }
    }
    return {
        async get(path) {
            return handle(await fetch(path, { credentials:'same-origin', headers: headers() }));
        },
        async post(path, body) {
            return handle(await fetch(path, { method:'POST', credentials:'same-origin',
                headers: headers(true), body: body == null ? undefined : JSON.stringify(body) }));
        },
        async put(path, body) {
            return handle(await fetch(path, { method:'PUT', credentials:'same-origin',
                headers: headers(true), body: body == null ? undefined : JSON.stringify(body) }));
        },
        async patch(path, body) {
            return handle(await fetch(path, { method:'PATCH', credentials:'same-origin',
                headers: headers(true), body: body == null ? undefined : JSON.stringify(body) }));
        },
        async del(path) {
            return handle(await fetch(path, { method:'DELETE', credentials:'same-origin', headers: headers() }));
        },
        async download(path, filename) {
            const res = await fetch(path, { credentials:'same-origin', headers: headers() });
            if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
            const cd = res.headers.get('Content-Disposition') || '';
            const m = cd.match(/filename="(.+?)"/);
            const name = filename || (m ? m[1] : 'download.csv');
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            URL.revokeObjectURL(a.href);
        }
    };
})();

function toast(msg, isError = false) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'toast is-hidden';
        document.body.appendChild(el);
    }
    el.classList.remove('toast-success', 'toast-error');
    el.classList.add(isError ? 'toast-error' : 'toast-success');
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.remove('is-hidden'));
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('is-hidden'), 3000);
}
