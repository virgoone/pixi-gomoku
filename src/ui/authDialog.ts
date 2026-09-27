import { getProfile } from '../app/storage';
import { account, ApiError, type PublicUser } from '../net/account';

/**
 * Email sign-in and rename dialogs. These are HTML overlays rather than Pixi
 * so phones get real keyboards, email autofill and one-time-code autofill,
 * styled to match the game's chunky look.
 */

const STYLE_ID = 'gomoku-dialog-style';
const CSS = `
.gd-overlay{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:rgba(11,4,24,.72);animation:gd-fade .18s ease-out}
.gd-panel{position:relative;width:min(380px,100%);box-sizing:border-box;padding:26px 22px 22px;border-radius:28px;background:linear-gradient(#3d2a6b,#241646);border:4px solid #2a1638;box-shadow:0 8px 0 #0d0620,inset 0 0 0 3px rgba(255,255,255,.1);color:#fff;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;animation:gd-pop .32s cubic-bezier(.2,1.6,.4,1)}
.gd-title{margin:0 0 6px;text-align:center;font:28px "ZCOOL KuaiLe","PingFang SC",sans-serif;color:#ffd84a;text-shadow:0 3px 0 #2a1638,2px 0 0 #2a1638,-2px 0 0 #2a1638,0 -2px 0 #2a1638,0 2px 0 #2a1638}
.gd-sub{margin:0 0 18px;text-align:center;font-size:14px;color:#d9ccff;line-height:1.5}
.gd-label{display:block;margin:0 0 6px 4px;font-size:13px;font-weight:700;color:#c9bde8}
.gd-input{width:100%;box-sizing:border-box;margin:0 0 14px;padding:12px 14px;border-radius:14px;border:3px solid #2a1638;background:#fff;color:#2a1638;font-size:17px;font-weight:600;outline:none}
.gd-input:focus{box-shadow:0 0 0 3px #ffd84a}
.gd-code{text-align:center;font-size:28px;letter-spacing:10px;font-family:"Lilita One","ZCOOL KuaiLe",sans-serif}
.gd-btn{display:block;width:100%;margin:6px 0 0;padding:12px 16px 16px;border:4px solid #2a1638;border-radius:22px;background:linear-gradient(#ffe96e,#ffb320);box-shadow:inset 0 -8px 0 #ec8a0c,0 6px 0 #2a1638;color:#fff;font:22px "ZCOOL KuaiLe","PingFang SC",sans-serif;text-shadow:0 2px 0 #2a1638,2px 0 0 #2a1638,-2px 0 0 #2a1638,0 -2px 0 #2a1638,0 2px 0 #2a1638;cursor:pointer;transition:transform .08s}
.gd-btn:active{transform:translateY(3px);box-shadow:inset 0 -6px 0 #ec8a0c,0 3px 0 #2a1638}
.gd-btn[disabled]{opacity:.55;cursor:default}
.gd-row{display:flex;justify-content:space-between;margin-top:12px;font-size:13px}
.gd-link{border:0;background:none;color:#ffd84a;font-size:13px;font-weight:700;cursor:pointer;padding:4px}
.gd-link[disabled]{color:#8f84b0;cursor:default}
.gd-error{min-height:18px;margin:-6px 0 8px 4px;font-size:13px;font-weight:600;color:#ff9a8a}
.gd-hint{margin:0 0 12px;padding:8px 10px;border-radius:10px;background:rgba(255,216,74,.14);color:#ffe98a;font-size:12px;text-align:center}
.gd-close{position:absolute;top:-14px;right:-14px;width:44px;height:44px;border-radius:50%;border:4px solid #2a1638;background:linear-gradient(#ffa090,#f24d40);box-shadow:0 4px 0 #2a1638;color:#fff;font-size:20px;font-weight:900;cursor:pointer;line-height:1}
@keyframes gd-fade{from{opacity:0}}
@keyframes gd-pop{from{transform:scale(.8);opacity:0}}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A modal shell; resolves `close(value)` once. */
function shell<T>(title: string, subtitle: string) {
  ensureStyle();
  const overlay = el('div', 'gd-overlay');
  const panel = el('div', 'gd-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  const closeButton = el('button', 'gd-close', '✕');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '关闭');
  const body = el('div');
  panel.append(closeButton, el('h2', 'gd-title', title), el('p', 'gd-sub', subtitle), body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let settle: (value: T | null) => void = () => undefined;
  const done = new Promise<T | null>((resolve) => {
    settle = resolve;
  });
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close(null);
  };
  function close(value: T | null) {
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
    settle(value);
  }
  closeButton.onclick = () => close(null);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close(null);
  });
  window.addEventListener('keydown', onKey, true);
  return { body, close, done, subtitle: panel.querySelector('.gd-sub') as HTMLElement };
}

const message = (error: unknown) => (error instanceof ApiError ? error.message : '出错了，请稍后再试');

/** Email → 6-digit code → signed in. Resolves with the user, or null if dismissed. */
export function openSignIn(reason = '登录后成绩会进入排行榜，别人也能看到你的昵称。'): Promise<PublicUser | null> {
  const ui = shell<PublicUser>('登录上榜', reason);
  let email = '';
  let name = '';
  let cooldown = 0;
  let cooldownTimer: number | null = null;

  const stopCooldown = () => {
    if (cooldownTimer !== null) window.clearInterval(cooldownTimer);
    cooldownTimer = null;
  };
  void ui.done.then(stopCooldown);

  function emailStep(error = '') {
    ui.body.replaceChildren();
    ui.subtitle.textContent = reason;
    const form = el('form');
    const emailLabel = el('label', 'gd-label', '邮箱');
    const emailInput = el('input', 'gd-input');
    Object.assign(emailInput, { type: 'email', name: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true, value: email });
    emailInput.id = emailLabel.htmlFor = 'gd-email';
    const nameLabel = el('label', 'gd-label', '上榜昵称（首次登录时使用）');
    const nameInput = el('input', 'gd-input');
    Object.assign(nameInput, { type: 'text', name: 'nickname', autocomplete: 'nickname', maxLength: 12, value: name || getProfile().nickname });
    nameInput.id = nameLabel.htmlFor = 'gd-name';
    const errorLine = el('div', 'gd-error', error);
    const submit = el('button', 'gd-btn', '发送验证码');
    submit.type = 'submit';
    form.append(emailLabel, emailInput, nameLabel, nameInput, errorLine, submit);
    form.onsubmit = async (event) => {
      event.preventDefault();
      email = emailInput.value.trim();
      name = nameInput.value.trim();
      submit.disabled = true;
      submit.textContent = '发送中…';
      try {
        const sent = await account.requestCode(email);
        startCooldown();
        codeStep('', sent.devCode);
      } catch (err) {
        submit.disabled = false;
        submit.textContent = '发送验证码';
        errorLine.textContent = message(err);
      }
    };
    ui.body.appendChild(form);
    window.setTimeout(() => (email ? nameInput : emailInput).focus(), 50);
  }

  function startCooldown() {
    cooldown = 60;
    stopCooldown();
    cooldownTimer = window.setInterval(() => {
      cooldown -= 1;
      const resend = ui.body.querySelector<HTMLButtonElement>('[data-resend]');
      if (resend) {
        resend.disabled = cooldown > 0;
        resend.textContent = cooldown > 0 ? `重新发送（${cooldown}s）` : '重新发送';
      }
      if (cooldown <= 0) stopCooldown();
    }, 1000);
  }

  function codeStep(error = '', devCode?: string) {
    ui.body.replaceChildren();
    ui.subtitle.textContent = `验证码已发送到 ${email}，10 分钟内有效。`;
    const form = el('form');
    if (devCode) form.appendChild(el('div', 'gd-hint', `本地开发未配置邮件，验证码：${devCode}`));
    const codeInput = el('input', 'gd-input gd-code');
    Object.assign(codeInput, { type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6, pattern: '\\d{6}', placeholder: '······', required: true });
    codeInput.setAttribute('aria-label', '6 位验证码');
    const errorLine = el('div', 'gd-error', error);
    const submit = el('button', 'gd-btn', '登录');
    submit.type = 'submit';
    const row = el('div', 'gd-row');
    const back = el('button', 'gd-link', '换个邮箱');
    back.type = 'button';
    back.onclick = () => emailStep();
    const resend = el('button', 'gd-link', cooldown > 0 ? `重新发送（${cooldown}s）` : '重新发送');
    resend.type = 'button';
    resend.dataset.resend = '1';
    resend.disabled = cooldown > 0;
    resend.onclick = async () => {
      resend.disabled = true;
      try {
        const sent = await account.requestCode(email);
        startCooldown();
        codeStep('', sent.devCode);
      } catch (err) {
        errorLine.textContent = message(err);
        resend.disabled = false;
      }
    };
    row.append(back, resend);
    form.append(codeInput, errorLine, submit, row);
    codeInput.oninput = () => {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
      if (codeInput.value.length === 6) form.requestSubmit();
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      submit.textContent = '登录中…';
      try {
        const user = await account.verify(email, codeInput.value, name);
        ui.close(user);
      } catch (err) {
        submit.disabled = false;
        submit.textContent = '登录';
        errorLine.textContent = message(err);
        codeInput.select();
      }
    };
    ui.body.appendChild(form);
    window.setTimeout(() => codeInput.focus(), 50);
  }

  emailStep();
  return ui.done;
}

/** Change the name shown on the leaderboard. */
export function openRename(current: string): Promise<PublicUser | null> {
  const ui = shell<PublicUser>('修改昵称', '排行榜上显示的名字，1–12 个字。');
  const form = el('form');
  const input = el('input', 'gd-input');
  Object.assign(input, { type: 'text', maxLength: 12, value: current, required: true });
  input.setAttribute('aria-label', '昵称');
  const errorLine = el('div', 'gd-error');
  const submit = el('button', 'gd-btn', '保存');
  submit.type = 'submit';
  form.append(input, errorLine, submit);
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      ui.close(await account.rename(input.value.trim()));
    } catch (err) {
      submit.disabled = false;
      errorLine.textContent = message(err);
    }
  };
  ui.body.appendChild(form);
  window.setTimeout(() => input.select(), 50);
  return ui.done;
}
