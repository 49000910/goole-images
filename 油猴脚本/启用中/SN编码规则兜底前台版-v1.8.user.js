// ==UserScript==
// @name         SN编码规则兜底前台版
// @namespace    mes.sn.rule.fallback.ui
// @version      1.8
// @description  SN接口查不到编码时按前台规则兜底；支持接口一强字段、接口一排除编码、左侧条码清洗、接口二转换编码
// @match        https://w3.huawei.com/mespmm/wipweb*
// @match        https://mes.huawei.com/mespmm/rptwebnew*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__SN_RULE_FALLBACK_UI__) return;
  window.__SN_RULE_FALLBACK_UI__ = true;

  const RULE_KEY = 'sn_code_rule_fallback_rules_v2';
  const ENABLE_KEY = 'sn_code_rule_fallback_enabled_v2';
  const STRONG_FIELD_KEY = 'sn_code_rule_fallback_strong_fields_v1';
  const EXCLUDE_CODE_KEY = 'sn_code_rule_fallback_exclude_codes_v1';
  const LEFT_CLEAN_KEY = 'sn_code_left_clean_rules_v1';
  const CONVERT_KEY = 'sn_code_rule_fallback_api2_convert_v1';

  const EMS_BASE = 'https://w3.huawei.com/mespmm/gateway/com.huawei.supply.mes.mesplus.pspw:mespmmpreallservice/mespmmpreallone/services/emsComponentDataInfo/find/page';
  const EMS_PAGE_SIZE = 100;
  const EMS_MODES = [[0, 0], [7, 0]];

  let enabled = localStorage.getItem(ENABLE_KEY) !== '0';

  function toStr(v) { return v == null ? '' : String(v).trim(); }

  function normSn(v) {
    v = toStr(v).replace(/\u00A0/g, ' ').replace(/\s+/g, '');
    if (v.indexOf('\uff1a') >= 0) v = v.split('\uff1a').pop();
    if (v.indexOf(':') >= 0) v = v.split(':').pop();
    return v.toUpperCase();
  }

  function normCode(v) { return toStr(v).replace(/\u00A0/g, ' ').replace(/\s+/g, '').toUpperCase(); }

  function normSearchText(v) {
    return toStr(v).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/\uff1a/g, ':').toUpperCase();
  }

  function codeExact(v) { return normCode(v); }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escReg(s) {
    const sp = '\\^$.*+?()[]{}|';
    return String(s).split('').map(function (ch) { return sp.indexOf(ch) >= 0 ? '\\' + ch : ch; }).join('');
  }

  function wildcardToRegExp(pattern) {
    pattern = normSn(pattern).replace(/\uff0a/g, '*').replace(/\uff1f/g, '?');
    let out = '^';
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === '?') { out += '[A-Z0-9]'; continue; }
      if (ch === '*') {
        let j = i; while (j < pattern.length && pattern[j] === '*') j++;
        const count = j - i; const isEnd = j === pattern.length;
        out += (count === 1 && isEnd) ? '[A-Z0-9]*' : '[A-Z0-9]{' + count + '}';
        i = j - 1; continue;
      }
      out += escReg(ch);
    }
    return new RegExp(out + '$', 'i');
  }

  function normalizeRuleType(type) {
    type = toStr(type);
    if (type === '\u5f00\u5934' || type === '\u524d\u7f00') return '\u5f00\u5934\u662f';
    if (type === '\u5305\u62ec' || type === '\u542b\u6709') return '\u5305\u542b';
    if (type === '\u7cbe\u786e' || type === '\u76f8\u7b49') return '\u7b49\u4e8e';
    if (type === '\u901a\u914d\u7b26') return '\u901a\u914d';
    if (['\u5305\u542b', '\u5f00\u5934\u662f', '\u7b49\u4e8e', '\u901a\u914d'].indexOf(type) >= 0) return type;
    return '\u5305\u542b';
  }

  function getEffectiveType(type, pattern) {
    type = normalizeRuleType(type);
    pattern = normSn(pattern);
    if (pattern.indexOf('*') >= 0 || pattern.indexOf('?') >= 0) return '\u901a\u914d';
    return type;
  }

  function loadRules() {
    try {
      const arr = JSON.parse(localStorage.getItem(RULE_KEY) || '[]');
      if (Array.isArray(arr)) return arr.filter(function (r) { return r && r.code && r.pattern; }).map(function (r) {
        return { code: normCode(r.code), type: normalizeRuleType(r.type || '\u5305\u542b'), pattern: normSn(r.pattern), note: toStr(r.note || '') };
      });
    } catch (e) {}
    return [];
  }

  function saveRules(rules) {
    rules = rules || [];
    localStorage.setItem(RULE_KEY, JSON.stringify(rules.filter(function (r) { return r && r.code && r.pattern; }).map(function (r) {
      return { code: normCode(r.code), type: normalizeRuleType(r.type), pattern: normSn(r.pattern), note: toStr(r.note || '') };
    })));
    updateCounts();
  }

  function loadStrongFields() {
    try {
      const arr = JSON.parse(localStorage.getItem(STRONG_FIELD_KEY) || '[]');
      if (Array.isArray(arr)) return arr.filter(function (r) { return r && r.field && r.code; }).map(function (r) {
        return { field: normSearchText(r.field), code: normCode(r.code), note: toStr(r.note || '') };
      });
    } catch (e) {}
    return [];
  }

  function saveStrongFields(rules) {
    rules = rules || [];
    localStorage.setItem(STRONG_FIELD_KEY, JSON.stringify(rules.filter(function (r) { return r && r.field && r.code; }).map(function (r) {
      return { field: normSearchText(r.field), code: normCode(r.code), note: toStr(r.note || '') };
    })));
    updateCounts();
  }

  function matchStrongFieldInText(text, rulesOverride) {
    text = normSearchText(text);
    if (!text) return null;
    const rules = rulesOverride || loadStrongFields();
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const field = normSearchText(r.field); const code = normCode(r.code);
      if (!field || !code) continue;
      if (isExcludedCodeForEms(code)) continue;
      if (text.indexOf(field) >= 0) return { index: i + 1, field: field, code: code, note: r.note || '' };
    }
    return null;
  }

  async function fetchEmsPageForStrongTest(sn, pageSize, pageNo, a, b) {
    const url = EMS_BASE + '/' + pageSize + '/' + pageNo + '/' + a + '/' + b;
    const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barCode: '', snStr: sn, itemName: '', componentType: '', createdFrom: '', createdTo: '' }) });
    return JSON.parse(await r.text());
  }

  async function queryEmsStrongFieldBySn(snRaw) {
    const sn = normSn(snRaw);
    if (!sn) return { sn: '', hit: null, rows: 0, pages: 0, mode: '-' };
    let rules = [];
    try { rules = readStrongFieldsFromTable().filter(function (r) { return r.field && r.code; }); } catch (e) { rules = loadStrongFields(); }
    let totalRows = 0, totalPagesChecked = 0;
    for (let m = 0; m < EMS_MODES.length; m++) {
      const a = EMS_MODES[m][0], b = EMS_MODES[m][1];
      let page = 1, totalPages = 1;
      do {
        const j = await fetchEmsPageForStrongTest(sn, EMS_PAGE_SIZE, page, a, b);
        totalPagesChecked++;
        const vo = j && j.resultObjVO || {};
        const pageVO = vo.pageVO || {};
        const rows = vo.result || [];
        if (Array.isArray(rows)) totalRows += rows.length;
        const hit = matchStrongFieldInText(JSON.stringify(j), rules);
        if (hit) return { sn: sn, hit: hit, rows: totalRows, pages: totalPagesChecked, mode: a + '/' + b };
        totalPages = Number(pageVO.totalPages || 1); page++;
      } while (page <= totalPages);
    }
    return { sn: sn, hit: null, rows: totalRows, pages: totalPagesChecked, mode: '-' };
  }

  function loadExcludeCodes() {
    try {
      const arr = JSON.parse(localStorage.getItem(EXCLUDE_CODE_KEY) || '[]');
      if (Array.isArray(arr)) return arr.map(codeExact).filter(Boolean);
    } catch (e) {}
    return [];
  }

  function loadLeftCleanRules() {
    try {
      const arr = JSON.parse(localStorage.getItem(LEFT_CLEAN_KEY) || '[]');
      if (Array.isArray(arr)) {
        const out = [];
        arr.forEach(function (x) {
          x = toStr(x).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/\uff1a/g, ':').replace(/\uff0d/g, '-');
          if (x && out.indexOf(x) < 0) out.push(x);
        });
        return out;
      }
    } catch (e) {}
    return [];
  }

  function saveLeftCleanRules(rules) {
    rules = rules || [];
    const clean = [];
    rules.forEach(function (x) { x = toStr(x).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/\uff1a/g, ':').replace(/\uff0d/g, '-'); if (x && clean.indexOf(x) < 0) clean.push(x); });
    localStorage.setItem(LEFT_CLEAN_KEY, JSON.stringify(clean));
    updateCounts();
  }

  function readLeftCleanRulesFromBox() {
    const el = document.getElementById('sn-left-clean-text');
    return (el ? el.value : '').split(/[\n\r]+/).map(toStr).filter(Boolean);
  }

  function saveExcludeCodes(codes) {
    codes = codes || [];
    const unique = [];
    codes.map(codeExact).filter(Boolean).forEach(function (x) { if (unique.indexOf(x) < 0) unique.push(x); });
    localStorage.setItem(EXCLUDE_CODE_KEY, JSON.stringify(unique));
    updateCounts();
  }

  function isExcludedCodeForEms(code) {
    code = codeExact(code);
    if (!code) return false;
    return loadExcludeCodes().indexOf(code) >= 0;
  }

  function shouldRemoveCodeValueFromEms(v) { return isExcludedCodeForEms(normCode(v)); }

  function sanitizeExcludedCodesDeepForEms(obj) {
    if (obj == null) return obj;
    if (typeof obj === 'string' || typeof obj === 'number') return shouldRemoveCodeValueFromEms(obj) ? '' : obj;
    if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) obj[i] = sanitizeExcludedCodesDeepForEms(obj[i]); return obj; }
    if (typeof obj === 'object') { Object.keys(obj).forEach(function (k) { obj[k] = sanitizeExcludedCodesDeepForEms(obj[k]); }); return obj; }
    return obj;
  }

  function injectStrongCodeToEmsResult(j, hit) {
    if (!j || !hit || !hit.code || isExcludedCodeForEms(hit.code)) return j;
    if (!j.resultObjVO) j.resultObjVO = {};
    if (!Array.isArray(j.resultObjVO.result)) j.resultObjVO.result = [];
    j.resultObjVO.result.unshift({ __snRuleStrongField: true, __snRuleField: hit.field, __snRuleNote: hit.note || '',
      partNo: hit.code, itemCode: hit.code, materialCode: hit.code, code: hit.code });
    return j;
  }

  function matchRule(snRaw) {
    const sn = normSn(snRaw);
    if (!sn) return null;
    const rules = loadRules();
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const value = normSn(r.pattern); const type = getEffectiveType(r.type, value);
      if (!r.code || !value) continue;
      let ok = false;
      if (type === '\u5f00\u5934\u662f') ok = sn.startsWith(value);
      else if (type === '\u5305\u542b') ok = sn.indexOf(value) >= 0;
      else if (type === '\u7b49\u4e8e') ok = sn === value;
      else if (type === '\u901a\u914d') ok = wildcardToRegExp(value).test(sn);
      else ok = sn.indexOf(value) >= 0;
      if (ok) return { sn: sn, code: r.code, type: type, pattern: r.pattern, note: r.note || '', index: i + 1 };
    }
    return null;
  }

  // ===== 接口二转换编码 =====
  function loadConvertRules() {
    try {
      const arr = JSON.parse(localStorage.getItem(CONVERT_KEY) || '[]');
      if (Array.isArray(arr)) return arr.filter(function (r) { return r && r.from && r.to; }).map(function (r) {
        return { from: normCode(r.from), to: normCode(r.to), note: toStr(r.note || '') };
      });
    } catch (e) {}
    return [];
  }

  function saveConvertRules(rules) {
    rules = rules || [];
    localStorage.setItem(CONVERT_KEY, JSON.stringify(rules.filter(function (r) { return r && r.from && r.to; }).map(function (r) {
      return { from: normCode(r.from), to: normCode(r.to), note: toStr(r.note || '') };
    })));
    updateCounts();
  }

  function readConvertRulesFromTable() {
    const rows = Array.from(document.querySelectorAll('#sn-convert-tbody tr'));
    const rules = [];
    rows.forEach(function (tr) {
      const fromEl = tr.querySelector('.sn-convert-from'); const toEl = tr.querySelector('.sn-convert-to'); const noteEl = tr.querySelector('.sn-convert-note');
      const from = normCode(fromEl ? fromEl.value : ''); const to = normCode(toEl ? toEl.value : ''); const note = toStr(noteEl ? noteEl.value : '');
      if (!from && !to) return;
      rules.push({ from: from, to: to, note: note });
    });
    return rules;
  }

  function findConvertedCodes(code) {
    code = normCode(code);
    if (!code) return [];
    const rules = loadConvertRules();
    const results = [];
    for (let i = 0; i < rules.length; i++) {
      if (normCode(rules[i].from) === code) results.push(normCode(rules[i].to));
      if (normCode(rules[i].to) === code) results.push(normCode(rules[i].from));
    }
    return results;
  }

  // ===== fetch 拦截 =====
  function getFetchUrl(input) { return typeof input === 'string' ? input : (input && input.url ? input.url : ''); }
  function getFetchBody(input, init) { return (init && init.body) ? init.body : ''; }
  function isEmsFindUrl(url) { return /emsComponentDataInfo\/find\/page/i.test(String(url || '')); }
  function isOpenApiUrl(url) { return /openapi\/getSnAttr/i.test(String(url || '')); }
  function jsonResponseLike(res, j) {
    const headers = new Headers(res.headers); headers.set('content-type', 'application/json;charset=utf-8');
    return new Response(JSON.stringify(j), { status: res.status, statusText: res.statusText, headers: headers });
  }

  const rawFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await rawFetch.apply(this, arguments);
    try {
      enabled = localStorage.getItem(ENABLE_KEY) !== '0';
      if (!enabled) return res;
      const url = getFetchUrl(input);

      if (isEmsFindUrl(url)) {
        const clone = res.clone();
        let text = '';
        try { text = await clone.text(); } catch (e) { return res; }
        let j = null;
        try { j = JSON.parse(text); } catch (e2) { return res; }
        let changed = false;
        const hit = matchStrongFieldInText(text);
        const before = JSON.stringify(j);
        j = sanitizeExcludedCodesDeepForEms(j);
        if (before !== JSON.stringify(j)) { changed = true; console.log('[SN\u89c4\u5219\u515c\u5e95] \u63a5\u53e3\u4e00\u5df2\u6e05\u9664\u6392\u9664\u7f16\u7801'); }
        if (hit && hit.code && !isExcludedCodeForEms(hit.code)) {
          injectStrongCodeToEmsResult(j, hit); changed = true;
          console.log('[SN\u89c4\u5219\u515c\u5e95] \u63a5\u53e3\u4e00\u5f3a\u5b57\u6bb5\u547d\u4e2d:', hit.field, '=>', hit.code);
        }
        if (changed) return jsonResponseLike(res, j);
        return res;
      }

      if (isOpenApiUrl(url)) {
        const reqBody = getFetchBody(input, init);
        let sn = '';
        if (typeof reqBody === 'string') { try { sn = JSON.parse(reqBody).sn || ''; } catch (e) {} }
        if (!sn) { console.log('[SN\u89c4\u5219\u515c\u5e95] openapi \u672a\u53d6\u5230SN'); return res; }
        const clone = res.clone();
        let j = null;
        try { j = await clone.json(); } catch (e) { return res; }
        if (!j || typeof j !== 'object') return res;
        if (!j.resultObjVO) j.resultObjVO = {};
        const vo = j.resultObjVO;
        const nowCode = normCode(vo.partNo || '');
        if (nowCode) {
          const converteds = findConvertedCodes(nowCode);
          if (converteds.length) {
            for (let ci = 0; ci < converteds.length; ci++) {
              const altCode = converteds[ci];
              if (normCode(altCode) === nowCode) continue;
              if (!vo.result) vo.result = [];
              vo.result.unshift({ partNo: altCode, itemCode: altCode, materialCode: altCode, code: altCode, __convertFrom: nowCode, __convertTo: altCode });
            }
            console.log('[SN\u89c4\u5219\u515c\u5e95] \u63a5\u53e3\u4e8c\u8f6c\u6362\u7f16\u7801:', nowCode, '=> \u9644\u52a0', converteds.join(', '));
            return jsonResponseLike(res, j);
          }
          console.log('[SN\u89c4\u5219\u515c\u5e95] \u63a5\u53e3\u4e8c\u5df2\u6709\u7f16\u7801:', sn, nowCode);
          return jsonResponseLike(res, j);
        }
        const hit = matchRule(sn);
        if (!hit || !hit.code) { console.log('[SN\u89c4\u5219\u515c\u5e95] SN\u89c4\u5219\u672a\u547d\u4e2d:', sn); return jsonResponseLike(res, j); }
        j.resultObjVO = Object.assign({}, vo, { partNo: hit.code, __ruleFallback: true, __ruleType: hit.type, __rulePattern: hit.pattern });
        console.log('[SN\u89c4\u5219\u515c\u5e95] SN\u89c4\u5219\u547d\u4e2d:', sn, '=>', hit.code, '\u65b9\u5f0f:', hit.type, '\u89c4\u5219:', hit.pattern);
        return jsonResponseLike(res, j);
      }
      return res;
    } catch (e) { console.warn('[SN\u89c4\u5219\u515c\u5e95] \u5f02\u5e38:', e); return res; }
  };

  // ===== CSS =====
  const css = ''
    + '#sn-rule-mini{position:fixed;right:12px;bottom:58px;z-index:2147483646;background:#fff;color:#222;border:1px solid #cbd5e1;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.12);font-family:"Segoe UI",system-ui,sans-serif;user-select:none;white-space:nowrap;transition:box-shadow .15s,border-color .15s}'
    + '#sn-rule-mini:hover{box-shadow:0 4px 16px rgba(0,0,0,.18);border-color:#3b82f6}'
    + '#sn-rule-mini b{color:#1d4ed8;margin:0 1px}'
    + '#sn-rule-mini .sn-state-on{color:#16a34a}'
    + '#sn-rule-mini .sn-state-off{color:#dc2626}'
    + '#sn-rule-modal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:880px;max-width:calc(100vw - 40px);height:680px;max-height:calc(100vh - 40px);background:#fff;color:#1e293b;border:1px solid #cbd5e1;border-radius:10px;z-index:2147483647;box-shadow:0 12px 40px rgba(0,0,0,.2);font-size:12px;font-family:"Segoe UI",system-ui,sans-serif;overflow:hidden;display:flex;flex-direction:column}'
    + '#sn-rule-modal.sn-minimized{height:auto !important;max-height:none}'
    + '#sn-rule-modal.sn-minimized .sn-modal-body{display:none}'
    + '.sn-modal-header{height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#1e293b;color:#fff;cursor:move;user-select:none;flex-shrink:0}'
    + '.sn-modal-header .sn-title{font-weight:600;font-size:14px}'
    + '.sn-modal-header .sn-hdr-btns{display:flex;gap:6px}'
    + '.sn-modal-header .sn-hdr-btn{width:24px;height:24px;border:none;border-radius:4px;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background .15s}'
    + '.sn-modal-header .sn-hdr-btn:hover{background:rgba(255,255,255,.3)}'
    + '.sn-modal-toolbar{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;flex-shrink:0}'
    + '.sn-modal-toolbar label{display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;color:#475569}'
    + '.sn-modal-toolbar .sn-msg{margin-left:auto;color:#16a34a;font-size:12px}'
    + '.sn-modal-body{flex:1;overflow-y:auto;padding:14px}'
    + '.sn-section{margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}'
    + '.sn-section-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0}'
    + '.sn-section-header .sn-sec-title{font-weight:600;color:#1e293b;font-size:13px}'
    + '.sn-section-header .sn-sec-hint{color:#94a3b8;font-size:11px;margin-left:8px;font-weight:400}'
    + '.sn-section-body{padding:10px 12px}'
    + '.sn-test-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}'
    + '.sn-test-bar input{height:26px;padding:3px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;outline:none}'
    + '.sn-test-bar input:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.15)}'
    + '.sn-test-bar .sn-test-btn{height:26px;padding:0 12px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;color:#475569;transition:all .15s}'
    + '.sn-test-bar .sn-test-btn:hover{background:#f1f5f9;border-color:#94a3b8}'
    + '.sn-test-bar .sn-test-hint{color:#94a3b8;font-size:11px}'
    + 'table.sn-table{width:100%;border-collapse:collapse;font-size:12px}'
    + 'table.sn-table th{border:1px solid #e2e8f0;padding:5px 6px;text-align:left;background:#f8fafc;color:#64748b;font-weight:500}'
    + 'table.sn-table td{border:1px solid #e2e8f0;padding:4px 6px}'
    + 'table.sn-table input,table.sn-table select{width:100%;height:24px;box-sizing:border-box;padding:2px 6px;border:1px solid #cbd5e1;border-radius:3px;font-size:12px;outline:none}'
    + 'table.sn-table input:focus,table.sn-table select:focus{border-color:#3b82f6}'
    + '.sn-del-btn{height:24px;padding:0 8px;border:1px solid #fca5a5;border-radius:3px;background:#fff;color:#dc2626;cursor:pointer;font-size:11px;transition:all .15s}'
    + '.sn-del-btn:hover{background:#fef2f2}'
    + '.sn-add-btn{height:22px;padding:0 10px;border:1px solid #cbd5e1;border-radius:3px;background:#fff;cursor:pointer;font-size:11px;color:#475569;transition:all .15s}'
    + '.sn-add-btn:hover{background:#f1f5f9}'
    + '.sn-section-footer{margin-top:6px;color:#94a3b8;line-height:18px;font-size:11px}'
    + 'textarea.sn-textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:4px;padding:6px 8px;font-size:12px;line-height:18px;outline:none;resize:vertical}'
    + 'textarea.sn-textarea:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.15)}'
    + '.sn-save-btn{height:28px;padding:0 16px;border:1px solid #2563eb;border-radius:4px;background:#2563eb;color:#fff;cursor:pointer;font-size:12px;transition:all .15s}'
    + '.sn-save-btn:hover{background:#1d4ed8}'
    + '.sn-clear-btn{height:28px;padding:0 16px;border:1px solid #fca5a5;border-radius:4px;background:#fff;color:#dc2626;cursor:pointer;font-size:12px;transition:all .15s}'
    + '.sn-clear-btn:hover{background:#fef2f2}'
    ;

  // ===== UI =====
  function updateCounts() {
    const map = { 'sn-rule-count': loadRules().length, 'sn-strong-count': loadStrongFields().length,
      'sn-exclude-count': loadExcludeCodes().length, 'sn-left-clean-count': loadLeftCleanRules().length, 'sn-convert-count': loadConvertRules().length };
    Object.keys(map).forEach(function (id) { const el = document.getElementById(id); if (el) el.textContent = String(map[id]); });
    const stateEl = document.getElementById('sn-rule-state');
    if (stateEl) { stateEl.textContent = enabled ? '\u5f00' : '\u5173'; stateEl.className = enabled ? 'sn-state-on' : 'sn-state-off'; }
  }

  function createMiniButton() {
    if (document.getElementById('sn-rule-mini')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const btn = document.createElement('div');
    btn.id = 'sn-rule-mini';
    btn.innerHTML = 'SN\u89c4\u5219:<b id="sn-rule-count">' + loadRules().length + '</b>'
      + ' \u5f3a\u5b57\u6bb5:<b id="sn-strong-count">' + loadStrongFields().length + '</b>'
      + ' \u6392\u9664:<b id="sn-exclude-count">' + loadExcludeCodes().length + '</b>'
      + ' \u6e05\u6d17:<b id="sn-left-clean-count">' + loadLeftCleanRules().length + '</b>'
      + ' \u8f6c\u6362:<b id="sn-convert-count">' + loadConvertRules().length + '</b>'
      + ' \u72b6\u6001:<b id="sn-rule-state" class="' + (enabled ? 'sn-state-on' : 'sn-state-off') + '">' + (enabled ? '\u5f00' : '\u5173') + '</b>';
    btn.addEventListener('click', showRuleModal);
    makeDraggable(btn, btn, true);
    document.body.appendChild(btn);
  }

  function makeDraggable(el, handle, keepInViewport) {
    let dx = 0, dy = 0, dragging = false;
    handle.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'BUTTON' || e.target.classList.contains('sn-hdr-btn')) return;
      dragging = true;
      const rect = el.getBoundingClientRect();
      dx = e.clientX - rect.left; dy = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      let x = e.clientX - dx, y = e.clientY - dy;
      if (keepInViewport) {
        x = Math.max(2, Math.min(x, window.innerWidth - el.offsetWidth - 2));
        y = Math.max(2, Math.min(y, window.innerHeight - el.offsetHeight - 2));
      }
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      if (el.id === 'sn-rule-modal') { el.style.transform = 'none'; }
    });
    document.addEventListener('mouseup', function () { dragging = false; });
  }

  function createEmptyRule() { return { code: '', type: '\u5305\u542b', pattern: '', note: '' }; }
  function createEmptyStrongField() { return { field: '', code: '', note: '' }; }

  function readRulesFromTable() {
    const rules = [];
    Array.from(document.querySelectorAll('#sn-rule-tbody tr')).forEach(function (tr) {
      const codeEl = tr.querySelector('.sn-rule-code'), typeEl = tr.querySelector('.sn-rule-type'),
        patternEl = tr.querySelector('.sn-rule-pattern'), noteEl = tr.querySelector('.sn-rule-note');
      let type = '\u5305\u542b';
      if (typeEl && typeEl.selectedIndex >= 0 && typeEl.options[typeEl.selectedIndex]) type = toStr(typeEl.options[typeEl.selectedIndex].value);
      type = normalizeRuleType(type);
      const code = normCode(codeEl ? codeEl.value : ''), pattern = normSn(patternEl ? patternEl.value : ''), note = toStr(noteEl ? noteEl.value : '');
      if (!code && !pattern) return;
      rules.push({ code: code, type: type, pattern: pattern, note: note });
    });
    return rules;
  }

  function readStrongFieldsFromTable() {
    const rules = [];
    Array.from(document.querySelectorAll('#sn-strong-tbody tr')).forEach(function (tr) {
      const fieldEl = tr.querySelector('.sn-strong-field'), codeEl = tr.querySelector('.sn-strong-code'), noteEl = tr.querySelector('.sn-strong-note');
      const field = normSearchText(fieldEl ? fieldEl.value : ''), code = normCode(codeEl ? codeEl.value : ''), note = toStr(noteEl ? noteEl.value : '');
      if (!field && !code) return;
      rules.push({ field: field, code: code, note: note });
    });
    return rules;
  }

  function readExcludeCodesFromBox() {
    const el = document.getElementById('sn-exclude-text');
    return (el ? el.value : '').split(/[\s,\uff0c;\uff1b\n\r]+/).map(codeExact).filter(Boolean);
  }

  function saveFromTable() {
    const rules = readRulesFromTable().filter(function (r) { return r.code && r.pattern; });
    const strongRules = readStrongFieldsFromTable().filter(function (r) { return r.field && r.code; });
    const excludeCodes = readExcludeCodesFromBox();
    const leftCleanRules = readLeftCleanRulesFromBox();
    const convertRules = readConvertRulesFromTable().filter(function (r) { return r.from && r.to; });
    saveRules(rules); saveStrongFields(strongRules); saveExcludeCodes(excludeCodes); saveLeftCleanRules(leftCleanRules); saveConvertRules(convertRules);
    setMsg('\u5df2\u4fdd\u5b58\uff1aSN\u89c4\u5219 ' + rules.length + ' \u6761\uff0c\u5f3a\u5b57\u6bb5 ' + strongRules.length + ' \u6761\uff0c\u6392\u9664\u7f16\u7801 ' + excludeCodes.length + ' \u4e2a\uff0c\u6e05\u6d17\u89c4\u5219 ' + leftCleanRules.length + ' \u6761\uff0c\u8f6c\u6362\u7f16\u7801 ' + convertRules.length + ' \u6761');
  }

  function setMsg(msg, color) {
    const el = document.getElementById('sn-rule-msg');
    if (el) { el.textContent = msg || ''; el.style.color = color || '#16a34a'; }
  }

  function ruleRowHtml(r, i) {
    r = r || createEmptyRule();
    const currType = normalizeRuleType(r.type || '\u5305\u542b');
    const types = ['\u5305\u542b', '\u5f00\u5934\u662f', '\u7b49\u4e8e', '\u901a\u914d'];
    return '<tr><td style="text-align:center;width:36px;">' + (i + 1) + '</td>'
      + '<td style="width:120px;"><input class="sn-rule-code" value="' + escHtml(r.code || '') + '" placeholder="\u5982 34100239"></td>'
      + '<td style="width:90px;"><select class="sn-rule-type">' + types.map(function (t) { return '<option value="' + t + '"' + (currType === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></td>'
      + '<td style="width:150px;"><input class="sn-rule-pattern" value="' + escHtml(r.pattern || '') + '" placeholder="\u5982 K179 / K???"></td>'
      + '<td><input class="sn-rule-note" value="' + escHtml(r.note || '') + '" placeholder="\u5907\u6ce8"></td>'
      + '<td style="text-align:center;width:56px;"><button class="sn-del-btn">\u5220\u9664</button></td></tr>';
  }

  function strongRowHtml(r, i) {
    r = r || createEmptyStrongField();
    return '<tr><td style="text-align:center;width:36px;">' + (i + 1) + '</td>'
      + '<td style="width:210px;"><input class="sn-strong-field" value="' + escHtml(r.field || '') + '" placeholder="\u5982 OC8072V1H74S"></td>'
      + '<td style="width:120px;"><input class="sn-strong-code" value="' + escHtml(r.code || '') + '" placeholder="\u5982 34090213"></td>'
      + '<td><input class="sn-strong-note" value="' + escHtml(r.note || '') + '" placeholder="\u5907\u6ce8"></td>'
      + '<td style="text-align:center;width:56px;"><button class="sn-del-btn">\u5220\u9664</button></td></tr>';
  }

  function convertRowHtml(r, i) {
    r = r || { from: '', to: '', note: '' };
    return '<tr><td style="text-align:center;width:36px;">' + (i + 1) + '</td>'
      + '<td style="width:150px;"><input class="sn-convert-from" value="' + escHtml(r.from || '') + '" placeholder="\u63a5\u53e3\u4e8c\u8fd4\u56de\u7f16\u7801"></td>'
      + '<td style="text-align:center;width:30px;color:#94a3b8;">\u2192</td>'
      + '<td style="width:150px;"><input class="sn-convert-to" value="' + escHtml(r.to || '') + '" placeholder="\u8f6c\u6362\u540e\u7f16\u7801"></td>'
      + '<td><input class="sn-convert-note" value="' + escHtml(r.note || '') + '" placeholder="\u5907\u6ce8"></td>'
      + '<td style="text-align:center;width:56px;"><button class="sn-del-btn">\u5220\u9664</button></td></tr>';
  }

  function bindDeleteButtons() {
    ['sn-rule-tbody', 'sn-strong-tbody', 'sn-convert-tbody'].forEach(function (id) {
      const tbody = document.getElementById(id);
      if (tbody) tbody.querySelectorAll('.sn-del-btn').forEach(function (btn) { btn.onclick = function () { const tr = btn.closest('tr'); if (tr) tr.remove(); }; });
    });
  }

  function addRow(tbodyId, htmlFn, emptyObj) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const idx = tbody.querySelectorAll('tr').length;
    const temp = document.createElement('tbody');
    temp.innerHTML = htmlFn(emptyObj, idx);
    tbody.appendChild(temp.querySelector('tr'));
    bindDeleteButtons();
  }

  function renderRuleTable() {
    const lcBox = document.getElementById('sn-left-clean-text'); if (lcBox) lcBox.value = loadLeftCleanRules().join('\n');
    const tbody = document.getElementById('sn-rule-tbody');
    if (tbody) { const r = loadRules(); tbody.innerHTML = r.length ? r.map(function (x, i) { return ruleRowHtml(x, i); }).join('') : ruleRowHtml(createEmptyRule(), 0); }
    const stbody = document.getElementById('sn-strong-tbody');
    if (stbody) { const r = loadStrongFields(); stbody.innerHTML = r.length ? r.map(function (x, i) { return strongRowHtml(x, i); }).join('') : strongRowHtml(createEmptyStrongField(), 0); }
    const exBox = document.getElementById('sn-exclude-text'); if (exBox) exBox.value = loadExcludeCodes().join('\n');
    const ctbody = document.getElementById('sn-convert-tbody');
    if (ctbody) { const r = loadConvertRules(); ctbody.innerHTML = r.length ? r.map(function (x, i) { return convertRowHtml(x, i); }).join('') : convertRowHtml({ from: '', to: '', note: '' }, 0); }
    bindDeleteButtons(); updateCounts();
  }

  function testRuleInModal() {
    const input = document.getElementById('sn-rule-test-sn');
    const sn = normSn(input ? input.value : '');
    if (!sn) { setMsg('\u8bf7\u8f93\u5165\u6d4b\u8bd5SN', '#dc2626'); return; }
    const tempRules = readRulesFromTable().filter(function (r) { return r.code && r.pattern; });
    for (let i = 0; i < tempRules.length; i++) {
      const r = tempRules[i]; const value = normSn(r.pattern); const type = getEffectiveType(r.type, value);
      let ok = false;
      if (type === '\u5305\u542b') ok = sn.indexOf(value) >= 0;
      else if (type === '\u5f00\u5934\u662f') ok = sn.startsWith(value);
      else if (type === '\u7b49\u4e8e') ok = sn === value;
      else if (type === '\u901a\u914d') ok = wildcardToRegExp(value).test(sn);
      if (ok) { setMsg('SN\u89c4\u5219\u547d\u4e2d\uff1a' + sn + ' => ' + r.code + '\uff0c\u7b2c' + (i + 1) + '\u884c\uff0c' + type + ' ' + r.pattern); return; }
    }
    setMsg('SN\u89c4\u5219\u672a\u547d\u4e2d\uff1a' + sn, '#dc2626');
  }

  async function testStrongFieldInModal() {
    const input = document.getElementById('sn-strong-test-text');
    const sn = normSn(input ? input.value : '');
    if (!sn) { setMsg('\u8bf7\u8f93\u5165SN', '#dc2626'); return; }
    setMsg('\u63a5\u53e3\u4e00\u67e5\u8be2\u4e2d\uff1a' + sn + ' ...', '#d97706');
    try {
      const ret = await queryEmsStrongFieldBySn(sn);
      if (ret.hit) setMsg('\u5f3a\u5b57\u6bb5\u547d\u4e2d\uff1a' + sn + '\uff0c' + ret.hit.field + ' => ' + ret.hit.code + '\uff08' + ret.mode + ' rows:' + ret.rows + ')');
      else setMsg('\u5f3a\u5b57\u6bb5\u672a\u547d\u4e2d\uff1a' + sn + '\uff08pages:' + ret.pages + ' rows:' + ret.rows + ')', '#dc2626');
    } catch (e) { setMsg('\u67e5\u8be2\u5f02\u5e38\uff1a' + e, '#dc2626'); }
  }

  function showRuleModal() {
    let modal = document.getElementById('sn-rule-modal');
    if (modal) { modal.style.display = 'flex'; renderRuleTable(); return; }

    modal = document.createElement('div');
    modal.id = 'sn-rule-modal';
    modal.innerHTML = ''
      + '<div class="sn-modal-header" id="sn-rule-drag-handle">'
      +   '<span class="sn-title">SN\u7f16\u7801\u89c4\u5219\u515c\u5e95\u8bbe\u7f6e</span>'
      +   '<div class="sn-hdr-btns">'
      +     '<button class="sn-hdr-btn" id="sn-rule-min" title="\u6700\u5c0f\u5316">\u2500</button>'
      +     '<button class="sn-hdr-btn" id="sn-rule-close" title="\u5173\u95ed">\u00d7</button>'
      +   '</div>'
      + '</div>'
      + '<div class="sn-modal-toolbar">'
      +   '<label><input id="sn-rule-enabled" type="checkbox"' + (enabled ? ' checked' : '') + '> \u542f\u7528\u515c\u5e95</label>'
      +   '<button class="sn-save-btn" id="sn-rule-save">\u4fdd\u5b58\u5168\u90e8</button>'
      +   '<button class="sn-clear-btn" id="sn-rule-clear">\u6e05\u7a7a\u5168\u90e8</button>'
      +   '<span class="sn-msg" id="sn-rule-msg"></span>'
      + '</div>'
      + '<div class="sn-modal-body">'
      // 一、SN规则兜底
      +   '<div class="sn-section">'
      +     '<div class="sn-section-header"><span class="sn-sec-title">\u4e00\u3001SN\u89c4\u5219\u515c\u5e95</span><span class="sn-sec-hint">\u63a5\u53e3\u67e5\u4e0d\u5230\u65f6\u6309SN\u89c4\u5219\u5224\u65ad\u7f16\u7801</span><button class="sn-add-btn" id="sn-rule-add">+ \u65b0\u589e</button></div>'
      +     '<div class="sn-section-body">'
      +       '<div class="sn-test-bar"><span>SN:</span><input id="sn-rule-test-sn" placeholder="\u5982 K0154738" style="width:160px;"><button class="sn-test-btn" id="sn-rule-test-btn">\u6d4b\u8bd5</button><span class="sn-test-hint">? = \u4efb\u610f1\u4f4d\uff0c\u672b\u5c3e\u5355 * = \u4efb\u610f\u957f\u5ea6</span></div>'
      +       '<table class="sn-table"><thead><tr><th style="width:36px;">#</th><th style="width:120px;">\u7f16\u7801</th><th style="width:90px;">\u5339\u914d\u65b9\u5f0f</th><th style="width:150px;">SN\u89c4\u5219</th><th>\u5907\u6ce8</th><th style="width:56px;">\u64cd\u4f5c</th></tr></thead><tbody id="sn-rule-tbody"></tbody></table>'
      +       '<div class="sn-section-footer">\u5305\u542b\uff1aSN\u91cc\u5305\u542b\u89c4\u5219\u5185\u5bb9\uff1b\u5f00\u5934\u662f\uff1aSN\u4ee5\u524d\u7f00\u5f00\u5934\uff1b\u7b49\u4e8e\uff1aSN\u5b8c\u5168\u4e00\u6837\uff1b\u901a\u914d\uff1a? \u4efb\u610f1\u4f4d\uff0c* \u4efb\u610f\u957f\u5ea6\u3002\u4e0d\u53d7\u6392\u9664\u7f16\u7801\u5f71\u54cd\u3002</div>'
      +     '</div>'
      +   '</div>'
      // 二、强字段
      +   '<div class="sn-section">'
      +     '<div class="sn-section-header"><span class="sn-sec-title">\u4e8c\u3001\u63a5\u53e3\u4e00\u5f3a\u5b57\u6bb5</span><span class="sn-sec-hint">\u8fd4\u56de\u5185\u5bb9\u542b\u56fa\u5b9a\u5b57\u7b26\u2192\u5f3a\u5236\u7f16\u7801</span><button class="sn-add-btn" id="sn-strong-add">+ \u65b0\u589e</button></div>'
      +     '<div class="sn-section-body">'
      +       '<div class="sn-test-bar"><span>SN:</span><input id="sn-strong-test-text" placeholder="\u8f93\u5165SN\u67e5\u8be2\u63a5\u53e3\u4e00" style="width:200px;"><button class="sn-test-btn" id="sn-strong-test-btn">\u67e5\u8be2\u6d4b\u8bd5</button></div>'
      +       '<table class="sn-table"><thead><tr><th style="width:36px;">#</th><th style="width:210px;">\u56fa\u5b9a\u5b57\u7b26</th><th style="width:120px;">\u7b49\u4e8e\u7f16\u7801</th><th>\u5907\u6ce8</th><th style="width:56px;">\u64cd\u4f5c</th></tr></thead><tbody id="sn-strong-tbody"></tbody></table>'
      +       '<div class="sn-section-footer">\u63a5\u53e3\u4e00\u8fd4\u56de\u5185\u5bb9\u542b\u201c\u56fa\u5b9a\u5b57\u7b26\u201d\u2192\u628a\u201c\u7b49\u4e8e\u7f16\u7801\u201d\u63d2\u5165\u7ed3\u679c\u6700\u524d\u9762\u3002\u53d7\u6392\u9664\u7f16\u7801\u5f71\u54cd\u3002</div>'
      +     '</div>'
      +   '</div>'
      // 三、排除编码
      +   '<div class="sn-section">'
      +     '<div class="sn-section-header"><span class="sn-sec-title">\u4e09\u3001\u63a5\u53e3\u4e00\u6392\u9664\u7f16\u7801</span><span class="sn-sec-hint">\u8fd9\u4e9b\u7f16\u7801\u5728\u63a5\u53e3\u4e00\u91cc\u4e0d\u8981\u547d\u4e2d</span></div>'
      +     '<div class="sn-section-body">'
      +       '<textarea class="sn-textarea" id="sn-exclude-text" placeholder="\u4e00\u884c\u4e00\u4e2a\u7f16\u7801" style="height:70px;"></textarea>'
      +       '<div class="sn-section-footer">\u53ea\u4f5c\u7528\u4e8e\u63a5\u53e3\u4e00\uff0c\u5b8c\u5168\u76f8\u7b49\u5339\u914d\u3002\u63a5\u53e3\u4e8c\u548cSN\u89c4\u5219\u515c\u5e95\u4e0d\u53d7\u5f71\u54cd\u3002</div>'
      +     '</div>'
      +   '</div>'
      // 四、左侧清洗
      +   '<div class="sn-section">'
      +     '<div class="sn-section-header"><span class="sn-sec-title">\u56db\u3001\u5de6\u4fa7\u6761\u7801\u6e05\u6d17</span><span class="sn-sec-hint">\u6e05\u6d17\u9875\u9762\u5de6\u4fa7\u6807\u7b7e\uff0c\u4e0d\u5f71\u54cd\u63a5\u53e3\u7f16\u7801</span></div>'
      +     '<div class="sn-section-body">'
      +       '<textarea class="sn-textarea" id="sn-left-clean-text" placeholder="\u4e00\u884c\u4e00\u4e2a\u89c4\u5219" style="height:80px;"></textarea>'
      +       '<div class="sn-section-footer">SN\uff1aSN03035FDT \u2192 03035FDT\uff1b: \uff1aU1:xxx \u2192 xxx\uff1b- \uff1aABC-34090213 \u2192 34090213\u3002\u624b\u52a8\u6682\u5b58\u91c7\u96c6\u4e5f\u8d70\u6b64\u6e05\u6d17\u3002</div>'
      +     '</div>'
      +   '</div>'
      // 五、接口二转换
      +   '<div class="sn-section">'
      +     '<div class="sn-section-header"><span class="sn-sec-title">\u4e94\u3001\u63a5\u53e3\u4e8c\u8f6c\u6362\u7f16\u7801</span><span class="sn-sec-hint">\u63a5\u53e3\u4e8c\u7f16\u7801\u2194\u8f6c\u6362\u7801\uff0c\u53cc\u5411\u90fd\u80fd\u547d\u4e2d</span><button class="sn-add-btn" id="sn-convert-add">+ \u65b0\u589e</button></div>'
      +     '<div class="sn-section-body">'
      +       '<table class="sn-table"><thead><tr><th style="width:36px;">#</th><th style="width:150px;">\u63a5\u53e3\u4e8c\u8fd4\u56de\u7f16\u7801</th><th style="width:30px;">\u2192</th><th style="width:150px;">\u8f6c\u6362\u540e\u7f16\u7801</th><th>\u5907\u6ce8</th><th style="width:56px;">\u64cd\u4f5c</th></tr></thead><tbody id="sn-convert-tbody"></tbody></table>'
      +       '<div class="sn-section-footer">\u53cc\u5411\uff1aA\u2192B \u89c4\u5219\u4e0b\uff0c\u8fd4\u56de A \u6216 B \u90fd\u80fd\u5339\u914d\u3002\u63a5\u53e3\u4e8c\u8fd4\u56de A \u2192 \u9644\u52a0 B\uff1b\u8fd4\u56de B \u2192 \u9644\u52a0 A\u3002</div>'
      +     '</div>'
      +   '</div>'
      + '</div>';

    document.body.appendChild(modal);
    makeDraggable(modal, document.getElementById('sn-rule-drag-handle'), false);

    document.getElementById('sn-rule-close').onclick = function () { modal.style.display = 'none'; };
    document.getElementById('sn-rule-min').onclick = function () { modal.classList.toggle('sn-minimized'); };
    document.getElementById('sn-rule-enabled').onchange = function () {
      enabled = this.checked; localStorage.setItem(ENABLE_KEY, enabled ? '1' : '0'); updateCounts();
      setMsg(enabled ? '\u515c\u5e95\u5df2\u542f\u7528' : '\u515c\u5e95\u5df2\u5173\u95ed', enabled ? '#16a34a' : '#dc2626');
    };
    document.getElementById('sn-rule-save').onclick = saveFromTable;
    document.getElementById('sn-rule-clear').onclick = function () {
      if (!confirm('\u786e\u5b9a\u6e05\u7a7a\u5168\u90e8\u89c4\u5219\uff1f')) return;
      saveRules([]); saveStrongFields([]); saveExcludeCodes([]); saveLeftCleanRules([]); saveConvertRules([]);
      renderRuleTable(); setMsg('\u5df2\u6e05\u7a7a', '#dc2626');
    };
    document.getElementById('sn-rule-add').onclick = function () { addRow('sn-rule-tbody', ruleRowHtml, createEmptyRule()); };
    document.getElementById('sn-strong-add').onclick = function () { addRow('sn-strong-tbody', strongRowHtml, createEmptyStrongField()); };
    document.getElementById('sn-convert-add').onclick = function () { addRow('sn-convert-tbody', convertRowHtml, { from: '', to: '', note: '' }); };
    document.getElementById('sn-rule-test-btn').onclick = testRuleInModal;
    document.getElementById('sn-strong-test-btn').onclick = testStrongFieldInModal;
    renderRuleTable();
  }

  function bootUI() { if (!document.body) { setTimeout(bootUI, 300); return; } createMiniButton(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootUI);
  else bootUI();

  window.SN_RULE_UI = {
    show: showRuleModal, rules: loadRules, strongFields: loadStrongFields, excludes: loadExcludeCodes,
    convertRules: loadConvertRules, findConvertedCodes: findConvertedCodes,
    test: matchRule, testStrong: matchStrongFieldInText, queryStrongBySn: queryEmsStrongFieldBySn,
    enable: function () { enabled = true; localStorage.setItem(ENABLE_KEY, '1'); updateCounts(); },
    disable: function () { enabled = false; localStorage.setItem(ENABLE_KEY, '0'); updateCounts(); },
    clear: function () { saveRules([]); saveStrongFields([]); saveExcludeCodes([]); saveLeftCleanRules([]); saveConvertRules([]); }
  };

  console.log('[SN\u89c4\u5219\u515c\u5e95\u524d\u53f0\u7248] \u5df2\u5b89\u88c5 v1.8');
})();
