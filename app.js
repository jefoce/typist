/* ---------- constants ---------- */
const UART_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const BS_BYTE = 0x08; // ASCII Backspace (KEY_BACKSPACE)

/* ---------- helper ---------- */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- class ---------- */
class BleTypist {
    #device = null;
    #char = null;
    #retry = 0;
    #lastLen = 0; // bytes of the last sent message
    #ui = {
        status: document.getElementById('status'),
        toggle: document.getElementById('toggle'),
        send: document.getElementById('send'),
        sendReplace: document.getElementById('sendReplace'),
        text: document.getElementById('text'),
    };

    constructor() {
        this.#bindUI();
        this.#tryKnownDevice();
    }

    /* ---------- UI ---------- */
    #bindUI() {
        const { toggle, send, sendReplace, text } = this.#ui;

        toggle.onclick = () => (toggle.dataset.state === 'connected' ? this.disconnect() : this.connect());
        send.onclick = () => this.#send();
        sendReplace.onclick = () => this.#send(true);
        text.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.#send();
            }
        };

        document.addEventListener('visibilitychange', () =>
            document.hidden
                ? this.disconnect(false)
                : this.#device
                ? this.#attach(this.#device)
                : this.#tryKnownDevice()
        );

        addEventListener('beforeunload', () => this.disconnect(true));
    }

    #setUI(connected, state = 'disconnected') {
        const { toggle, send, sendReplace } = this.#ui;
        toggle.textContent = connected ? '🔗' : '🛜';
        toggle.dataset.state = connected ? 'connected' : state;
        send.disabled = sendReplace.disabled = !connected;
    }

    /* ---------- reconnect ---------- */
    async #tryKnownDevice() {
        if (!navigator.bluetooth?.getDevices) return;
        const [d] = (await navigator.bluetooth.getDevices()).filter((v) => v.name === 'Typist');
        d && this.#attach(d);
    }

    #scheduleReconnect() {
        if (this.#retry) return;
        this.#retry = setTimeout(
            () => ((this.#retry = 0), this.#device ? this.#attach(this.#device) : this.connect()),
            3000
        );
    }

    /* ---------- attach ---------- */
    async #attach(device) {
        try {
            !device.gatt.connected && (await device.gatt.connect());
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

    #onDisc = () => {
        this.#ui.status.textContent = 'Disconnected – retrying…';
        this.#char = null;
        this.#setUI(false);
        this.#scheduleReconnect();
    };

    /* ---------- public ---------- */
    async connect() {
        if (!navigator.bluetooth) return (this.#ui.status.textContent = 'Web-Bluetooth not supported');

        this.#ui.status.textContent = 'Choose device…';
        this.#setUI(false, 'connecting');

        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [UART_UUID],
            });
            this.#attach(device);
        } catch (e) {
            this.#ui.status.textContent = e.name === 'NotFoundError' ? 'Cancelled' : `Connect error: ${e.message}`;
            this.#setUI(false);
        }
    }

    disconnect(hard = false) {
        this.#device?.gatt.connected && this.#device.gatt.disconnect();
        this.#device?.removeEventListener('gattserverdisconnected', this.#onDisc);
        clearTimeout(this.#retry);
        this.#retry = 0;

        hard && (this.#device = null);
        this.#char = null;
        this.#setUI(false);
        this.#ui.status.textContent = 'Disconnected';
    }

    /* ---------- send ---------- */
    async #writeChunk(buf) {
        // BLE MTU ≤ 20 B
        for (let i = 0; i < buf.length; i += 20) {
            await this.#char.writeValue(buf.slice(i, i + 20));
        }
    }

    async #clearPrev() {
        if (!this.#lastLen) return;
        const buf = new Uint8Array(this.#lastLen).fill(BS_BYTE);
        await this.#writeChunk(buf);
    }

    async #send(replace = false) {
        if (!this.#char) return alert('Connect first');

        const msg = this.#ui.text.value;
        if (!msg) {
            await this.#writeChunk(new TextEncoder().encode('\r'));
            return;
        }

        try {
            if (replace) await this.#clearPrev();
            if (msg) {
                await this.#writeChunk(new TextEncoder().encode(msg + '\r'));
                this.#lastLen = msg.length;
            } else {
                this.#lastLen = 0;
            }

            this.#ui.status.textContent = replace ? 'Replaced' : 'Sent';
            this.#ui.text.value = '';
            this.#ui.text.focus();
        } catch (e) {
            this.#ui.status.textContent = `Send error: ${e.message}`;
        }
    }
}

/* ---------- bootstrap ---------- */
addEventListener('DOMContentLoaded', () => new BleTypist());
