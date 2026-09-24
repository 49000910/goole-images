// ==UserScript==
// @name        MES 一体化（固定链接+批量过站）
// @namespace    tampermonkey.mes.allinone.final
// @version      3.4.12
// @description  固定UI提取条码并回填；手动载入开始；SN重复锁定+常驻气泡；接口提取后条码后显示工序；v3.2.3 面板精致浅色美化；v3.3.0 合并极简自动过站（BOM门禁+ATE查询+自动点过站，仅ProductTrackInOut页）；v3.3.1 状态行合并一排+面板紧凑化；v3.3.2 悬浮窗美化（顶部渐变条+拖拽握点+状态芯片+蓝色系阴影+渐变悬浮球）；v3.3.3 悬浮球可拖动（位置记忆+点击/拖拽区分+呼吸光环+拖拽阴影）；v3.3.4 任务令框粘贴排产文本自动过滤（识别任务令一行一个，去重合并）；v3.3.5 工序列表行内直接删除（去掉"全部工序"下拉和"删除选中工序"按钮）；v3.3.6 脚本过站条码（批量队列+自动过站）记入 localStorage（2小时窗），供原表格叠加效能统计排除；v3.3.7 工序条码导入列表（提取后工序行加"载入"，选中工序只载入该组条码，不用删多余工序；当前载入工序高亮）；v3.3.11 自动过站（人工扫码+BOM门禁/ATE校验后代点过站）不再记入效能排除名单，计入手动效能；仅批量队列过站继续排除；v3.3.12 完全移除条码 localStorage 存储（效能排除名单机制废弃，叠加效能统计全部采集条码）；v3.3.13 ATE 未通过旁路（仅 ProductTrackInOut）：模块已加载时过站按钮强制可见（#submitButton 被 MES 隐藏也显示，供手动点）；ATE 未测完被拉回条码采集框时，焦点自动送回下一个空 SN 框，未测完也能继续扫 SN 正常跳焦点（无时间窗，只要有空 SN 框就跳）；v3.3.14 ATE 旁路修正：焦点回送豁免用户真实点击条码采集框（手动点它不抢焦点、可编辑；MES 程序化拉回仍立即跳空 SN 框）；v3.3.15 ① 批量队列运行期间写 `tm_bulk_passing` 开关（开始/暂停/重置/完成/超时/换队列全部清或置位，启动时清残留；供叠加"每小时节拍"暂停统计，不存条码）② 自动过站（只校验/校验+ATE）点过站按钮前延时 0.2s，延时后重取按钮；v3.3.16 `tm_bulk_passing` 加心跳时间戳 `tm_bulk_passing_ts`（每提交一条刷新），队列真卡死/页面异常时叠加侧 5 分钟无心跳自动恢复统计；v3.3.17 ① 队列完成即清标记+进度复位（可直接重新点开始整套重跑）② 看门狗：标记挂着但 90 秒无进度直接清标记+清"开始执行"状态（独立于 tick 主循环）③ 开始时若残留旧进度自动复位到 0；v3.3.18 去掉看门狗与心跳兜底（完成即清、不等不拦，立即可扫码），保留完成复位+开始残留复位；v3.3.19 修复作用域 BUG：setBulkPassing 原定义在 buildPanel() 内，tick() 完成分支调用抛 ReferenceError 导致标记只能靠点暂停清除，现移到顶层作用域，进度跑完立即自动清标记；v3.3.20 暂存模式（预扫暂存延后过站）：读 `mes_pass_hold_mode`（调试面板写，on+30s 心跳有效，过期自动失效兜底），开启时自动过站只校验不点过站按钮，供"扫完暂存、到点取出再自动过站"；v3.4.0 **预扫暂存·延后过站正式并入**（调试脚本废弃）：面板"只校验"后加"暂存"开关（`tm_hold_mode_on` 记忆），任务令标签右侧加功能分页（过站/暂存，开暂存自动切到暂存页，可手动切）；暂存开=校验全过（校验+ATE 模式含 ATE）自动暂存纯 SN（剥系统前缀）+自动清空+焦点回采集框，连续扫下一个；暂存页=暂存列表（行内 取出/删，列表只在数据变化时重渲染，修复删按钮被重渲染打断）+全部取出（逐模块串行：模块条码回车重建网格→按各自 SN 条数回填 150ms/个→等 BOM（+ATE）→1.5s 延迟自动点过站→即从暂存区删除）；取出时自动关暂存开关，取出期间自动过站挂起；v3.4.1 **取出/过站可靠性大修**：① 取出等"网格"前先等 MES 全局 loading 出现又消失（=MES 真受理了模块），修复旧版把上一次遗留旧网格误判为新网格→SN 回填落空→校验根本不触发的问题；② SN 回填智能判断：框里已有码且对得上（MES 预填）→跳过不重复提交，是别的码→中止；③ 等 BOM 20s→60s 且实时显示"校验中 N"进度；④ 点过站前不再固定延时 0.2s/1.5s 后盲点，改为等"批量过站" loading 圈消失再点（圈圈还在时点过站会异常弹窗），10s 等不到则放弃本次；⑤ 过站后暂存记录自动清理三通道：自动过站点完即删 / 取出点完即删 / 周期兜底（本会话 passedSet 命中即删 + 检测用户手动过站：页面被清空+3s 内"出站成功"toast→删记录）；⑥ 取出中暂存列表按钮禁用（防误点），失败信息更明确；v3.4.2 **过站后幽灵行修复+防重复暂存+按钮精简**：① 修复删除最后一条暂存记录时列表不刷新——hash 哨兵 '' 与空列表 hash '' 撞车导致 renderHoldList 提前返回，幽灵行常驻 DOM（"已过站却还留在列表"的根因，哨兵改 null）② 手动过站命中的模块记入本会话 passedSet，再扫同一已过站模块时不再重复暂存（提示"该模块本会话已过站，无需暂存"）③ "全部取出"按钮长文案精简为"全部取出（逐模块自动过站）"，完整流程说明移入悬浮提示；v3.4.3 **连续取出大修**：① 取出不再拒绝"采集框/SN 框有残留码"（MES 过站后模块码留在采集框、旧网格 SN 清不干净各留一条），改为自动清空残留继续 →"全部取出"可连跑无需手动清框 ② ④ 回填 SN 时框里是别的码（上一条残留）→ 清空覆盖，不再中止（MES 预填同码仍跳过）③ 模块条码必须 16 位：采集框非 16 位（扫断/焦点被弹窗抢走一半）→ 自动过站忽略本次+不暂存，取出遇非 16 位暂存码直接拒绝并提示删记录重扫；v3.4.4 **连续取出时序修复**：点过站后等"过站本身"的 loading 圈出现又消失（=MES 过站完成）再进下一条——旧版点完立即发下一模块的 Enter，MES 还在处理上一条（过站 loading 圈还没转完）把 Enter 吞掉→网格出不来→20s 超时停跑（实测 3 条连跑：第 1 条 6s 过站，第 2 条因此卡③）；v3.4.5 **清框后防残留转填**：clearPageBoxes（自动暂存清空）与取出清残留后写 `sn_suppress_refill_v1`（2s/5s 窗），SN 校验脚本 v2.7.15 在该窗口内暂停弹窗转填/自动归位——根因：扫码枪双发或断扫重发的码，第一份完成校验触发暂存清空后，第二份的弹窗转填还在飞行（查码接口 300ms+），此时框已空、防重不拦，把码转填回刚清空的框→"清不干净留一条"；v3.4.6 **残留根因实锤+终解（MES 重写波竞争）**：双窗口全键盘流+SET 调用栈追踪实锤——每个 SN 提交后 MES 页面自身代码（AUI U.val，vendor-aui-tools.js）会在随后 1~5 秒内异步重写全部 SN 框（先原码、再 U1:/VOA1: 前缀），预扫暂存"allOk 即清框"撞上在飞重写波→值被写回刚清空的框=残留（v2.7.15 暂停窗压错对象：压的是 SN 校验脚本，真凶是 MES 页面代码）；暂存清框后追加 +1.5s/+3s/+5s 三次"精准清扫"（仅当采集框为空或仍是刚暂存模块时，只清值恰好=刚暂存模块 SN（剥前缀后匹配）的框，绝不误伤下一个模块的在扫数据），截断重写波尾巴；v3.4.7 **暂存区防重复+数量角标**：① 暂存前 SN 级查重——待暂存模块的 SN 与暂存区已有其他模块的 SN 重复→拒绝暂存（"SN xxx 与暂存区 yyy 重复，疑似扫错，不暂存"），防同一 SN 被两个模块重复分配（模块级"已在暂存区"查重 v3.4.0 起已有）② 功能分页（过站/暂存）左侧加"暂存 N"数量角标（>0 蓝色高亮，1.5s 周期随 store 刷新，跨窗口共享 localStorage 自动同步）
// @match        https://w3.huawei.com/mespmm/wipweb*
// @match        https://mes.huawei.com/mespmm/rptwebnew*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      w3.huawei.com



// @grant        GM_addValueChangeListener
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

    while (Date.now() - start < 10000) {
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

    console.warn('[MES授权门禁] 未授权，脚本已停止运行');
    return false;
  }

  if (!(await __MES_AUTH_GATE__())) return;
  // ===== MES授权门禁 END =====


  // 固定提取链接（按你要求）


  // 固定提取链接（按你要求）
  var FIXED_UI_URL = 'https://mes.huawei.com/mespmm/rptwebnew#/ProductList#autoExtract=1';

    // ===== 保持登入 =====
var KEEPALIVE_URL = 'https://w3.huawei.com/mespmm/gateway/com.huawei.supply.mes.mesplus.pspw:mespmmsystemservice/mespmm/sys/only4ssoTimeUpdate.do';
var KEEPALIVE_CFG_KEY = 'tm_keepalive_cfg';
var keepAliveTimer = null;

// 任务令条码接口提取，一页最多100条，超过自动翻页
var TASK_SN_API_BASE = 'https://w3.huawei.com/mespmm/gateway/S007307:mespmmrptservice/mespmm/rpt/services/wipTaskSn/findlist/page';

  var fallbackIndex = 3;
  var loadingSelector = '#global_toploading_flag';

  // 快慢自适应
  var tickMs = 50;
  var maxWaitMs = 60000;
  var fastPassMs = 1200;

  var KEY_JOB = 'mes_extract_job';
  var KEY_RESULT = 'mes_extract_result';

  var snCodeMap = {};
  var queue = [];
  var wsPool = [];
  var idx = 0;
  var running = false;
  var waiting = false;
  var waitStart = 0;
  var submitAt = 0;
  var currentCode = '';
  var ticking = false;
  var sawLoading = false;
  var loadingGoneCount = 0;
  var completionWaitStart = 0;
  var completionSettleStart = 0;

  // 批量队列运行标记（供原表格叠加"每小时节拍"暂停统计用；只写开关，不存条码）
  // v3.3.19 修：原来定义在 buildPanel() 内部，tick()/submitOne()（顶层作用域）调用时抛
  // ReferenceError → 队列"完成"分支炸掉，标记只能靠点暂停清除。移到顶层作用域解决。
  var BULK_PASSING_KEY = 'tm_bulk_passing';
  var BULK_PASSING_TS_KEY = 'tm_bulk_passing_ts';
  function setBulkPassing(on) {
    try {
      if (on) {
        localStorage.setItem(BULK_PASSING_KEY, '1');
        localStorage.setItem(BULK_PASSING_TS_KEY, String(Date.now()));
      } else {
        localStorage.setItem(BULK_PASSING_KEY, '0');
        localStorage.removeItem(BULK_PASSING_TS_KEY);
      }
    } catch (e) {}
  }
  function bulkHeartbeat() {
    try {
      if (localStorage.getItem(BULK_PASSING_KEY) === '1') {
        localStorage.setItem(BULK_PASSING_TS_KEY, String(Date.now()));
      }
    } catch (e) {}
  }

  var extractRunning = false;
  var lastJobId = '';
// ===== 条码回车：扫码枪真实Enter后，等待“产品进站成功”，再补一个Enter =====
var BARCODE_ENTER_KEY = 'tm_barcode_enter_on';

var barcodeEnterPending = false;
var barcodeEnterTriggerAt = 0;
var barcodeEnterValue = '';
var barcodeEnterLastAutoAt = 0;
var barcodeEnterSending = false;
var barcodeEnterBoundInput = null;
var barcodeEnterDocBound = false;
var barcodeEnterBgStarted = false;


// 记录扫码前页面上已有多少条“当前条码进站成功”提示，防止旧提示误触发
var barcodeEnterSuccessCountBefore = 0;



  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function isVisible(el) {
    if (!el) return false;
    var st = getComputedStyle(el);
    return el.offsetParent !== null && st.display !== 'none' && st.visibility !== 'hidden';
  }

  function setStatus(msg, color) {
    color = color || '#333';
    var el = document.getElementById('tm-batch-status');
    if (el) {
      el.textContent = msg;
      el.style.color = color;
    }
    console.log('[MES] ' + msg);
  }

  function setProgress() {
    var el = document.getElementById('tm-batch-progress');
    if (el) el.textContent = idx + '/' + queue.length;
  }
    function loadKeepAliveCfg() {
  try {
    var c = JSON.parse(localStorage.getItem(KEEPALIVE_CFG_KEY) || '{}');
    return {
      enabled: !!c.enabled,
      sec: Number(c.sec || 600)
    };
  } catch (e) {
    return {
      enabled: false,
      sec: 600
    };
  }
}

function saveKeepAliveCfg(c) {
  localStorage.setItem(KEEPALIVE_CFG_KEY, JSON.stringify(c));
}

async function keepAliveOnce() {
  try {
    // 只在 w3 域名执行，避免其它页面跨域异常
    if (location.hostname !== 'w3.huawei.com') return;

    var r = await fetch(KEEPALIVE_URL, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });

    var el = document.getElementById('tm-keepalive-status');

    if (r.status === 401) {
      if (el) {
        el.textContent = '掉线';
        el.style.color = '#cf1322';
      }
      console.warn('[MES] 保持登入失败：401');
      return;
    }

    if (el) {
      el.textContent = '在线';
      el.style.color = '#389e0d';
    }

    console.log('[MES] keepAlive ok:', r.status);
  } catch (e) {
    var el2 = document.getElementById('tm-keepalive-status');
    if (el2) {
      el2.textContent = '异常';
      el2.style.color = '#fa8c16';
    }
    console.warn('[MES] keepAlive error:', e);
  }
}

function restartKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }

  var cfg = loadKeepAliveCfg();

  if (!cfg.enabled) {
    var el = document.getElementById('tm-keepalive-status');
    if (el) {
      el.textContent = '关';
      el.style.color = '#666';
    }
    return;
  }

 var ms = Math.max(30, Number(cfg.sec) || 600) * 1000;

  keepAliveTimer = setInterval(function () {
    keepAliveOnce();
  }, ms);

  keepAliveOnce();
}


  function parseCodes(txt) {
    return (txt || '').split(/\r?\n/)
      .map(function (s) { return s.trim(); })
      .map(function (s) { return s.replace(/\s*（[^（）]*）\s*$/, ''); })
      .filter(Boolean);
  }

  // ===== 工序条码导入列表（行内 载入/删除）=====
  function updateWorkstepFilter() {
    var listEl = document.getElementById('tm-workstep-list');
    if (!listEl) return;

    var hasCodes = wsPool.length > 0;
    listEl.style.display = hasCodes ? '' : 'none';
    if (!hasCodes) { listEl.innerHTML = ''; return; }

    var steps = {};
    var stepArr = [];
    for (var i = 0; i < wsPool.length; i++) {
      var ws = snCodeMap[wsPool[i]] || '未知';
      if (!steps[ws]) { steps[ws] = 0; stepArr.push(ws); }
      steps[ws]++;
    }
    listEl._stepArr = stepArr;

    function isCurrent(ws) {
      if (!queue.length) return false;
      for (var j = 0; j < queue.length; j++) {
        if ((snCodeMap[queue[j]] || '未知') !== ws) return false;
      }
      return true;
    }

    listEl.innerHTML = stepArr.map(function (s, i) {
      var badge = isCurrent(s) ? ' <span style="color:#0958D9;font-size:10px;white-space:nowrap;">● 当前</span>' : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
        '<span>' + s + ': ' + steps[s] + '条' + badge + '</span>' +
        '<span style="display:flex;gap:10px;white-space:nowrap;">' +
          '<a class="tm-ws-load" href="javascript:void(0)" data-i="' + i + '" style="color:#0958D9;font-size:12px;cursor:pointer;">载入</a>' +
          '<a class="tm-ws-del" href="javascript:void(0)" data-i="' + i + '" style="color:#cf1322;font-size:12px;cursor:pointer;">删除</a>' +
        '</span>' +
      '</div>';
    }).join('') || '<div style="color:#999;">暂无工序信息（接口提取后自动带出）</div>';
  }

  function loadByWorkstep(ws) {
    if (!ws) { setStatus('请选择要载入的工序', '#cf1322'); return; }

    var filtered = [];
    for (var i = 0; i < wsPool.length; i++) {
      if ((snCodeMap[wsPool[i]] || '未知') === ws) filtered.push(wsPool[i]);
    }
    if (!filtered.length) { setStatus('工序[' + ws + ']没有条码可载入', '#fa8c16'); return; }

    queue = filtered; idx = 0; running = false; waiting = false; currentCode = '';

    var taEl = document.getElementById('tm-batch-input');
    if (taEl) {
      taEl.value = queue.map(function (c) {
        return snCodeMap[c] ? c + '（' + snCodeMap[c] + '）' : c;
      }).join('\n');
    }

    setProgress();
    setStatus('已载入工序[' + ws + ']的' + queue.length + '条', '#0958D9');
    updateWorkstepFilter();
  }

  function deleteByWorkstep(ws) {
    if (!ws) { setStatus('请选择要删除的工序', '#cf1322'); return; }

    var before = queue.length;
    var newQueue = [];
    for (var i = 0; i < queue.length; i++) {
      if ((snCodeMap[queue[i]] || '未知') !== ws) newQueue.push(queue[i]);
    }
    var newPool = [];
    for (var j = 0; j < wsPool.length; j++) {
      if ((snCodeMap[wsPool[j]] || '未知') !== ws) newPool.push(wsPool[j]);
    }

    queue = newQueue; wsPool = newPool; idx = 0; running = false; waiting = false; currentCode = '';

    var taEl = document.getElementById('tm-batch-input');
    if (taEl) {
      taEl.value = queue.map(function (c) {
        return snCodeMap[c] ? c + '（' + snCodeMap[c] + '）' : c;
      }).join('\n');
    }

    setProgress();
    setStatus('已删除工序[' + ws + ']的' + (before - queue.length) + '条，剩余' + queue.length + '条', '#fa8c16');
    updateWorkstepFilter();
  }
// ===== 条码回车功能 =====
function isBarcodeEnterEnabled() {
  return localStorage.getItem(BARCODE_ENTER_KEY) === '1';
}

function isBarcodeInput(el) {
  if (!el) return false;

  var target = getParentInput();

  if (target && el === target) return true;

  var box = el.closest && el.closest('div[id^="Input_"]');
  var ctx = ((box && box.parentElement ? box.parentElement.innerText : '') || '').replace(/\s+/g, '');

  return ctx.indexOf('条码采集') >= 0;
}

// 统计页面上“当前条码 + 产品进站成功”的次数
function countBarcodeTrackInSuccess(code) {
  if (!code) return 0;

  var text = document.body && document.body.innerText ? document.body.innerText : '';

  if (!text) return 0;

  code = String(code).trim();

  if (!code) return 0;

  var count = 0;
  var pos = 0;

  while (true) {
    var idx = text.indexOf(code, pos);

    if (idx < 0) break;

    // 取当前条码附近的文字
    // 示例：
    // 【032VBY10S6001881】过站信息：
    // 产品进站成功!
    var near = text.slice(Math.max(0, idx - 80), idx + 500);

    var hasSuccess =
      near.indexOf('产品进站成功') >= 0 ||
      near.indexOf('进站成功') >= 0;

    var hasInfo =
      near.indexOf('过站信息') >= 0 ||
      near.indexOf('进站信息') >= 0 ||
      near.indexOf('过站') >= 0;

    if (hasSuccess && hasInfo) {
      count++;
    }

    pos = idx + code.length;

    if (count > 20) break;
  }

  return count;
}

function hasNewBarcodeTrackInSuccess(code) {
  var nowCount = countBarcodeTrackInSuccess(code);
  return nowCount > barcodeEnterSuccessCountBefore;
}

function prepareBarcodeEnter(input, reason) {
  if (!isBarcodeEnterEnabled()) return;

  // 批量过站运行时不触发，避免冲突
  if (running || waiting) return;

  // 自己补 Enter 时不触发
  if (barcodeEnterSending) return;

  var v = input && input.value ? String(input.value).trim() : '';

  if (!v) return;

  // 记录扫码前页面上已有多少条当前条码成功提示，防止旧提示误触发
  barcodeEnterSuccessCountBefore = countBarcodeTrackInSuccess(v);

  barcodeEnterPending = true;
  barcodeEnterTriggerAt = Date.now();
  barcodeEnterValue = v;

  console.log('[MES] 条码回车：已捕获扫码 Enter，等待进站成功提示', {
    value: v,
    reason: reason,
    successCountBefore: barcodeEnterSuccessCountBefore
  });

  setStatus('条码回车：等待进站成功提示', '#1677ff');
}

function pressEnterForBarcodeEnter() {
  var input = getParentInput();

  if (!input) {
    setStatus('条码回车：未找到条码采集框', '#cf1322');
    return false;
  }

  var currentValue = String(input.value || '').trim();

  // 如果输入框内容已经变了，说明用户又扫了别的，避免误补
  if (barcodeEnterValue && currentValue && currentValue !== barcodeEnterValue) {
    console.warn('[MES] 条码回车：输入框内容已变化，取消补 Enter', {
      oldValue: barcodeEnterValue,
      currentValue: currentValue
    });

    setStatus('条码回车：条码已变化，取消补 Enter', '#fa8c16');
    return false;
  }

  barcodeEnterSending = true;

  try {
    input.focus();

    var opts = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };

    input.dispatchEvent(new KeyboardEvent('keydown', opts));
    input.dispatchEvent(new KeyboardEvent('keypress', opts));
    input.dispatchEvent(new KeyboardEvent('keyup', opts));

    barcodeEnterLastAutoAt = Date.now();

    console.log('[MES] 条码回车：已自动补 Enter', barcodeEnterValue);

    setStatus('条码回车：已自动补 Enter', '#389e0d');

    return true;
  } finally {
    setTimeout(function () {
      barcodeEnterSending = false;
    }, 500);
  }
}

function bindBarcodeEnterInput() {
  var input = getParentInput();

  if (input) {
    barcodeEnterBoundInput = input;
  }

  // document 级监听只绑定一次
  // 不依赖面板是否显示，也不怕 MES 重渲染输入框
  if (barcodeEnterDocBound) return;

  barcodeEnterDocBound = true;

  document.addEventListener('', function (e) {
    try {
      if (!isBarcodeEnterEnabled()) return;

      if (e.key !== 'Enter' && e.keyCode !== 13) return;

      // 只接受真实扫码枪/键盘 Enter，不接受脚本自己派发的 Enter
      if (!e.isTrusted) return;

      var target = e.target;

      if (!target) return;

      if (!isBarcodeInput(target)) return;

      barcodeEnterBoundInput = target;

      // 延迟一拍，确保扫码枪输入值已经写入 input.value
      setTimeout(function () {
        prepareBarcodeEnter(target, 'background document trusted enter');
      }, 0);

    } catch (err) {
      console.warn('[MES] 条码回车：document监听异常', err);
    }
  }, true);

  console.log('[MES] 条码回车：document级监听已启动，面板最小化不影响');
}


async function barcodeEnterTick() {
  if (!isBarcodeEnterEnabled()) {
    barcodeEnterPending = false;
    return;
  }

  // 定期绑定，因为页面可能重渲染输入框
  bindBarcodeEnterInput();

  if (!barcodeEnterPending) return;

  // 批量过站中不处理
  if (running || waiting) return;

  var now = Date.now();

  // 超过 15 秒没检测到成功提示，取消本次
  if (now - barcodeEnterTriggerAt > 15000) {
    barcodeEnterPending = false;

    console.warn('[MES] 条码回车：等待进站成功提示超时，取消本次', barcodeEnterValue);

    setStatus('条码回车：等待进站成功超时，已取消', '#fa8c16');

    return;
  }

  // 只判断当前条码是否出现新的“产品进站成功”提示
  if (!hasNewBarcodeTrackInSuccess(barcodeEnterValue)) {
    return;
  }

  // 防止短时间重复补 Enter
  if (now - barcodeEnterLastAutoAt < 2500) {
    barcodeEnterPending = false;
    return;
  }

  barcodeEnterPending = false;

  console.log('[MES] 条码回车：检测到当前条码进站成功，准备补 Enter', {
    barcode: barcodeEnterValue,
    before: barcodeEnterSuccessCountBefore,
    now: countBarcodeTrackInSuccess(barcodeEnterValue)
  });

  setStatus('条码回车：检测到进站成功，准备补 Enter', '#389e0d');

  // 稍等页面稳定
  await sleep(300);

  pressEnterForBarcodeEnter();
}

    function parseTaskNos(txt) {
  var tokens = String(txt || '')
    .toUpperCase()
    .match(/[A-Z0-9]+/g) || [];

  var out = [];
  var seen = {};

  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];

    // 任务令一般是 10~12 位，前面至少4位字母，且包含数字
    // 示例：EPZE145150D、EPZEL452606、DDEDZN051406
    if (t.length < 10 || t.length > 12) continue;
    if (!/^[A-Z]{4,8}[A-Z0-9]*$/.test(t)) continue;
    if (!/[0-9]/.test(t)) continue;

    // 排除明显不是任务令的内容
    if (t.indexOf('ROHS') >= 0) continue;
    if (t.indexOf('LINE') === 0) continue;
    if (t.indexOf('SUB') === 0) continue;

    if (!seen[t]) {
      seen[t] = 1;
      out.push(t);
    }
  }

  return out;
}

      // ===== 任务令条码接口提取 =====
  function taskApiPad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function taskApiFmtDateTime(d, endOfDay) {
    return [
      d.getFullYear(),
      taskApiPad2(d.getMonth() + 1),
      taskApiPad2(d.getDate())
    ].join('-') + (endOfDay ? ' 23:59:59' : ' 00:00:00');
  }

  function gmPostJson(url, data) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'POST',
        url: url,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data: JSON.stringify(data),
        timeout: 30000,
        onload: function (res) {
          var text = String(res.responseText || '');

          console.groupCollapsed('[TASK-SN-API] 返回 ' + res.status);
          console.log('URL:', url);
          console.log('Body:', data);
          console.log('Response前1500字符:', text.slice(0, 1500));
          console.groupEnd();

          if (res.status < 200 || res.status >= 300) {
            reject(new Error('HTTP ' + res.status + '：' + text.slice(0, 200)));
            return;
          }

          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error('JSON解析失败：' + text.slice(0, 200)));
          }
        },
        onerror: function (e) {
          try {
            reject(new Error('请求失败：' + JSON.stringify(e).slice(0, 200)));
          } catch (err) {
            reject(new Error('请求失败'));
          }
        },
        ontimeout: function () {
          reject(new Error('请求超时'));
        }
      });
    });
  }

  function buildTaskSnBody(taskNo, siteId) {
    var end = new Date();

    // 查最近180天，任务令比较老也能覆盖
    var start = new Date(end.getTime() - 180 * 24 * 3600 * 1000);

    return {
      siteId: String(siteId),
      snType: 10,
      partNo: null,
      sn: null,
      traySn: null,
      taskNo: taskNo,
      workstepName: null,
      snStatus: null,
      productSnCategory: '10',
      createdFrom: taskApiFmtDateTime(start, false),
      createdTo: taskApiFmtDateTime(end, true)
    };
  }

async function queryTaskSnOneMode(taskNo, siteId, modeA, modeB) {
  var pageSize = 100;
  var pageNo = 1;
  var allRows = [];
  var maxPages = 300;

  while (pageNo <= maxPages) {
    var url = TASK_SN_API_BASE + '/' + pageSize + '/' + pageNo + '/' + modeA + '/' + modeB;
    var body = buildTaskSnBody(taskNo, siteId);

    console.log(
      '[TASK-SN-API] 查询 taskNo=' + String(taskNo).slice(0, 80) +
      ' siteId=' + siteId +
      ' mode=' + modeA + '/' + modeB +
      ' page=' + pageNo
    );

    var j = await gmPostJson(url, body);

    var vo = j && j.resultObjVO ? j.resultObjVO : {};
    var pageVO = vo.pageVO || {};
    var rows = Array.isArray(vo.result) ? vo.result : [];

    console.log(
      '[TASK-SN-API] page=' + pageNo +
      ' rows=' + rows.length +
      ' totalRows=' + (pageVO.totalRows || '') +
      ' totalPages=' + (pageVO.totalPages || '')
    );

    allRows = allRows.concat(rows);



setStatus(
  '接口翻页：siteId=' + siteId +
  ' mode=' + modeA + '/' + modeB +
  ' 第' + pageNo +
  '页，累计' + allRows.length + '条',
  '#1677ff'
);

    // 核心：不要只信 totalPages
    // 一页最多100条，如果本页少于100，说明到最后一页
    if (rows.length < pageSize) {
      break;
    }

    pageNo++;
  }

  console.log(
    '[TASK-SN-API] 完成 siteId=' + siteId +
    ' mode=' + modeA + '/' + modeB +
    ' 总rows=' + allRows.length +
    ' 查询页数=' + pageNo
  );

  return allRows;
}


