/* ---------- constants ---------- */
const UART_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/* ---------- helper ---------- */
const delay = ms => new Promise(r => setTimeout(r, ms));

/* ---------- class ---------- */
class BleTypist {
    #device = null;
    #char = null;
    #retry = 0;                    // milliseconds until next retry
    #ui = {
        status: document.getElementById('status'),
        toggle: document.getElementById('toggle'),
        send: document.getElementById('send'),
        text: document.getElementById('text'),
    };

    constructor() {
        this.#bindUI();
        this.#tryKnownDevice();       // boot-time reconnect
    }

    /* ---------- UI + lifecycle ---------- */
    #bindUI() {
        const { toggle, send, text } = this.#ui;

        toggle.onclick = () =>
            toggle.dataset.state === 'connected' ? this.disconnect() : this.connect();
        send.onclick = () => this.send();
        text.onkeydown = e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
        };

        /* pause connection in background, re-attach on return */
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.disconnect(false);              // keep #device reference
            } else {
                this.#device ? this.#attach(this.#device)
                    : this.#tryKnownDevice();
            }
        });

        addEventListener('beforeunload', () => this.disconnect(true));
    }

    #setUI(connected, state = 'disconnected') {
        const { toggle, send } = this.#ui;
        toggle.textContent = connected ? '❌' : '🔌';
        toggle.dataset.state = connected ? 'connected' : state;
        send.disabled = !connected;
    }

    /* ----- reconnect flow ----- */
    async #tryKnownDevice() {
        if (!navigator.bluetooth?.getDevices) return;
        const [d] = (await navigator.bluetooth.getDevices()).filter(v => v.name === 'Typist');
        if (d) this.#attach(d);       // no await: fire-and-forget
    }

    #scheduleReconnect() {
        if (this.#retry) return;      // already scheduled
        this.#retry = setTimeout(async () => {
            this.#retry = 0;
            this.#device ? this.#attach(this.#device) : this.connect();
        }, 3000);
    }

    /* ----- core attach ----- */
    async #attach(device) {
        try {
            if (!device.gatt.connected) await device.gatt.connect();
            await delay(200);

            const svc = await device.gatt.getPrimaryService(UART_UUID);
            this.#char = await svc.getCharacteristic(TX_UUID);
            this.#device = device;

            device.removeEventListener('gattserverdisconnected', this.#onDisc);
            device.addEventListener('gattserverdisconnected', this.#onDisc);

            this.#ui.status.textContent = 'Connected';
            this.#setUI(true);
        } catch (e) {
            this.#ui.status.textContent = `Attach error: ${e.message}`;
            this.#scheduleReconnect();
        }
    }

    /* keep arrow fn so “this” is stable when used as listener */
    #onDisc = () => {
        this.#ui.status.textContent = 'Disconnected – retrying…';
        this.#char = null;
        this.#setUI(false);
        this.#scheduleReconnect();
    };

    /* ----- public helpers ----- */
    async connect() {
        if (!navigator.bluetooth) { this.#ui.status.textContent = 'Web-Bluetooth not supported'; return; }

        this.#ui.status.textContent = 'Choose device…';
        this.#setUI(false, 'connecting');

        try {
            const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [UART_UUID] });
            this.#attach(device);
        } catch (e) {
            this.#ui.status.textContent = e.name === 'NotFoundError' ? 'Cancelled' : `Connect error: ${e.message}`;
            this.#setUI(false);
        }
    }

    /* ---------- disconnect ---------- */
    disconnect(hard = false) {
        this.#device?.gatt.connected && this.#device.gatt.disconnect();
        this.#device?.removeEventListener('gattserverdisconnected', this.#onDisc);
        clearTimeout(this.#retry); this.#retry = 0;

        if (hard) this.#device = null;           // only drop reference on full unload
        this.#char = null;
        this.#setUI(false);
        this.#ui.status.textContent = 'Disconnected';
    }

    async send() {
        if (!this.#char) return alert('Connect first');
        const data = new TextEncoder().encode(this.#ui.text.value + '\r');

        try {
            for (let i = 0; i < data.length; i += 20) await this.#char.writeValue(data.slice(i, i + 20));
            this.#ui.status.textContent = 'Sent ✔';
            this.#ui.text.value = ''; this.#ui.text.focus();
        } catch (e) {
            this.#ui.status.textContent = `Send error: ${e.message}`;
        }
    }
}

/* ----- bootstrap ----- */
addEventListener('DOMContentLoaded', () => new BleTypist());