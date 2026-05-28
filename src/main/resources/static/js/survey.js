/* WhaTap Picker - 설문 폼 동적 렌더링 + 분기 표시 + 인라인 검증 피드백 */

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

    function validateField(field, v) {
        const empty = field.type === 'CHECKBOX_MULTI'
            ? !Array.isArray(v) || v.length === 0
            : (v === '' || v === null || v === undefined);
        if (empty) return field.type === 'CHECKBOX_MULTI'
            ? '하나 이상 선택해 주세요.'
            : '필수 항목입니다.';
        if (field.type === 'PHONE' && field.pattern) {
            try {
                if (!new RegExp(field.pattern).test(v)) {
                    return '휴대폰 번호 형식이 올바르지 않습니다. (예: 01012345678 — 010 다음 0 불가)';
                }
            } catch {}
        }
        if (field.type === 'EMAIL') {
            if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v)) {
                return '이메일 형식이 올바르지 않습니다. (예: name@company.com)';
            }
        }
        return '';
    }

    return {
        schema,
        pages: schema.pages || [],
        consents: schema.consents || [],
        values: buildValues(schema),
        currentIdx: 0,
        submitting: false,
        error: '',
        attempted: {},        // pageIdx → true (사용자가 다음/제출 시도한 페이지)
        consentsAttempted: false,

        get canGoPrev() { return this.currentIdx > 0; },
        get currentPage() { return this.pages[this.currentIdx] || null; },

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

        /** 페이지의 (visible × required) 필드별 에러 맵 — 부수효과 없음. */
        checkPage(page) {
            const errs = {};
            if (!page) return errs;
            for (const f of page.fields || []) {
                if (!f.required) continue;
                if (!this.visibleField(f)) continue;
                const msg = validateField(f, this.values[f.key]);
                if (msg) errs[f.key] = msg;
            }
            return errs;
        },

        get currentPageErrors() { return this.checkPage(this.currentPage); },
        get currentPageValid()  { return Object.keys(this.currentPageErrors).length === 0; },
        get missingCount()      { return Object.keys(this.currentPageErrors).length; },
        get consentsValid()     { return !this.consents.some(c => c.required && !this.values[c.key]); },

        /** 사용자가 시도한 페이지에서만 에러 표시 → 처음부터 빨간색으로 도배되지 않게. */
        errorFor(fieldKey) {
            if (!this.attempted[this.currentIdx]) return '';
            return this.currentPageErrors[fieldKey] || '';
        },
        consentError(consent) {
            if (!this.consentsAttempted) return '';
            return (consent.required && !this.values[consent.key]) ? '동의가 필요합니다.' : '';
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

        next() {
            this.attempted[this.currentIdx] = true;
            if (!this.currentPageValid) {
                this.error = `입력이 필요한 항목이 ${this.missingCount}개 있습니다. 빨간 표시를 확인해 주세요.`;
                this.$nextTick(() => this.focusFirstError());
                return;
            }
            this.error = '';
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

        focusFirstError() {
            // 현재 화면에서 .field.has-error 첫 번째를 찾아 포커스 + 스크롤
            const el = document.querySelector('.page .field.has-error input, .page .field.has-error select, .page .field.has-error textarea');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => el.focus({ preventScroll: true }), 220);
            } else {
                this.scrollToTop();
            }
        },

        /** 진짜 마지막 페이지(배열 마지막)일 때만 동의·제출 섹션 표시. */
        isLastPageVisible() {
            const last = this.pages[this.pages.length - 1];
            if (!last) return false;
            const cur = this.pages[this.currentIdx];
            return cur && cur.id === last.id;
        },

        get canSubmit() {
            return !this.submitting && this.currentPageValid && this.consentsValid;
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
            this.attempted[this.currentIdx] = true;
            this.consentsAttempted = true;
            this.error = '';

            if (!this.currentPageValid) {
                this.error = `입력이 필요한 항목이 ${this.missingCount}개 있습니다. 빨간 표시를 확인해 주세요.`;
                this.$nextTick(() => this.focusFirstError());
                return;
            }
            if (!this.consentsValid) {
                this.error = '필수 동의 항목을 모두 체크해 주세요.';
                this.scrollToTop();
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
                    this.scrollToTop();
                    return;
                }
                window.location.href = `/survey/${encodeURIComponent(eventCode)}/complete`;
            } catch (e) {
                this.error = '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
                this.submitting = false;
                this.scrollToTop();
            }
        }
    };
}