async function extractTaskCodesByApi(taskNos) {
  if (!Array.isArray(taskNos)) {
    taskNos = parseTaskNos(taskNos);
  }

  taskNos = taskNos.map(function (x) {
    return String(x || '').trim().toUpperCase();
  }).filter(Boolean);

  if (!taskNos.length) {
    throw new Error('未识别到任务令');
  }

   // 接口支持多任务令：逗号分隔
  var taskNoText = taskNos.join(',');


  // 两个组织都尝试，避免不同任务令属于不同组织
  var siteIds = ['50', '66'];

  // 你抓到过 /10/0 和 /0/0，两种都尝试
  var modes = [
    [10, 0],
    [0, 0]
  ];

  var codeMap = {};
  var allCodes = [];
  var hitInfo = [];
  snCodeMap = {};

  for (var s = 0; s < siteIds.length; s++) {
    for (var m = 0; m < modes.length; m++) {
      var siteId = siteIds[s];
      var modeA = modes[m][0];
      var modeB = modes[m][1];

      var rows = await queryTaskSnOneMode(taskNoText, siteId, modeA, modeB);

      hitInfo.push({
        siteId: siteId,
        mode: modeA + '/' + modeB,
        rows: rows.length
      });

      for (var i = 0; i < rows.length; i++) {
        var sn = rows[i] && rows[i].sn;
        sn = sn == null ? '' : String(sn).trim();

        if (!sn) continue;

        if (!codeMap[sn]) {
          codeMap[sn] = 1;
          allCodes.push(sn);
        }

        if (!snCodeMap[sn]) {
          var ws = rows[i] && rows[i].workstepName;
          if (ws != null) {
            ws = String(ws).trim();
            if (ws) snCodeMap[sn] = ws;
          }
        }
      }

      console.log(
        '[TASK-SN-API] 组合完成 siteId=' + siteId +
        ' mode=' + modeA + '/' + modeB +
        ' rows=' + rows.length +
        ' 当前累计SN=' + allCodes.length
      );
    }
  }

  return {
    codes: allCodes,
    taskNos: taskNos,
    taskCount: taskNos.length,
    hitInfo: hitInfo
  };
}


  function isLoadingVisible() {
    var el = document.querySelector(loadingSelector);
    if (!el) return false;
    var st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  }

  // ===== 父项过站输入框 =====
  function getParentInput() {
    var all = [].slice.call(document.querySelectorAll('div[id^="Input_"] > input.hae-ui-input[type="text"],div[id^="Input_"] > input'));
    for (var i = 0; i < all.length; i++) {
      var box = all[i].closest('div[id^="Input_"]');
      var ctx = ((box && box.parentElement ? box.parentElement.innerText : '') || '').replace(/\s+/g, '');
      if (ctx.indexOf('条码采集') >= 0) return all[i];
    }
    return all[fallbackIndex] || null;
  }

  async function submitOne(code) {
    var input = getParentInput();
      if (!input) {
        setStatus('未找到“条码采集”输入框', '#cf1322');
        running = false;
        setBulkPassing(false);
        return false;
      }

    input.focus();
    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(input, code);
    else input.value = code;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await sleep(40);

    var opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', opts));
    input.dispatchEvent(new KeyboardEvent('keypress', opts));
    input.dispatchEvent(new KeyboardEvent('keyup', opts));
    return true;
  }

  async function tick() {
    if (!running || ticking) return;
    ticking = true;
    bulkHeartbeat(); // v3.4.10：运行期间持续刷新心跳，叠加侧靠它判活/清死标记
    try {
      if (waiting) {
        var on = isLoadingVisible();

        if (on) {
          sawLoading = true;
          loadingGoneCount = 0;
        } else if (sawLoading) {
          loadingGoneCount++;
        }

        if (sawLoading && loadingGoneCount >= 2) {
          waiting = false;
          idx++;
          setProgress();
          await sleep(40);
          return;
        }

        if (!sawLoading && (Date.now() - submitAt) >= fastPassMs) {
          waiting = false;
          idx++;
          setProgress();
          await sleep(40);
          return;
        }

        if (Date.now() - waitStart > maxWaitMs) {
          running = false;
          waiting = false;
          setBulkPassing(false);
          setStatus('第 ' + (idx + 1) + ' 条超时：' + currentCode + '，已暂停', '#cf1322');
        }
        return;
      }

      if (idx >= queue.length) {
        // v3.4.9：等最后一条 loading 圈消失；
        // v3.4.12：圈消失后再等 3 秒表格落账才清标记——圈消失 ≠ 表格已刷新，
        // 提前清标记 → 最后一行在标记清除后才出现 → 叠加把它的行数成手动 +1 → 每小时节拍多一条
        if (isLoadingVisible()) {
          completionSettleStart = 0; // 圈还在转/又转起来 → 3 秒重新计
          if (!completionWaitStart) {
            completionWaitStart = Date.now();
            setStatus('等待最后一条过站完成…', '#1677ff');
          }
          if (Date.now() - completionWaitStart > maxWaitMs) {
            completionWaitStart = 0; // 超时兜底
          } else {
            return;
          }
        } else {
          if (!completionSettleStart) {
            completionSettleStart = Date.now();
            setStatus('等待最后一条表格落账…', '#1677ff');
          }
          if (Date.now() - completionSettleStart < 3000 && Date.now() - (completionWaitStart || completionSettleStart) < maxWaitMs + 3000) {
            return;
          }
        }
        completionWaitStart = 0;
        completionSettleStart = 0;
        running = false;
        waiting = false;
        setBulkPassing(false);
        idx = 0;
        currentCode = '';
        setProgress();
        setStatus('完成：共 ' + queue.length + ' 条（已复位，可直接重新点开始）', '#389e0d');
        return;
      }

currentCode = queue[idx];

      sawLoading = false;
      loadingGoneCount = 0;

      var ok = await submitOne(currentCode);
      if (!ok) return;

      submitAt = Date.now();
      waiting = true;
      waitStart = Date.now();
      setStatus('提交中 (' + (idx + 1) + '/' + queue.length + ')：' + currentCode, '#1677ff');
    } finally {
      ticking = false;
    }
  }

  // ===== 自动过站（ATE结果命中即过站）v3.3.0 起合并自「MES 极简自动过站 v0.2」=====
  // 仅 #/ProductTrackInOut 页激活：读条码采集框 SN → BOM门禁校验 →（校验+ATE模式）查ATE接口 → 自动点过站按钮
  var ATE_URL = 'https://w3.huawei.com/mespmm/gateway/S007307:mespmmrptservice/mespmm/rpt/services/wipAteFacade/selectPrintAteTestResultList/page/10/1/1/0';
  var AUTO_PASS_INTERVAL_MS = 1200;
  var SN_CODE_CHECK_GATE_KEY = 'sn_code_check_gate_status';
  var SN_CODE_GATE_STALE_MS = 120000;
  var AUTO_PASS_MODE_BOM_ATE = 'bom_ate';
  var AUTO_PASS_MODE_BOM_ONLY = 'bom_only';

  var autoPassTimer = null;
  var autoPassBusy = false;
  var autoPassLastLog = '';
  var passedSet = new Set();
  var missCountMap = new Map();

  function setAutoPassStatus(text, color) {
    var el = document.getElementById('tm-autopass-status');
    if (el) {
      el.textContent = '自动：' + text;
      el.style.color = color || '#333';
    }
    if (text !== autoPassLastLog) {
      autoPassLastLog = text;
      console.log('[AUTO-PASS] ' + text);
    }
  }

  function toStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function fmtDateTime(d, endOfDay) {
    return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-') + (endOfDay ? ' 23:59:59' : ' 00:00:00');
  }

  function normGateParent(v) {
    return v == null ? '' : String(v).replace(/\s+/g, '').toUpperCase();
  }

  function readSnCodeGate(currentParentSn) {
    var raw = localStorage.getItem(SN_CODE_CHECK_GATE_KEY);
    if (!raw) return { ok: false, msg: '未收到BOM子项SN校验状态' };
    var data = null;
    try { data = JSON.parse(raw); } catch (e) { return { ok: false, msg: 'BOM子项SN状态解析失败' }; }
    if (!data || !data.ts) return { ok: false, msg: 'BOM子项SN状态无效' };
    if (Date.now() - data.ts > SN_CODE_GATE_STALE_MS) return { ok: false, msg: 'BOM子项SN状态过期' };
    if (!data.parentSn) return { ok: false, msg: '未识别父项条码' };
    if (normGateParent(data.parentSn) !== normGateParent(currentParentSn)) return { ok: false, msg: '父项条码不一致，等待BOM状态刷新' };
    if (!data.total) return { ok: false, msg: '未检测到BOM子项SN框' };
    if (data.filled < data.total) return { ok: false, msg: 'BOM子项未扫完 ' + data.filled + '/' + data.total };
    if (data.duplicate > 0) return { ok: false, msg: 'BOM子项重复条码 ' + data.duplicate + ' 个' };
    if (data.pending > 0) return { ok: false, msg: 'BOM子项校验中 ' + data.pending + ' 个' };
    if (data.bad > 0) return { ok: false, msg: 'BOM子项编码异常 ' + data.bad + ' 个' };
    if (!data.allOk) return { ok: false, msg: 'BOM子项未全部通过' };
    return { ok: true, msg: 'BOM子项校验通过 ' + data.ok + '/' + data.total, data: data };
  }

  function getPassBtn() {
    var list = document.querySelectorAll('button.hae-btn');
    for (var i = 0; i < list.length; i++) {
      var txt = (list[i].innerText || '').replace(/\s+/g, '');
      var hasSaveIcon = !!list[i].querySelector('.hae-icon.icon-save');
      if (txt === '过站' && hasSaveIcon) return list[i];
    }
    return null;
  }

  function buildBody(sn) {
    var end = new Date();
    // 往前查180天，够查最近ATE结果
    var start = new Date(end.getTime() - 180 * 24 * 3600 * 1000);
    return {
      siteId: '50',
      workProcess: null,
      workSite: null,
      barCode: sn,
      testResult: null,
      tpsName: null,
      equipmentSn: null,
      createdFrom: fmtDateTime(start, false),
      createdTo: fmtDateTime(end, true)
    };
  }

  async function postJson(url, body) {
    console.groupCollapsed('[AUTO-PASS] 查询ATE');
    console.log('URL:', url);
    console.log('Body:', body);
    console.groupEnd();
    var r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var text = await r.text();
    console.groupCollapsed('[AUTO-PASS] ATE返回 ' + r.status);
    console.log('responseText:', text.slice(0, 1500));
    console.groupEnd();
    if (!r.ok) throw new Error('HTTP ' + r.status + '：' + text.slice(0, 200));
    try { return JSON.parse(text); } catch (e) { throw new Error('JSON解析失败：' + text.slice(0, 200)); }
  }

  function getRows(j) {
    if (j && j.resultObjVO && Array.isArray(j.resultObjVO.result)) return j.resultObjVO.result;
    return [];
  }

  // 新接口命中规则：testResult === "0" 或 orgTestResult === "0" 或 mesTestResult === "Y"
  function hitRule(row, sn) {
    if (!row) return false;
    var barCode = toStr(row.barCode);
    if (barCode && barCode !== sn) return false;
    var testResult = toStr(row.testResult);
    var orgTestResult = toStr(row.orgTestResult);
    var mesTestResult = toStr(row.mesTestResult).toUpperCase();
    var failDesc = toStr(row.failDesc);
    return testResult === '0' ||
      orgTestResult === '0' ||
      mesTestResult === 'Y' ||
      failDesc.indexOf('成功') >= 0;
  }

  async function queryAtePass(sn) {
    var j = await postJson(ATE_URL, buildBody(sn));
    var rows = getRows(j);
    console.log('[AUTO-PASS] ATE rows:', rows.length);
    if (rows.length) console.table(rows.slice(0, 5));
    var hit = rows.some(function (row) { return hitRule(row, sn); });
    return { hit: hit, rows: rows, raw: j };
  }

  function currentAutoPassMode() {
    var el = document.getElementById('tm-pass-mode-bom-only');
    return el && el.checked ? AUTO_PASS_MODE_BOM_ONLY : AUTO_PASS_MODE_BOM_ATE;
  }

  // ===== v3.4.0 预扫暂存·延后过站（调试脚本功能并入）=====
  var HOLD_STORE_KEY = 'mes_pass_hold_v1';
  var HOLD_MODE_KEY = 'tm_hold_mode_on';
  var holdReleaseBusy = false;
  var holdListHash = null;

  // 纯 SN：剥系统加的前缀（VOA1:/VOA2:/U1: 等），取出回填不再被二次加前缀
  function holdNormSn(v) {
    v = toStr(v).replace(/\u00A0/g, ' ').replace(/\s+/g, '').trim();
    if (v.indexOf('：') >= 0) v = v.split('：').pop();
    if (v.indexOf(':') >= 0) v = v.split(':').pop();
    return v.toUpperCase();
  }

  function loadHoldStore() {
    try { return JSON.parse(localStorage.getItem(HOLD_STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveHoldStore(h) {
    try { localStorage.setItem(HOLD_STORE_KEY, JSON.stringify(h)); } catch (e) {}
  }
  function isHoldModeOn() {
    var el = document.getElementById('tm-hold-mode-on');
    if (el) return !!el.checked;
    return localStorage.getItem(HOLD_MODE_KEY) === '1';
  }

  function allSnInputsVis() {
    var arr = [].slice.call(document.querySelectorAll('input[id^="sn-input"]'));
    var out = [];
    for (var i = 0; i < arr.length; i++) if (isVisible(arr[i])) out.push(arr[i]);
    out.sort(function (a, b) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var dy = ra.top - rb.top;
      if (Math.abs(dy) > 4) return dy;
      return ra.left - rb.left;
    });
    return out;
  }

  // v3.4.8：按物料编码匹配网格框位（手动采集存了 code 字段，取出时按编码找对应框，不依赖顺序）
  function holdNormalizeCode(v) {
    v = toStr(v).replace(/\u00A0/g, ' ').replace(/\s+/g, '').replace(/\uFF1A/g, ':').toUpperCase();
    if (v.indexOf(':') >= 0) v = v.split(':').pop();
    return v.replace(/^(?=[A-Z0-9]*[A-Z])[A-Z0-9]+[-_]/i, '');
  }
  function holdGetNearCode(inputEl) {
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
    return best ? toStr(best.innerText).trim() : '';
  }
  function holdFindBoxByCode(targets, code) {
    if (!code) return null;
    var cn = holdNormalizeCode(code);
    if (!cn) return null;
    for (var i = 0; i < targets.length; i++) {
      var gridCode = holdNormalizeCode(holdGetNearCode(targets[i]));
      if (gridCode && gridCode === cn && !toStr(targets[i].value)) return targets[i];
    }
    return null;
  }

  function fillInputValue(el, value) {
    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pressEnter(el) {
    try { el.focus(); } catch (e) {}
    var opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function clearPageBoxes() {
    var parent = getParentInput();
    if (parent && toStr(parent.value)) fillInputValue(parent, '');
    var els = allSnInputsVis();
    for (var i = 0; i < els.length; i++) {
      if (toStr(els[i].value)) fillInputValue(els[i], '');
    }
    // v3.4.5：通知 SN 校验脚本暂停自动转填 2s（扫码枪双发/断扫的迟到码会被转填回刚清空的框=残留根因）
    try { localStorage.setItem('sn_suppress_refill_v1', String(Date.now() + 2000)); } catch (e) {}
    if (parent) { try { parent.focus(); } catch (e) {} }
  }

  function setHoldStatus(msg, color) {
    var el = document.getElementById('tm-hold-status');
    if (el) { el.textContent = msg; el.style.color = color || '#667085'; }
    console.log('[HOLD] ' + msg);
  }

  // 列表只在数据变化时重渲染（修复每秒重渲染打断"删"按钮点击的问题）
  function renderHoldList() {
    var listEl = document.getElementById('tm-hold-list');
    if (!listEl) return;
    var h = loadHoldStore();
    // v3.4.7：分页左侧"暂存 N"数量角标（每次调用都刷新：1.5s 周期 tick 覆盖本窗口变更+跨窗口共享变更，不动列表 DOM）
    var chip = document.getElementById('tm-hold-count');
    if (chip) {
      var nHold = Object.keys(h).length;
      chip.textContent = '暂存 ' + nHold;
      if (nHold > 0) chip.classList.add('on'); else chip.classList.remove('on');
    }
    var keys = Object.keys(h).sort(function (a, b) { return (h[a].holdTs || 0) - (h[b].holdTs || 0); });
    var hash = keys.map(function (k) { return k + ':' + (h[k].holdTs || 0); }).join('|');
    if (hash === holdListHash) return;
    holdListHash = hash;
    listEl.innerHTML = '';
    if (!keys.length) {
      listEl.innerHTML = '<div class="tm-hold-empty">（空）</div>';
      return;
    }
    keys.forEach(function (k) {
      var e = h[k];
      var d = new Date(e.holdTs || Date.now());
      var tstr = pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      var row = document.createElement('div');
      row.className = 'tm-hold-row';
      row.innerHTML =
        '<div class="tm-hold-info">' +
          '<div class="tm-hold-mod" title="' + e.module + '">' + e.module + '</div>' +
          '<div class="tm-hold-sub">' + e.count + ' SN · ' + tstr + '</div>' +
        '</div>' +
        '<button class="tm-hold-btn" data-k="' + k + '" data-act="release">取出</button>' +
        '<button class="tm-hold-btn tm-hold-btn-del" data-k="' + k + '" data-act="del">删</button>';
      listEl.appendChild(row);
    });
  }

  function deleteHoldEntry(key) {
    var h = loadHoldStore();
    var e = h[key];
    if (!e) return;
    delete h[key];
    saveHoldStore(h);
    holdListHash = null;
    renderHoldList();
    setHoldStatus('已删除 ' + e.module + '（不执行过站）', '#fa8c16');
  }

  // v3.4.1：本会话已过站（自动/手动）但暂存区还留着记录的 → 自动移出（兜底清理）
  function sweepPassedHolds() {
    if (!passedSet.size) return;
    var h = loadHoldStore();
    var keys = Object.keys(h);
    var changed = false;
    for (var i = 0; i < keys.length; i++) {
      if (h[keys[i]] && passedSet.has(h[keys[i]].module)) {
        setHoldStatus('✓ ' + h[keys[i]].module + ' 已过站，自动移出暂存区', '#389e0d');
        delete h[keys[i]];
        changed = true;
      }
    }
    if (changed) {
      saveHoldStore(h);
      holdListHash = null;
      renderHoldList();
    }
  }

  // v3.4.1：手动过站检测（用户自己点 MES 过站按钮，脚本没点）
  // 序列 = 父框有模块 M → 页面被 MES 清空 → 3s 内出现"出站成功/过站成功" toast（且晚于 M 载入）→ 删 M 的暂存记录
  var lastParentSn = '';
  var lastParentFilledTs = 0;
  var lastClearTs = 0;
  var lastPassToastTs = 0;

  function hasVisiblePassToast() {
    var els = document.querySelectorAll('div,span');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var t = el.textContent;
      if (!t || t.length > 30) continue;
      if (t.indexOf('出站成功') < 0 && t.indexOf('过站成功') < 0) continue;
      var st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
      return true;
    }
    return false;
  }

  function sweepManualPass() {
    var p = getParentInput();
    var cur = p ? toStr(p.value) : '';
    var now = Date.now();
    if (cur) {
      if (cur !== lastParentSn) { lastParentSn = cur; lastParentFilledTs = now; lastPassToastTs = 0; }
      lastClearTs = 0;
      return;
    }
    if (!lastParentSn) return;
    var filled = allSnInputsVis().some(function (el) { return toStr(el.value); });
    if (filled) { lastClearTs = 0; return; }
    if (!lastClearTs) lastClearTs = now;
    if (hasVisiblePassToast()) lastPassToastTs = now;
    if (now - lastClearTs >= 3000) { lastParentSn = ''; lastClearTs = 0; return; }
    if (lastPassToastTs > lastParentFilledTs) {
      var k = holdNormSn(lastParentSn);
      var h = loadHoldStore();
      if (h[k]) {
        setHoldStatus('✓ ' + h[k].module + ' 过站成功，移出暂存区', '#389e0d');
        delete h[k];
        saveHoldStore(h);
        holdListHash = null;
        renderHoldList();
      }
      // v3.4.2：手动过站过的模块记入本会话 passedSet → 再扫不重复暂存
      passedSet.add(lastParentSn);
      lastParentSn = '';
      lastClearTs = 0;
    }
  }

  // 暂存当前模块（要求 BOM 门禁 allOk + 父项一致；存纯 SN）
  function saveCurrentHold() {
    var parent = getParentInput();
    var mod = parent ? toStr(parent.value) : '';
    if (!mod) return { ok: false, msg: '条码采集框为空' };
    // v3.4.3：模块条码必须 16 位（扫断/焦点被弹窗抢走一半的残码不许入暂存区）
    if (mod.length !== 16) return { ok: false, msg: '条码长度异常（须 16 位，当前 ' + mod.length + ' 位，疑似扫断），不暂存，请重扫' };
    var gate = readSnCodeGate(mod);
    if (!gate.ok) return { ok: false, msg: gate.msg };
    var els = allSnInputsVis();
    var items = [];
    for (var i = 0; i < els.length; i++) {
      var v = toStr(els[i].value);
      if (!v) continue;
      items.push({ sn: holdNormSn(v), boxId: els[i].id || '' });
    }
    if (!items.length) return { ok: false, msg: '没有已填 SN' };
    var h = loadHoldStore();
    var key = holdNormSn(mod);
    // v3.4.2：本会话已过站（自动/手动/取出）的模块不再重复暂存
    if (passedSet.has(mod)) return { ok: false, msg: '该模块本会话已过站，无需暂存' };
    if (h[key]) return { ok: false, msg: '该模块已在暂存区' };
    // v3.4.7：SN 级查重——待暂存 SN 与暂存区其他模块的 SN 重复 → 拒绝（防同一 SN 被两个模块重复分配）
    for (var di = 0; di < items.length; di++) {
      var dSn = holdNormSn(items[di].sn);
      var oKeys = Object.keys(h);
      for (var oj2 = 0; oj2 < oKeys.length; oj2++) {
        var oEnt = h[oKeys[oj2]];
        if (!oEnt || !oEnt.items) continue;
        for (var oj3 = 0; oj3 < oEnt.items.length; oj3++) {
          if (holdNormSn(oEnt.items[oj3].sn) === dSn) {
            return { ok: false, msg: 'SN ' + dSn + ' 与暂存区 ' + oEnt.module + ' 重复，疑似扫错，不暂存（先删错的那条再重扫）' };
          }
        }
      }
    }
    h[key] = { module: mod, holdTs: Date.now(), count: items.length, total: els.length, items: items };
    saveHoldStore(h);
    holdListHash = null;
    renderHoldList();
    return { ok: true, mod: mod, count: items.length, total: els.length };
  }

  // 暂存模式下：校验全过（+ATE）→ 自动暂存 + 清空 + 焦点回采集框，连续扫下一个
  function holdAutoAndClear() {
    var res = saveCurrentHold();
    if (!res.ok) {
      setAutoPassStatus('暂存失败：' + res.msg, '#cf1322');
      setHoldStatus('暂存失败：' + res.msg, '#cf1322');
      return;
    }
    clearPageBoxes();
    // v3.4.6：拦截 MES 页面代码的迟到重写波（1~5s 内把值写回刚清空的框=残留）
    scheduleHeldResweep(res.mod);
    setAutoPassStatus('暂存：✓ ' + res.mod + '（' + res.count + ' SN）已暂存+清空', '#389e0d');
    setHoldStatus('✓ 已自动暂存 ' + res.mod + '（' + res.count + ' SN，纯码）', '#389e0d');
  }

  // v3.4.6：暂存清框后 +1.5s/+3s/+5s 三次精准清扫，截断 MES 页面代码（U.val 重写波）的迟到写入
  // 安全边界：① 采集框已有别的 16 位模块码=用户已开扫下一模块→整轮放弃
  //           ② 只清"值（剥前缀后）恰好等于刚暂存模块某 SN"的框，其他值一律不碰
  function scheduleHeldResweep(mod) {
    var h = loadHoldStore();
    var e = h[holdNormSn(mod)];
    if (!e || !e.items || !e.items.length) return;
    var sns = {};
    for (var i = 0; i < e.items.length; i++) sns[holdNormSn(e.items[i].sn)] = 1;
    [1500, 3000, 5000].forEach(function (delay) {
      setTimeout(function () {
        try {
          var p = getParentInput();
          var pv = p ? toStr(p.value) : '';
          if (pv && pv.length === 16 && holdNormSn(pv) !== holdNormSn(mod)) return;
          var els = allSnInputsVis();
          for (var j = 0; j < els.length; j++) {
            var v = toStr(els[j].value);
            if (v && sns[holdNormSn(v)]) fillInputValue(els[j], '');
          }
        } catch (err) {}
      }, delay);
    });
  }

  // 取出过站：模块条码回车重建网格 → 按各自条数回填 SN → 等 BOM（+ATE）→ 1.5s 延迟自动点过站 → 删除暂存记录
  async function releaseHold(key) {
    if (holdReleaseBusy) { setHoldStatus('正在取出中，请稍候', '#fa8c16'); return; }
    if (location.href.indexOf('#/ProductTrackInOut') < 0) { setHoldStatus('不在过站页（#/ProductTrackInOut）', '#cf1322'); return; }
    var h = loadHoldStore();
    var entry = h[key];
    if (!entry) { setHoldStatus('暂存区没有该模块', '#cf1322'); return; }
    // 取出=过站阶段，暂存开关若还开着会自动挡自动过站 → 先自动关掉
    var hm = document.getElementById('tm-hold-mode-on');
    if (hm && hm.checked) {
      hm.checked = false;
      try { localStorage.setItem(HOLD_MODE_KEY, '0'); } catch (e) {}
      setHoldStatus('已自动关闭"暂存"开关（开始过站）', '#fa8c16');
    }
    var parent = getParentInput();
    if (!parent) { setHoldStatus('未找到条码采集框', '#cf1322'); return; }
    // v3.4.3：残留码不挡路（MES 过站后模块码留在采集框、旧网格 SN 清不干净）→ 自动清空继续，支持连续取出
    var staleParent = toStr(parent.value);
    var staleBoxes = allSnInputsVis().filter(function (el) { return toStr(el.value); });
    if (staleParent) fillInputValue(parent, '');
    for (var si = 0; si < staleBoxes.length; si++) fillInputValue(staleBoxes[si], '');
    if (staleParent || staleBoxes.length) {
      setHoldStatus('已自动清空残留' + (staleParent ? '（采集框 ' + staleParent + ')' : '') + (staleBoxes.length ? '（SN 框 ' + staleBoxes.length + ' 个）' : ''), '#fa8c16');
    }
    // v3.4.5：取出期间也暂停自动转填（回填 150ms/框 窗口内防迟到双发码混入）
    try { localStorage.setItem('sn_suppress_refill_v1', String(Date.now() + 5000)); } catch (e) {}
    if (entry.module.length !== 16) { setHoldStatus('✗ 暂存模块码 ' + entry.module + ' 不是 16 位（疑似扫断），请删记录重扫', '#cf1322'); return; }

    holdReleaseBusy = true;
    var holdListEl = document.getElementById('tm-hold-list');
    if (holdListEl) holdListEl.classList.add('tm-busy');
    var releaseAllBtn = document.getElementById('tm-hold-release-all');
    if (releaseAllBtn) releaseAllBtn.disabled = true;
    try {
      setAutoPassStatus('取出中：' + entry.module, '#722ed1');
      setHoldStatus('① 回填模块 ' + entry.module + '（条码回车重建网格）', '#1677ff');
      fillInputValue(parent, entry.module);
      await sleep(60);
      pressEnter(parent);

      // ② v3.4.1：必须看到 MES 全局 loading 出现并消失 = MES 真受理了模块
      //    （旧版直接等"框数够"，会把上一次留下的旧网格误判为新网格，SN 回填落空、校验根本不触发）
      setHoldStatus('② 等 MES 受理模块（loading 出现又消失）…', '#1677ff');
      var sawLoad = false;
      var loadGone = 0;
      var tL = Date.now();
      while (Date.now() - tL < 15000) {
        if (isLoadingVisible()) {
          sawLoad = true;
          loadGone = 0;
        } else if (sawLoad) {
          loadGone++;
          if (loadGone >= 2) break;
        }
        await sleep(150);
      }
      if (!sawLoad) {
        setHoldStatus('✗ 模块回车后没出现 loading：MES 未受理（已过站？被拒？），暂存保留，请手动处理', '#cf1322');
        return;
      }
      await sleep(400);

      // ③ SN 网格出现（几百毫秒~几秒）
      setHoldStatus('③ 等 SN 网格出现…', '#1677ff');
      var gridOk = false;
      var t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        if (allSnInputsVis().length >= entry.count) { gridOk = true; break; }
        await sleep(300);
      }
      if (!gridOk) {
        setHoldStatus('✗ 网格未出来（MES 可能拒收：已过站/已采集？），暂存保留，请手动处理', '#cf1322');
        return;
      }
      await sleep(300);

      // ④ 回填 SN：框里已有码且对得上（MES 预填了采集码）→ 跳过不重复提交；是别的码 → 中止；空 → 回填
      var targets = allSnInputsVis();
      var fillN = 0;
      for (var i = 0; i < entry.items.length; i++) {
        var item = entry.items[i];
        var box = null;
        if (item.boxId) {
          for (var b = 0; b < targets.length; b++) if (targets[b].id === item.boxId) { box = targets[b]; break; }
        }
        // v3.4.8：手动采集存了 code 字段 → 按物料编码匹配网格框位（不依赖模板顺序=网格顺序）
        if (!box && item.code) box = holdFindBoxByCode(targets, item.code);
        if (!box) box = targets[i] || null;
        if (!box) {
          setHoldStatus('✗ SN[' + (i + 1) + '] ' + item.sn + ' 未找到对应框，中止（暂存保留）', '#cf1322');
          return;
        }
        var curV = toStr(box.value);
        if (curV) {
          if (holdNormSn(curV) === holdNormSn(item.sn)) continue; // MES 预填同码 → 跳过不重复提交
          // v3.4.3：上一条残留的别的码 → 清空覆盖，不再中止
          fillInputValue(box, '');
          await sleep(30);
        }
        fillInputValue(box, item.sn);
        await sleep(20);
        pressEnter(box);
        fillN++;
        setHoldStatus('④ 回填 SN ' + (i + 1) + '/' + entry.items.length + '  ' + item.sn, '#1677ff');
        await sleep(150);
      }
      if (!fillN) setHoldStatus('④ SN 框已有码（MES 预填），无需回填', '#389e0d');

      // ⑤ 等 BOM 校验全过（v3.4.1：20s→60s，实时显示进度）
      setHoldStatus('⑤ 等 BOM 校验全过…', '#fa8c16');
      var gateOk = false;
      var t1 = Date.now();
      var lastGateMsg = '';
      while (Date.now() - t1 < 60000) {
        var g = readSnCodeGate(entry.module);
        if (g.ok) { gateOk = true; break; }
        if (g.msg !== lastGateMsg) {
          lastGateMsg = g.msg;
          setHoldStatus('⑤ 等 BOM 校验：' + g.msg, '#fa8c16');
        }
        await sleep(500);
      }
      if (!gateOk) {
        if (passedSet.has(entry.module)) {
          var hx = loadHoldStore();
          delete hx[key];
          saveHoldStore(hx);
          holdListHash = null;
          renderHoldList();
          setHoldStatus('✓ ' + entry.module + ' 等待期间已过站，移出暂存区', '#389e0d');
        } else {
          setHoldStatus('✗ BOM 校验 60s 未全过，暂存保留。检查 SN 或手动过站（过站成功后记录自动删）', '#cf1322');
        }
        return;
      }

      if (currentAutoPassMode() === AUTO_PASS_MODE_BOM_ATE) {
        setHoldStatus('⑥ 等待 ATE 通过…', '#fa8c16');
        var ateOk = false;
        var t2 = Date.now();
        while (Date.now() - t2 < 120000) {
          try {
            var r = await queryAtePass(entry.module);
            if (r.hit) { ateOk = true; break; }
          } catch (e) {}
          await sleep(2000);
        }
        if (!ateOk) {
          setHoldStatus('✗ ATE 2 分钟未通过，暂存保留', '#cf1322');
          return;
        }
      }

      setHoldStatus('⑦ 1.5 秒后自动过站（先等批量过站 loading 圈消失）…', '#389e0d');
      await sleep(1500);
      var tSpin2 = Date.now();
      while (isLoadingVisible()) {
        if (Date.now() - tSpin2 > 10000) {
          setHoldStatus('✗ 过站 loading 圈 10s 未消失，暂存保留，请手动过站（过站后记录自动删）', '#cf1322');
          return;
        }
        await sleep(200);
      }
      var btn = getPassBtn();
      if (!btn) {
        setHoldStatus('✗ 未找到过站按钮，暂存保留（可手动点过站，过站后记录自动删）', '#cf1322');
        return;
      }
      btn.click();
      passedSet.add(entry.module);
      setAutoPassStatus('已自动过站：' + entry.module + '（取出）', '#389e0d');
      // v3.4.4：等"过站本身"的 loading 圈出现又消失 = MES 过站完成，再进下一条
      //（旧版点完立即发下一模块 Enter，MES 还在处理上一条→Enter 被吞→网格出不来）
      setHoldStatus('⑧ 已过站，等 MES 完成收尾…', '#389e0d');
      var sawS = false, goneS = 0, tS = Date.now();
      while (Date.now() - tS < 15000) {
        if (isLoadingVisible()) { sawS = true; goneS = 0; }
        else if (sawS) { goneS++; if (goneS >= 3) break; }
        await sleep(150);
      }
      await sleep(500);
      setHoldStatus('⑧ 已点过站，' + entry.module + ' 移出暂存区', '#389e0d');

      var h2 = loadHoldStore();
      delete h2[key];
      saveHoldStore(h2);
      holdListHash = null;
      renderHoldList();
    } catch (e) {
      console.error('[HOLD] 取出异常:', e);
      setHoldStatus('✗ 取出异常：' + (e && e.message ? e.message : String(e)) + '（暂存保留）', '#cf1322');
    } finally {
      holdReleaseBusy = false;
      var hl2 = document.getElementById('tm-hold-list');
      if (hl2) hl2.classList.remove('tm-busy');
      var ra2 = document.getElementById('tm-hold-release-all');
      if (ra2) ra2.disabled = false;
    }
  }

  // 全部取出：按暂存顺序逐模块串行，一条失败即停（后续保留）
  async function releaseAllHold() {
    if (holdReleaseBusy) { setHoldStatus('正在取出中，请稍候', '#fa8c16'); return; }
    var h = loadHoldStore();
    var keys = Object.keys(h).sort(function (a, b) { return (h[a].holdTs || 0) - (h[b].holdTs || 0); });
    if (!keys.length) { setHoldStatus('暂存区为空', '#fa8c16'); return; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!loadHoldStore()[k]) continue;
      await releaseHold(k);
      if (loadHoldStore()[k]) {
        setHoldStatus('第 ' + (i + 1) + ' 条未完成，停止"全部取出"（后续保留）', '#cf1322');
        break;
      }
    }
  }

  async function checkAutoPassLoop() {
    if (autoPassBusy) return;
    autoPassBusy = true;
    try {
      var input = getParentInput();
      if (!input) {
        setAutoPassStatus('未找到条码采集框', '#cf1322');
        return;
      }
      var sn = toStr(input.value);
      if (!sn) {
        setAutoPassStatus('等待扫码', '#1677ff');
        return;
      }
      // v3.4.3：模块条码必须 16 位（扫断的残码不自动过站、不暂存）
      if (sn.length !== 16) {
        setAutoPassStatus('⚠ 采集框 ' + sn.length + ' 位（须 16 位，疑似扫断），忽略本次，请重扫', '#cf1322');
        return;
      }
      if (passedSet.has(sn)) {
        setAutoPassStatus('已处理：' + sn, '#389e0d');
        return;
      }

      // v3.4.0：取出进行中 → 自动过站挂起（取出自带 1.5s 延迟点过站，防双点）
      if (holdReleaseBusy) {
        setAutoPassStatus('取出中，自动过站暂停', '#722ed1');
        return;
      }

      // v3.4.0：暂存模式（预扫暂存·延后过站）：校验全过（校验+ATE 模式含 ATE）→ 自动暂存+清空+回采集框
      if (isHoldModeOn()) {
        if (loadHoldStore()[holdNormSn(sn)]) {
          setAutoPassStatus('暂存：' + sn + ' 已在暂存区（重扫请先在暂存页删记录）', '#722ed1');
          return;
        }
        var hg = readSnCodeGate(sn);
        if (!hg.ok) {
          setAutoPassStatus('暂存 ' + hg.msg + '（未全过，不暂存）', '#fa8c16');
          return;
        }
        if (currentAutoPassMode() === AUTO_PASS_MODE_BOM_ATE) {
          setAutoPassStatus('暂存 BOM 通过，查 ATE：' + sn, '#1677ff');
          var hret;
          try { hret = await queryAtePass(sn); } catch (e) { setAutoPassStatus('暂存 ATE 查询异常，继续等', '#fa8c16'); return; }
          if (!hret.hit) {
            var hn = (missCountMap.get(sn) || 0) + 1;
            missCountMap.set(sn, hn);
            setAutoPassStatus('暂存 ATE 未通过/未出结果，继续等 ' + hn, '#fa8c16');
            return;
          }
        }
        holdAutoAndClear();
        return;
      }

      var mode = currentAutoPassMode();

      // 第一步：无论哪个模式，都必须先校验BOM子项SN
      var gate = readSnCodeGate(sn);
      if (!gate.ok) {
        setAutoPassStatus('等待BOM校验：' + gate.msg, '#fa8c16');
        return;
      }

      // 第二步：根据模式决定是否查询ATE
      if (mode === AUTO_PASS_MODE_BOM_ATE) {
        setAutoPassStatus(gate.msg + '，查询ATE：' + sn, '#1677ff');
        var ret = await queryAtePass(sn);
        if (!ret.hit) {
          var n = (missCountMap.get(sn) || 0) + 1;
          missCountMap.set(sn, n);
          setAutoPassStatus('ATE未通过/未出结果，继续等 ' + n + '：' + sn, '#fa8c16');
          return;
        }
        setAutoPassStatus('BOM校验通过，ATE通过，准备过站：' + sn, '#389e0d');
      } else if (mode === AUTO_PASS_MODE_BOM_ONLY) {
        setAutoPassStatus('BOM校验通过，只校验模式，准备过站：' + sn, '#fa8c16');
      } else {
        setAutoPassStatus('未知过站模式，禁止过站', '#cf1322');
        return;
      }

      var btn = getPassBtn();
      if (!btn) {
        setAutoPassStatus('校验通过，但未找到过站按钮', '#cf1322');
        return;
      }

      // v3.4.1：等"批量过站" loading 圈消失再点过站（圈圈还在时点过站会异常弹窗）
      // v3.4.11：先无条件等 0.3s——校验刚过后 MES 的 loading 圈有延迟才出现，
      // 只等"圈消失"会在圈还没出来时就点（MES 内部处理未完）→ 异常弹窗；0.3s 给圈露面时间，再结合圈圈判断
      await sleep(300);
      var tSpin = Date.now();
      while (isLoadingVisible()) {
        if (Date.now() - tSpin > 10000) {
          setAutoPassStatus('过站 loading 圈 10s 未消失，本次跳过', '#cf1322');
          return;
        }
        await sleep(100);
      }
      btn = getPassBtn();
      if (!btn) {
        setAutoPassStatus('等 loading 圈期间过站按钮消失，未点', '#cf1322');
        return;
      }

      btn.click();
      passedSet.add(sn);
      missCountMap.delete(sn);
      // v3.4.1：在暂存区里的模块（取出超时残留/手动过站）→ 同步删记录
      var hsd = loadHoldStore();
      var hsk = holdNormSn(sn);
      if (hsd[hsk]) {
        delete hsd[hsk];
        saveHoldStore(hsd);
        holdListHash = null;
        renderHoldList();
      }
      setAutoPassStatus('已自动过站：' + sn, '#389e0d');
    } catch (e) {
      console.error('[AUTO-PASS] 异常详情:', e);
      setAutoPassStatus('异常：' + (e && e.message ? e.message : String(e)), '#cf1322');
    } finally {
      autoPassBusy = false;
    }
  }

  function startAutoPass() {
    if (autoPassTimer) return;
    if (location.href.indexOf('#/ProductTrackInOut') < 0) return;
    autoPassTimer = setInterval(checkAutoPassLoop, AUTO_PASS_INTERVAL_MS);
    setAutoPassStatus('运行中', '#1677ff');
    // 启动后立即查一次
    setTimeout(checkAutoPassLoop, 300);
    startAteBypass();
  }

  // 手动测试钩子（控制台：autoPassAteTest("SN")）
  var autoPassAteTestFn = async function (sn) {
    sn = toStr(sn);
    if (!sn) {
      console.warn('用法：autoPassAteTest("SN")');
      return;
    }
    var ret = await queryAtePass(sn);
    console.log('[AUTO-PASS TEST] hit:', ret.hit);
    console.log('[AUTO-PASS TEST] rows:', ret.rows);
    return ret;
  };
  window.autoPassAteTest = autoPassAteTestFn;
  try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) unsafeWindow.autoPassAteTest = autoPassAteTestFn; } catch (e) {}
  // ===== 自动过站 END =====

  // ===== v3.3.13 ATE 未通过旁路（仅 ProductTrackInOut）：
  //  1) 过站按钮强制可见：模块已加载（条码采集框有值）时，MES 把 #submitButton 藏了也强制显示
  //     （实测容器隐藏时按钮 click 依然生效，显示出来供手动点）
  //  2) SN 焦点回送：MES 查 ATE 未通过会把焦点拉回条码采集框并全选（准备扫下一个模块码），
  //     此时若还有空的 sn-input 框，焦点立即送回下一个空 SN 框——未测完也能继续扫 SN、正常跳焦点。
  //     无时间窗：只要焦点进条码采集框且还有空 SN 框就跳；但豁免用户真实点击
  //     （手动点条码采集框时不抢焦点、可正常编辑；MES 程序化拉回仍立即跳）。 =====
  var ateBypassOn = false;
  var parentRealClick = false;

  function nextEmptySnInput() {
    var boxes = [].slice.call(document.querySelectorAll('input[id^="sn-input"]'));
    for (var i = 0; i < boxes.length; i++) {
      if (!boxes[i].value) return boxes[i];
    }
    return null;
  }

  function showPassBtnOnce() {
    try {
      var parent = getParentInput();
      if (!parent || !parent.value) return;
      var sb = document.getElementById('submitButton');
      if (sb && getComputedStyle(sb).display === 'none') {
        sb.style.setProperty('display', 'block', 'important');
      }
    } catch (e) {}
  }

  function startAteBypass() {
    if (ateBypassOn) return;
    if (location.href.indexOf('#/ProductTrackInOut') < 0) return;
    ateBypassOn = true;

    setInterval(showPassBtnOnce, 300);

    // 用户真实点击条码采集框 → 打标记（焦点离开时清除）
    document.addEventListener('mousedown', function (e) {
      try {
        if (!e.isTrusted) return;
        var parent = getParentInput();
        if (parent && e.target === parent) parentRealClick = true;
      } catch (err) {}
    }, true);

    document.addEventListener('focusout', function (e) {
      try {
        var parent = getParentInput();
        if (parent && e.target === parent) parentRealClick = false;
      } catch (err) {}
    }, true);

    document.addEventListener('focusin', function (e) {
      try {
        var parent = getParentInput();
        if (!parent || e.target !== parent) return;
        if (!parent.value) return;
        if (parentRealClick) { parentRealClick = false; return; } // 用户手动点的 → 放行编辑
        var next = nextEmptySnInput();
        if (next) next.focus();
      } catch (err) {}
    }, true);
  }
  // ===== v3.3.13 ATE 旁路 END =====

  // ===== 提取逻辑 =====
  function getTaskMagnifier() {
    var list = [].slice.call(document.querySelectorAll('a.hae-icon.icon-search')).filter(isVisible);
    return list[1] || null;
  }

  function getTaskDialog() {
    var titles = document.querySelectorAll('.hae-dialog__title');
    for (var i = 0; i < titles.length; i++) {
      var t = titles[i];
      if ((t.innerText || '').indexOf('任务令多输入框') >= 0 && isVisible(t)) {
        return t.closest('.hae-dialog__wrapper') || t.closest('.hae-dialog-box');
      }
    }
    var form = document.querySelector('#addForm');
    if (form) return form.closest('.hae-dialog__wrapper') || form.closest('.hae-dialog-box');
    return null;
  }

  function getTaskTextarea(dialog) {
    if (!dialog) return null;
    return dialog.querySelector('#addForm div[id^="Textarea_"] > textarea.textarea')
      || dialog.querySelector('#addForm textarea.textarea')
      || dialog.querySelector('textarea.textarea')
      || dialog.querySelector('textarea');
  }

  function setTextareaValue(el, value) {
    var desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findBtnByText(txt, root) {
    root = root || document;
    var list = root.querySelectorAll('button');
    for (var i = 0; i < list.length; i++) {
      if (isVisible(list[i]) && (list[i].innerText || '').trim() === txt) return list[i];
    }
    return null;
  }

  async function waitLoadingDone(max) {
    max = max || 18000;
    var start = Date.now();
    var seen = false;
    while (Date.now() - start < max) {
      var on = isLoadingVisible();
      if (on) seen = true;
      if (seen && !on) return true;
      await sleep(120);
    }
    return false;
  }

  async function waitRowsReady(max) {
    max = max || 12000;
    var start = Date.now();
    while (Date.now() - start < max) {
      if (document.querySelectorAll('tr.grid-row').length > 0) return true;
      await sleep(150);
    }
    return false;
  }

  function extractCodes() {
    var list = [].slice.call(document.querySelectorAll('tr.grid-row td:nth-of-type(3) span.grid-input'))
      .map(function (el) { return (el.innerText || '').trim(); })
      .filter(Boolean);

    if (!list.length) {
      list = [].slice.call(document.querySelectorAll('tr.grid-row span.grid-input'))
        .map(function (el) { return (el.innerText || '').trim(); })
        .filter(function (v) { return /^[0-9A-Za-z]{8,}$/.test(v); });
    }

    var map = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!map[list[i]]) { map[list[i]] = 1; out.push(list[i]); }
    }
    return out;
  }

  async function waitUntil(cond, timeout, step) {
    timeout = timeout || 45000;
    step = step || 250;
    var start = Date.now();
    while (Date.now() - start < timeout) {
      if (cond()) return true;
      await sleep(step);
    }
    return false;
  }

  async function waitExtractReady() {
    var ok = await waitUntil(function () {
      var mags = [].slice.call(document.querySelectorAll('a.hae-icon.icon-search')).filter(isVisible);
      return mags.length >= 2;
    }, 45000, 300);
    if (!ok) throw new Error('提取页未就绪');
  }

  async function runExtract(taskNo) {
    var mag = getTaskMagnifier();
    if (!mag) throw new Error('未找到任务令放大镜');
    mag.click();
    await sleep(250);

    var dialog = null, ta = null;
    for (var i = 0; i < 100; i++) {
      dialog = getTaskDialog();
      ta = getTaskTextarea(dialog);
      if (dialog && ta && isVisible(ta)) break;
      await sleep(140);
    }
    if (!ta) throw new Error('未找到任务令输入框');

    ta.focus();
    ta.click();
    setTextareaValue(ta, taskNo);
    await sleep(140);

    var saveBtn = findBtnByText('保存', dialog) || findBtnByText('保存', document);
    if (!saveBtn) throw new Error('未找到保存按钮');
    saveBtn.click();

    await sleep(260);

    var queryBtn = findBtnByText('查询', document);
    if (!queryBtn) throw new Error('未找到查询按钮');
    queryBtn.click();

    var ok = await waitLoadingDone(18000);
    if (!ok) throw new Error('查询超时');

    var rowsOk = await waitRowsReady(12000);
    if (!rowsOk) throw new Error('表格未渲染');

    return extractCodes();
  }

  async function runExtractWithRetry(taskNo, maxTry) {
    maxTry = maxTry || 3;
    for (var i = 0; i < maxTry; i++) {
      try {
        var codes = await runExtract(taskNo);
        if (codes.length) return codes;
      } catch (e) {}
      await sleep(400);
    }
    return [];
  }

  async function handleJob(job) {
    if (!job || !job.taskNo) return;
    if (extractRunning) return;
    if (job.jobId === lastJobId) return;

    extractRunning = true;
    lastJobId = job.jobId;

    try {
      await waitExtractReady();
      var codes = await runExtractWithRetry(job.taskNo, 3);
      if (!codes.length) throw new Error('重试后仍未提取到条码');

      await GM_setValue(KEY_RESULT, {
        ok: true,
        jobId: job.jobId,
        taskNo: job.taskNo,
        codes: codes,
        ts: Date.now()
      });
    } catch (e) {
      await GM_setValue(KEY_RESULT, {
        ok: false,
        jobId: job.jobId,
        taskNo: job.taskNo,
        codes: [],
        err: String(e),
        ts: Date.now()
      });
    } finally {
      setTimeout(function () { try { window.close(); } catch (e) {} }, 500);
      extractRunning = false;
    }
  }

  async function bgWorker() {
    if (location.hash.indexOf('autoExtract=1') === -1) return;

    var first = await GM_getValue(KEY_JOB, null);
    handleJob(first);

    if (typeof GM_addValueChangeListener === 'function') {
      GM_addValueChangeListener(KEY_JOB, function (_k, _o, n) { handleJob(n); });
    }
  }

