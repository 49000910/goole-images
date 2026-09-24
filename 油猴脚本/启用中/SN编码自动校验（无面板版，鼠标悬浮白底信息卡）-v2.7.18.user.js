

// ==UserScript==
// @name         SN编码自动校验（无面板版，鼠标悬浮白底信息卡）
// @namespace    tm.sn.code.check.no.panel.hover.white
// @version      2.7.18
// @match        https://w3.huawei.com/mespmm/wipweb*
// @grant        none
// ==/UserScript==

(async function () {
  'use strict';

  // ===== MES授权门禁 START =====
  async function __MES_AUTH_GATE__() {
    if (
      location.hostname === 'mes.huawei.com' &&
      location.href.indexOf('/mespmm/rptwebnew') >= 0 &&
      location.hash.indexOf('autoExtract=1') >= 0
    ) {
      return true;
    }

    var KEY = 'MES_AUTH_CENTER_STATE_V1';
    var start = Date.now();

    while (Date.now() - start < 180000) {
      try {
        var st = JSON.parse(localStorage.getItem(KEY) || 'null');

        if (st && st.ok && Date.now() - Number(st.ts || 0) < 10000) {
          console.log('[MES授权门禁] 已授权，脚本继续运行：', st.jobNumber);
          return true;
        }
      } catch (e) {}

      await new Promise(function (r) {
        setTimeout(r, 300);
      });
    }

    console.warn('[MES授权门禁] 等待3分钟仍未授权，脚本已停止运行（刷新页面可重试）');
    return false;
  }

  if (!(await __MES_AUTH_GATE__())) return;
  // ===== MES授权门禁 END =====

  if (!location.href.includes('#/ProductTrackInOut')) return;


  const BASE = 'https://w3.huawei.com/mespmm/gateway/com.huawei.supply.mes.mesplus.pspw:mespmmpreallservice/mespmmpreallone/services/emsComponentDataInfo/find/page';
  const selector = 'input[id^="sn-input"]';

  // 由别的脚本面板控制
  const LOCK_SWITCH_KEY = 'sn_code_check_lock_on';
  const AUTO_ROUTE_KEY = 'sn_code_auto_route_on';
// 左侧条码清洗规则，由兜底脚本设置
const LEFT_CLEAN_KEY = 'sn_code_left_clean_rules_v1';
// ===== 父项条码-BOM-SN采集记录 =====
const BOM_COLLECT_STORE_KEY = 'sn_bom_collect_store_v1';
const BOM_COLLECT_MAX_PARENT = 500;
const bomCollectUnlockMap = new WeakMap();

  let lockOn = localStorage.getItem(LOCK_SWITCH_KEY) === '1';
  let autoRouteOn = localStorage.getItem(AUTO_ROUTE_KEY) !== '0';

  const __checkTimers = new WeakMap(); // v2.7.14：每框独立 220ms 防抖。旧版全局单计时器：快速连续回填（一体化取出 150ms/框）时后一框的 input 会 clearTimeout 掉前一框的入队定时器 → 除最后一框外全部卡"等待校验"永不入队
  const __reqSeq = new WeakMap();
  const rowBubbleMap = new WeakMap();
  const rowBubbleKeys = new Set();
  const lastScanByInput = new WeakMap();
  const lastNonEmptyScanByInput = new WeakMap();
  // ===== SN重复锁定：统一放在脚本1，避免和自动转填冲突 =====
  let dupLockedEl = null;
  let dupSuppressUntil = 0;

  // 左侧红色括号DOM
  const dupBracketEls = [];

  // 被淡红标记过的重复框
  const dupPaintEls = new Set();

  function suppressDuplicateLockForRoute(ms) {
    dupSuppressUntil = Date.now() + (ms || 1200);
  }

  function isDuplicateLockSuppressed() {
    return Date.now() < dupSuppressUntil;
  }

  function isVisibleSnInputForDup(el) {
    if (!el || !document.body.contains(el)) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isSnRouteMoving(el) {
    return !!(
      el &&
      el.dataset &&
      (
        el.dataset.snAutoFill === '1' ||
        el.dataset.snRouteMoving === '1'
      )
    );
  }

  function clearDupBrackets() {
    while (dupBracketEls.length) {
      var el = dupBracketEls.pop();
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
  }

  function clearDupPaint(el) {
    if (!el || !el.dataset || el.dataset.snDupPaint !== '1') return;

    el.style.outline = '';
    el.style.backgroundColor = '';
    el.style.boxShadow = '';
    el.style.color = '';

    if (el.title && el.title.indexOf('重复条码') >= 0) {
      el.title = '';
    }

    delete el.dataset.snDupPaint;
  }

  function clearAllDupPaint() {
    dupPaintEls.forEach(function (el) {
      clearDupPaint(el);
    });
    dupPaintEls.clear();
  }

  function paintDup(el, key) {
    if (!el) return;

    el.dataset.snDupPaint = '1';

    // 统一淡红色，不再有单个框深红
    el.style.outline = '1px solid #d4380d';
    el.style.backgroundColor = '#fff1f0';
    el.style.boxShadow = '0 0 0 1px rgba(212,56,13,.12)';
    el.style.color = '#000';
    el.title = '重复条码：' + key;

    dupPaintEls.add(el);
  }

  function addDupLine(left, top, width, height) {
    var div = document.createElement('div');

    div.style.position = 'fixed';
    div.style.zIndex = '2147483647';
    div.style.left = left + 'px';
    div.style.top = top + 'px';
    div.style.width = width + 'px';
    div.style.height = height + 'px';
    div.style.background = '#d4380d';
    div.style.borderRadius = '1px';
    div.style.pointerEvents = 'none';

    document.body.appendChild(div);
    dupBracketEls.push(div);

    return div;
  }

  function drawDupBracketForGroup(els) {
    if (!els || els.length < 2) return;

    var items = [];

    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();

      items.push({
        el: els[i],
        rect: r,
        centerY: r.top + r.height / 2
      });
    }

    items.sort(function (a, b) {
      return a.centerY - b.centerY;
    });

    var first = items[0];
    var last = items[items.length - 1];

    var minLeft = Infinity;

    for (var j = 0; j < items.length; j++) {
      minLeft = Math.min(minLeft, items[j].rect.left);
    }

    // 红色括号参数
    // 线粗 3，横线短，无左侧标签
    var lineWidth = 3;
    var armLen = 11;
    var bracketLeft = Math.max(4, minLeft - 22);

    // 上短横对齐最上重复框中心
    var topCenter = first.centerY;

    // 下短横对齐最下重复框中心
    var bottomCenter = last.centerY;

    if (bottomCenter - topCenter < 18) {
      var mid = (topCenter + bottomCenter) / 2;
      topCenter = mid - 9;
      bottomCenter = mid + 9;
    }

    // 竖线
    addDupLine(
      bracketLeft,
      topCenter,
      lineWidth,
      bottomCenter - topCenter
    );

    // 上短横
    addDupLine(
      bracketLeft,
      topCenter - lineWidth / 2,
      armLen,
      lineWidth
    );

    // 下短横
    addDupLine(
      bracketLeft,
      bottomCenter - lineWidth / 2,
      armLen,
      lineWidth
    );
  }

  function buildDuplicateMap() {
    var els = allSnInputs().filter(function (el) {
      return isVisibleSnInputForDup(el) && !isSnRouteMoving(el);
    });

    var map = new Map();

    for (var i = 0; i < els.length; i++) {
      var key = normalizeSnForDup(els[i].value);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key).push(els[i]);
    }

    return map;
  }

  function removeDuplicateBubblesIfNeeded() {
    var els = allSnInputs();

    for (var i = 0; i < els.length; i++) {
      var st = rowBubbleMap.get(els[i]);
     if (st && st.text && st.text.indexOf('重复条码') >= 0) {
  removeRowBubble(els[i]);
}

    }
  }

  function refreshDuplicateLock(preferEl) {
    if (isDuplicateLockSuppressed()) return false;

    // 每次先清掉旧括号和旧淡红
    clearDupBrackets();
    clearAllDupPaint();

    var map = buildDuplicateMap();

    var hasDup = false;
    var targetEl = null;
    var targetKey = '';

    map.forEach(function (arr, key) {
      if (arr.length <= 1) return;

      hasDup = true;

      for (var i = 0; i < arr.length; i++) {
        paintDup(arr[i], key);

        // 当前输入框在重复组里，优先把右侧气泡挂当前框
        if (preferEl && arr[i] === preferEl) {
          targetEl = preferEl;
          targetKey = key;
        }

        // 没有优先目标时，锁第一个重复框
        if (!targetEl) {
          targetEl = arr[i];
          targetKey = key;
        }

               // 不要在这里写 fail，避免临时重复解除后状态残留
        // 重复判断交给 publishSnCheckGate() 动态统计

      }

      // 左侧红色括号，无文字
      drawDupBracketForGroup(arr);
    });

       if (!hasDup) {
      dupLockedEl = null;
      clearDupBrackets();
      clearAllDupPaint();
      removeDuplicateBubblesIfNeeded();

      // 修复：如果之前因为临时重复写入过 fail/重复条码，
      // 但当前实际已经没有重复，则重新触发这些框的编码校验，清掉旧fail状态。
      try {
        var gate = JSON.parse(localStorage.getItem('sn_code_check_gate_status') || 'null');

        if (gate && Array.isArray(gate.details)) {
          gate.details.forEach(function (d) {
            if (!d) return;

            var isOldDupFail =
              d.status === 'duplicate' ||
              d.msg === '重复条码' ||
              (d.status === 'fail' && d.msg === '重复条码');

            if (!isOldDupFail) return;

            var el = document.getElementById(d.id);
            if (!el || !document.body.contains(el)) return;

            var val = toStr(el.value);
            if (!val) return;

            // 先改成 pending，避免 gate 一直 bad
            if (typeof setSnCheckState === 'function') {
              setSnCheckState(el, 'pending', '重复解除待复核', val);
            }

            // 重新跑编码校验，校验通过后会变回 ok
            if (typeof enqueueCheck === 'function') {
              enqueueCheck(el, val);
            } else {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        }
      } catch (e) {}

      return false;
    }


    dupLockedEl = targetEl;

    // 右侧气泡保留
    if (targetEl) {
      showRowBubble(targetEl, '重复条码：' + targetKey, 'err');

      try {
        if (document.activeElement === targetEl) {
          targetEl.select();
        }
      } catch (e) {}
    }

    return true;
  }

  // 输入时刷新重复状态
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches(selector)) return;

    // 脚本1自动转填期间不做重复锁定
    if (isDuplicateLockSuppressed() || isSnRouteMoving(t)) return;

    setTimeout(function () {
      try {
        refreshDuplicateLock(t);
      } catch (err) {}
    }, 0);
  }, true);

  // 按 Enter 时，如有重复则阻止继续提交
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches(selector)) return;
    if (e.key !== 'Enter') return;

    // 自动转填提交 Enter 时放行
    if (isDuplicateLockSuppressed() || isSnRouteMoving(t)) return;

    if (refreshDuplicateLock(t)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      var focusEl = dupLockedEl || t;

      setTimeout(function () {
        try {
          focusEl.focus();
          focusEl.select();
        } catch (err) {}
      }, 0);
    }
  }, true);

    // 按 Enter 时，如SN已被其他父项采集，也阻止继续提交
