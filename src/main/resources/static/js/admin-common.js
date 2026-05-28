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
        /**
         * CSV / 파일 다운로드.
         * 인증은 HttpOnly 쿠키로 자동 동행 → fetch+blob 패턴(혹은 그 안에서의
         * URL.createObjectURL revoke 타이밍) 없이 native browser download 로
         * 처리해 blob URL 이슈(ERR_NAME_NOT_RESOLVED 등) 회피.
         */
        async download(path, filename) {
            const a = document.createElement('a');
            a.href = path;
            if (filename) a.download = filename;
            a.rel = 'noopener';
            // download 속성을 anchor 에 두면 브라우저가 Content-Disposition 을 우선 사용.
            document.body.appendChild(a);
            a.click();
            setTimeout(() => a.remove(), 1500);
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
