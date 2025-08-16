const SVC = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

const ui = {
    connect: document.getElementById('connect'),
    fsStats: document.getElementById('fsStats'),

    text: document.getElementById('text'),
    send: document.getElementById('send'),
    sendReplace: document.getElementById('sendReplace'),
    sendEnter: document.getElementById('sendEnter'),

    grid: document.getElementById('grid'),
    editor: document.getElementById('editor'),
    form: document.getElementById('editorForm'),
    mId: document.getElementById('mId'),
    mTitle: document.getElementById('mTitle'),
    mIconSelect: document.getElementById('mIconSelect'),
    iconPreview: document.getElementById('iconPreview'),
    mScript: document.getElementById('mScript'),
    newMacro: document.getElementById('newMacro'),
    refresh: document.getElementById('refresh'),

    startupSelect: document.getElementById('startupSelect'),
    startupScript: document.getElementById('startupScript'),
    saveStartupId: document.getElementById('saveStartupId'),
    saveStartupScript: document.getElementById('saveStartupScript'),

    dock: document.getElementById('dock'),
    cancel: document.getElementById('cancel'),
    toast: document.getElementById('toast'),
};

/* ---------- Icons (names only) ---------- */
const ICONS = [
    'bolt',
    'gear',
    'play',
    'keyboard',
    'arrow-right',
    'message',
    'gamepad',
    'rocket',
    'wand-magic-sparkles',
    'terminal',
    'robot',
    'globe',
    'bell',
    'camera',
    'clock',
    'code',
    'copy',
    'download',
    'upload',
    'trash',
    'pen',
    'paper-plane',
    'arrows-rotate',
];
function composeIconClass(name) {
    return `fa-solid fa-${name || 'bolt'}`;
}
function normalizeIconName(raw) {
    if (!raw) return 'bolt';
    let s = ('' + raw).trim();
    if (s.startsWith('fa-'))
        s =
            s
                .split(/\s+/)
                .find((t) => t.startsWith('fa-') && t.length > 3)
                ?.slice(3) || s.slice(3);
    return s.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'bolt';
}
function populateIconSelect(sel) {
    sel.innerHTML = '';
    for (const n of ICONS) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        sel.appendChild(opt);
    }
}
// replace your runMacro with this version
async function runMacro(cardEl, iconEl, script) {
  if (cardEl?.classList.contains('is-sending')) return; // ← guard

  cardEl.classList.add('is-sending');
  iconEl?.classList.add('spin');

  const minSpin = delay(1000);
  let err = null;
  try {
      await writeLong(script);
  } catch (e) {
      err = e;
  }
  await minSpin;

  iconEl?.classList.remove('spin');
  cardEl.classList.remove('is-sending');
  if (err) showToast(err?.message || String(err), 'error', true);
}

/* ---------- Toast (auto-dismiss 10s) ---------- */
const LOG_KEY = 'typist:lastErr';
const REMEMBER_KEY = 'typist:deviceId';
function showToast(msg, kind = 'info', persist = false) {
    const wrap = document.createElement('div');
    wrap.className = 'toast' + (kind === 'error' ? ' err' : '');
    const text = document.createElement('div');
    text.className = 'msg';
    text.textContent = msg;
    const act = document.createElement('div');
    act.className = 'actions';
    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    copy.onclick = () => navigator.clipboard?.writeText(msg).catch(() => {});
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.onclick = () => wrap.remove();
    act.append(copy, close);
    wrap.append(text, act);
    ui.toast?.appendChild(wrap);
    if (persist)
        try {
            localStorage.setItem(LOG_KEY, msg);
        } catch {}
    setTimeout(() => wrap.remove(), 10000);
}
(function restoreToast() {
    try {
        const last = localStorage.getItem(LOG_KEY);
        if (!last) return;
        if (/requestDevice\(\)\s*chooser/i.test(last)) {
            localStorage.removeItem(LOG_KEY);
            return;
        }
        showToast('Recovered:\n' + last, 'error');
    } catch {}
})();

/* ---------- UI helpers ---------- */
function setUiEnabled(r) {
    // Never disable New/Refresh; keep them interactive offline.
    [ui.send, ui.sendReplace, ui.saveStartupId, ui.saveStartupScript].forEach((el) => el && (el.disabled = !r));
    // Force these two to be enabled
    if (ui.newMacro) ui.newMacro.disabled = false;
    if (ui.refresh) ui.refresh.disabled = false;
}
function updateFsStats(fs) {
    const kb = (n) => Math.round((n || 0) / 1024);
    if (fs && typeof fs.total === 'number' && typeof fs.used === 'number') {
        const type = fs.type ? ` (${fs.type})` : '';
        ui.fsStats.textContent = `${kb(fs.used)}/${kb(fs.total)} KB${type}`;
    } else {
        ui.fsStats.textContent = '—/— KB';
    }
}
function updateConnectUi() {
    const connected = !!device?.gatt?.connected;
    ui.connect.textContent = connected ? 'Disconnect' : 'Connect';
}