document.addEventListener('keydown', function (e) {
  var t = e.target;

  if (!t || !t.matches || !t.matches(selector)) return;
  if (e.key !== 'Enter') return;

  if (isDuplicateLockSuppressed() || isSnRouteMoving(t)) return;

  if (bomCollectCheckConflictAndLock(t, t.value)) {
    e.preventDefault();
    e.stopPropagation();

    if (e.stopImmediatePropagation) {
      e.stopImmediatePropagation();
    }

    setTimeout(function () {
      try {
        t.focus();
        t.select();
      } catch (err) {}
    }, 0);
  }
}, true);

  // 滚动时重新定位左侧括号
  window.addEventListener('scroll', function () {
    try {
      if (dupLockedEl) refreshDuplicateLock(dupLockedEl);
    } catch (e) {}
  }, true);

  // 窗口变化时重新定位左侧括号
  window.addEventListener('resize', function () {
    try {
      if (dupLockedEl) refreshDuplicateLock(dupLockedEl);
    } catch (e) {}
  }, true);

  // 页面动态刷新时重新判断
  setInterval(function () {
    try {
      if (!document.querySelector(selector)) return;
      refreshDuplicateLock(document.activeElement);
    } catch (e) {}
  }, 800);



  // ===== 无对应编码时自动重试，防止扫太快接口数据还没出来 =====
  const NO_CODE_RETRY_MAX = 6;
  const NO_CODE_RETRY_DELAYS = [300, 600, 1000, 1500, 2200, 3000];
  const noCodeRetryMap = new WeakMap();

  function retrySnKey(snRaw) {
    return normalizeSnForDup(snRaw || '');
  }

  function resetNoCodeRetry(el) {
    noCodeRetryMap.delete(el);
  }

  function scheduleNoCodeRetry(el, snRaw) {
    if (!el || !document.body.contains(el)) return false;

    var key = retrySnKey(snRaw);
    if (!key) return false;

    var st = noCodeRetryMap.get(el);
    if (!st || st.key !== key) {
      st = {
        key: key,
        count: 0,
        token: 0
      };
      noCodeRetryMap.set(el, st);
    }

    if (st.count >= NO_CODE_RETRY_MAX) {
      return false;
    }

    st.count++;
    st.token++;

    var token = st.token;
    var delay = NO_CODE_RETRY_DELAYS[Math.min(st.count - 1, NO_CODE_RETRY_DELAYS.length - 1)];

    showRowBubble(el, '未查到编码，重试 ' + st.count + '/' + NO_CODE_RETRY_MAX, 'warn');

    setTimeout(function () {
      if (!el || !document.body.contains(el)) return;

      var latest = noCodeRetryMap.get(el);
      if (!latest || latest.key !== key || latest.token !== token) return;

      var curr = toStr(el.value);
      if (!curr || retrySnKey(curr) !== key) return;

      enqueueCheck(el, snRaw);
    }, delay);

    return true;
  }


  // ===== 给自动过站脚本读取：BOM子项SN校验状态 =====
  const SN_CODE_CHECK_GATE_KEY = 'sn_code_check_gate_status';
  const snCheckStateMap = new WeakMap();
  // gate发现有值但没校验状态时，自动补校验，避免永久pending
  const gatePendingKickMap = new WeakMap();

  function kickPendingGateCheck(el, val, reason) {
    if (!el || !document.body.contains(el)) return;
    val = toStr(val);
    if (!val) return;

    var key = normalizeSnForDup(val);
    var now = Date.now();
    var old = gatePendingKickMap.get(el);

    // 同一个值3秒内只补触发一次，避免死循环刷接口
    if (old && old.key === key && now - old.ts < 3000) return;

    gatePendingKickMap.set(el, {
      key: key,
      ts: now,
      reason: reason || ''
    });

    setTimeout(function () {
      try {
        if (!el || !document.body.contains(el)) return;
        if (normalizeSnForDup(el.value) !== key) return;

        enqueueCheck(el, val);
      } catch (e) {}
    }, 0);
  }

  function getParentBarcodeValueForGate() {
    var all = [].slice.call(document.querySelectorAll(
      'div[id^="Input_"] > input.hae-ui-input[type="text"], div[id^="Input_"] > input'
    ));

    for (var i = 0; i < all.length; i++) {
      var box = all[i].closest('div[id^="Input_"]');
      var ctx = ((box && box.parentElement ? box.parentElement.innerText : '') || '').replace(/\s+/g, '');
      if (ctx.indexOf('条码采集') >= 0) {
        return toStr(all[i].value);
      }
    }

    return '';
  }

  function publishSnCheckGate() {
    var els = [].slice.call(document.querySelectorAll(selector));

    // 只统计当前页面可见的BOM子项SN框
    els = els.filter(function (el) {
      var r = el.getBoundingClientRect();
      return document.body.contains(el) && r.width > 0 && r.height > 0;
    });

    var parentSn = getParentBarcodeValueForGate();

    var total = els.length;
    var filled = 0;
    var ok = 0;
    var bad = 0;
    var pending = 0;
    var duplicate = 0;
    var duplicateGroups = 0;
    var details = [];

    // 先统计清洗后的SN，用于判断重复
    // 例如 U1:21340902 和 21340902 清洗后都等于 21340902
    var dupCount = {};

    for (var d = 0; d < els.length; d++) {
      var dv = toStr(els[d].value);
      if (!dv) continue;

      var dk = normalizeSnForDup(dv);
      if (!dk) continue;

      dupCount[dk] = (dupCount[dk] || 0) + 1;
    }

    Object.keys(dupCount).forEach(function (k) {
      if (dupCount[k] > 1) {
        duplicateGroups++;
        duplicate += dupCount[k];
      }
    });

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var val = toStr(el.value);
      var cleanVal = normalizeSnForDup(val);

      if (!val) {
        pending++;
        details.push({
          id: el.id || '',
          sn: '',
          cleanSn: '',
          status: 'empty',
          msg: '未扫描'
        });
        continue;
      }

      filled++;

      // 重复条码优先判失败
      if (cleanVal && dupCount[cleanVal] > 1) {
        bad++;
        details.push({
          id: el.id || '',
          sn: val,
          cleanSn: cleanVal,
          status: 'duplicate',
          msg: '重复条码'
        });
        continue;
      }

      var st = snCheckStateMap.get(el);
      var currKey = normalizeSnForDup(val);
      var stKey = st ? normalizeSnForDup(st.sn) : '';

           if (!st || stKey !== currKey) {
        pending++;

        // 有值但没有对应校验状态，自动补一次校验
        kickPendingGateCheck(el, val, !st ? '无校验状态' : '校验值不一致');

        details.push({
          id: el.id || '',
          sn: val,
          cleanSn: cleanVal,
          status: 'pending',
          msg: !st ? '等待校验-已补触发' : '等待校验-值变更'
        });
        continue;
      }


      if (st.status === 'ok') {
        ok++;
      } else if (st.status === 'pending' || st.status === 'retry') {
        pending++;
      } else {
        bad++;
      }

      details.push({
        id: el.id || '',
        sn: val,
        cleanSn: cleanVal,
        status: st.status,
        msg: st.msg || ''
      });
    }

    var data = {
      ts: Date.now(),
      parentSn: parentSn,
      total: total,
      filled: filled,
      ok: ok,
      bad: bad,
      pending: pending,
     duplicate: duplicate,
     duplicateGroups: duplicateGroups,


      // 必须：有子项框、全部填写、全部校验OK、无重复
      allOk: total > 0 &&
             filled === total &&
             ok === total &&
             bad === 0 &&
             pending === 0 &&
             duplicate === 0,

      details: details
    };

  try {
  window.__SN_CODE_CHECK_GATE = data;
  localStorage.setItem(SN_CODE_CHECK_GATE_KEY, JSON.stringify(data));
  // v2.7.18：同时写 sessionStorage（按标签隔离）——多窗口时各窗口每秒都写同一个
  // localStorage key 互相覆盖（别的窗口空网格把本窗口门禁盖掉→单组Push 永远"等待校验"卡条码）。
  // sessionStorage 每个窗口独立，Push 读时按当前父项过滤，取到的是自己窗口的门禁。
  try { sessionStorage.setItem(SN_CODE_CHECK_GATE_KEY, JSON.stringify(data)); } catch (e2) {}
  window.dispatchEvent(new CustomEvent('sn-code-check-gate', { detail: data }));
} catch (e) {}

try {
  bomCollectSaveWhenGateAllOk(data);
} catch (e) {
  console.warn('[BOM采集记录] 保存失败：', e);
}



  }

  function setSnCheckState(el, status, msg, sn) {
    if (!el) return;

    if (status === 'empty') {
      snCheckStateMap.delete(el);
    } else {
      snCheckStateMap.set(el, {
        status: status,
        msg: msg || '',
        sn: sn || toStr(el.value),
        ts: Date.now()
      });
    }

    publishSnCheckGate();
  }

  // 定时刷新状态，防止系统带出/删除SN框后状态不同步
  setInterval(function () {
    try { publishSnCheckGate(); } catch (e) {}
  }, 1000);


    // 修复1：脚本主动清空时，禁止空值回放
  const suppressEmptyReplay = new WeakSet();

  // 修复2：查码并行（限4路），前置检查与结果回填保持串行（防自动转填/焦点打架）
  const CHECK_QUERY_PARALLEL = 4;
  let __checkRunning = 0;
  const __checkQueue = [];
  let __commitChain = Promise.resolve();

  function __nextCommit(fn){
    var p = __commitChain.then(fn, fn);
    __commitChain = p.then(function(){}, function(){});
    return p;
  }

  function __pumpCheckQueue(){
    while (__checkRunning < CHECK_QUERY_PARALLEL && __checkQueue.length) {
      var job = __checkQueue.shift();
      __checkRunning++;
      Promise.resolve()
        .then(function () {
          if (!job.el || !document.body.contains(job.el)) return;
          return runCheckOne(job.el, job.sn);
        })
        .catch(function(){})
        .then(function () {
          __checkRunning--;
          __pumpCheckQueue();
        });
    }
  }

  function enqueueCheck(el, sn){
    __checkQueue.push({ el: el, sn: sn });
    __pumpCheckQueue();
  }

  let lockedInput = null;
  let lockedValue = '';

 const hoverCardMap = new WeakMap();
const hoverCache = new Map();
let hoverCurrentEl = null;