function startBarcodeEnterBackgroundService() {
  if (barcodeEnterBgStarted) return;

  barcodeEnterBgStarted = true;

  var bgPending = false;
  var bgInput = null;
  var bgCode = '';
  var bgTriggerAt = 0;
  var bgSawLoading = false;
  var bgLoadingGoneCount = 0;
  var bgLastAutoAt = 0;

  // 最长等待 loading 出现时间
  // 超过这个时间没看到 loading，就取消，不补 Enter
  var BG_WAIT_LOADING_MS = 8000;

  // 最长总等待时间
  var BG_MAX_WAIT_MS = 30000;

  function bgMakeEnterEvent(type) {
    var e = new KeyboardEvent(type, {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true
    });

    try {
      Object.defineProperty(e, 'keyCode', {
        get: function () {
          return 13;
        }
      });
    } catch (err) {}

    try {
      Object.defineProperty(e, 'which', {
        get: function () {
          return 13;
        }
      });
    } catch (err2) {}

    return e;
  }

  function bgPressEnter(reason) {
    var input = bgInput;

    if (!input || !document.contains(input)) {
      input = getParentInput();
    }

    if (!input) {
      console.warn('[MES] 条码回车后台：未找到条码采集框，无法补Enter');
      setStatus('条码回车：未找到条码采集框', '#cf1322');
      return false;
    }

    if (Date.now() - bgLastAutoAt < 1200) {
      console.warn('[MES] 条码回车后台：距离上次补Enter太近，跳过');
      return false;
    }

    barcodeEnterSending = true;

    try {
      input.focus();

      input.dispatchEvent(bgMakeEnterEvent('keydown'));
      input.dispatchEvent(bgMakeEnterEvent('keypress'));
      input.dispatchEvent(bgMakeEnterEvent('keyup'));

      bgLastAutoAt = Date.now();
      barcodeEnterLastAutoAt = Date.now();

      console.log('[MES] 条码回车后台：检测到loading结束，已补Enter', {
        reason: reason,
        barcode: bgCode,
        inputValue: String(input.value || '')
      });

      setStatus('条码回车：loading结束，已补 Enter', '#389e0d');

      return true;
    } finally {
      setTimeout(function () {
        barcodeEnterSending = false;
      }, 500);
    }
  }

  function bgIsBarcodeTarget(target) {
    if (!target) return false;

    var p = getParentInput();

    if (p && target === p) return true;

    try {
      if (isBarcodeInput(target)) return true;
    } catch (e) {}

    return false;
  }

  document.addEventListener('keydown', function (e) {
    try {
      if (!isBarcodeEnterEnabled()) return;

      if (barcodeEnterSending) return;

      if (e.key !== 'Enter' && e.keyCode !== 13) return;

      // 只处理扫码枪/键盘真实 Enter
      if (!e.isTrusted) return;

      var target = e.target;

      // 只处理条码采集框
      if (!bgIsBarcodeTarget(target)) return;

      var v = String(target.value || '').trim();

      if (!v) return;

        bgPending = true;
        bgInput = target;
        bgCode = v;
        bgTriggerAt = Date.now();
        bgSawLoading = false;
        bgLoadingGoneCount = 0;
        barcodeEnterBoundInput = target;


      console.log('[MES] 条码回车后台：捕获条码真实Enter，等待loading出现', {
        barcode: bgCode,
        panelHidden: !!document.getElementById('tm-fab') &&
          getComputedStyle(document.getElementById('tm-fab')).display !== 'none'
      });

      setStatus('条码回车：等待loading', '#1677ff');

    } catch (err) {
      console.warn('[MES] 条码回车后台：真实Enter监听异常', err);
    }
  }, true);

  setInterval(function () {
    try {
      if (!isBarcodeEnterEnabled()) {
        bgPending = false;
        return;
      }

      if (!bgPending) return;

      var now = Date.now();
      var loading = false;

      try {
        loading = isLoadingVisible();
      } catch (e) {
        loading = false;
      }

      // 看到 loading
      if (loading) {
        bgSawLoading = true;
        bgLoadingGoneCount = 0;

        setStatus('条码回车：检测到loading，等待结束', '#1677ff');
        return;
      }

      // 已经看到过 loading，现在 loading 消失
      if (bgSawLoading && !loading) {
        bgLoadingGoneCount++;

        // 连续检测两次消失，认为页面缓冲结束
        if (bgLoadingGoneCount >= 2) {
          bgPending = false;

          setTimeout(function () {
            bgPressEnter('loading finished');
          }, 200);

          return;
        }
      }

      // 没看到 loading，超过等待时间：取消，不补 Enter
      if (!bgSawLoading && now - bgTriggerAt >= BG_WAIT_LOADING_MS) {
        bgPending = false;

        console.warn('[MES] 条码回车后台：未检测到loading，取消本次，不补Enter', {
          barcode: bgCode,
          waitMs: BG_WAIT_LOADING_MS
        });

        setStatus('条码回车：未检测到loading，已取消', '#fa8c16');
        return;
      }

      // 总超时保护：取消，不补 Enter
      if (now - bgTriggerAt >= BG_MAX_WAIT_MS) {
        bgPending = false;

        console.warn('[MES] 条码回车后台：等待loading结束超时，取消本次，不补Enter', {
          barcode: bgCode,
          waitMs: BG_MAX_WAIT_MS
        });

        setStatus('条码回车：等待loading超时，已取消', '#fa8c16');
        return;
      }

    } catch (err) {
      console.warn('[MES] 条码回车后台：检测异常', err);
    }
  }, 100);

  console.log('[MES] 条码回车独立后台服务已启动：只检测loading，未检测到不补Enter');
}







