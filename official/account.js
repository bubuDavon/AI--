/* 个人中心：账户和登录态仅保存在当前浏览器，不发送到服务端。 */
(function () {
  'use strict';

  var LEARN_URL = '/learning/';
  var ACCOUNT_KEY = 'zdx_local_account';
  var PROFILE_KEY = 'zdx_profile';
  var TOKEN_KEY = 'zdx_token';

  var authCard = document.getElementById('authCard');
  var profileCard = document.getElementById('profileCard');
  var switchAuth = document.getElementById('switchAuth');
  var authForm = document.getElementById('authForm');
  var authSubmit = document.getElementById('authSubmit');
  var authMsg = document.getElementById('authMsg');
  var leadBanner = document.getElementById('leadBanner');
  var mode = 'login';
  var fromLead = new URLSearchParams(location.search).get('from') === 'lead';

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }

  async function hashPassword(value) {
    var bytes = new TextEncoder().encode(value);
    var digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(function (item) {
      return item.toString(16).padStart(2, '0');
    }).join('');
  }

  function setMode(next) {
    mode = next;
    var isLogin = mode === 'login';
    authSubmit.textContent = isLogin ? '登录' : '注册并登录';
    switchAuth.textContent = isLogin ? '没有账号？立即注册' : '已有账号？返回登录';
    authMsg.textContent = '';
  }

  function showProfile(profile) {
    authCard.hidden = true;
    profileCard.hidden = false;
    document.getElementById('pName').textContent = profile.name || '-';
    document.getElementById('pPhone').textContent = profile.phone || '-';
    document.getElementById('pMember').textContent = profile.member || '本地会员';
    document.getElementById('learnJump').href = LEARN_URL;
    if (fromLead) {
      leadBanner.hidden = false;
      leadBanner.textContent = '留资成功 · 资料与登录状态已保存在当前浏览器。';
    }
  }

  function showAuth(message) {
    profileCard.hidden = true;
    authCard.hidden = false;
    if (message) {
      authMsg.className = 'form-msg err';
      authMsg.textContent = message;
    }
  }

  switchAuth.addEventListener('click', function () {
    setMode(mode === 'login' ? 'register' : 'login');
  });

  authForm.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var phone = document.getElementById('aPhone').value.trim();
    var password = document.getElementById('aPass').value;
    var demo = phone === '8888' && password === '8888';
    if (!demo && !/^1[3-9][0-9]{9}$/.test(phone)) {
      showAuth('请输入正确的 11 位手机号，或使用演示号 8888。');
      return;
    }
    if (!demo && (password.length < 8 || password.length > 72)) {
      showAuth('密码需要 8–72 位。');
      return;
    }

    authMsg.className = 'form-msg';
    authMsg.textContent = '处理中…';
    try {
      var passwordHash = await hashPassword(password);
      var account = readJson(ACCOUNT_KEY);
      var profile;

      if (mode === 'register') {
        if (account && account.phone === phone) {
          showAuth('该手机号已在当前浏览器注册，请直接登录。');
          return;
        }
        profile = { name: demo ? '演示会员' : '学员' + phone.slice(-4), phone: phone, member: '本地会员' };
        localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ phone: phone, passwordHash: passwordHash, profile: profile }));
      } else if (demo) {
        profile = { name: '演示会员', phone: '8888', member: '本地演示会员' };
      } else if (!account || account.phone !== phone) {
        showAuth('当前浏览器没有这个账号，请先注册。');
        return;
      } else if (account.passwordHash !== passwordHash) {
        showAuth('密码不正确，请重新输入。');
        return;
      } else {
        profile = account.profile;
      }

      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      localStorage.setItem(TOKEN_KEY, 'local-browser-session');
      authMsg.textContent = '';
      showProfile(profile);
    } catch {
      showAuth('浏览器阻止了本地存储，请允许本站保存数据后重试。');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    setMode('login');
    showAuth();
  });

  var storedProfile = readJson(PROFILE_KEY);
  if (localStorage.getItem(TOKEN_KEY) && storedProfile) showProfile(storedProfile);
  else showAuth();
})();
