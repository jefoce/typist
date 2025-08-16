# Typist — Macros Cheatsheet

**How it works:** Outside of `{{ ... }}` the text is typed literally.
Inside `{{ ... }}` you can send commands and key combos.

---

## Commands (case-insensitive)

- `TEXT:...` — type literal text (ASCII/Cyrillic).
  _Example:_ `{{TEXT:Hello}}`
- `DELAY:ms` — wait for milliseconds.
  _Example:_ `{{DELAY:500}}`
- `TAP:KEY(+KEY...)` — press & release one or more keys.
  _Example:_ `{{TAP:ENTER}}`, `{{TAP:CTRL+C}}`
- `DOWN:KEY(+KEY...)` — hold one or more keys (no auto-release).
  _Example:_ `{{DOWN:CTRL+SHIFT}}`
- `UP:KEY(+KEY...)` — release key(s) previously held with `DOWN`.
  _Example:_ `{{UP:CTRL+SHIFT}}`
- `COMBO:K1+K2(+K3...)` — press all at once, brief hold (~25ms), release.
  _Example:_ `{{COMBO:ALT+TAB}}`

**Shortcut:** Writing just a combo also works.
`{{CTRL+SHIFT+ESC}}` == `{{COMBO:CTRL+SHIFT+ESC}}`

---

## Common Key Names

**Modifiers**
- `CTRL`, `LCTRL`, `RCTRL`
- `SHIFT`, `LSHIFT`, `RSHIFT`
- `ALT`, `RALT` (`LOPTION`/`ROPTION`)
- `GUI`, `WIN`, `META`, `LCMD`, `RCMD`

**Navigation**
- `UP`, `DOWN`, `LEFT`, `RIGHT`, `HOME`, `END`, `PGUP`, `PGDN`, `INS`, `DEL`

**Controls**
- `ESC`, `TAB`, `ENTER` (`RETURN`), `SPACE`, `BKSP` (`BACKSPACE`)
- `CAPS`, `PRINTSCREEN`, `SCROLLLOCK`, `PAUSE`, `MENU` (`APP`)

**Alphanumerics & F-keys**
- Letters: `A`…`Z`
- Digits: `0`…`9`
- Function keys: `F1`…`F24`

**Symbols (US)**
- `` ` `` (`GRAVE`), `-` (`MINUS`), `=` (`EQUAL`)
- `[` (`LBRACKET`), `]` (`RBRACKET`), `\` (`BACKSLASH`)
- `;` (`SEMICOLON`), `'` (`QUOTE`), `,` (`COMMA`), `.` (`DOT`/`PERIOD`), `/` (`SLASH`)

---

## Practical Examples

- **Run dialog (Windows):** `{{COMBO:WIN+R}}`
- **Task Manager:** `{{CTRL+SHIFT+ESC}}`
- **Copy / Paste:** `{{CTRL+C}} ... {{CTRL+V}}`
- **Alt-Tab switch:** `{{ALT+TAB}}`
- **Sequence:** `hello{{ENTER}}{{DELAY:500}}world`
- **Hold / tap / release:** `{{DOWN:CTRL}}c{{UP:CTRL}}`

---

## Mixing Text & Commands