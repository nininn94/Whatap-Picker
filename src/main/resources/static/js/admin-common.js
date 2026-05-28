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
         * fetch 로 본문을 받아 Blob 으로 만들고 anchor.click() 으로 다운로드.
         * 직접 anchor href 방식은 HTTPS 페이지가 백엔드(HTTP)로 redirect 될 때
         * Chrome 의 mixed-content 차단("인터넷 연결 상태 확인" 메시지)에 걸린다.
         * fetch → 같은 origin → blob: URL 은 항상 안전. revoke 는 충분히 지연.
         */
        async download(path, filename) {
            const h = { 'Accept': '*/*' };
            if (token()) h['Authorization'] = 'Bearer ' + token();
            const res = await fetch(path, { credentials:'same-origin', headers: h });
            if (!res.ok) {
                let msg = `다운로드 실패 (${res.status})`;
                try { const t = await res.text(); const j = JSON.parse(t); if (j.message) msg = j.message; } catch {}
                throw new Error(msg);
            }
            const cd = res.headers.get('Content-Disposition') || '';
            const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
            const name = filename || (m ? decodeURIComponent(m[1] || m[2]) : 'download.csv');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            // Chrome download manager 가 blob 을 가져갈 충분한 시간 확보(5s).
            setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 5000);
        }
    };
})();

/**
 * 경량 Markdown → HTML 렌더러.
 * 지원: # ## ### 헤딩, **bold**, *italic*, `inline code`, - / * 리스트, 1. 2. 번호리스트,
 *      줄바꿈, 단락. HTML escape 후 변환하므로 XSS 안전.
 * 외부 라이브러리 의존 없이 어드민 페이지에 충분.
 */
function renderMarkdown(text) {
    if (text == null) return '';
    // 1) HTML escape
    let s = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 2) 코드 펜스 ```...``` (간단)
    s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="md-pre">${code.trim()}</pre>`);

    // 3) inline code `xxx`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 4) 헤딩 ###, ##, #
    s = s.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^#\s+(.+)$/gm,  '<h1>$1</h1>');

    // 5) bold **xx**, italic *xx*
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    // 6) 리스트 (- item / * item / 1. item) 묶기
    const lines = s.split(/\n/);
    const out = [];
    let inUl = false, inOl = false;
    for (const line of lines) {
        const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
        const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
        if (ulMatch) {
            if (inOl) { out.push('</ol>'); inOl = false; }
            if (!inUl) { out.push('<ul>'); inUl = true; }
            out.push(`<li>${ulMatch[1]}</li>`);
        } else if (olMatch) {
            if (inUl) { out.push('</ul>'); inUl = false; }
            if (!inOl) { out.push('<ol>'); inOl = true; }
            out.push(`<li>${olMatch[1]}</li>`);
        } else {
            if (inUl) { out.push('</ul>'); inUl = false; }
            if (inOl) { out.push('</ol>'); inOl = false; }
            out.push(line);
        }
    }
    if (inUl) out.push('</ul>');
    if (inOl) out.push('</ol>');
    s = out.join('\n');

    // 7) 단락: 빈 줄로 구분된 블록을 <p> 로 (헤딩/리스트/pre 는 건너뜀)
    const blocks = s.split(/\n{2,}/).map(b => {
        const t = b.trim();
        if (!t) return '';
        if (/^<(h\d|ul|ol|pre)/.test(t)) return t;
        return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    });
    return blocks.join('\n');
}

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