/* Startup active border */
function updateStartupActiveUI(obj) {
    const usedId = Number.isInteger(obj?.startupId) ? obj.startupId : 0;
    const script = typeof obj?.startupScript === 'string' ? obj.startupScript : ui.startupScript?.value || '';
    if (ui.startupSelect)
        ui.startupSelect.classList.toggle('is-active', usedId > 0 && (!script || script.trim() === ''));
    if (ui.startupScript) ui.startupScript.classList.toggle('is-active', !!script && script.trim() !== '');
}

/* ---------- Pinned composer spacing ---------- */
function updateDockPadding() {
    const h = ui.dock?.offsetHeight || 168;
    document.documentElement.style.setProperty('--dock-h', `${h}px`);
}

/* ---------- BLE session ---------- */
let device = null,
    server = null,
    svc = null,
    rx = null,
    tx = null;
let reconnectTimer = null,
    reconnectDelay = 800,
    connecting = false;

const enc = new TextEncoder();
const dec = new TextDecoder();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let writeChain = Promise.resolve();

/* ---------- Clean disconnect helper ---------- */
async function disconnectGattClean({ forget = false, dropAllGranted = false } = {}) {
    try {
        tx?.removeEventListener('characteristicvaluechanged', onNotify);
    } catch {}
    try {
        await tx?.stopNotifications?.();
    } catch {}
    try {
        if (device?.gatt?.connected) device.gatt.disconnect();
    } catch {}
    rx = tx = svc = server = null;
    if (forget) {
        try {
            device?.removeEventListener('gattserverdisconnected', onDisconnect);
        } catch {}
        device = null;
        try {
            localStorage.removeItem(REMEMBER_KEY);
        } catch {}
    }
    if (dropAllGranted && 'bluetooth' in navigator && typeof navigator.bluetooth.getDevices === 'function') {
        try {
            const list = await navigator.bluetooth.getDevices();
            for (const d of list)
                if (/typist/i.test(d?.name || ''))
                    try {
                        if (d?.gatt?.connected) d.gatt.disconnect();
                    } catch {}
        } catch {}
    }
    await delay(150);
    setUiEnabled(false);
    updateConnectUi();
}

/* ---------- Write queue ---------- */
async function writeChunk(chrc, bytes) {
    if (typeof chrc.writeValueWithoutResponse === 'function') {
        try {
            await chrc.writeValueWithoutResponse(bytes);
            return;
        } catch {}
    }
    await chrc.writeValue(bytes);
}
async function _writeLongImpl(str) {
    await ensureConnected();
    const bytes = enc.encode(str),
        CHUNK = 20;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        await writeChunk(rx, bytes.slice(i, i + CHUNK));
        await delay(8);
    }
}
function writeLong(str) {
    const job = () =>
        _writeLongImpl(str).catch((e) => {
            console.error('BLE write error:', e);
            throw e;
        });
    writeChain = writeChain.then(job, job);
    return writeChain;
}