function syncSwitchFromStorage() {
  lockOn = localStorage.getItem(LOCK_SWITCH_KEY) === '1';
  autoRouteOn = localStorage.getItem(AUTO_ROUTE_KEY) !== '0';
}

  window.addEventListener('storage', function (e) {
    if (e.key === LOCK_SWITCH_KEY || e.key === AUTO_ROUTE_KEY) syncSwitchFromStorage();
  });

  function toStr(v){ return v == null ? '' : String(v).trim(); }
 function normSn(v){
  v = toStr(v).replace(/\s+/g, '');
  if (v.indexOf(':') >= 0) v = v.split(':').pop();
  return v;
}


  function normalizeForCompare(v){
    return toStr(v).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/：/g, ':').toUpperCase();
  }

  function normalizeSnForDup(v){
    v = toStr(v).replace(/\u00A0/g, ' ').replace(/\s+/g, '').trim();
    if (v.indexOf('：') >= 0) v = v.split('：').pop();
    if (v.indexOf(':') >= 0) v = v.split(':').pop();
    return v.toUpperCase();
  }
// ===== 左侧条码自定义清洗规则 =====
function loadLeftCleanRules() {
  try {
    var arr = JSON.parse(localStorage.getItem(LEFT_CLEAN_KEY) || '[]');

    if (Array.isArray(arr)) {
      var out = [];

      arr.forEach(function (x) {
        x = toStr(x)
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, '')
          .replace(/：/g, ':')
          .replace(/－/g, '-');

        if (x && out.indexOf(x) < 0) {
          out.push(x);
        }
      });

      return out;
    }
  } catch (e) {}

  return [];
}

function cleanLeftByRules(seg) {
  var s = toStr(seg)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/：/g, ':')
    .replace(/－/g, '-');

  if (!s) return '';

  var rules = loadLeftCleanRules();

  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    if (!r) continue;

    // 配置 ":"：清洗冒号前面的任意字符
    // U1:213409015510S4104636 => 213409015510S4104636
    if (r === ':') {
      var p = s.indexOf(':');
      if (p >= 0) {
        s = s.slice(p + 1);
      }
      continue;
    }

    // 配置 "-"：清洗横杠前面的任意字符
    // ABC-34090213 => 34090213
    if (r === '-') {
      var p2 = s.indexOf('-');
      if (p2 >= 0) {
        s = s.slice(p2 + 1);
      }
      continue;
    }

    // 普通固定前缀：
    // 配置 SN：SN03035FDT => 03035FDT
    if (s.toUpperCase().indexOf(r.toUpperCase()) === 0) {
      s = s.slice(r.length);
    }
  }

  return s;
}

// 只用于左侧条码的清洗，不影响接口查出来的编码
function extractLeftCodeSmart(text) {
  text = toStr(text).replace(/\u00A0/g, ' ').replace(/：/g, ':');

  var parts = text.split(/\s+/).filter(Boolean);
  var last = '';

  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i];

    // 先执行自定义左侧清洗
    seg = cleanLeftByRules(seg);

    // 保留原来逻辑：冒号后内容优先
    if (seg.indexOf(':') >= 0) {
      seg = seg.split(':').pop();
    }

    // 保留原来逻辑：带字母前缀的 xxx- / xxx_ 去掉
    seg = seg.replace(/^(?=[A-Z0-9]*[A-Z])[A-Z0-9]+[-_]/i, '');

    seg = normalizeForCompare(seg);

    if (seg) last = seg;
  }

  return last || normalizeForCompare(cleanLeftByRules(text));
}
// ===== 父项条码-BOM-SN采集记录 START =====
function bomCollectParentKey(v) {
  return normalizeSnForDup(v);
}

function bomCollectSnKey(v) {
  return normalizeSnForDup(v);
}

function bomCollectLoadStore() {
  var store = null;

  try {
    store = JSON.parse(localStorage.getItem(BOM_COLLECT_STORE_KEY) || 'null');
  } catch (e) {}

  if (!store || typeof store !== 'object') {
    store = {
      parents: {},
      snIndex: {}
    };
  }

  if (!store.parents || typeof store.parents !== 'object') {
    store.parents = {};
  }

  if (!store.snIndex || typeof store.snIndex !== 'object') {
    store.snIndex = {};
  }

  return store;
}

function bomCollectRebuildIndex(store) {
  store.snIndex = {};

  Object.keys(store.parents || {}).forEach(function (parentKey) {
    var p = store.parents[parentKey];
    if (!p || !Array.isArray(p.items)) return;

    p.items.forEach(function (item) {
      if (!item || !item.cleanSn) return;

      if (!store.snIndex[item.cleanSn]) {
        store.snIndex[item.cleanSn] = [];
      }

      store.snIndex[item.cleanSn].push({
        parentKey: parentKey,
        parentSn: p.parentSn || parentKey,
        bomCode: item.bomCode || '',
        sn: item.sn || '',
        cleanSn: item.cleanSn || '',
        ts: p.ts || item.ts || 0
      });
    });
  });

  return store;
}

function bomCollectPrune(store) {
  var keys = Object.keys(store.parents || {});

  if (keys.length <= BOM_COLLECT_MAX_PARENT) {
    return store;
  }

  keys.sort(function (a, b) {
    var pa = store.parents[a] || {};
    var pb = store.parents[b] || {};
    return Number(pb.ts || 0) - Number(pa.ts || 0);
  });

  var keep = {};
  keys.slice(0, BOM_COLLECT_MAX_PARENT).forEach(function (k) {
    keep[k] = store.parents[k];
  });

  store.parents = keep;

  return store;
}

function bomCollectSaveStore(store) {
  store = bomCollectPrune(store);
  store = bomCollectRebuildIndex(store);

  try {
    localStorage.setItem(BOM_COLLECT_STORE_KEY, JSON.stringify(store));
  } catch (e) {}

  return store;
}

function bomCollectSaveWhenGateAllOk(gateData) {
  if (!gateData || !gateData.allOk) return false;

  var parentRaw = toStr(gateData.parentSn);
  var parentKey = bomCollectParentKey(parentRaw);

  if (!parentKey) return false;

  if (!Array.isArray(gateData.details) || !gateData.details.length) {
    return false;
  }

  var now = Date.now();
  var items = [];

  gateData.details.forEach(function (d) {
    if (!d) return;
    if (d.status !== 'ok') return;

    var sn = toStr(d.sn);
    var cleanSn = bomCollectSnKey(d.cleanSn || d.sn);

    if (!sn || !cleanSn) return;

    var el = d.id ? document.getElementById(d.id) : null;
    var leftText = el ? getNearCode(el) : '';
    var bomCode = extractLeftCodeSmart(leftText);

    items.push({
      id: d.id || '',
      sn: sn,
      cleanSn: cleanSn,
      bomCode: bomCode || '',
      leftText: leftText || '',
      ts: now
    });
  });

  if (!items.length) return false;

  var store = bomCollectLoadStore();

  store.parents[parentKey] = {
    parentKey: parentKey,
    parentSn: parentRaw || parentKey,
    ts: now,
    count: items.length,
    items: items
  };

  bomCollectSaveStore(store);

  console.log('[BOM采集记录] 已保存父项BOM-SN关系：', {
    parentSn: parentRaw || parentKey,
    count: items.length,
    items: items
  });

  return true;
}

function bomCollectFindConflict(snRaw, currentParentRaw) {
  var cleanSn = bomCollectSnKey(snRaw);
  if (!cleanSn) return null;

  var currentParentKey = bomCollectParentKey(currentParentRaw || getParentBarcodeValueForGate());
  if (!currentParentKey) return null;

  var store = bomCollectLoadStore();
  var arr = store.snIndex && store.snIndex[cleanSn];

  if (!Array.isArray(arr) || !arr.length) {
    store = bomCollectRebuildIndex(store);
    arr = store.snIndex && store.snIndex[cleanSn];
  }

  if (!Array.isArray(arr) || !arr.length) return null;

  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    if (!item) continue;

    if (item.parentKey && item.parentKey !== currentParentKey) {
      return item;
    }
  }

  return null;
}

function bomCollectUnlockKey(el, snRaw) {
  var parentKey = bomCollectParentKey(getParentBarcodeValueForGate());
  var snKey = bomCollectSnKey(snRaw || (el ? el.value : ''));

  if (!parentKey || !snKey) return '';

  return parentKey + '|' + snKey;
}

function bomCollectIsUnlocked(el, snRaw) {
  var key = bomCollectUnlockKey(el, snRaw);
  if (!key) return false;

  var st = bomCollectUnlockMap.get(el);

  return !!(st && st.key === key);
}

function bomCollectUnlockInput(el) {
  if (!el) return;

  var key = bomCollectUnlockKey(el, el.value);

  if (!key) return;

  bomCollectUnlockMap.set(el, {
    key: key,
    ts: Date.now()
  });

  console.log('[BOM采集记录] 已手动解锁：', key);
}

function bomCollectCheckConflictAndLock(el, snRaw) {
  if (!el || !document.body.contains(el)) return false;

  snRaw = toStr(snRaw || el.value);

  if (!snRaw) return false;

  if (bomCollectIsUnlocked(el, snRaw)) {
    return false;
  }

  var hit = bomCollectFindConflict(snRaw, getParentBarcodeValueForGate());

  if (!hit) return false;

  var cleanSn = bomCollectSnKey(snRaw);

  var msg =
    'SN【' + cleanSn + '】已被父项【' + (hit.parentSn || hit.parentKey || '') + '】采集' +
    (hit.bomCode ? '，BOM【' + hit.bomCode + '】' : '');

  try {
    setSnCheckState(el, 'fail', msg, snRaw);
  } catch (e) {}

  try {
    showRowBubble(el, msg, 'err');
  } catch (e2) {}

  try {
    lockedInput = el;
    lockedValue = toStr(el.value);
  } catch (e3) {}

  setTimeout(function () {
    try {
      el.focus();
      el.select();
    } catch (e4) {}
  }, 0);

  console.warn('[BOM采集记录] 发现跨父项重复采集：', {
    sn: cleanSn,
    currentParent: getParentBarcodeValueForGate(),
    oldParent: hit.parentSn || hit.parentKey,
    bomCode: hit.bomCode || ''
  });

  return true;
}
// ===== 父项条码-BOM-SN采集记录 END =====

  // 仅删含字母前缀
  function extractCodeSmart(text){
    text = toStr(text).replace(/\u00A0/g, ' ').replace(/：/g, ':');
    var parts = text.split(/\s+/).filter(Boolean);
    var last = '';

    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (seg.indexOf(':') >= 0) seg = seg.split(':').pop();
      seg = seg.replace(/^(?=[A-Z0-9]*[A-Z])[A-Z0-9]+[-_]/i, '');
      seg = normalizeForCompare(seg);
      if (seg) last = seg;
    }
    return last || normalizeForCompare(text);
  }

  function isCodeEqual(leftText, actualCode){
  var L = extractLeftCodeSmart(leftText);
  var A = extractCodeSmart(actualCode);
  return !!L && !!A && L === A;
}


  // ===== 左侧定位 =====
  function nearestLeftCodeCell(inputEl){
    var ir = inputEl.getBoundingClientRect();
    var cands = [].slice.call(document.querySelectorAll('td.grid-cell'));
    var best = null, bestScore = Infinity;

    for (var i = 0; i < cands.length; i++) {
      var td = cands[i];
      var r = td.getBoundingClientRect();
      if (r.right > ir.left) continue;

      var dy = Math.abs((r.top + r.height / 2) - (ir.top + ir.height / 2));
      var dx = ir.left - r.right;
      if (dy > 80 || dx > 700) continue;

      var bonus = (td.className || '').indexOf('col0') >= 0 ? -20 : 0;
      var score = dy * 3 + dx + bonus;
      if (score < bestScore) { bestScore = score; best = td; }
    }
    return best;
  }

  function findCodeNodeByInput(el){ return nearestLeftCodeCell(el); }
  function findCodeByInput(el){ return findCodeNodeByInput(el); } // 兜底别名
  function getNearCode(el){
    var td = findCodeNodeByInput(el);
    return td ? toStr(td.innerText) : '';
  }

 // ===== 查询 =====