// ===== UI =====
function buildPanel() {
  if (document.getElementById('tm-main-panel')) return;

  var CFG_KEY = 'tm_auto_pass_cfg';
  var PANEL_STATE_KEY = 'tm_panel_state';
  var SN_LOCK_KEY = 'sn_code_check_lock_on';
  var SN_ROUTE_KEY = 'sn_code_auto_route_on';
  var SN_POPUP_KEY = 'sn_scan_popup_on';
  var AUTO_PASS_MODE_KEY = 'auto_pass_mode';

  var AUTO_PASS_MODE_BOM_ATE = 'bom_ate';
  var AUTO_PASS_MODE_BOM_ONLY = 'bom_only';

  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      return { enabled: !!c.enabled };
    } catch (e) {
      return { enabled: false };
    }
  }

  function loadPanelState() {
    try {
      return JSON.parse(localStorage.getItem(PANEL_STATE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function savePanelState(state) {
    var old = loadPanelState();
    var next = Object.assign({}, old, state);
    localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(next));
  }

  // ===== v3.2.3 精致浅色主题样式 =====
  if (!document.getElementById('tm-panel-style')) {
    var tmStyle = document.createElement('style');
    tmStyle.id = 'tm-panel-style';
    tmStyle.textContent = [
      '#tm-main-panel{position:fixed;right:16px;bottom:16px;z-index:999999;width:360px;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
      'font-size:12px;color:#1D2939;background:#fff;',
      'border:1px solid #E4E7EC;border-radius:12px;overflow:hidden;',
      'box-shadow:0 1px 2px rgba(9,88,217,.06),0 12px 32px -8px rgba(9,88,217,.20);',
      'animation:tm-in .18s ease-out;}',
      '#tm-main-panel::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;z-index:1;',
      'background:linear-gradient(90deg,#0958D9,#5558E3);pointer-events:none}',
      '@keyframes tm-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '#tm-main-panel #tm-head{display:flex;align-items:center;justify-content:space-between;gap:8px;',
      'padding:10px 16px 8px;border-bottom:1px solid #F2F4F7;cursor:move;',
      'background:linear-gradient(180deg,#F9FAFB,#fff);}',
      '#tm-main-panel .tm-title{display:inline-flex;align-items:center;gap:7px;',
      'font-size:13px;font-weight:700;color:#101828;letter-spacing:.2px}',
      '#tm-main-panel .tm-grip{width:8px;height:13px;flex:0 0 auto;opacity:.85;',
      'background-image:radial-gradient(circle,#98A2B3 1.2px,transparent 1.3px);',
      'background-size:4.5px 6.5px;}',
      '#tm-main-panel .tm-head-actions{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#475467;cursor:default}',
      '#tm-main-panel .tm-kv{display:flex;align-items:center;gap:5px;white-space:nowrap;cursor:pointer;user-select:none}',
      '#tm-main-panel #tm-keepalive-status{font-weight:600;font-size:11px}',
      '#tm-main-panel #tm-body{padding:10px 16px 12px}',
      '#tm-main-panel hr{border:none;border-top:1px solid #F2F4F7;margin:9px -16px}',
      '#tm-main-panel .tm-label{display:block;font-size:12px;font-weight:600;color:#101828;margin-bottom:5px}',
      '#tm-main-panel .tm-label-sm{margin-bottom:0}',
      '#tm-main-panel .tm-hint{font-weight:400;font-size:11px;color:#98A2B3}',
      '#tm-main-panel .tm-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px}',
      '#tm-main-panel .tm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}',
      '#tm-main-panel .tm-row-opts{margin-top:0;gap:6px}',
      '#tm-main-panel .tm-row-opts .tm-check{gap:4px}',
      '#tm-main-panel .tm-btn{font-family:inherit;font-size:12px;font-weight:600;line-height:1.4;',
      'color:#344054;background:#fff;border:1px solid #D0D5DD;border-radius:7px;padding:5px 12px;',
      'cursor:pointer;white-space:nowrap;',
      'transition:background .12s ease,border-color .12s ease,box-shadow .12s ease,transform .06s ease;}',
      '#tm-main-panel .tm-btn:hover{background:#F9FAFB;border-color:#98A2B3}',
      '#tm-main-panel .tm-btn:active{transform:translateY(1px);background:#F2F4F7}',
      '#tm-main-panel .tm-btn:focus-visible{outline:2px solid rgba(9,88,217,.45);outline-offset:1px}',
      '#tm-main-panel .tm-btn-primary{background:#0958D9;border-color:#0958D9;color:#fff;box-shadow:0 1px 2px rgba(9,88,217,.3)}',
      '#tm-main-panel .tm-btn-primary:hover{background:#0B4FBB;border-color:#0B4FBB}',
      '#tm-main-panel .tm-btn-primary:active{background:#0A47A8}',
      '#tm-main-panel .tm-btn-danger{background:#D92D20;border-color:#D92D20;color:#fff}',
      '#tm-main-panel .tm-btn-danger:hover{background:#B42318;border-color:#B42318}',
      '#tm-main-panel .tm-btn-danger:active{background:#912018}',
      '#tm-main-panel .tm-btn-ghost{background:transparent;border-color:transparent;color:#667085;padding:3px 8px}',
      '#tm-main-panel .tm-btn-ghost:hover{background:#F2F4F7;border-color:transparent;color:#101828}',
      '#tm-main-panel textarea,#tm-main-panel select{display:block;width:100%;box-sizing:border-box;',
      'font-family:ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace;',
      'font-size:11.5px;line-height:1.55;color:#1D2939;',
      'border:1px solid #D0D5DD;border-radius:8px;padding:8px 10px;background:#FCFCFD;',
      'transition:border-color .12s ease,box-shadow .12s ease,background .12s ease;}',
      '#tm-main-panel #tm-taskno{height:44px;min-height:36px;max-height:100px;resize:vertical;margin-bottom:2px}',
      '#tm-main-panel #tm-batch-input{height:84px;resize:vertical}',
      '#tm-main-panel select{padding:5px 8px;margin-top:6px}',
      '#tm-main-panel textarea:focus,#tm-main-panel select:focus{outline:none;border-color:#0958D9;background:#fff;box-shadow:0 0 0 3px rgba(9,88,217,.14)}',
      '#tm-main-panel textarea::placeholder{color:#98A2B3}',
      '#tm-main-panel #tm-workstep-list{height:64px;overflow-y:auto;box-sizing:border-box;',
      'font-family:inherit;font-size:11px;line-height:1.6;color:#475467;',
      'border:1px solid #EAECF0;border-radius:8px;background:#F9FAFB;padding:6px 10px;margin-top:6px;}',
      '#tm-main-panel ::-webkit-scrollbar{width:8px;height:8px}',
      '#tm-main-panel ::-webkit-scrollbar-thumb{background:#D0D5DD;border-radius:4px}',
      '#tm-main-panel ::-webkit-scrollbar-thumb:hover{background:#98A2B3}',
      '#tm-main-panel input[type=checkbox],#tm-main-panel input[type=radio]{',
      'accent-color:#0958D9;width:14px;height:14px;margin:0;cursor:pointer;vertical-align:-2px;}',
      '#tm-main-panel .tm-check{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;',
      'color:#344054;cursor:pointer;user-select:none;white-space:nowrap}',
      '#tm-main-panel .tm-status-line{font-size:11.5px;color:#667085;margin-top:5px}',
      '#tm-main-panel .tm-status-combo{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 6px}',
      '#tm-main-panel .tm-status-combo .tm-sep{color:#D0D5DD;user-select:none}',
      '#tm-main-panel .tm-status-combo span:not(.tm-sep){padding:2px 8px;border-radius:999px;font-size:11px;line-height:1.5;',
      'background:color-mix(in srgb,currentColor 8%,#fff)}',
      '#tm-main-panel .tm-footer{margin-top:8px;background:#F9FAFB;border:1px solid #F2F4F7;border-radius:9px;padding:7px 12px}',
      '#tm-main-panel .tm-progress{font-size:12px;font-weight:600;color:#344054;font-variant-numeric:tabular-nums}',
      '#tm-main-panel #tm-batch-progress{color:#0958D9;font-weight:700}',
      '#tm-main-panel #tm-batch-status{margin-top:3px;font-size:11.5px;color:#475465;min-height:16px}',
        '#tm-main-panel .tm-tabs-row{display:flex;justify-content:flex-end;margin-bottom:6px}',
        '#tm-main-panel #tm-hold-count{flex:0 0 auto;margin-right:6px;font-family:inherit;font-size:11px;font-weight:700;line-height:1.8;padding:0 9px;border-radius:999px;background:#F2F4F7;color:#98A2B3;white-space:nowrap}',
        '#tm-main-panel #tm-hold-count.on{background:linear-gradient(135deg,#0958D9,#4E59D6);color:#fff;box-shadow:0 1px 2px rgba(9,88,217,.35)}',
       '#tm-main-panel .tm-label-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px}',
       '#tm-main-panel .tm-label-row .tm-label{margin-bottom:0}',
       '#tm-main-panel #tm-tabs{display:inline-flex;gap:4px;flex:0 0 auto}',
       '#tm-main-panel #tm-tabs button{font-family:inherit;font-size:11px;font-weight:600;line-height:1.4;padding:2px 10px;border-radius:999px;',
       'border:1px solid #D0D5DD;background:#fff;color:#667085;cursor:pointer;white-space:nowrap;',
       'transition:background .12s ease,border-color .12s ease,color .12s ease,box-shadow .12s ease;}',
       '#tm-main-panel #tm-tabs button:hover{border-color:#98A2B3;background:#F9FAFB}',
       '#tm-main-panel #tm-tabs button.active{background:linear-gradient(135deg,#0958D9,#4E59D6);border-color:transparent;color:#fff;box-shadow:0 1px 2px rgba(9,88,217,.35)}',
       '#tm-main-panel #tm-hold-status{font-size:11.5px;color:#667085;background:#F9FAFB;border:1px solid #F2F4F7;border-radius:8px;padding:6px 10px;min-height:16px;line-height:16px}',
       '#tm-main-panel #tm-hold-list{height:118px;overflow-y:auto;box-sizing:border-box;border:1px solid #EAECF0;border-radius:8px;background:#F9FAFB;margin-top:6px}',
       '#tm-main-panel .tm-hold-row{display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid #EEF0F3}',
       '#tm-main-panel .tm-hold-row:last-child{border-bottom:none}',
       '#tm-main-panel .tm-hold-info{flex:1;min-width:0}',
       '#tm-main-panel .tm-hold-mod{font-family:ui-monospace,"SF Mono","Cascadia Mono",Consolas,monospace;font-weight:700;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
       '#tm-main-panel .tm-hold-sub{color:#98A2B3;font-size:10.5px}',
       '#tm-main-panel .tm-hold-empty{padding:12px;color:#98A2B3;font-size:11.5px;text-align:center}',
       '#tm-main-panel .tm-hold-btn{flex:0 0 auto;font-family:inherit;font-size:11px;font-weight:600;border-radius:6px;padding:2px 9px;cursor:pointer;',
       'border:1px solid #0958D9;color:#0958D9;background:#fff;transition:background .12s ease;}',
       '#tm-main-panel .tm-hold-btn:hover{background:#EFF4FF}',
        '#tm-main-panel .tm-hold-btn-del{border-color:#F0D9D6;color:#D92D20}',
        '#tm-main-panel .tm-hold-btn-del:hover{background:#FEF3F2}',
        '#tm-main-panel #tm-hold-list.tm-busy .tm-hold-btn{opacity:.45;pointer-events:none}',
        '#tm-main-panel #tm-hold-release-all:disabled{opacity:.45;cursor:default}',
       '#tm-fab{position:fixed;right:18px;bottom:18px;z-index:1000001;width:48px;height:48px;border-radius:50%;',
      'display:flex;align-items:center;justify-content:center;',
      'background:linear-gradient(135deg,#0B4FBB 0%,#0958D9 55%,#4E59D6 100%);color:#fff;',
      'font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
      'font-size:12px;font-weight:700;letter-spacing:.5px;cursor:grab;user-select:none;touch-action:none;',
      'box-shadow:0 4px 12px rgba(9,88,217,.38),0 1px 2px rgba(16,24,40,.18),inset 0 1px 0 rgba(255,255,255,.22);',
      'transition:transform .15s ease,box-shadow .15s ease;}',
      '#tm-fab::after{content:"";position:absolute;inset:-3px;border-radius:50%;pointer-events:none;',
      'border:2px solid rgba(9,88,217,.30);',
      'animation:tm-fab-pulse 2.6s ease-out infinite;}',
      '@keyframes tm-fab-pulse{0%{transform:scale(.92);opacity:.85}70%{transform:scale(1.3);opacity:0}100%{transform:scale(1.3);opacity:0}}',
      '#tm-fab:hover{transform:scale(1.08);box-shadow:0 6px 18px rgba(9,88,217,.45),inset 0 1px 0 rgba(255,255,255,.22)}',
      '#tm-fab:active{transform:scale(1.02);cursor:grabbing}',
      '#tm-fab.tm-dragging{transform:scale(1.05);cursor:grabbing;',
      'box-shadow:0 12px 28px rgba(9,88,217,.5),inset 0 1px 0 rgba(255,255,255,.22)}',
      '#tm-fab.tm-dragging::after{animation-play-state:paused;opacity:0}'
    ].join('');
    document.head.appendChild(tmStyle);
  }

  var box = document.createElement('div');
  box.id = 'tm-main-panel';

  box.innerHTML =
    '<div id="tm-head">' +
      '<span class="tm-title"><span class="tm-grip" aria-hidden="true"></span>82023703MES专用</span>' +
      '<div class="tm-head-actions">' +
        '<label class="tm-kv" title="保持w3登录态"><input id="tm-keepalive-on" type="checkbox"> 保持W3登入</label>' +
        '<span id="tm-keepalive-status">关</span>' +
        '<button id="tm-toggle" class="tm-btn tm-btn-ghost">最小化</button>' +
      '</div>' +
    '</div>' +
    '<div id="tm-body">' +
      '<div class="tm-tabs-row">' +
        '<span id="tm-hold-count" title="暂存区当前模块数量（预扫暂存·延后过站）">暂存 0</span>' +
        '<div id="tm-tabs" title="功能分页：过站=提取/批量队列；暂存=预扫暂存·延后过站"><button id="tm-tab-pass" type="button">过站</button><button id="tm-tab-hold" type="button">暂存</button></div>' +
      '</div>' +
      '<div id="tm-page-pass">' +
      '<div class="tm-section">' +
        '<label class="tm-label" for="tm-taskno">任务令 <span class="tm-hint">可粘贴排产文本，自动过滤</span></label>' +
        '<textarea id="tm-taskno" placeholder="可输入多个任务令，或粘贴排产文本"></textarea>' +
        '<div class="tm-row">' +
          '<button id="tm-paste-task" class="tm-btn">粘贴剪贴板</button>' +
          '<button id="tm-extract-api" class="tm-btn">接口提取</button>' +
          '<button id="tm-extract-run" class="tm-btn">提取条码</button>' +
        '</div>' +
      '</div>' +
      '<hr>' +
      '<div class="tm-section">' +
        '<label class="tm-label tm-label-sm" for="tm-batch-input">批量条码列表 <span class="tm-hint">每行一个，括号内为工序；点工序行"载入"只导入该组条码，"删除"整组移除</span></label>' +
        '<textarea id="tm-batch-input"></textarea>' +
        '<div id="tm-workstep-list" style="display:none;"></div>' +
        '<div class="tm-row">' +
          '<button id="tm-load" class="tm-btn">载入</button>' +
          '<button id="tm-start" class="tm-btn tm-btn-primary">开始</button>' +
          '<button id="tm-pause" class="tm-btn">暂停</button>' +
          '<button id="tm-reset" class="tm-btn">重置</button>' +
          '<label class="tm-check" title="扫码枪输入条码并触发真实Enter后，等待产品进站成功，再自动补一个Enter"><input id="tm-barcode-enter-on" type="checkbox"> 条码回车</label>' +
         '</div>' +
       '</div>' +
      '</div>' +
      '<div id="tm-page-hold" style="display:none">' +
        '<div class="tm-section">' +
          '<div id="tm-hold-status">暂存待命</div>' +
          '<div id="tm-hold-list"></div>' +
          '<div class="tm-row"><button id="tm-hold-release-all" class="tm-btn tm-btn-primary" style="flex:1" title="逐模块串行执行：模块条码回车重建 SN 网格 → 回填SN → 等 BOM 校验（+ATE）→ loading 圈消失后自动点过站；过站成功即移出暂存区">全部取出（逐模块自动过站）</button></div>' +
        '</div>' +
      '</div>' +
      '<hr>' +
      '<div class="tm-section">' +
        '<div class="tm-row tm-row-opts">' +
          '<label class="tm-check" title="编码不一致时锁定当前SN框"><input id="tm-sn-lock-on" type="checkbox"> SN拦截</label>' +
          '<label class="tm-check" title="SN扫错位置时自动转填到对应编码行"><input id="tm-sn-route-on" type="checkbox"> SN归位</label>' +
          '<label class="tm-check" title="勾选后扫码进独立小窗，回车自动查码转填入对应编码框；不勾选=直接在网格里扫"><input id="tm-sn-popup-on" type="checkbox"> SN弹窗</label>' +
          '<label class="tm-check" title="BOM子项校验通过后，还要ATE测试通过才过站"><input id="tm-pass-mode-bom-ate" name="tm-pass-mode" type="radio" value="bom_ate"> 校验+ATE</label>' +
          '<label class="tm-check" title="只要BOM子项校验通过就过站，不查ATE"><input id="tm-pass-mode-bom-only" name="tm-pass-mode" type="radio" value="bom_only"> 只校验</label>' +
          '<label class="tm-check" title="预扫暂存：开启后校验全过（校验+ATE 模式含 ATE）自动暂存+清空+回采集框，不点过站，并自动切到暂存页；到点取出再自动过站"><input id="tm-hold-mode-on" type="checkbox"> 暂存</label>' +
        '</div>' +
         '<div class="tm-status-line tm-status-combo">' +
           '<span id="tm-sn-status">SN：待命</span>' +
           '<span class="tm-sep">·</span>' +
           '<span id="tm-pass-mode-status">过站：待命</span>' +
           '<span class="tm-sep">·</span>' +
           '<span id="tm-autopass-status">自动：待命</span>' +
         '</div>' +
        '<div class="tm-footer">' +
          '<div class="tm-progress">进度 <span id="tm-batch-progress">0/0</span></div>' +
          '<div id="tm-batch-status">待命</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(box);

  // 折叠/展开 + 状态记忆
  var bodyWrap = box.querySelector('#tm-body');
  var toggleBtn = box.querySelector('#tm-toggle');
  var keepAliveOn = box.querySelector('#tm-keepalive-on');

  var st = loadPanelState();
  var collapsed = !!st.collapsed;

  // 悬浮球（样式见 tm-panel-style）
  var fab = document.createElement('div');
  fab.id = 'tm-fab';
  fab.textContent = 'qiu';
  fab.style.display = 'none';
  fab.title = '点击展开面板，按住可拖动';
  document.body.appendChild(fab);

  function applyCollapsed() {
    bodyWrap.style.display = collapsed ? 'none' : '';
    toggleBtn.textContent = collapsed ? '展开' : '最小化';
    box.style.width = collapsed ? '220px' : '360px';
  }
  applyCollapsed();
// 保持登入初始化
(function initKeepAliveSwitch() {
  var kc = loadKeepAliveCfg();

  keepAliveOn.checked = !!kc.enabled;

  var stEl = box.querySelector('#tm-keepalive-status');
  if (stEl) {
    stEl.textContent = keepAliveOn.checked ? '启动中' : '关';
    stEl.style.color = keepAliveOn.checked ? '#1677ff' : '#666';
  }

  keepAliveOn.addEventListener('change', function (e) {
    e.stopPropagation();

    var next = loadKeepAliveCfg();
    next.enabled = !!keepAliveOn.checked;
    if (!next.sec) next.sec = 90;

    saveKeepAliveCfg(next);
    restartKeepAlive();

    var el = box.querySelector('#tm-keepalive-status');
    if (el) {
      el.textContent = keepAliveOn.checked ? '启动中' : '关';
      el.style.color = keepAliveOn.checked ? '#1677ff' : '#666';
    }
  });

  restartKeepAlive();
})();
var keepAliveLabel = box.querySelector('label[title="保持w3登录态"]');
if (keepAliveLabel) {
  keepAliveLabel.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  }, true);
}
if (keepAliveOn) {
  keepAliveOn.addEventListener('mousedown', function (e) {
    e.stopPropagation();
  }, true);
}


  toggleBtn.onclick = function (e) {
    e.stopPropagation();
    collapsed = !collapsed;
    applyCollapsed();
    savePanelState({ collapsed: collapsed });

    if (collapsed) {
      box.style.display = 'none';
      fab.style.display = 'flex';
    } else {
      box.style.display = '';
      fab.style.display = 'none';
    }
  };

  fab.onclick = function () {
    box.style.display = '';
    fab.style.display = 'none';
    collapsed = false;
    applyCollapsed();
    savePanelState({ collapsed: false });
  };

  // 悬浮球拖动（v3.3.3）：位置记忆 + 点击/拖拽区分
  (function makeFabDrag() {
    var down = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    fab.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      down = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      var r = fab.getBoundingClientRect();
      ox = r.left; oy = r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 4) {
        moved = true;
        fab.classList.add('tm-dragging');
        document.body.style.userSelect = 'none';
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      }
      if (moved) {
        var nx = Math.max(0, Math.min(ox + dx, window.innerWidth - fab.offsetWidth));
        var ny = Math.max(0, Math.min(oy + dy, window.innerHeight - fab.offsetHeight));
        fab.style.left = nx + 'px';
        fab.style.top = ny + 'px';
      }
    });
    document.addEventListener('mouseup', function () {
      if (!down) return;
      down = false;
      document.body.style.userSelect = '';
      if (moved) {
        fab.classList.remove('tm-dragging');
        var r = fab.getBoundingClientRect();
        savePanelState({ fabLeft: r.left, fabTop: r.top });
      }
    });
    // 拖拽后吞掉随后的 click，避免误展开
    fab.addEventListener('click', function (e) {
      if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
  })();

  // 恢复悬浮球上次位置
  if (typeof st.fabLeft === 'number' && typeof st.fabTop === 'number') {
    fab.style.left = Math.max(0, Math.min(st.fabLeft, window.innerWidth - 48)) + 'px';
    fab.style.top = Math.max(0, Math.min(st.fabTop, window.innerHeight - 48)) + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }

  // 拖拽
  (function makeDrag(panel, head) {
    var down = false, sx = 0, sy = 0, ox = 0, oy = 0;
    head.addEventListener('mousedown', function (e) {
      down = true; sx = e.clientX; sy = e.clientY;
      var r = panel.getBoundingClientRect();
      ox = r.left; oy = r.top;
      panel.style.left = ox + 'px';
      panel.style.top = oy + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function (e) {
      if (!down) return;
      panel.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
      panel.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!down) return;
      down = false;
      document.body.style.userSelect = '';
      var r = panel.getBoundingClientRect();
      savePanelState({ left: r.left, top: r.top });
    });
  })(box, box.querySelector('#tm-head'));

  // 恢复上次位置
  if (typeof st.left === 'number' && typeof st.top === 'number') {
    box.style.left = Math.max(0, st.left) + 'px';
    box.style.top = Math.max(0, st.top) + 'px';
    box.style.right = 'auto';
    box.style.bottom = 'auto';
  }

  // 首次加载如果上次是折叠，直接显示悬浮球
  if (collapsed) {
    box.style.display = 'none';
    fab.style.display = 'flex';
  }

    var taskInput = box.querySelector('#tm-taskno');
    var ta = box.querySelector('#tm-batch-input');
    var barcodeEnterOn = box.querySelector('#tm-barcode-enter-on');
    var snLockOn = box.querySelector('#tm-sn-lock-on');
    var snRouteOn = box.querySelector('#tm-sn-route-on');
    var snPopupOn = box.querySelector('#tm-sn-popup-on');
    var passModeBomAte = box.querySelector('#tm-pass-mode-bom-ate');
    var passModeBomOnly = box.querySelector('#tm-pass-mode-bom-only');
    var holdModeOnEl = box.querySelector('#tm-hold-mode-on');

    // ===== v3.4.0 功能分页（过站/暂存）+ 暂存开关 =====
    var pagePass = box.querySelector('#tm-page-pass');
    var pageHold = box.querySelector('#tm-page-hold');
    var tabPassBtn = box.querySelector('#tm-tab-pass');
    var tabHoldBtn = box.querySelector('#tm-tab-hold');
    var holdTabActive = !!st.holdTab;

    function setHoldTab(on, silent) {
      holdTabActive = !!on;
      pagePass.style.display = holdTabActive ? 'none' : '';
      pageHold.style.display = holdTabActive ? '' : 'none';
      if (tabPassBtn) tabPassBtn.classList.toggle('active', !holdTabActive);
      if (tabHoldBtn) tabHoldBtn.classList.toggle('active', holdTabActive);
      if (!silent) savePanelState({ holdTab: holdTabActive });
    }
    if (tabPassBtn) tabPassBtn.addEventListener('click', function () { setHoldTab(false); });
    if (tabHoldBtn) tabHoldBtn.addEventListener('click', function () { setHoldTab(true); });

    if (holdModeOnEl) {
      holdModeOnEl.checked = localStorage.getItem(HOLD_MODE_KEY) === '1';
      holdModeOnEl.addEventListener('change', function () {
        localStorage.setItem(HOLD_MODE_KEY, holdModeOnEl.checked ? '1' : '0');
        setHoldTab(holdModeOnEl.checked);
        renderHoldList();
        console.log('[HOLD] 暂存开关:', holdModeOnEl.checked ? '开' : '关');
      });
    }
    // 初始：暂存开关开着→暂存页；否则→记忆的分页
    setHoldTab(holdModeOnEl && holdModeOnEl.checked ? true : holdTabActive, true);
    renderHoldList();
    setInterval(function () { try { renderHoldList(); sweepPassedHolds(); sweepManualPass(); } catch (e) {} }, 1500);

    if (box.querySelector('#tm-hold-release-all')) {
      box.querySelector('#tm-hold-release-all').addEventListener('click', function () { releaseAllHold(); });
    }
    if (box.querySelector('#tm-hold-list')) {
      box.querySelector('#tm-hold-list').addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('button.tm-hold-btn') : null;
        if (!b) return;
        var k = b.getAttribute('data-k');
        var act = b.getAttribute('data-act');
        if (!k) return;
        if (act === 'release') releaseHold(k);
        else if (act === 'del') deleteHoldEntry(k);
      });
    }




  function applySnCfgNow() {
    localStorage.setItem(SN_LOCK_KEY, snLockOn.checked ? '1' : '0');
    localStorage.setItem(SN_ROUTE_KEY, snRouteOn.checked ? '1' : '0');
    localStorage.setItem(SN_POPUP_KEY, snPopupOn.checked ? '1' : '0');

    var s = box.querySelector('#tm-sn-status');
    if (s) {
      s.textContent = 'SN：拦截' + (snLockOn.checked ? '开' : '关') + '/归位' + (snRouteOn.checked ? '开' : '关') + '/弹窗' + (snPopupOn.checked ? '开' : '关');
      s.style.color = (snLockOn.checked || snRouteOn.checked || snPopupOn.checked) ? '#389e0d' : '#666';
    }
  }
      function applyAutoPassModeNow() {
    var mode = passModeBomOnly.checked ? AUTO_PASS_MODE_BOM_ONLY : AUTO_PASS_MODE_BOM_ATE;

    localStorage.setItem(AUTO_PASS_MODE_KEY, mode);

    var s = box.querySelector('#tm-pass-mode-status');
    if (s) {
      if (mode === AUTO_PASS_MODE_BOM_ONLY) {
        s.textContent = '过站：只校验';
        s.style.color = '#fa8c16';
      } else {
        s.textContent = '过站：校验+ATE';
        s.style.color = '#389e0d';
      }
    }

    console.log('[MES] 自动过站模式:', mode);
  }

  function initAutoPassModeUi() {
    var mode = localStorage.getItem(AUTO_PASS_MODE_KEY) || AUTO_PASS_MODE_BOM_ATE;

    if (mode === AUTO_PASS_MODE_BOM_ONLY) {
      passModeBomOnly.checked = true;
      passModeBomAte.checked = false;
    } else {
      passModeBomAte.checked = true;
      passModeBomOnly.checked = false;
    }

    applyAutoPassModeNow();
  }



  snLockOn.addEventListener('change', applySnCfgNow);
  snRouteOn.addEventListener('change', applySnCfgNow);
  snPopupOn.addEventListener('change', applySnCfgNow);
  passModeBomAte.addEventListener('change', applyAutoPassModeNow);
  passModeBomOnly.addEventListener('change', applyAutoPassModeNow);