/* ---------- Discovery / connect ---------- */
function isChooserCancel(e) {
    const n = e?.name || '',
        m = (e?.message || e || '') + '';
    return n === 'NotFoundError' || /requestDevice\(\)\s*chooser/i.test(m);
}
async function requestDeviceInteractive() {
    try {
        return await navigator.bluetooth.requestDevice({ filters: [{ services: [SVC] }], optionalServices: [SVC] });
    } catch (e) {
        if (isChooserCancel(e)) throw e;
        return await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'Typist' }],
            optionalServices: [SVC],
        });
    }
}
async function refreshKnownDeviceHandle() {
    if (!('bluetooth' in navigator) || typeof navigator.bluetooth.getDevices !== 'function') return false;
    const rememberId = localStorage.getItem(REMEMBER_KEY) || '';
    try {
        const known = await navigator.bluetooth.getDevices();
        const found = known.find((d) => d.id === rememberId || /typist/i.test(d.name || ''));
        if (!found) return false;
        if (device !== found) {
            try {
                device?.removeEventListener('gattserverdisconnected', onDisconnect);
            } catch {}
            device = found;
            device.addEventListener('gattserverdisconnected', onDisconnect);
        }
        return true;
    } catch {
        return false;
    }
}
async function discoverGatt() {
    svc = await server.getPrimaryService(SVC);
    const tryGet = async (u) => {
        try {
            return await svc.getCharacteristic(u);
        } catch {
            return null;
        }
    };
    rx = await tryGet(RX);
    tx = await tryGet(TX);
    if (!rx || !tx) {
        const all = await svc.getCharacteristics();
        if (!rx)
            rx =
                all.find(
                    (c) => c.uuid?.toLowerCase?.() === RX || c.properties?.write || c.properties?.writeWithoutResponse
                ) || null;
        if (!tx) tx = all.find((c) => c.uuid?.toLowerCase?.() === TX || c.properties?.notify) || null;
    }
    if (!rx || !tx) throw new Error('UART characteristics not found.');
    await tx.startNotifications();
    tx.removeEventListener('characteristicvaluechanged', onNotify);
    tx.addEventListener('characteristicvaluechanged', onNotify);
}
async function ensureConnected() {
    await refreshKnownDeviceHandle();
    if (!device) throw new Error('No device selected');
    if (!device.gatt.connected) await device.gatt.connect();
    server = device.gatt;
    await discoverGatt();
    setUiEnabled(true);
    updateConnectUi();
}

/* ---------- Disconnect / reconnect ---------- */
function onDisconnect() {
    setUiEnabled(false);
    rx = tx = svc = server = null;
    updateConnectUi();
    scheduleReconnect();
}
function scheduleReconnect() {
    if (reconnectTimer) return;
    const backoff = async () => {
        try {
            connecting = true;
            await refreshKnownDeviceHandle();
            if (!device) throw new Error('Bluetooth Device is no longer in range.');
            if (!device.gatt.connected) await device.gatt.connect();
            server = device.gatt;
            await discoverGatt();
            setUiEnabled(true);
            updateConnectUi();
            reconnectDelay = 800;
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
            await listMacros().catch(() => {});
            return;
        } catch {
            reconnectDelay = Math.min(reconnectDelay * 1.6, 12000);
            reconnectTimer = setTimeout(backoff, reconnectDelay + Math.floor(Math.random() * 250));
        } finally {
            connecting = false;
        }
    };
    reconnectTimer = setTimeout(backoff, reconnectDelay);
}

/* ---------- Auto-restore on load ---------- */
document.addEventListener('DOMContentLoaded', () => {
    // initial UI prep
    updateDockPadding();
    populateIconSelect(ui.mIconSelect);
    // ALWAYS enable New/Refresh
    if (ui.newMacro) ui.newMacro.disabled = false;
    if (ui.refresh) ui.refresh.disabled = false;

    // Wire handlers here to be 100% sure the elements exist
    ui.newMacro?.addEventListener('click', (e) => {
        e.preventDefault();
        openEditor();
    });
    ui.refresh?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await listMacros();
        } catch (err) {
            showToast('Connect first to refresh.', 'error');
        }
    });

    // try to restore BLE connection
    restoreKnownDevice().catch(() => {});
});
window.addEventListener('resize', updateDockPadding);

/* ---------- Connect/Disconnect button ---------- */
async function connect() {
    if (connecting) return;
    try {
        connecting = true;
        ui.connect.disabled = true;
        ui.connect.textContent = 'Connecting…';
        setUiEnabled(false);

        device = await requestDeviceInteractive();
        localStorage.setItem(REMEMBER_KEY, device.id);
        device.addEventListener('gattserverdisconnected', onDisconnect);

        server = await device.gatt.connect();
        await discoverGatt();
        setUiEnabled(true);
        updateConnectUi();
        await listMacros().catch(() => {});
    } catch (e) {
        const persist = !isChooserCancel(e);
        showToast(e?.message || String(e), 'error', persist);
    } finally {
        connecting = false;
        ui.connect.disabled = false;
        updateConnectUi();
    }
}
ui.connect.addEventListener('click', async () => {
    const connected = !!device?.gatt?.connected;
    if (connected) await disconnectGattClean();
    else await connect();
});

/* ---------- Restore helper ---------- */
async function restoreKnownDevice() {
    const ok = await refreshKnownDeviceHandle();
    if (!ok) {
        updateConnectUi();
        return;
    }
    try {
        if (!device.gatt.connected) await device.gatt.connect();
        server = device.gatt;
        await discoverGatt();
        setUiEnabled(true);
        updateConnectUi();
        await listMacros().catch(() => {});
    } catch {
        updateConnectUi();
        scheduleReconnect();
    }
}