function isStrongCode(v){ return /^(34|45)\d{6}(-\d{3})?$/.test(toStr(v)); }
function isWeakCode(v){ return /^\d{8}(-\d{3})?$/.test(toStr(v)); }
function looksLikeDate8(v){ return /^20\d{6}$/.test(toStr(v)); }

// 新增：9开头，8位，或带-3位偏码
function isNineCode(v){
  v = toStr(v).toUpperCase();
  return /^9[A-Z0-9]{7}(?:-\d{3})?$/.test(v);
}

function pickFirstMatchedCode(obj){
  var strong = '';
  var weak = '';
  var nine = '';

  (function walk(x){
    if (x == null) return;

    if (typeof x !== 'object') {
      var s = toStr(x).toUpperCase();
      if (!s) return;

      if (!strong && isStrongCode(s)) { strong = s; return; }
      if (!weak && isWeakCode(s) && !looksLikeDate8(s)) weak = s;
      if (!nine && isNineCode(s)) nine = s;
      return;
    }

    if (Array.isArray(x)) { for (var i = 0; i < x.length; i++) walk(x[i]); return; }

    var keys = Object.keys(x);
    for (var k = 0; k < keys.length; k++) walk(x[keys[k]]);
  })(obj);

  return strong || weak || nine || '';
}

  async function fetchPage(sn, pageSize, pageNo, a, b){
    var url = BASE + '/' + pageSize + '/' + pageNo + '/' + a + '/' + b;
    var body = { barCode:'', snStr:sn, itemName:'', componentType:'', createdFrom:'', createdTo:'' };

    var r = await fetch(url, {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });

    return JSON.parse(await r.text());
  }

  async function queryAllRows(snRaw, pageSize){
    pageSize = pageSize || 100;
    var sn = normSn(snRaw);
    var modes = [[0,0],[7,0]];
    var best = { sn: sn, rows: [], mode: '-' };

    for (var i = 0; i < modes.length; i++) {
      var a = modes[i][0], b = modes[i][1];
      var page = 1, totalPages = 1, rows = [];

      do {
        var j = await fetchPage(sn, pageSize, page, a, b);
        var vo = (j && j.resultObjVO) || {};
        var pageVO = vo.pageVO || {};
        rows = rows.concat(vo.result || []);
        totalPages = Number(pageVO.totalPages || 1);
        page++;
      } while (page <= totalPages);

      if (rows.length) return { sn: sn, rows: rows, mode: a + '/' + b };
      best = { sn: sn, rows: rows, mode: a + '/' + b };
    }
    return best;
  }

  async function queryCodeBySn_OpenApi(snRaw){
    var sn = normSn(snRaw);
    var url = 'https://w3.huawei.com/mes/qmgateway/com.huawei.supply.mes.mesplus.qm:mesqmmitrservice/mes/mitrservice/services/openapi/getSnAttr';

    var r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sn: sn })
    });

    var j = await r.json();
    var vo = (j && j.resultObjVO) || {};
    var code = toStr(vo.partNo);
    var altCodes = [];
    if (Array.isArray(vo.result)) {
      for (var i = 0; i < vo.result.length; i++) {
        var item = vo.result[i];
        if (item && item.__convertFrom) {
          var alt = toStr(item.partNo || item.code || item.itemCode || '');
          if (alt && alt !== code) altCodes.push(alt);
        }
      }
    }
    return { sn: sn, code: code, altCodes: altCodes, source: 'openapi', mode: '-', rows: 0 };
  }

  async function queryCodeHybrid(snRaw){
    var q1 = await queryAllRows(snRaw, 100);
    var code1 = pickFirstMatchedCode(q1.rows);
    if (code1) return { sn: q1.sn, code: code1, altCodes: [], source: 'ems-find', mode: q1.mode, rows: q1.rows.length };
    return queryCodeBySn_OpenApi(snRaw);
  }

  // ===== v2.7.15 清框后转填抑制窗（一体化脚本信号）=====
  // 一体化清框（自动暂存清空/取出清残留）后写 sn_suppress_refill_v1=截止时间戳；
  // 窗口内扫码枪双发/断扫迟到的码不再被弹窗转填/自动归位写进刚清空的框
  //（框已空→防重不拦→码被填回去再校验 OK = "清不干净留一条"的根因）
  function suppressRefillActive() {
    try { return Date.now() < Number(localStorage.getItem('sn_suppress_refill_v1') || 0); } catch (e) { return false; }
  }

  // ===== 自动归位 =====
  function allSnInputs(){
    var arr = [].slice.call(document.querySelectorAll(selector));
    arr.sort(function (a, b) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var dy = ra.top - rb.top;
      if (Math.abs(dy) > 4) return dy;
      return ra.left - rb.left;
    });
    return arr;
  }

  function hasDuplicateSn(snRaw, ignoreEl){
    var sn = normalizeSnForDup(snRaw);
    if (!sn) return false;

    var els = allSnInputs();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (ignoreEl && el === ignoreEl) continue;
      var v = normalizeSnForDup(el.value);
      if (v && v === sn) return true;
    }
    return false;
  }

  function findTargetInputByActualCode(actualCode, excludeEl){
    var A = extractCodeSmart(actualCode);
    if (!A) return null;

    var els = allSnInputs();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === excludeEl) continue;
      var left = extractLeftCodeSmart(getNearCode(el));
      if (left && left === A && !toStr(el.value)) return el;
    }
    return null;
  }

  function commitInputByEnter(el, noFocus){
    if (!el) return;
    if (!noFocus) { try { el.focus(); } catch(e){} }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); // v2.7.13 MES 新页面监听 keypress，缺它不提交
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }

  function tryAutoRouteWrongScan(currEl, snRaw, actualCode){
    if (suppressRefillActive()) return null; // v2.7.15：清框抑制窗内不做归位
    if (!toStr(snRaw) || !toStr(actualCode)) return null;
    if (hasDuplicateSn(snRaw, currEl)) return null;

    var target = findTargetInputByActualCode(actualCode, currEl);
    if (!target) return null;

    if (hasDuplicateSn(snRaw, currEl)) return null;

        // 自动转填期间，暂停重复锁定，避免临时重复误锁
    suppressDuplicateLockForRoute(1200);

    target.dataset.snAutoFill = '1';
    target.dataset.snRouteMoving = '1';
    target.dataset.autoFilled = '1';

    currEl.dataset.snRouteMoving = '1';

    target.value = snRaw;

    setSnCheckState(target, 'pending', '自动转填待校验', snRaw);


    setTimeout(function () {
      try { commitInputByEnter(target); } catch(e){}
           setTimeout(function () {
        try { enqueueCheck(target, toStr(target.value) || snRaw); } catch(e2){}
      }, 60);

    }, 0);

    // 修复1：清空原框时同步模型 + 清缓存 + 禁止空值回放
    currEl.value = '';
    lastScanByInput.delete(currEl);
    setSnCheckState(currEl, 'empty', '已转填', '');
    suppressEmptyReplay.add(currEl);


    currEl.dispatchEvent(new Event('input', { bubbles: true }));
    currEl.dispatchEvent(new Event('change', { bubbles: true }));

    setTimeout(function () { suppressEmptyReplay.delete(currEl); }, 300);
    // 自动转填结束后，清除标记，并重新检查真实重复
    setTimeout(function () {
      try { delete target.dataset.snAutoFill; } catch(e){}
      try { delete target.dataset.snRouteMoving; } catch(e){}
      try { delete currEl.dataset.snRouteMoving; } catch(e){}

      try { refreshDuplicateLock(target); } catch(e2){}
    }, 1200);

    // 保持你原行为：回当前框并全选
    setTimeout(function () { try { currEl.focus(); currEl.select(); } catch(e){} }, 80);

    return target;
  }

  function focusNextEmptyFrom(el){
    var els = allSnInputs();
    var idx = els.indexOf(el);
    if (idx < 0) return null;
    for (var i = idx + 1; i < els.length; i++) {
      if (!toStr(els[i].value)) return els[i];
    }
    return null;
  }

  // ===== 气泡 =====
  function ensureRowBubble(inputEl){
    var st = rowBubbleMap.get(inputEl);

    if (!st) {
      var box = document.createElement('div');
      var arrow = document.createElement('div');

      document.body.appendChild(box);
      document.body.appendChild(arrow);

      st = { box: box, arrow: arrow, type: 'warn', text: '' };
      rowBubbleMap.set(inputEl, st);
      rowBubbleKeys.add(inputEl);
    }

    // 每次都强制刷新样式，避免旧样式残留导致只有一个小豆豆
    st.box.style.position = 'fixed';
    st.box.style.zIndex = '2147483647';
    st.box.style.display = 'block';
    st.box.style.visibility = 'visible';
    st.box.style.boxSizing = 'border-box';
    st.box.style.width = 'auto';
    st.box.style.minWidth = '80px';
   st.box.style.maxWidth = '520px';
      st.box.style.minHeight = '24px';
      st.box.style.padding = '6px 10px';
      st.box.style.borderRadius = '6px';
      st.box.style.color = '#fff';
      st.box.style.fontSize = '12px';
      st.box.style.fontWeight = '400';
      st.box.style.lineHeight = '18px';
      st.box.style.textAlign = 'left';
      st.box.style.boxShadow = '0 4px 12px rgba(0,0,0,.2)';
      st.box.style.whiteSpace = 'normal';
      st.box.style.wordBreak = 'break-all';
      st.box.style.overflowWrap = 'anywhere';
      st.box.style.overflow = 'visible';
      st.box.style.pointerEvents = 'none';


    st.arrow.style.position = 'fixed';
    st.arrow.style.zIndex = '2147483647';
    st.arrow.style.width = '0';
    st.arrow.style.height = '0';
    st.arrow.style.pointerEvents = 'none';
    st.arrow.style.display = 'block';

    return st;
  }


  function positionRowBubble(inputEl){
    var st = rowBubbleMap.get(inputEl);
    if (!st) return;
    if (!document.body.contains(inputEl)) return removeRowBubble(inputEl);

    var r = inputEl.getBoundingClientRect();

    // 确保文字已经撑开后再取宽高
    var bw = st.box.getBoundingClientRect().width || st.box.offsetWidth || 120;
    var bh = st.box.getBoundingClientRect().height || st.box.offsetHeight || 28;
    st.box.style.maxWidth = Math.min(520, window.innerWidth - 40) + 'px';
    st.box.style.width = 'auto';

    var arrow = 6;
    var gap = 8;

    // 默认放右边
    var left = r.right + gap + arrow;

    // 如果右边空间不够，贴到视窗右边，但仍然保持在右侧区域
    if (left + bw > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - bw - 8);
    }

    var top = r.top + (r.height - bh) / 2;

    if (top < 8) top = 8;
    if (top + bh > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - bh - 8);
    }

    st.box.style.left = left + 'px';
    st.box.style.top = top + 'px';

    // 箭头在气泡左侧，指向SN框
    st.arrow.style.left = (left - arrow * 2 + 1) + 'px';
    st.arrow.style.top = (top + bh / 2 - arrow) + 'px';
  }




  function showRowBubble(inputEl, text, type){
    var st = ensureRowBubble(inputEl);

    st.type = type || 'warn';
    st.text = text || '';

    var bg = '#d48806';
    if (st.type === 'err') bg = '#d4380d';
    if (st.type === 'warn') bg = '#d48806';
    if (st.type === 'ok') bg = '#389e0d';

    st.box.style.background = bg;
    st.box.style.color = '#fff';
    st.box.textContent = st.text || '提示';

    // 先清空箭头旧样式，防止左箭头/右箭头样式叠加成小豆豆
    st.arrow.style.borderTop = '0';
    st.arrow.style.borderBottom = '0';
    st.arrow.style.borderLeft = '0';
    st.arrow.style.borderRight = '0';

    // 气泡在右边，所以箭头在气泡左侧，尖头朝左，指向SN框
    st.arrow.style.borderTop = '6px solid transparent';
    st.arrow.style.borderBottom = '6px solid transparent';
    st.arrow.style.borderRight = '6px solid ' + bg;
    st.arrow.style.borderLeft = '0';

    positionRowBubble(inputEl);

    // 再延迟一帧重新定位，确保文字宽度生效
    requestAnimationFrame(function () {
      positionRowBubble(inputEl);
    });
  }



  function removeRowBubble(inputEl){
    var st = rowBubbleMap.get(inputEl);
    if (!st) return;
    if (st.box && st.box.parentNode) st.box.parentNode.removeChild(st.box);
    if (st.arrow && st.arrow.parentNode) st.arrow.parentNode.removeChild(st.arrow);
    rowBubbleMap.delete(inputEl);
    rowBubbleKeys.delete(inputEl);
  }

  function removeAllRowBubbles(){ rowBubbleKeys.forEach(function(el){ removeRowBubble(el); }); }
  function refreshAllBubblePos(){ rowBubbleKeys.forEach(function(el){ positionRowBubble(el); }); }

  window.addEventListener('scroll', refreshAllBubblePos, true);
  window.addEventListener('resize', refreshAllBubblePos, true);

  // ===== 白底悬浮信息卡（放在SN框下方）=====
  function ensureHoverCard(inputEl){
    var card = hoverCardMap.get(inputEl);
    if (card) return card;

    card = document.createElement('div');
    card.style.position = 'fixed';
    card.style.zIndex = '2147483646';
    card.style.maxWidth = '380px';
    card.style.padding = '8px 10px';
    card.style.borderRadius = '8px';
    card.style.background = '#fff';
    card.style.color = '#333';
    card.style.border = '1px solid #d9d9d9';
    card.style.fontSize = '12px';
    card.style.lineHeight = '1.5';
    card.style.whiteSpace = 'pre-line';
    card.style.pointerEvents = 'none';
    card.style.boxShadow = '0 6px 20px rgba(0,0,0,.15)';
    card.style.display = 'none';

    document.body.appendChild(card);
    hoverCardMap.set(inputEl, card);
    return card;
  }

  function positionHoverCard(inputEl){
    var card = hoverCardMap.get(inputEl);
    if (!card) return;

    var r = inputEl.getBoundingClientRect();
    var left = r.left;
    var top = r.bottom + 6; // 放在下方

    var maxW = 380;
    if (left + maxW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - maxW - 8);
    }

    var cardH = card.offsetHeight || 120;
    if (top + cardH > window.innerHeight - 8) {
      top = Math.max(8, r.top - cardH - 6); // 放不下就上方
    }

    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function hideHoverCard(inputEl){
    var card = hoverCardMap.get(inputEl);
    if (card) card.style.display = 'none';
    if (hoverCurrentEl === inputEl) hoverCurrentEl = null;
  }

  async function queryHoverInfo(snRaw){
    var sn = normSn(snRaw);
    if (!sn) return null;

    var hit = hoverCache.get(sn);
    var now = Date.now();
    if (hit && (now - hit.ts < 15000)) return hit.data;

    var q = await queryCodeHybrid(sn);
    var data = {
      sn: q.sn || sn,
      code: toStr(q.code),
      source: q.source || '-',
      mode: q.mode || '-',
      rows: q.rows || 0
    };
    hoverCache.set(sn, { ts: now, data: data });
    return data;
  }

  async function showHoverInfo(inputEl){
    var snRaw = toStr(inputEl.value);
    if (!snRaw) return hideHoverCard(inputEl);

    hoverCurrentEl = inputEl;

    var leftRaw = getNearCode(inputEl) || '';
    var leftFiltered = extractLeftCodeSmart(leftRaw) || '(无)';
    var card = ensureHoverCard(inputEl);

    card.textContent = '左侧(过滤后): ' + leftFiltered + '\n查询中...';
    card.style.display = 'block';
    positionHoverCard(inputEl);

    try {
      var info = await queryHoverInfo(snRaw);
      if (hoverCurrentEl !== inputEl) return;

      var queryFiltered = info && info.code ? (extractCodeSmart(info.code) || info.code) : '(无)';
      card.textContent =
        '左侧(过滤后): ' + leftFiltered + '\n' +
        '查询: ' + queryFiltered + '\n' +
        '来源: ' + (info ? info.source : '-') + '\n' +
        '模式: ' + (info ? info.mode : '-') + '\n' +
        'rows: ' + (info ? info.rows : 0);

      card.style.display = 'block';
      positionHoverCard(inputEl);
    } catch (e) {
      if (hoverCurrentEl !== inputEl) return;
      card.textContent = '左侧(过滤后): ' + leftFiltered + '\n查询异常: ' + String(e);
      card.style.display = 'block';
      positionHoverCard(inputEl);
    }
  }

  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(selector)) showHoverInfo(t);
  }, true);
  document.addEventListener('mouseout', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(selector)) hideHoverCard(t);
  }, true);

  // ===== 主校验 =====
  function paintCodeNode(node, status){
    if (!node) return;
    node.style.backgroundColor = '';
    if (status === 'fail') { node.style.color = '#d4380d'; node.style.fontWeight = '700'; }
    else if (status === 'none') { node.style.color = '#d48806'; node.style.fontWeight = '700'; }
    else if (status === 'ok') { node.style.color = '#389e0d'; node.style.fontWeight = '700'; }
    else { node.style.color = ''; node.style.fontWeight = ''; }
  }

    async function runCheckOne(el, snOverride){
    // 前置检查（冲突锁/空值/pending 状态）保持串行，避免并发打架
    var pre = null;
    await __nextCommit(function () {
      syncSwitchFromStorage();

      var seq = (__reqSeq.get(el) || 0) + 1;
      __reqSeq.set(el, seq);

      var snRaw = toStr(snOverride || el.value);
      if (!snRaw) {
        resetNoCodeRetry(el);
        setSnCheckState(el, 'empty', '空', '');
        removeRowBubble(el);
        paintCodeNode(findCodeNodeByInput(el), '');
        return { skip: true };
      }

      if (bomCollectCheckConflictAndLock(el, snRaw)) {
        return { skip: true };
      }

      setSnCheckState(el, 'pending', '查询中', snRaw);

      pre = {
        skip: false,
        seq: seq,
        snRaw: snRaw,
        expected: getNearCode(el),
        codeNode: findCodeNodeByInput(el)
      };
    });
    if (!pre || pre.skip) return;

    var seq = pre.seq;
    var snRaw = pre.snRaw;
    function isStale(){ return __reqSeq.get(el) !== seq; }

    var expected = pre.expected;
    var codeNode = pre.codeNode;

    // 查码并行段：多任务同时发接口请求
    var q = null, qErr = null;
    try {
      q = await queryCodeHybrid(snRaw);
    } catch (e) { qErr = e; }

    // 结果回填保持串行（含自动转填/焦点），防并发写同一行打架
    await __nextCommit(function () {
      if (isStale()) return;

      if (qErr) {
        resetNoCodeRetry(el);
        setSnCheckState(el, 'fail', '查询失败', snRaw);
        paintCodeNode(codeNode, 'fail');
        showRowBubble(el, '查询失败', 'err');
      } else {
        var actual = q.code;

        if (!expected) {
          resetNoCodeRetry(el);
          setSnCheckState(el, 'fail', '无左侧编码', snRaw);
          paintCodeNode(codeNode, 'none');
          showRowBubble(el, '无左侧编码', 'warn');

        } else if (!actual) {
          paintCodeNode(codeNode, 'none');

          // 查不到编码时先自动重试，防止扫太快接口还没返回数据
          if (scheduleNoCodeRetry(el, snRaw)) {
            setSnCheckState(el, 'retry', '未查到编码，重试中', snRaw);
            return;
          }

          setSnCheckState(el, 'fail', '无对应编码，已重试' + NO_CODE_RETRY_MAX + '次', snRaw);
          showRowBubble(el, '无对应编码，已重试' + NO_CODE_RETRY_MAX + '次', 'warn');

        } else if (isCodeEqual(expected, actual)) {
          resetNoCodeRetry(el);
          setSnCheckState(el, 'ok', '编码一致', snRaw);
          paintCodeNode(codeNode, 'ok');
          removeRowBubble(el);

        } else {
          var altMatch = false;
          var altMatchedCode = '';
          if (Array.isArray(q.altCodes)) {
            for (var ai = 0; ai < q.altCodes.length; ai++) {
              if (isCodeEqual(expected, q.altCodes[ai])) { altMatch = true; altMatchedCode = q.altCodes[ai]; break; }
            }
          }
          if (altMatch) {
            resetNoCodeRetry(el);
            setSnCheckState(el, 'ok', '编码一致(转换)', snRaw);
            paintCodeNode(codeNode, 'ok');
            removeRowBubble(el);
          } else {
          resetNoCodeRetry(el);

          var targetEl = null;
          if (autoRouteOn) {
            targetEl = tryAutoRouteWrongScan(el, snRaw, actual);
            if (!targetEl && Array.isArray(q.altCodes)) {
              for (var ai = 0; ai < q.altCodes.length; ai++) {
                targetEl = tryAutoRouteWrongScan(el, snRaw, q.altCodes[ai]);
                if (targetEl) break;
              }
            }
          }
          if (isStale()) return;

          if (targetEl) {
            setSnCheckState(el, 'empty', '已转填', '');
            paintCodeNode(codeNode, 'none');
            showRowBubble(el, '已转填', 'warn');
            showRowBubble(targetEl, '已自动填入对应编码行', 'warn');
          } else {
            setSnCheckState(el, 'fail', '编码不一致', snRaw);
            paintCodeNode(codeNode, 'fail');
            showRowBubble(el, '编码不一致', 'err');

            if (lockOn) {
              lockedInput = el;
              lockedValue = toStr(el.value);
              setTimeout(function(){ try { el.focus(); el.select(); } catch (e) {} }, 0);
            }
          }
        }
      }
    }

    if (isStale()) return;
    refreshAllBubblePos();
  });
    }


  // ===== 监听 =====
  // 只鼠标悬停显示详情，不在 focus 时显示
  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(selector)) showHoverInfo(t);
  }, true);

  // 扫码流防截断（v2.7.8 两条独立流水线）：扫码接收（弹窗）永远优先，
  // 转填提交（写网格框+提交）改为独立流水线——只在"两条码之间的空隙"执行，
  // 任何时刻不插正在接收的扫码流（此前两类截断全是转填/守护在扫码流中途搬焦点）：
  //   ① 转填后 MES 推进焦点到网格框，守护(200ms)/拉回(120ms)抢焦点
  //      （34090101：2134090101→网格框 + 10S7000171→弹窗）
  //   ② 扫码比查码快（间隔620ms<查码680ms），上一条码异步转填的 target.focus()
  //      在下一条码流中途抢走弹窗焦点（34090101：213409010110S→弹窗 + 7000177→网格框）
  //   ③ 转填后 120ms"拉回焦点+select()"落在下一条码流开头：select() 全选已输入字符，
  //      下一字符整段顶掉（213409027610S5001932：213409027610 被 S 顶掉只剩 S5001932）
  //      → 120ms 定时器已删除，焦点回弹窗交给 200ms 焦点守护兜底
  //   v2.7.10 转填彻底无焦点化：提交不再 el.focus()（commitInputByEnter(el, true)），
  //      弹窗焦点全程纹丝不动；回车 keydown 处理完同步 popupInput.focus() 零延时回焦；
  //      取消"等两条码空隙"排队（速度优先，无焦点提交无撞流风险）
  //   v2.7.12 删 500ms 兜底重提交（无焦点料件值不变无法判成败，
  //      误触发抢焦点打断扫码流=34090155 断流事故，重复提交还会被 MES 拒收清空框）；
  //      "无空框可填"前加 4×150ms 重试（防网格重渲染/瞬时占框误判）
  //   v2.7.13 MES 新页面改监听 keypress：无 keypress 的合成 Enter 只导航不提交
  //      （155/132/133 码整轮未触发之因）；提交改"聚焦→keydown/keypress/keyup→
  //      立即回弹窗焦点"同步块（微秒窗口不撞流），autoFilled 提交后再打防自动跳框抢焦点
  // 只认"可信"击键（扫码枪/人手）；转填的脚本写入(MES 规范化)是 isTrusted=false，不触发。
  var __lastGridTypeAt = 0, __lastPopupTypeAt = 0;
  function __scanBusyGrid() { return Date.now() - __lastGridTypeAt < 800; }

  // v2.7.16：条码采集框（模块码）"正在扫"追踪——模块码扫码流期间同样禁止弹窗抢焦点。
  // 修复"断码"：扫模块码时 300ms 巡检看到采集框值变化→openPopup 的 50ms 延时 focus
  // 落在扫码流中途→焦点被弹窗抢走，模块码前半在采集框、后半落进弹窗（"未查到物料编码"）。
  var __lastParentTypeAt = 0;
  var __parentBoxCache = null;
  function __getParentBarcodeBox() {
    if (__parentBoxCache && document.contains(__parentBoxCache)) return __parentBoxCache;
    __parentBoxCache = (function () {
      var all = document.querySelectorAll('div[id^="Input_"] > input');
      for (var i = 0; i < all.length; i++) {
        var box = all[i].closest('div[id^="Input_"]');
        var ctx = ((box && box.parentElement ? box.parentElement.innerText : '') || '').replace(/\s+/g, '');
        if (ctx.indexOf('条码采集') >= 0) return all[i];
      }
      return null;
    })();
    return __parentBoxCache;
  }
  function __scanBusyParent() { return Date.now() - __lastParentTypeAt < 800; }

 // focusin 仅保留锁逻辑（去掉 autoFilled 自动跳下一个）
