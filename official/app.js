/* 智多星官网交互：浮窗智能体咨询 + 浏览器本地留资 + 登录态导航。
   服务端只代理 OpenHex 对话，账户、留资和 conversationId 均保存在当前浏览器。 */
(function () {
  'use strict';

  var API = '/api/official';

  /* ---------- 登录态导航 ---------- */
  var navAccount = document.getElementById('navAccount');
  if (navAccount && localStorage.getItem('zdx_token')) {
    navAccount.textContent = '个人中心';
  }

  /* ---------- 浮窗开关 ---------- */
  var floatBtn = document.getElementById('floatBtn');
  var floatPanel = document.getElementById('floatPanel');
  var floatClose = document.getElementById('floatClose');

  function setPanel(open) {
    floatPanel.hidden = !open;
    floatBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      var input = document.getElementById('chatText');
      if (input) input.focus();
    }
  }
  floatBtn.addEventListener('click', function () { setPanel(floatPanel.hidden); });
  floatClose.addEventListener('click', function () { setPanel(false); });
  var heroChat = document.getElementById('heroChat');
  if (heroChat) heroChat.addEventListener('click', function () { setPanel(true); });
  var routesChat = document.getElementById('routesChat');
  if (routesChat) routesChat.addEventListener('click', function (ev) { ev.preventDefault(); setPanel(true); });

  /* ---------- 智能体咨询 ---------- */
  var chatLog = document.getElementById('chatLog');
  var chatForm = document.getElementById('chatForm');
  var chatText = document.getElementById('chatText');

  function addMsg(kind, text) {
    var wrap = document.createElement('div');
    wrap.className = 'msg msg-' + kind;
    var p = document.createElement('p');
    p.textContent = text;
    wrap.appendChild(p);
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
    return wrap;
  }

  chatForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var message = chatText.value.trim();
    if (!message) return;
    addMsg('user', message);
    chatText.value = '';

    var pending = addMsg('ai', '正在思考…');
    fetch(API + '?action=chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        conversationId: localStorage.getItem('zdx_official_conversation') || '',
      }),
    })
      .then(function (res) {
        var status = res.status;
        return res.json().then(
          function (data) { return { ok: res.ok, status: status, data: data }; },
          function () { return { ok: res.ok, status: status, data: null }; }
        );
      })
      .then(function (result) {
        pending.remove();
        if (result.ok && result.data && result.data.reply) {
          if (result.data.conversationId) {
            localStorage.setItem('zdx_official_conversation', result.data.conversationId);
          }
          addMsg('ai', result.data.reply);
          return;
        }
        addMsg('sys', '咨询失败（' + ((result.data && result.data.error) || ('HTTP ' + result.status)) + '）。请稍后重试或留资由人工回复。');
      })
      .catch(function () {
        pending.remove();
        addMsg('sys', '网络层异常：请求没到达服务器（请按 Ctrl+Shift+R 强制刷新或换无痕窗口重试）。');
      });
  });

  /* ---------- 留资表单 ---------- */
  var leadForm = document.getElementById('leadForm');
  var leadMsg = document.getElementById('leadMsg');
  var contactType = document.getElementById('fContactType');
  var contactInput = document.getElementById('fContact');

  // 切换联系方式类型时，同步提示与输入法。
  function syncContactField() {
    var isPhone = contactType.value !== 'email';
    contactInput.placeholder = isPhone ? '11 位手机号，以 1 开头' : '例如 name@example.com';
    contactInput.inputMode = isPhone ? 'numeric' : 'email';
    contactInput.autocomplete = isPhone ? 'tel' : 'email';
  }
  syncContactField();
  contactType.addEventListener('change', syncContactField);

  // 返回空串表示通过校验，否则返回给用户看的中文提示。
  function contactError(type, value) {
    if (!value) return '联系方式为必填项，请填写后再提交。';
    if (/\s/.test(value)) return '联系方式里不能有空格。';
    if (type === 'email') {
      if (value.indexOf('@') < 0) return '邮箱格式不对：需要包含 @，例如 name@example.com。';
      if (value.indexOf('@') !== value.lastIndexOf('@')) return '邮箱格式不对：只能有一个 @。';
      var halves = value.split('@');
      if (!halves[0] || !halves[1]) return '邮箱格式不对：@ 前后都要有内容。';
      return '';
    }
    if (!/^[0-9]+$/.test(value)) return '手机号只能是数字，不要加空格或横线。';
    if (value.charAt(0) !== '1') return '手机号需要以 1 开头。';
    if (value.length !== 11) return '手机号需要 11 位数字，当前是 ' + value.length + ' 位。';
    return '';
  }

  contactInput.addEventListener('input', function () {
    if (leadMsg.className.indexOf('err') >= 0) { leadMsg.className = 'form-msg'; leadMsg.textContent = ''; }
  });

  leadForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var type = contactType.value === 'email' ? 'email' : 'phone';
    var payload = {
      name: document.getElementById('fName').value.trim(),
      contact: contactInput.value.trim(),
      contactType: type,
      audience: document.getElementById('fAudience').value,
      goal: document.getElementById('fGoal').value.trim(),
    };
    var problem = contactError(type, payload.contact);
    if (problem) {
      leadMsg.className = 'form-msg err';
      leadMsg.textContent = problem;
      contactInput.focus();
      return;
    }
    try {
      var leads = JSON.parse(localStorage.getItem('zdx_leads') || '[]');
      if (!Array.isArray(leads)) leads = [];
      leads.push(Object.assign({ createdAt: new Date().toISOString() }, payload));
      localStorage.setItem('zdx_leads', JSON.stringify(leads.slice(-20)));
      localStorage.setItem('zdx_profile', JSON.stringify({
        name: payload.name || '体验会员',
        phone: payload.contact,
        member: '本地体验会员',
      }));
      localStorage.setItem('zdx_token', 'local-browser-session');
      leadMsg.className = 'form-msg ok';
      leadMsg.textContent = '已保存到当前浏览器，正在进入个人中心…';
      setTimeout(function () { location.href = '/account.html?from=lead'; }, 800);
    } catch {
      leadMsg.className = 'form-msg err';
      leadMsg.textContent = '浏览器阻止了本地存储，请允许本站保存数据后重试。';
    }
  });
})();