/* ---------- CFG streaming ---------- */
let cfgRx = { active: false, expect: 0, got: 0, buf: '', done: false, timer: 0 };
const state = { startupEditing: false, lastStartupScriptSent: null };

function cfgReset() {
    if (cfgRx.timer) clearTimeout(cfgRx.timer);
    cfgRx = { active: false, expect: 0, got: 0, buf: '', done: false, timer: 0 };
}
function cfgStart(len) {
    cfgReset();
    cfgRx.active = true;
    cfgRx.expect = Number(len) || 0;
}
function cfgAppend(s) {
    if (!cfgRx.active) return;
    cfgRx.buf += s;
    cfgRx.got += s.length;
}
function cfgDone() {
    cfgRx.done = true;
    parseIfReady();
}
function parseIfReady(force = false) {
    if (!cfgRx.active) return;
    const ready = (cfgRx.expect > 0 && cfgRx.got >= cfgRx.expect) || cfgRx.done || force;
    if (!ready) return;
    try {
        renderList(JSON.parse(cfgRx.buf));
        cfgReset();
    } catch (e) {
        if (!force) {
            if (cfgRx.timer) clearTimeout(cfgRx.timer);
            cfgRx.timer = setTimeout(() => parseIfReady(true), 150);
            return;
        }
        console.error('JSON error', e, cfgRx.buf);
        showToast('Invalid data from device.', 'error', true);
        cfgReset();
    }
}
let lastCfgCmd = '';

function onNotify(e) {
    const text = dec.decode(e.target.value);

    if (text.startsWith(':CFG:LIST LEN=')) {
        cfgStart(text.split('=')[1] || '0');
        return;
    }
    if (text.startsWith(':CFG:DATA ')) {
        cfgAppend(text.slice(10));
        parseIfReady();
        return;
    }
    if (text.startsWith(':CFG:DONE')) {
        cfgDone();
        return;
    }

    if (cfgRx.active) {
        cfgAppend(text);
        parseIfReady();
        return;
    }

    if (text.startsWith(':CFG:OK')) {
        if (lastCfgCmd && lastCfgCmd.startsWith('SET_STARTUP_SCRIPT')) {
            try {
                const sent =
                    state.lastStartupScriptSent ??
                    decodeURIComponent(lastCfgCmd.slice('SET_STARTUP_SCRIPT'.length).replace(/^\s+/, ''));
                ui.startupScript.value = (sent || '').replace(/\r\n/g, '\n');
                state.lastStartupScriptSent = null;
            } catch {}
        }
        listMacros().catch(() => {});
        return;
    }
    if (text.startsWith(':CFG:ERR')) {
        const msg = `${text}\nlastCmd=${lastCfgCmd}`;
        console.error(msg);
        showToast(msg, 'error', true);
        return;
    }
}

/* ---------- Send / Replace text ---------- */
const BS = '\x08';
let lastChars = 0;
const charCount = (s) => Array.from(s ?? '').length;

async function sendText(raw) {
    try {
        const payload = (raw ?? ui.text.value ?? '') + (ui.sendEnter.checked ? '\n' : '');
        await writeLong(payload);
        lastChars = charCount(payload);
    } catch (e) {
        showToast(e?.message || String(e), 'error', true);
    }
}
async function replaceText(raw) {
    try {
        const payload = (raw ?? ui.text.value ?? '') + (ui.sendEnter.checked ? '\n' : '');
        if (lastChars > 0) await writeLong(BS.repeat(lastChars));
        await writeLong(payload);
        lastChars = charCount(payload);
    } catch (e) {
        showToast(e?.message || String(e), 'error', true);
    }
}

/* ---------- CFG API ---------- */
const encSafe = (s) => encodeURIComponent(s ?? '');
async function sendCfg(cmd) {
    lastCfgCmd = cmd;
    return writeLong(`:CFG:${cmd}\n`);
}
async function listMacros() {
    return sendCfg('LIST');
}