document.addEventListener('focusin', function (e) {
  var t = e.target;
  if (!t || !t.matches || !t.matches(selector)) return;

  __lastSnInput = t;

  // 锁定优先
  if (lockOn && lockedInput && t !== lockedInput) {
    setTimeout(function () {
      try { lockedInput.focus(); lockedInput.select(); } catch (err) {}
    }, 0);
    return;
  }

  // 已自动转填且有值：自动跳过到下一个空框
  if (t.dataset && t.dataset.autoFilled === '1' && toStr(t.value)) {
    var nxt = focusNextEmptyFrom(t);
    if (nxt) {
      setTimeout(function () {
        try { nxt.focus(); } catch (e2) {}
      }, 0);
    }
  }
}, true);



  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(selector)) {
      __preJumpSnInput = t; // 记录跳走前SN框
    }
  }, true);

  // 修复2：input 改为串行入队
  document.addEventListener('input', function (e) {
    var t = e.target;
    // v2.7.16：采集框真实击键（模块码扫码流）→ 标记 800ms 扫码忙，弹窗不抢焦点
    if (t && e.isTrusted && t.tagName === 'INPUT') {
      var pbc = __getParentBarcodeBox();
      if (pbc && t === pbc) __lastParentTypeAt = Date.now();
    }
    if (!t || !t.matches || !t.matches(selector)) return;
    if (e.isTrusted) __lastGridTypeAt = Date.now(); // 真实击键（扫码枪流）：800ms 内禁止任何搬焦点
    if (t.dataset && t.dataset.snAutoFill === '1') return;

    syncSwitchFromStorage();

       if (toStr(t.value)) {
      lastScanByInput.set(t, toStr(t.value));
      lastNonEmptyScanByInput.set(t, toStr(t.value));
      setSnCheckState(t, 'pending', '等待校验', toStr(t.value));
    } else {
      setSnCheckState(t, 'empty', '空', '');
    }



    if (lockOn && lockedInput === t && toStr(t.value) !== lockedValue) {
      lockedInput = null;
      lockedValue = '';
    }

    // v2.7.14：每框独立计时器（旧版全局单计时器在快速连续回填时互相取消入队）
    var tm = __checkTimers.get(t);
    if (tm) clearTimeout(tm);
    __checkTimers.set(t, setTimeout(function () {
      __checkTimers.delete(t);
      enqueueCheck(t, toStr(t.value));
    }, 220));
  }, true);

  // 修复1+2：屏蔽脚本清空回放 + 串行入队
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches(selector)) return;

    syncSwitchFromStorage();

    if (!toStr(t.value)) {
      if (suppressEmptyReplay.has(t)) return;

      var last = toStr(lastScanByInput.get(t));
      if (last) {
        setTimeout(function () {
          enqueueCheck(t, last);
        }, 0);
      }
    }
  }, true);

  // 双击解锁
  document.addEventListener('dblclick', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches(selector)) return;

    if (t.dataset && t.dataset.autoFilled) delete t.dataset.autoFilled;

    try {
      bomCollectUnlockInput(t);
    } catch (err) {}

    lockedInput = null;
    lockedValue = '';

    showRowBubble(t, '已解锁，可手动修改', 'warn');
    setTimeout(function(){ removeRowBubble(t); }, 1200);
  }, true);


  // Esc 解锁
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      lockedInput = null;
      lockedValue = '';
    }
  }, true);

  // ===== 覆盖这整段：弹窗自动关闭 + 单次回拉 + 不回填但可转填 =====
  var __lastSnInput = null;
  var __preJumpSnInput = null;
  var __snErrBubbleUntil = 0;
  var __snErrBubbleText = '';

  // 记录当前SN焦点
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(selector)) {
      __lastSnInput = t;
    }
  }, true);

  // 记录跳走前SN框
  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches(selector)) {
      __preJumpSnInput = t;
    }
  }, true);

  var __snDialogMo = new MutationObserver(function (list) {
    list.forEach(function (m) {
      [].forEach.call(m.addedNodes || [], function (n) {
        if (!n || n.nodeType !== 1) return;

        var dialog = null;
        if (n.matches && n.matches('.hae-dialog.popup-dialog, .dialog-tips.hae-dialog')) {
          dialog = n;
        } else if (n.querySelector) {
          dialog = n.querySelector('.hae-dialog.popup-dialog, .dialog-tips.hae-dialog');
        }
        if (!dialog) return;

        var txt = (dialog.innerText || '');
                var isErr1 = txt.indexOf('未配置新编码') >= 0 && txt.indexOf('物料SN[') >= 0;
        var isErr2 = txt.indexOf('新编码与当前物料编码不一致') >= 0;
        if (!isErr1 && !isErr2) return;

        // 自动点“确定”
        var okBtn = dialog.querySelector('button.hae-btn.btn-primary, .btn-primary');
        if (okBtn) {
          try { okBtn.click(); } catch (e) {}
        }

        // 单次回拉（不回填），但用缓存值触发转填
        setTimeout(function () {
          var recoverEl = __preJumpSnInput || __lastSnInput;
          if (!recoverEl || !document.body.contains(recoverEl)) return;
          if (!(recoverEl.matches && recoverEl.matches(selector))) return;

         // 不回填输入框，但用最近缓存值跑校验/自动转填（含兜底缓存）
var last = toStr(
  lastScanByInput.get(recoverEl) ||
  lastNonEmptyScanByInput.get(recoverEl)
);
if (last) {
  enqueueCheck(recoverEl, last);
}


          var msg = isErr2 ? '系统校验未通过：新编码与当前物料编码不一致，请重新扫描' : '系统校验未通过：未配置新编码，请重新扫描';

          __snErrBubbleText = msg;
          __snErrBubbleUntil = Date.now() + 5000;

          try { showRowBubble(recoverEl, msg, 'err'); } catch (e) {}
          try { recoverEl.focus(); recoverEl.select(); } catch (e) {}

          setTimeout(function () {
            if (Date.now() >= __snErrBubbleUntil && __snErrBubbleText === msg) {
              try { removeRowBubble(recoverEl); } catch (e) {}
            }
          }, 5000);
        }, 80);
      });
    });
  });

  __snDialogMo.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  // ===== 悬浮卡兜底隐藏（防卡住）=====
  setInterval(function () {
    if (!hoverCurrentEl) return;

    if (!document.body.contains(hoverCurrentEl)) {
      hideHoverCard(hoverCurrentEl);
      hoverCurrentEl = null;
      return;
    }

    var over = document.querySelector(selector + ':hover');
    if (over !== hoverCurrentEl) {
      hideHoverCard(hoverCurrentEl);
      hoverCurrentEl = null;
    }
  }, 180);

  document.addEventListener('scroll', function () {
    if (hoverCurrentEl) {
      hideHoverCard(hoverCurrentEl);
      hoverCurrentEl = null;
    }
  }, true);

  document.addEventListener('mousedown', function () {
    if (hoverCurrentEl) {
      hideHoverCard(hoverCurrentEl);
      hoverCurrentEl = null;
    }
  }, true);

 // ===== 清理 =====
