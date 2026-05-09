/**
 * Reference Autmzr plugin: "echo".
 *
 * Минимальный AIProvider — стримит обратно то что юзер прислал, по словам.
 * Используется как:
 *   • smoke-test plugin loader / chat pipeline
 *   • живой пример для авторов плагинов
 *
 * Установка:
 *   mkdir -p ~/.autmzr-command/plugins/echo
 *   cp packages/example-plugin-echo/src/index.js ~/.autmzr-command/plugins/echo/
 *   systemctl --user restart autmzr-command-agent  # (или systemctl restart, в зависимости от установки)
 */

const PLUGIN_API_VERSION = 1;

/** @type {import('@autmzr/plugin-api').AIProvider} */
const echoProvider = {
  id: 'echo',
  label: 'Echo (demo)',
  apiVersion: PLUGIN_API_VERSION,
  models: [
    { id: 'echo-fast', label: 'Echo Fast', icon: '🔁', hint: 'echoes back instantly', tier: 'cheap' },
  ],
  async status() {
    return { installed: true, logged_in: true, version: '0.1.0' };
  },
  async chat(req, emit, cancel) {
    const words = (req.prompt || '').split(/\s+/).filter(Boolean);
    let acc = '';
    for (const w of words) {
      if (cancel.cancelled) {
        emit({ type: 'error', message: 'cancelled', code: 'cancelled' });
        return;
      }
      const chunk = (acc.length ? ' ' : '') + w;
      acc += chunk;
      emit({ type: 'text', text: chunk });
      await sleep(80);
    }
    emit({ type: 'done', result: acc });
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default echoProvider;