/* ---------- Render ---------- */
function renderList(obj = {}) {
    updateFsStats(obj.fs);
    updateStartupActiveUI(obj);

    const macros = Array.isArray(obj.macros) ? obj.macros : [];
    const startupId = Number.isInteger(obj.startupId) ? obj.startupId : 0;
    const startupScript = typeof obj.startupScript === 'string' ? obj.startupScript : '';

    if (ui.grid) ui.grid.innerHTML = '';
    if (ui.startupSelect) ui.startupSelect.innerHTML = '<option value="0">— none —</option>';

    for (const m of macros) {
        const card = document.createElement('div');
        card.className = 'card';
        card.addEventListener('click', () => runMacro(card, i, m.script));

        const icon = document.createElement('div');
        icon.className = 'icon';
        const i = document.createElement('i');
        i.className = composeIconClass(normalizeIconName(m.icon));
        icon.appendChild(i);

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = m.title || '(untitled)';

        const actions = document.createElement('div');
        actions.className = 'actions';
        const edit = document.createElement('button');
        edit.innerHTML = '<i class="fa fa-pen"></i>';
        edit.onclick = (ev) => {
            ev.stopPropagation();
            openEditor(m);
        };
        const del = document.createElement('button');
        del.innerHTML = '<i class="fa fa-trash"></i>';
        del.onclick = async (ev) => {
            ev.stopPropagation();
            if (confirm(`Delete "${m.title}"?`)) await sendCfg(`DEL ${m.id}`);
        };
        actions.append(edit, del);

        card.append(icon, title, actions);
        ui.grid?.appendChild(card);

        if (ui.startupSelect) {
            const opt = document.createElement('option');
            opt.value = String(m.id);
            opt.textContent = `${m.id}: ${m.title}`;
            if (startupId === m.id) opt.selected = true;
            ui.startupSelect.appendChild(opt);
        }
    }

    if (!state.startupEditing && ui.startupScript)
        ui.startupScript.value = (startupScript || '').replace(/\r\n/g, '\n');
}

/* ---------- Editor ---------- */
function openEditor(m = null) {
    ui.mId.value = m?.id ?? '';
    ui.mTitle.value = m?.title ?? '';
    const name = normalizeIconName(m?.icon ?? 'bolt');
    ui.mIconSelect.value = ICONS.includes(name) ? name : 'bolt';
    ui.iconPreview.className = composeIconClass(ui.mIconSelect.value);
    ui.mScript.value = m?.script ?? '';

    if (ui.editor?.showModal) ui.editor.showModal();
    else ui.editor?.setAttribute('open', ''); // fallback if <dialog> lacks showModal
}
ui.cancel?.addEventListener('click', () => {
    if (ui.editor?.close) ui.editor.close('cancel');
    else ui.editor?.removeAttribute('open');
});
ui.form?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveEditor();
});
ui.mIconSelect?.addEventListener('change', () => {
    ui.iconPreview.className = composeIconClass(ui.mIconSelect.value);
});

async function saveEditor() {
    try {
        const id = ui.mId.value.trim();
        const title = encSafe(ui.mTitle.value);
        const iconName = encSafe(ui.mIconSelect.value); // store name only
        const script = encSafe(ui.mScript.value);
        await sendCfg(`PUT ${id}|${title}|${iconName}|${script}`);
        if (ui.editor?.close) ui.editor.close('ok');
        else ui.editor?.removeAttribute('open');
        setTimeout(() => listMacros().catch(() => {}), 250);
    } catch (e) {
        showToast(e?.message || String(e), 'error', true);
    }
}

/* ---------- Startup controls ---------- */
ui.startupScript?.addEventListener('focus', () => {
    state.startupEditing = true;
});
ui.startupScript?.addEventListener('input', () => {
    state.startupEditing = true;
    updateStartupActiveUI(null);
});
ui.startupScript?.addEventListener('blur', () => {
    state.startupEditing = false;
});

ui.saveStartupId &&
    (ui.saveStartupId.onclick = async () => {
        try {
            await sendCfg(`SET_STARTUP ${ui.startupSelect.value}`);
            showToast('Startup macro saved.');
            updateStartupActiveUI(null);
        } catch (e) {
            showToast(e?.message || String(e), 'error', true);
        }
    });
ui.saveStartupScript &&
    (ui.saveStartupScript.onclick = async () => {
        try {
            const raw = (ui.startupScript.value || '').replace(/\r\n/g, '\n');
            state.lastStartupScriptSent = raw;
            await sendCfg(`SET_STARTUP_SCRIPT ${encodeURIComponent(raw)}`);
            showToast('Startup script saved.');
            updateStartupActiveUI(null);
        } catch (e) {
            showToast(e?.message || String(e), 'error', true);
        }
    });

/* ---------- Other buttons (send stays as-is) ---------- */
ui.send && (ui.send.onclick = () => sendText());
ui.sendReplace && (ui.sendReplace.onclick = () => replaceText());
