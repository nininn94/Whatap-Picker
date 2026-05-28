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

    function pageOrder(s) {
        return (s.pages || []).map(p => p.id);
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

        lookup(key) {
            return this.values[key];
        },

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
            const next = this.computeNextPageId(currentId);
            return next !== null;
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
            const cur = this.pages[this.currentIdx];
            const nextId = this.computeNextPageId(cur.id);
            if (!nextId) return;
            const idx = this.pages.findIndex(p => p.id === nextId);
            if (idx >= 0) this.currentIdx = idx;
        },

        prev() {
            if (this.currentIdx > 0) this.currentIdx--;
        },

        isLastPageVisible() {
            const cur = this.pages[this.currentIdx];
            if (!cur) return false;
            return this.computeNextPageId(cur.id) === null;
        },

        buildPayload() {
            // surveyPayload.* 키들을 nested object로 재구성
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
                privacyConsent: !!this.values.privacyConsent,
                marketingConsent: !!this.values.marketingConsent
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
            this.submitting = true;
            try {
                const res = await fetch('/api/leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.buildPayload())
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ message: '제출에 실패했습니다.' }));
                    this.error = err.message || '제출에 실패했습니다.';
                    this.submitting = false;
                    return;
                }
                window.location.href = `/survey/${encodeURIComponent(eventCode)}/complete`;
            } catch (e) {
                this.error = '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
                this.submitting = false;
            }
        }
    };
}