function hasGridRows(){ return document.querySelectorAll('tr.grid-row').length > 0; }
function allSnEmpty(){
  var els = document.querySelectorAll(selector);
  for (var i = 0; i < els.length; i++) {
    if ((els[i].value || '').trim()) return false;
  }
  return true;
}

setInterval(function () {
  if (Date.now() < __snErrBubbleUntil) return;

  if (!hasGridRows() || allSnEmpty()) {
    removeAllRowBubbles();
    hoverCurrentEl = null;
  }
}, 300);

  // ===== 扫码转填弹窗（v2.7.4）START =====
  var POPUP_KEY = 'sn_scan_popup_on';
  var POPUP_POS_KEY = 'sn_scan_popup_pos_v1';
  var popupEl = null, popupInput = null, popupCountEl = null, popupStatusEl = null;
  var popupParentEl = null, popupLogEl = null, popupChip = null;
  var __popupLastCount = -1;
  var __popupLastBarcode = '';
  var __popupFirstEl = null;
  var __popupChain = Promise.resolve();
  var __popupCaptureTimer = null;
  var __popupUserInGrid = false;
  var popupLogEntries = [];
  var popupLogPendingSn = '';

  // 默认关（网格模式）：一体化面板勾选"SN弹窗"才开
  function popupEnabled() { try { return localStorage.getItem(POPUP_KEY) === '1'; } catch (e) { return false; } }

  function popupLogNorm(s) { return String(s || '').replace(/\s+/g, '').split(':').pop().toUpperCase(); }

  function popupLogRender() {
    if (!popupLogEl) return;
    popupLogEl.innerHTML = '';
    if (!popupLogEntries.length) {
      var em = document.createElement('div');
      em.style.cssText = 'color:#94a3b8;font-family:Consolas,monospace';
      em.textContent = '（尚未扫描）';
      popupLogEl.appendChild(em);
      return;
    }
    popupLogEntries.forEach(function (en) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:10px;white-space:nowrap';
      var left = document.createElement('span');
      left.style.cssText = 'overflow:hidden;text-overflow:ellipsis;font-family:Consolas,monospace;font-size:11px;color:#334155';
      left.textContent = en.sn;
      var right = document.createElement('span');
      var color = en.cls === 'ok' ? '#2563eb' : en.cls === 'warn' ? '#d97706' : en.cls === 'bad' ? '#dc2626' : '#94a3b8';
      right.style.cssText = 'font-family:Consolas,monospace;font-size:11px;font-weight:700;color:' + color;
      right.textContent = en.cls === 'wait' ? '…' : (en.code || '');
      row.appendChild(left);
      row.appendChild(right);
      popupLogEl.appendChild(row);
    });
    popupLogEl.scrollTop = popupLogEl.scrollHeight;
  }

  function popupLogReset() { popupLogEntries = []; popupLogPendingSn = ''; popupLogRender(); }

  function popupLogFinalize(snMatch, cls, code) {
    var en = null, i;
    for (i = 0; i < popupLogEntries.length; i++) {
      if (popupLogEntries[i].cls === 'wait' && snMatch && popupLogNorm(popupLogEntries[i].sn) === popupLogNorm(snMatch)) { en = popupLogEntries[i]; break; }
    }
    if (!en) {
      for (i = 0; i < popupLogEntries.length; i++) if (popupLogEntries[i].cls === 'wait') { en = popupLogEntries[i]; break; }
    }
    if (!en) return;
    en.cls = cls;
    en.code = code;
    popupLogRender();
  }

  // 状态行状态机："查码中…SN" 与结论（✓码/⚠重复SN/未查到SN/无空框）严格串行对应
  function popupLogOnStatus() {
    if (!popupStatusEl) return;
    var t = (popupStatusEl.textContent || '').trim();
    if (!t) return;
    if (t.indexOf('查码中') === 0) {
      var qsn = t.replace(/^查码中[….\s]*/, '').trim();
      popupLogPendingSn = qsn ? popupLogNorm(qsn) : '';
      return;
    }
    if (t.indexOf('✓ 已全部填满') === 0) {
      if (popupLogPendingSn) { popupLogFinalize(popupLogPendingSn, 'ok', '✓'); popupLogPendingSn = ''; }
      return;
    }
    if (t.indexOf('✓') === 0) {
      var code = t.slice(1).trim().split(/\s+/)[0];
      if (popupLogPendingSn) { popupLogFinalize(popupLogPendingSn, 'ok', code); popupLogPendingSn = ''; }
      return;
    }
    if (t.indexOf('⚠') === 0 && t.indexOf('重复') >= 0) {
      var snm = t.replace(/^.*?重复\s*SN[：:]\s*/, '').trim();
      popupLogFinalize(snm, 'warn', '重复');
      return;
    }
    if (t.indexOf('无空框可填') >= 0) {
      if (popupLogPendingSn) { popupLogFinalize(popupLogPendingSn, 'warn', '无空框'); popupLogPendingSn = ''; }
      return;
    }
    if (t.indexOf('未查到物料编码') >= 0) {
      if (popupLogPendingSn) { popupLogFinalize(popupLogPendingSn, 'bad', '未查到'); popupLogPendingSn = ''; }
      else {
        var snm2 = t.replace(/^.*?[：:]\s*/, '').trim();
        popupLogFinalize(snm2, 'bad', '未查到');
      }
      return;
    }
    if (t.indexOf('查询失败') >= 0) {
      if (popupLogPendingSn) { popupLogFinalize(popupLogPendingSn, 'bad', '失败'); popupLogPendingSn = ''; }
      return;
    }
  }

  function initPopupDrag(header) {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(POPUP_POS_KEY) || 'null'); } catch (e) {}
    if (saved && typeof saved.left === 'number') {
      popupEl.style.right = 'auto';
      popupEl.style.left = saved.left + 'px';
      popupEl.style.top = saved.top + 'px';
    }
    var drag = null;
    header.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target && e.target.matches && e.target.matches('input')) return;
      var r = popupEl.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, left: r.left, top: r.top, moved: false };
    });
    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      drag.moved = true;
      popupEl.style.right = 'auto';
      popupEl.style.left = (drag.left + dx) + 'px';
      popupEl.style.top = (drag.top + dy) + 'px';
      header.style.cursor = 'grabbing';
    });
    document.addEventListener('mouseup', function () {
      if (!drag) return;
      if (drag.moved) {
        var r = popupEl.getBoundingClientRect();
        try { localStorage.setItem(POPUP_POS_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch (e) {}
      }
      drag = null;
      header.style.cursor = 'grab';
    });
  }

  function ensurePopupDom() {
    if (popupEl && document.body.contains(popupEl)) return;
    popupEl = document.createElement('div');
    popupEl.id = 'sn-scan-popup';
    popupEl.style.cssText = 'position:fixed;right:18px;top:96px;z-index:2147483645;width:280px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.22);font-family:-apple-system,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;user-select:none;display:none';

    var accent = document.createElement('div');
    accent.className = 'jnz-accent';
    accent.style.cssText = 'height:3px;background:linear-gradient(90deg,#2563eb,#4f46e5);border-radius:10px 10px 0 0';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:1px solid #eef2f7;background:linear-gradient(180deg,#fbfcfe,#f4f6fa);border-radius:9px 9px 0 0;cursor:grab';
    var bcLabel = document.createElement('span');
    bcLabel.textContent = '条码:';
    bcLabel.style.cssText = 'flex:none;font-size:11px;color:#94a3b8';
    popupParentEl = document.createElement('span');
    popupParentEl.className = 'jnz-parent';
    popupParentEl.style.cssText = 'flex:1;min-width:0;display:block;font-family:Consolas,"Courier New",monospace;font-size:12px;color:#2563eb;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    popupCountEl = document.createElement('span');
    popupCountEl.textContent = '0/0';
    popupCountEl.style.cssText = 'flex:none;margin-left:auto;font-size:11px;font-weight:700;color:#fff;background:linear-gradient(90deg,#2563eb,#4f46e5);padding:2px 9px;border-radius:999px';
    header.appendChild(bcLabel);
    header.appendChild(popupParentEl);
    header.appendChild(popupCountEl);

    var body = document.createElement('div');
    body.style.cssText = 'padding:10px';
    popupInput = document.createElement('input');
    popupInput.type = 'text';
    popupInput.placeholder = '扫 SN 回车…';
    popupInput.autocomplete = 'off';
    popupInput.className = 'jnz-input';
    popupInput.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;font-size:12px;border:1px solid #dbe2ea;border-radius:6px;outline:none;font-family:Consolas,"Courier New",monospace;transition:border-color .15s,box-shadow .15s';
    popupInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      var raw = toStr(popupInput.value);
      popupInput.value = '';
      if (!raw) return;
      // 任意空白（空格/换行）拆成一个个 SN 顺序转填（连扫/粘贴多码）
      var parts = raw.replace(/\r?\n/g, ' ').split(/\s+/).filter(Boolean);
      for (var i = 0; i < parts.length; i++) {
        popupLogEntries.push({ sn: parts[i], cls: 'wait', code: '' });
        if (popupLogEntries.length > 50) popupLogEntries.shift();
        handlePopupSn(parts[i]);
      }
      popupLogRender();
      try { popupInput.focus(); } catch (e) {} // v2.7.10 回车触发=焦点立即回弹窗，零延时
    });
    popupInput.addEventListener('input', function (e) { if (e.isTrusted) __lastPopupTypeAt = Date.now(); });
    popupStatusEl = document.createElement('div');
    popupStatusEl.style.cssText = 'margin-top:8px;font-size:12px;line-height:16px;min-height:16px;color:#6b7280;word-break:break-all';
    popupLogEl = document.createElement('div');
    popupLogEl.className = 'jnz-log';
    popupLogEl.style.cssText = 'margin-top:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;max-height:140px;overflow-y:auto;font-size:11px;line-height:18px;color:#64748b';
    body.appendChild(popupInput);
    body.appendChild(popupStatusEl);
    body.appendChild(popupLogEl);

    popupEl.appendChild(accent);
    popupEl.appendChild(header);
    popupEl.appendChild(body);
    document.body.appendChild(popupEl);

    if (!document.getElementById('sn-check-popup-style')) {
      var st = document.createElement('style');
      st.id = 'sn-check-popup-style';
      st.textContent = '#sn-scan-popup .jnz-input:focus{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,.12)!important}#sn-scan-popup .jnz-log::-webkit-scrollbar{width:6px}#sn-scan-popup .jnz-log::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}';
      document.head.appendChild(st);
    }

    new MutationObserver(popupLogOnStatus).observe(popupStatusEl, { childList: true, characterData: true, subtree: true });
    initPopupDrag(header);
  }

  function popupStatus(text, kind) {
    if (!popupStatusEl) return;
    popupStatusEl.textContent = text;
    popupStatusEl.style.color = kind === 'ok' ? '#16a34a' : kind === 'err' ? '#dc2626' : kind === 'warn' ? '#d97706' : kind === 'busy' ? '#2563eb' : '#6b7280';
  }

  function openPopup() {
    if (!popupEnabled()) return;
    ensurePopupDom();
    var wasClosed = popupEl.style.display === 'none';
    popupEl.style.display = 'block';
    if (wasClosed) popupStatus('等待扫描 SN…', '');
    updatePopupCount();
    startPopupCapture();
    setTimeout(function () {
      // v2.7.16：模块码正在扫进采集框（800ms 内）→ 不抢焦点，防扫码流被拦腰截断；
      // 扫完后由 200ms 焦点守护在 MES 把焦点挪到 SN 框时自然拉回弹窗
      if (__scanBusyParent()) return;
      try { popupInput.focus(); } catch (e) {}
    }, 50);
  }

  function closePopup() {
    if (popupEl) popupEl.style.display = 'none';
    stopPopupCapture();
  }

  function updatePopupCount() {
    if (!popupEl || popupEl.style.display === 'none') return;
    var els = document.querySelectorAll(selector);
    var total = els.length, filled = 0;
    for (var i = 0; i < els.length; i++) if (toStr(els[i].value)) filled++;
    if (popupCountEl) popupCountEl.textContent = filled + '/' + total;
    if (total > 0 && filled === total) popupStatus('✓ 已全部填满，可点“过站”', 'ok');
  }

  function getPopupBarcodeBox() {
    var all = document.querySelectorAll('div[id^="Input_"] > input');
    for (var i = 0; i < all.length; i++) {
      var box = all[i].closest('div[id^="Input_"]');
      var ctx = ((box && box.parentElement ? box.parentElement.innerText : '') || '').replace(/\s+/g, '');
      if (ctx.indexOf('条码采集') >= 0) return all[i];
    }
    return null;
  }

  function doPopupSn(raw) {
    return (async function () {
      var sn = normSn(raw);
      if (!sn) return;
      if (hasDuplicateSn(raw, null)) { popupStatus('⚠ 重复 SN：' + sn, 'warn'); return; }
      if (suppressRefillActive()) { popupStatus('⏸ 刚清完框，暂停自动转填（' + sn + '）', 'warn'); return; }
      popupStatus('查码中… ' + sn, 'busy');
      var q;
      try { q = await queryCodeHybrid(raw); }
      catch (e) { popupStatus('查询失败：' + (e && e.message ? e.message : e), 'err'); return; }
      var code = (q && q.code) ? q.code : '';
      if (!code) { popupStatus('未查到物料编码：' + sn, 'err'); return; }
      var target = findTargetInputByActualCode(code, null);
      if (!target && Array.isArray(q.altCodes)) {
        for (var ai = 0; ai < q.altCodes.length; ai++) {
          target = findTargetInputByActualCode(q.altCodes[ai], null);
          if (target) break;
        }
      }
      // v2.7.12 网格可能正在重渲染（上一条码提交触发刷新）：重试几次再判定无框
      for (var __r = 0; __r < 4 && !target; __r++) {
        await new Promise(function (res) { setTimeout(res, 150); });
        target = findTargetInputByActualCode(code, null);
        if (!target && Array.isArray(q.altCodes)) {
          for (var ai2 = 0; ai2 < q.altCodes.length; ai2++) {
            target = findTargetInputByActualCode(q.altCodes[ai2], null);
            if (target) break;
          }
        }
      }
      if (!target) { popupStatus('编码 ' + code + ' 无空框可填', 'warn'); return; }
      // 框可能被其他路线（网格直扫/自动转填）填掉 → 跳过，避免覆盖
      if (toStr(target.value)) { popupStatus('编码 ' + code + ' 框已被占，跳过', 'warn'); return; }
      // v2.7.15：查码飞行期间发生了清框（双发码迟到）→ 不写进刚清空的框
      if (suppressRefillActive()) { popupStatus('⏸ 刚清完框，自动转填已暂停（' + sn + '），需要请重扫', 'warn'); return; }

      suppressDuplicateLockForRoute(1200);
      try { target.dataset.snAutoFill = '1'; } catch (e) {}
      target.value = raw;
      setSnCheckState(target, 'pending', '弹窗转填待校验', raw);

      setTimeout(function () {
        // v2.7.13 焦点提交：MES 新页面必须"焦点+keypress"才提交。焦点窗口只有同步块
        // （微秒级，扫码键在任务内插不进来），提交完立即把焦点还给弹窗；
        // autoFilled 在提交后再打，防 focusin 自动跳转抢焦点到下一框
        try { target.focus(); } catch (e) {}
        try { commitInputByEnter(target, true); } catch (e) {}
        try { popupInput.focus(); } catch (e) {}
        try { target.dataset.autoFilled = '1'; } catch (e) {}
        setTimeout(function () {
          try { enqueueCheck(target, toStr(target.value) || raw); } catch (e2) {}
          setTimeout(function () {
            try { delete target.dataset.snAutoFill; } catch (e) {}
            try { delete target.dataset.autoFilled; } catch (e) {}
            try { refreshDuplicateLock(target); } catch (e2) {}
          }, 1200);
        }, 60);
      }, 0);

      popupStatus('✓ ' + code + ' → ' + (target.id || '框'), 'ok');
      updatePopupCount();
      // v2.7.9 删掉 120ms"拉回焦点+select()"：select() 撞上下一条码流开头会把已输入字符
      // 全选、下一字符整段顶掉（213409027610 被 S 顶掉只剩 S5001932）；
      // 焦点回弹窗由 200ms 焦点守护兜底，无需定时器
    })();
  }

  function handlePopupSn(raw) {
    __popupChain = __popupChain.then(function () { return doPopupSn(raw); }).catch(function () {});
  }

  function startPopupCapture() {
    stopPopupCapture();
    __popupCaptureTimer = setInterval(function () {
      if (!popupEnabled() || !popupEl || popupEl.style.display === 'none') return;
      var active = document.activeElement;
      if (active === popupInput) return;
      if (__scanBusyGrid()) return; // 扫码枪正在往网格框灌码：不抢焦点，防截断
      if (__scanBusyParent()) return; // v2.7.16：扫码枪正在往采集框灌模块码：不抢焦点，防断码
      var isPageSn = active && active.matches && active.matches(selector);
      if (isPageSn) {
        // 用户真实鼠标点过网格框=放手；否则（MES 挪的焦点）拉回弹窗
        if (__popupUserInGrid) return;
        try { popupInput.focus(); } catch (e) {}
        return;
      }
      var tag = active ? active.tagName : '';
      if (!active || tag === 'BODY' || tag === 'HTML') {
        try { popupInput.focus(); } catch (e) {}
      }
    }, 200);
  }

  function stopPopupCapture() {
    if (__popupCaptureTimer) { clearInterval(__popupCaptureTimer); __popupCaptureTimer = null; }
  }

  // 用户意图：真实点过网格 SN 框=想用网格；点弹窗=回弹窗模式
  document.addEventListener('mousedown', function (e) {
    var t = e.target;
    if (!t || !t.matches) return;
    if (t.matches(selector)) __popupUserInGrid = true;
    else if (t.closest && t.closest('#sn-scan-popup')) __popupUserInGrid = false;
  }, true);

  function ensurePopupChip() {
    if (popupChip && document.body.contains(popupChip)) return;
    popupChip = document.createElement('div');
    popupChip.id = 'sn-scan-popup-chip';
    popupChip.style.cssText = 'display:none;position:fixed;right:14px;bottom:14px;z-index:2147483644;background:#1e293b;color:#e2e8f0;font-size:12px;padding:7px 12px;border-radius:999px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    popupChip.textContent = 'SN 弹窗已关 · 点我重开';
    popupChip.addEventListener('click', function () { try { localStorage.setItem(POPUP_KEY, '1'); } catch (e) {} });
    document.body.appendChild(popupChip);
  }

  setInterval(function () {
    var els = document.querySelectorAll(selector);
    var n = els.length;
    var bc = getPopupBarcodeBox();
    var bv = bc ? toStr(bc.value) : '';
    var first = n ? els[0] : null;
    if (popupParentEl) popupParentEl.textContent = bv;
    if (!popupEnabled()) {
      closePopup();
      __popupLastCount = -1;
      __popupLastBarcode = bv;
      __popupFirstEl = first;
      return;
    }
    if (n > 0) {
      // 新模块/重建 → 清空日志
      if (bv && bv !== __popupLastBarcode) popupLogReset();
      else if (__popupLastCount > 0 && first !== __popupFirstEl) popupLogReset();
      else if (__popupLastCount === 0) popupLogReset();
      var wantOpen = (__popupLastCount === 0 || __popupLastCount === -1) || (bv && bv !== __popupLastBarcode);
      if (wantOpen) openPopup();
      updatePopupCount();
    } else {
      closePopup();
    }
    __popupFirstEl = first;
    __popupLastBarcode = bv;
    __popupLastCount = n;
  }, 300);

  // 重开入口：弹窗用过但现在关着 → 右下角小药丸
  setInterval(function () {
    var off = !popupEnabled();
    var hidden = !!(popupEl && popupEl.style.display === 'none');
    if (off && hidden) { ensurePopupChip(); if (popupChip) popupChip.style.display = 'block'; }
    else if (popupChip) popupChip.style.display = 'none';
  }, 500);
  // ===== 扫码转填弹窗（v2.7.4）END =====

})();