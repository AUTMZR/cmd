#!/usr/bin/env bash
# Autmzr Command agent installer.
# Usage: curl -sSL <master>/connect.sh | bash -s -- --master wss://<host>/ws/agent --token <TOKEN> --name <NAME>
set -euo pipefail

MASTER=""
TOKEN=""
NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --master) MASTER="$2"; shift 2 ;;
    --token)  TOKEN="$2"; shift 2 ;;
    --name)   NAME="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$MASTER" || -z "$TOKEN" || -z "$NAME" ]]; then
  echo "Usage: curl ... | bash -s -- --master wss://host/ws/agent --token X --name home-mac"
  exit 1
fi

# Новые имена (Autmzr Command). Старые — для миграции существующих установок.
DIR="$HOME/.autmzr-command"
LEGACY_DIR="$HOME/.pocket-claude"
SERVICE_NAME="autmzr-command-agent"
LEGACY_SERVICE_NAME="pocket-claude-agent"
LAUNCHD_LABEL="dev.autmzr.command-agent"
LEGACY_LAUNCHD_LABEL="dev.pocket-claude.agent"

# ---------------------------------------------------------------
# Миграция со старого имени (pocket-claude-agent → autmzr-command-agent).
# Делаем ДО установки нового, чтобы не было двух одновременных агентов.
# ---------------------------------------------------------------
migrate_legacy() {
  local OS_NAME
  OS_NAME=$(uname -s)
  if [[ "$OS_NAME" == "Linux" ]]; then
    if [[ -f "/etc/systemd/system/${LEGACY_SERVICE_NAME}.service" ]] && [[ $EUID -eq 0 ]]; then
      echo ">> Найден старый сервис ${LEGACY_SERVICE_NAME} — мигрирую."
      systemctl disable --now "${LEGACY_SERVICE_NAME}" 2>/dev/null || true
      rm -f "/etc/systemd/system/${LEGACY_SERVICE_NAME}.service"
      systemctl daemon-reload
    fi
    if [[ -f "$HOME/.config/systemd/user/${LEGACY_SERVICE_NAME}.service" ]]; then
      echo ">> Найден старый user-сервис ${LEGACY_SERVICE_NAME} — мигрирую."
      systemctl --user disable --now "${LEGACY_SERVICE_NAME}" 2>/dev/null || true
      rm -f "$HOME/.config/systemd/user/${LEGACY_SERVICE_NAME}.service"
      systemctl --user daemon-reload 2>/dev/null || true
    fi
  elif [[ "$OS_NAME" == "Darwin" ]]; then
    local LEGACY_PLIST="$HOME/Library/LaunchAgents/${LEGACY_LAUNCHD_LABEL}.plist"
    if [[ -f "$LEGACY_PLIST" ]]; then
      echo ">> Найден старый launchd ${LEGACY_LAUNCHD_LABEL} — мигрирую."
      launchctl unload "$LEGACY_PLIST" 2>/dev/null || true
      rm -f "$LEGACY_PLIST"
    fi
  fi
  # Переносим конфиг (token / config.json) из ~/.pocket-claude в ~/.autmzr-command
  if [[ -d "$LEGACY_DIR" ]] && [[ ! -d "$DIR" ]]; then
    echo ">> Переношу конфиг ${LEGACY_DIR} → ${DIR}"
    mkdir -p "$DIR"
    chmod 700 "$DIR"
    cp -a "$LEGACY_DIR/." "$DIR/" 2>/dev/null || true
  fi
  # Чистим зависшие nohup-процессы из старого пути
  pkill -f 'pocket-claude/agent.js' 2>/dev/null || true
}
migrate_legacy

mkdir -p "$DIR"
chmod 700 "$DIR"

# Check node
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is required. Install Node 20+ first."
  exit 1
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if (( MAJOR < 20 )); then
  echo "ERROR: Node 20+ required (you have $(node -v))"
  exit 1
fi

# Derive HTTP URL from WSS for bundle download
BASE_URL=$(echo "$MASTER" | sed 's|^ws://|http://|; s|^wss://|https://|; s|/ws/agent$||')
BUNDLE_URL="$BASE_URL/agent.js"
RFS_MCP_URL="$BASE_URL/rfs-mcp.js"

echo ">> Downloading agent from $BUNDLE_URL"
curl -sSL "$BUNDLE_URL" -o "$DIR/agent.js"

echo ">> Downloading rfs-mcp server (for remote filesystem proxy mode)"
curl -sSL "$RFS_MCP_URL" -o "$DIR/rfs-mcp.js" || echo "   (rfs-mcp.js not available on this master — proxy-mode disabled)"