// 条码回车开关初始化
if (barcodeEnterOn) {
  barcodeEnterOn.checked = localStorage.getItem(BARCODE_ENTER_KEY) === '1';

  barcodeEnterOn.addEventListener('change', function () {
    localStorage.setItem(BARCODE_ENTER_KEY, barcodeEnterOn.checked ? '1' : '0');

    barcodeEnterPending = false;
    barcodeEnterSuccessCountBefore = 0;

    setStatus(
      '条码回车：' + (barcodeEnterOn.checked ? '开' : '关'),
      barcodeEnterOn.checked ? '#389e0d' : '#666'
    );

    if (barcodeEnterOn.checked) {
      bindBarcodeEnterInput();
    }
  });

  if (barcodeEnterOn.checked) {
    bindBarcodeEnterInput();
  }
}


  // 粘贴排产文本 → 自动过滤提取任务令，框内一行一个（保留框内已有任务令，去重合并）
  function applyTaskPaste(raw) {
    var parsed = parseTaskNos(raw);
    if (!parsed.length) {
      taskInput.value = raw;
      taskInput.dispatchEvent(new Event('input', { bubbles: true }));
      taskInput.dispatchEvent(new Event('change', { bubbles: true }));
      setStatus('已粘贴，但未识别到任务令', '#fa8c16');
      return;
    }
    var merged = parseTaskNos(taskInput.value).slice();
    for (var i = 0; i < parsed.length; i++) {
      if (merged.indexOf(parsed[i]) < 0) merged.push(parsed[i]);
    }
    taskInput.value = merged.join('\n');
    taskInput.dispatchEvent(new Event('input', { bubbles: true }));
    taskInput.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[TASK-NO] 识别到任务令:', parsed);
    setStatus('已粘贴，识别任务令 ' + parsed.length + ' 个，框内共 ' + merged.length + ' 个（一行一个）', '#389e0d');
  }

  taskInput.addEventListener('paste', function (e) {
    var raw = '';
    try { raw = (e.clipboardData || window.clipboardData).getData('text'); } catch (err) {}
    if (!raw || !parseTaskNos(raw).length) return; // 没解析出任务令就按普通粘贴处理
    e.preventDefault();
    applyTaskPaste(raw);
  });

  box.querySelector('#tm-paste-task').onclick = async function () {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setStatus('浏览器不支持直接读取剪贴板，请手动 Ctrl+V', '#fa8c16');
        try {
          taskInput.focus();
          taskInput.select();
        } catch (e) {}
        return;
      }

      var text = await navigator.clipboard.readText();

      if (!text) {
        setStatus('剪贴板为空', '#fa8c16');
        return;
      }

      applyTaskPaste(text);
    } catch (e) {
      console.error('[TASK-NO] 读取剪贴板失败:', e);
      setStatus('读取剪贴板失败，请手动 Ctrl+V', '#cf1322');

      try {
        taskInput.focus();
        taskInput.select();
      } catch (err) {}
    }
  };

  box.querySelector('#tm-extract-run').onclick = async function () {
    var taskNos = parseTaskNos(taskInput.value);
    if (!taskNos.length) return setStatus('未识别到任务令', '#cf1322');

    // 固定链接提取保持原逻辑，只取第一个任务令
    var taskNo = taskNos[0];

    if (taskNos.length > 1) {
      setStatus('固定提取只使用第一个任务令：' + taskNo + '，多个请用接口提取', '#fa8c16');
    }

    var jobId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    await GM_setValue(KEY_JOB, { jobId: jobId, taskNo: taskNo, ts: Date.now() });

    GM_openInTab(FIXED_UI_URL, { active: true, insert: true, setParent: true });
    setStatus('已打开固定提取页并发送任务：' + taskNo);
  };

      box.querySelector('#tm-extract-api').onclick = async function () {
    var taskNos = parseTaskNos(taskInput.value);

    if (!taskNos.length) {
      return setStatus('未识别到任务令', '#cf1322');
    }

    try {
      setStatus('识别到任务令 ' + taskNos.length + ' 个，接口批量提取中...', '#1677ff');

      var ret = await extractTaskCodesByApi(taskNos);
      var codes = ret.codes || [];

      if (!codes.length) {
        setStatus('接口未提取到条码：任务令' + taskNos.length + '个', '#fa8c16');
        console.log('[TASK-SN-API] 未提取到，任务令:', taskNos);
        console.log('[TASK-SN-API] 查询组合:', ret.hitInfo);
        return;
      }

      ta.value = codes.map(function (c) {
        return snCodeMap[c] ? c + '（' + snCodeMap[c] + '）' : c;
      }).join('\n');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));

      // 自动载入到批量队列（parseCodes 会自动去掉（工序）后缀）
      queue = parseCodes(ta.value);
      wsPool = queue.slice();
      idx = 0;
      running = false;
      waiting = false;
      currentCode = '';

      setProgress();
      updateWorkstepFilter();

      setStatus(
        '接口提取成功：任务令' + ret.taskCount +
        '个，条码' + queue.length +
        '条，已自动载入',
        '#389e0d'
      );

      console.log('[TASK-SN-API] 任务令:', ret.taskNos);
      console.log('[TASK-SN-API] 查询组合:', ret.hitInfo);
      console.log('[TASK-SN-API] SN数量:', queue.length);

    } catch (e) {
      console.error('[TASK-SN-API] 接口提取失败:', e);
      setStatus('接口提取失败：' + (e && e.message ? e.message : String(e)), '#cf1322');
    }
  };




  var wsListEl = document.getElementById('tm-workstep-list');
  if (wsListEl) {
    wsListEl.addEventListener('click', function (e) {
      var a = e.target;
      while (a && a !== wsListEl && !/tm-ws-(load|del)/.test(String(a.className || ''))) a = a.parentNode;
      if (!a || a === wsListEl) return;
      var arr = wsListEl._stepArr || [];
      var ws = arr[parseInt(a.getAttribute('data-i'), 10)];
      if (!ws) return;
      if (String(a.className).indexOf('tm-ws-del') >= 0) deleteByWorkstep(ws);
      else loadByWorkstep(ws);
    });
  }

  box.querySelector('#tm-load').onclick = function () {
    queue = parseCodes(ta.value);
    wsPool = queue.slice();
    idx = 0; running = false; waiting = false; currentCode = '';
    setBulkPassing(false);
    setProgress();
    updateWorkstepFilter();
    setStatus('已载入 ' + queue.length + ' 条');
  };

  box.querySelector('#tm-start').onclick = function () {
    if (!queue.length) return setStatus('请先载入条码', '#cf1322');
    if (idx >= queue.length) { idx = 0; currentCode = ''; setProgress(); }
    completionWaitStart = 0; completionSettleStart = 0; // v3.4.12：清掉暂停打断的残留计时
    running = true;
    setBulkPassing(true);
    setStatus('开始执行...', '#1677ff');
  };

  box.querySelector('#tm-pause').onclick = function () {
    running = false; waiting = false;
    setBulkPassing(false);
    setStatus('已暂停', '#fa8c16');
  };

  box.querySelector('#tm-reset').onclick = function () {
    running = false; waiting = false; idx = 0; currentCode = '';
    setBulkPassing(false);
    setProgress();
    setStatus('已重置');
  };

  if (typeof GM_addValueChangeListener === 'function') {
    GM_addValueChangeListener(KEY_RESULT, function (_k, _o, r) {
      if (!r) return;
      if (!r.ok) return setStatus('提取失败：' + (r.err || '未知错误'), '#cf1322');

      ta.value = (r.codes || []).join('\n');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));

      // 自动载入
      queue = parseCodes(ta.value);
      wsPool = queue.slice();
      idx = 0; running = false; waiting = false; currentCode = '';
      setBulkPassing(false);
      setProgress();
      updateWorkstepFilter();

      setStatus('提取成功：' + queue.length + ' 条，已自动载入', '#1677ff');
    });
  }

  // SN 开关初始化
  snLockOn.checked = localStorage.getItem(SN_LOCK_KEY) === '1';
  snRouteOn.checked = localStorage.getItem(SN_ROUTE_KEY) !== '0';
  snPopupOn.checked = localStorage.getItem(SN_POPUP_KEY) === '1';
  applySnCfgNow();

  // 自动过站模式初始化
  initAutoPassModeUi();

  setInterval(function () { tick(); }, tickMs);
  setBulkPassing(false); // 清掉上次残留的批量标记
  startAutoPass();

// 条码回车检测已移动到独立后台服务 startBarcodeEnterBackgroundService()
// 不要在这里重复启动，避免重复执行


}



function boot() {
  buildPanel();

  startBarcodeEnterBackgroundService();

  bgWorker();
}




if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
})();
