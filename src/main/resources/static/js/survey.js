/* WhaTap Picker - 설문 폼 동적 렌더링 + 분기 표시 */

function surveyForm() {
    const schema = schemaJson;

    function buildValues(s) {
        const v = {};
        for (const page of s.pages || []) {
            for (const f of page.fields || []) {
                if (f.type === 'CHECKBOX_MULTI') v[f.key] = [];
                else v[f.key] = '';
            }
        }
        for (const c of s.consents || []) v[c.key] = false;
        return v;
    }

    return {
        schema,
        pages: schema.pages || [],
        consents: schema.consents || [],
        values: buildValues(schema),
        currentIdx: 0,
        submitting: false,
        error: '',

        get canGoPrev() { return this.currentIdx > 0; },

        visiblePage(pageId) {
            return this.pages[this.currentIdx] && this.pages[this.currentIdx].id === pageId;
        },

        visibleField(field) {
            if (!field.showWhen) return true;
            return Object.entries(field.showWhen).every(([k, cond]) => {
                const v = this.lookup(k);
                if (typeof cond === 'string') return v === cond;
                if (cond.contains !== undefined) return Array.isArray(v) && v.includes(cond.contains);
                if (cond.not_only !== undefined) {
                    return Array.isArray(v) && v.length > 0 && !(v.length === 1 && v[0] === cond.not_only);
                }
                return true;
            });
        },

        lookup(key) { return this.values[key]; },

        optionsFor(field) {
            if (field.options) return field.options;
            if (field.optionsRef && schema.options && schema.options[field.optionsRef]) {
                return schema.options[field.optionsRef];
            }
            return [];
        },

        toggleMulti(key, value) {
            const arr = this.values[key] || [];
            const i = arr.indexOf(value);
            if (i >= 0) arr.splice(i, 1); else arr.push(value);
            this.values[key] = [...arr];
        },

        hasNextPage(currentId) {
            return !this.isLastPageVisible() && this.computeNextPageId(currentId) !== null;
        },

        computeNextPageId(currentId) {
            const cur = this.pages.find(p => p.id === currentId);
            if (!cur || !cur.branching) {
                const idx = this.pages.findIndex(p => p.id === currentId);
                return (idx >= 0 && idx + 1 < this.pages.length) ? this.pages[idx + 1].id : null;
            }
            for (const rule of cur.branching) {
                if (!rule.when) return rule.goTo;
                const allMatch = Object.entries(rule.when).every(([k, v]) => this.lookup(k) === v);
                if (allMatch) return rule.goTo;
            }
            return null;
        },

        /** 현재 페이지의 visible + required 필드가 모두 채워져 있는지 검증.
         *  실패 시 첫 미달 필드 메시지 표시 + false 반환. */
        validateCurrentPage() {
            this.error = '';
            const cur = this.pages[this.currentIdx];
            if (!cur) return true;
            for (const field of cur.fields || []) {
                if (!field.required) continue;
                if (!this.visibleField(field)) continue;
                const v = this.values[field.key];
                const empty = field.type === 'CHECKBOX_MULTI'
                    ? !Array.isArray(v) || v.length === 0
                    : (v === '' || v === null || v === undefined);
                if (empty) {
                    this.error = `'${field.label}' 을(를) 입력하거나 선택해 주세요.`;
                    return false;
                }
                if (field.type === 'PHONE' && field.pattern) {
                    try {
                        if (!new RegExp(field.pattern).test(v)) {
                            this.error = `'${field.label}' 형식이 올바르지 않습니다.`;
                            return false;
                        }
                    } catch {}
                }
                if (field.type === 'EMAIL') {
                    // 형식 보강: a@a.com 같은 짧은 도메인 막기 위해 TLD 최소 2자 + 도메인 점 2부 이상
                    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v)) {
                        this.error = `'${field.label}' 형식이 올바르지 않습니다.`;
                        return false;
                    }
                }
            }
            return true;
        },

        next() {
            if (!this.validateCurrentPage()) {
                this.scrollToError();
                return;
            }
            const cur = this.pages[this.currentIdx];
            const nextId = this.computeNextPageId(cur.id);
            if (!nextId) return;
            const idx = this.pages.findIndex(p => p.id === nextId);
            if (idx >= 0) {
                this.currentIdx = idx;
                this.scrollToTop();
            }
        },

        prev() {
            if (this.currentIdx > 0) {
                this.currentIdx--;
                this.error = '';
                this.scrollToTop();
            }
        },

        scrollToTop() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        scrollToError() {
            // 에러 메시지가 보이게 top 으로
            this.scrollToTop();
        },

        /** 진짜 마지막 페이지(배열 마지막)일 때만 동의·제출 섹션 표시. */
        isLastPageVisible() {
            const last = this.pages[this.pages.length - 1];
            if (!last) return false;
            const cur = this.pages[this.currentIdx];
            return cur && cur.id === last.id;
        },

        buildPayload() {
            const top = {
                eventCode,
                firstName: this.values.firstName,
                lastName: this.values.lastName,
                company: this.values.company,
                email: this.values.email,
                phone: this.values.phone,
                industry: this.values.industry,
                jobFunction: this.values.jobFunction,
                jobLevel: this.values.jobLevel,
                companySize: this.values.companySize,
                employeeCountRange: this.values.employeeCountRange,
                monitoringStatus: this.values.monitoringStatus,
                surveyPayload: {},
                adoptionBlocker: this.values.adoptionBlocker || null,
                interestProducts: this.values.interestProducts || [],
                planWithinYear: this.values.planWithinYear || null,
                consultationPreference: this.values.consultationPreference || null,
                // 동의 1개로 통합됨 — 백엔드는 두 필드 모두 true 요구.
                privacyConsent: !!(this.values.fullConsent ?? this.values.privacyConsent),
                marketingConsent: !!(this.values.fullConsent ?? this.values.marketingConsent)
            };
            for (const [k, v] of Object.entries(this.values)) {
                if (!k.startsWith('surveyPayload.')) continue;
                if (v === '' || v === null || (Array.isArray(v) && v.length === 0)) continue;
                const path = k.split('.').slice(1);
                let node = top.surveyPayload;
                for (let i = 0; i < path.length - 1; i++) {
                    if (!node[path[i]]) node[path[i]] = {};
                    node = node[path[i]];
                }
                node[path[path.length - 1]] = v;
            }
            return top;
        },

        async submit() {
            this.error = '';
            // 마지막 페이지 visible required 검증
            if (!this.validateCurrentPage()) { this.scrollToError(); return; }
            // 동의 모두 체크되었는지
            const consentMissing = this.consents.some(c => c.required && !this.values[c.key]);
            if (consentMissing) {
                this.error = '동의 항목에 체크해 주세요.';
                this.scrollToError();
                return;
            }
            this.submitting = true;
            try {
                const res = await fetch('/api/leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(this.buildPayload())
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ message: '제출에 실패했습니다.' }));
                    this.error = err.message || '제출에 실패했습니다.';
                    this.submitting = false;
                    this.scrollToError();
                    return;
                }
                window.location.href = `/survey/${encodeURIComponent(eventCode)}/complete`;
            } catch (e) {
                this.error = '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
                this.submitting = false;
                this.scrollToError();
            }
        }
    };
}