cat > "$DIR/config.json" <<EOF
{
  "master_url": "$MASTER",
  "token": "$TOKEN",
  "name": "$NAME",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
chmod 600 "$DIR/config.json"

# ================================================================
# Опционально: node-pty для полноценного PTY-терминала (vim/htop).
# Без него агент работает, просто PTY-режим в UI покажет инструкцию.
# ================================================================
OS=$(uname -s)
install_node_pty() {
  if node -e "require('node-pty')" 2>/dev/null; then
    echo "   node-pty уже установлен — ok"
    return 0
  fi
  echo ">> Пробую установить node-pty (для vim/htop/интерактивных команд)..."
  # Ставим build-tools для компиляции native addon
  if [[ "$OS" == "Linux" ]]; then
    if command -v apt-get >/dev/null 2>&1 && [[ $EUID -eq 0 ]]; then
      apt-get install -y build-essential python3 >/dev/null 2>&1 || true
    elif command -v yum >/dev/null 2>&1 && [[ $EUID -eq 0 ]]; then
      yum groupinstall -y 'Development Tools' >/dev/null 2>&1 || true
      yum install -y python3 >/dev/null 2>&1 || true
    fi
  fi
  if [[ $EUID -eq 0 ]] || [[ "$OS" == "Darwin" ]]; then
    if npm install -g node-pty >/dev/null 2>&1; then
      echo "   ✓ node-pty установлен глобально"
    else
      echo "   ⚠ node-pty не установлен — PTY в UI покажет инструкцию"
      echo "     руками: sudo npm install -g node-pty"
    fi
  else
    echo "   ⚠ не root — не могу поставить node-pty глобально"
    echo "     руками: sudo npm install -g node-pty"
  fi
}
install_node_pty

# Очищаем старые nohup-процессы агента (оставшиеся от предыдущих установок),
# чтобы не было конфликта с новым systemd-юнитом.
pkill -f 'autmzr-command/agent.js' 2>/dev/null || true
sleep 1

# Install service
if [[ "$OS" == "Linux" ]]; then
  # Под root ставим system-unit с лимитами и auto-restart.
  if [[ $EUID -eq 0 ]]; then
    UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
    cat > "$UNIT" <<EOF
[Unit]
Description=Autmzr Command Agent (node-pty + WebSocket)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$DIR
Environment=NODE_PATH=/usr/local/lib/node_modules:/usr/lib/node_modules
ExecStart=$(which node) $DIR/agent.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
MemoryMax=512M
TasksMax=200

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable --now "${SERVICE_NAME}"
    echo "✓ systemd system service: ${SERVICE_NAME}"
    echo "  logs: journalctl -u ${SERVICE_NAME} -f"
  else
    # Non-root — user-scope (работает пока юзер залогинен или linger включён)
    UNIT="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
    mkdir -p "$(dirname "$UNIT")"
    cat > "$UNIT" <<EOF
[Unit]
Description=Autmzr Command Agent
After=network-online.target

[Service]
ExecStart=$(which node) $DIR/agent.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "${SERVICE_NAME}"
    echo "✓ systemd user service: ${SERVICE_NAME}"
    echo "  logs: journalctl --user -u ${SERVICE_NAME} -f"
    echo "  (для auto-start при reboot без логина: sudo loginctl enable-linger $USER)"
  fi
elif [[ "$OS" == "Darwin" ]]; then
  PLIST="$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"
  NODE=$(which node)
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>$DIR/agent.js</string>
  </array>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$DIR/agent.log</string>
</dict></plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "✓ launchd service: ${LAUNCHD_LABEL}"
  echo "  logs: tail -f $DIR/agent.log"
else
  echo "⚠ Unknown OS ($OS). Start manually:"
  echo "  node $DIR/agent.js"
fi

# Uninstaller
cat > "$DIR/uninstall.sh" <<EOF
#!/usr/bin/env bash
set -e
OS=\$(uname -s)
if [[ "\$OS" == "Linux" ]]; then
  if [[ \$EUID -eq 0 ]] && [[ -f /etc/systemd/system/${SERVICE_NAME}.service ]]; then
    systemctl disable --now ${SERVICE_NAME} 2>/dev/null || true
    rm -f /etc/systemd/system/${SERVICE_NAME}.service
    systemctl daemon-reload
  else
    systemctl --user disable --now ${SERVICE_NAME} 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/${SERVICE_NAME}.service"
    systemctl --user daemon-reload 2>/dev/null || true
  fi
elif [[ "\$OS" == "Darwin" ]]; then
  launchctl unload "$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"
fi
rm -rf "$DIR"
echo "Autmzr Command agent uninstalled."
EOF
chmod +x "$DIR/uninstall.sh"

echo ""
echo "Done! Device '$NAME' is now connecting to $MASTER"
echo "Uninstall: $DIR/uninstall.sh"

# Проверка что агент реально стартовал и не упал.
# Если не active через 5 сек — покажем последние 20 строк лога с диагностикой.
sleep 6
echo ""
echo ">> Проверяю что агент жив..."
is_active_sys=$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || true)
is_active_user=$(systemctl --user is-active "${SERVICE_NAME}" 2>/dev/null || true)
# Показываем последние 15 строк лога ВСЕГДА — чтобы видеть connected/disconnected
# и ошибки даже если процесс мгновенно рестартает в active.
echo "────── последние 15 строк лога агента ──────"
journalctl -u "${SERVICE_NAME}" -n 15 --no-pager 2>/dev/null \
  || journalctl --user -u "${SERVICE_NAME}" -n 15 --no-pager 2>/dev/null \
  || echo "(journalctl недоступен)"
echo "────────────────────────────────────────────"
if [[ "$is_active_sys" == "active" || "$is_active_user" == "active" ]]; then
  echo "✓ systemd unit active"
else
  echo "⚠ systemd unit НЕ active"
fi
echo "Диагностика окружения:"
command -v node >/dev/null 2>&1 && echo "  node: $(node --version) @ $(which node)" || echo "  ❌ node НЕ НАЙДЕН"
command -v curl >/dev/null 2>&1 && echo "  curl: $(curl --version | head -1 | cut -d ' ' -f 1-2)" || echo "  ❌ curl отсутствует"
command -v codex >/dev/null 2>&1 && echo "  codex: $(codex --version 2>/dev/null | head -1) @ $(which codex)" || echo "  codex: не установлен (опционально)"
echo "  master URL: $MASTER"
