'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Settings as SettingsIcon, FolderOpen, Folder, Plug, X } from 'lucide-react';
import DeviceBrowser from './DeviceBrowser';
import { effectiveIntent, type DeviceIntent } from '@/lib/device-intent';
import type { Provider } from '@/lib/models';

const ClaudeInstallModal = dynamic(() => import('./ClaudeInstallModal'), { ssr: false, loading: () => null });
const ClaudeLoginModal = dynamic(() => import('./ClaudeLoginModal'), { ssr: false, loading: () => null });
const GeminiSetupModal = dynamic(() => import('./GeminiSetupModal'), { ssr: false, loading: () => null });

export interface DeviceSheetDevice {
  id: string; name: string; kind: string; hostname: string | null;
  os?: string | null; arch?: string | null; online: boolean;
  agent_logged_in: boolean | null;
  agent_installed?: boolean | null;
  agent_version?: string | null;
  agent_kind?: string | null;
  gemini_installed?: boolean | null;
  gemini_version?: string | null;
  gemini_logged_in?: boolean | null;
  codex_installed?: boolean | null;
  codex_version?: string | null;
  codex_logged_in?: boolean | null;
  preferred_agent?: Provider | null;
  last_online: string | null; root_path: string | null;
  intent?: DeviceIntent | null;
}

/**
 * Focused-режим для одного устройства — открывается тапом по девайсу на
 * welcome-экране или в sidebar. Показывает ТОЛЬКО про это устройство:
 *  - статус Claude CLI (Install/Login)
 *  - статус Gemini CLI (Setup)
 *  - Default agent (Claude / Gemini / Codex)
 *  - Файлы · Корень проектов · Intent-toggle · Отключить
 *  - Внизу ссылка на полные Settings (тема, invites, аккаунт)
 */
export default function DeviceSheet({
  device,
  onClose,
  onReload,
  onOpenSettings,
  onCreateProject,
}: {
  device: DeviceSheetDevice;
  onClose: () => void;
  onReload: () => void;
  onOpenSettings: () => void;
  onCreateProject?: (deviceId: string, path: string) => void;
}) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [editRootOpen, setEditRootOpen] = useState(false);
  const [installClaude, setInstallClaude] = useState(false);
  const [loginClaude, setLoginClaude] = useState(false);
  const [setupGemini, setSetupGemini] = useState(false);

  const role = effectiveIntent(device);
  const isClaudeRole = role === 'claude';

  async function setPreferredAgent(provider: Provider) {
    await fetch('/api/devices', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: device.id, preferred_agent: provider }),
    });
    onReload();
  }

  async function setIntent(intent: DeviceIntent) {
    await fetch('/api/devices', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: device.id, intent }),
    });
    onReload();
  }

  async function setRoot(path: string | null) {
    await fetch('/api/devices', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: device.id, root_path: path }),
    });
    onReload();
  }

  async function deleteDevice() {
    if (!confirm('Отключить устройство? Агент потеряет токен.')) return;
    await fetch('/api/devices', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: device.id }),
    });
    onReload(); onClose();
  }

  const claudeInstalled = device.agent_installed === true;
  const claudeLegacy = device.agent_installed == null;
  const claudeLoggedIn = device.agent_logged_in === true;
  const geminiInstalled = device.gemini_installed === true;
  const geminiLoggedIn = device.gemini_logged_in === true;
  const codexLoggedIn = device.codex_logged_in === true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl flex flex-col overflow-hidden max-h-[90dvh]"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent-light)', fontSize: 18 }}>
              {isClaudeRole ? '🤖' : '📂'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-semibold text-[15px] truncate">{device.name}</div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: device.online ? 'var(--ok)' : 'var(--danger)', color: '#fff' }}>
                  {device.online ? 'online' : 'offline'}
                </span>
              </div>
              <div className="text-[11.5px] font-mono truncate" style={{ color: 'var(--muted)' }}>
                {device.hostname || device.id.slice(0, 8)}
                {device.os ? ` · ${device.os}/${device.arch}` : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5" aria-label="Закрыть" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Agents status (claude-role девайсы) */}
          {isClaudeRole && device.online && (
            <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
                AI-агенты
              </div>

              {/* Claude row */}
              <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px dashed var(--border)' }}>
                <span style={{ fontSize: 18 }}>🤖</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium">Claude Code</div>
                  <div className="text-[11.5px] font-mono" style={{ color: 'var(--muted)' }}>
                    {claudeInstalled && claudeLoggedIn && <span style={{ color: 'var(--ok)' }}>✓ v{device.agent_version} · авторизован</span>}
                    {claudeInstalled && !claudeLoggedIn && <span style={{ color: 'var(--warn)' }}>⚠ v{device.agent_version} · нет login</span>}
                    {device.agent_installed === false && <span style={{ color: 'var(--danger)' }}>❌ не установлен</span>}
                    {claudeLegacy && !claudeLoggedIn && <span style={{ color: 'var(--warn)' }}>⚠ нет login (статус неизвестен)</span>}
                  </div>
                </div>
                {claudeInstalled && !claudeLoggedIn && (
                  <button onClick={() => setLoginClaude(true)}
                    className="text-[11.5px] px-3 py-1 rounded-full shrink-0"
                    style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                    🔐 Войти
                  </button>
                )}
                {device.agent_installed === false && (
                  <button onClick={() => setInstallClaude(true)}
                    className="text-[11.5px] px-3 py-1 rounded-full shrink-0"
                    style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                    📥 Установить
                  </button>
                )}
                {claudeLegacy && !claudeLoggedIn && (
                  <button onClick={() => setLoginClaude(true)}
                    className="text-[11.5px] px-3 py-1 rounded-full shrink-0"
                    style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                    🔐 Войти
                  </button>
                )}
              </div>

              {/* Gemini row */}
              <div className="flex items-center gap-3 py-2.5">
                <span style={{ fontSize: 18 }}>✨</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium">Gemini CLI</div>
                  <div className="text-[11.5px] font-mono" style={{ color: 'var(--muted)' }}>
                    {geminiInstalled && geminiLoggedIn && <span style={{ color: 'var(--ok)' }}>✓ v{device.gemini_version} · готов</span>}
                    {geminiInstalled && !geminiLoggedIn && <span style={{ color: 'var(--warn)' }}>⚠ v{device.gemini_version} · нет API-ключа</span>}
                    {!geminiInstalled && <span style={{ color: 'var(--muted)' }}>не установлен</span>}
                  </div>
                </div>
                <button onClick={() => setSetupGemini(true)}
                  className="text-[11.5px] px-3 py-1 rounded-full shrink-0"
                  style={{
                    background: geminiInstalled && geminiLoggedIn ? 'var(--surface-2)' : 'var(--accent)',
                    color: geminiInstalled && geminiLoggedIn ? 'var(--fg)' : 'var(--bg)',
                    border: geminiInstalled && geminiLoggedIn ? '1px solid var(--border)' : 'none',
                  }}>
                  {geminiInstalled && geminiLoggedIn ? 'Обновить ключ' : geminiInstalled ? '🔑 Настроить' : '📥 Установить'}
                </button>
              </div>

              {/* Notice о региональных ограничениях Gemini — только если CLI установлен */}
              {geminiInstalled && (
                <div className="mt-2 px-3 py-2 rounded-lg text-[11.5px] flex items-start gap-2"
                  style={{ background: 'var(--accent-light)', color: 'var(--fg-2)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13 }}>🌍</span>
                  <span>
                    <b>Gemini API заблокирован Google для ряда стран</b> (Россия, Китай, Иран и др.).
                    Если получаешь ошибку «User location is not supported» — нужен VPN на сервере или
                    отдельный агент в неблокированной локации.
                  </span>
                </div>
              )}

              {/* Default-agent селектор */}
              {(claudeLoggedIn || geminiLoggedIn || codexLoggedIn) && (
                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px dashed var(--border)' }}>
                  <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>По умолчанию:</span>
                  {([
                    { id: 'claude-code', label: '🤖 Claude', ready: claudeLoggedIn },
                    { id: 'gemini-cli',  label: '✨ Gemini', ready: geminiLoggedIn },
                    { id: 'codex-cli',   label: '⌘ Codex', ready: codexLoggedIn },
                  ] as const).map((opt) => {
                    const active = (device.preferred_agent || 'claude-code') === opt.id;
                    return (
                      <button key={opt.id}
                        onClick={() => { if (opt.ready) setPreferredAgent(opt.id); }}
                        disabled={!opt.ready}
                        className="text-[11.5px] px-3 py-1 rounded-full disabled:opacity-40"
                        style={{
                          background: active ? 'var(--accent)' : 'var(--surface-2)',
                          color: active ? 'var(--bg)' : 'var(--fg-2)',
                          border: active ? 'none' : '1px solid var(--border)',
                        }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Project root */}
          <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
              Корень проектов
            </div>
            {device.root_path ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] flex-1 truncate px-2.5 py-1.5 rounded"
                  style={{ background: 'var(--surface-2)', color: 'var(--fg-2)' }}>
                  {device.root_path}
                </span>
                <button onClick={() => setEditRootOpen(true)}
                  disabled={!device.online}
                  className="text-[11.5px] px-3 py-1.5 rounded-full shrink-0 disabled:opacity-40"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  Сменить
                </button>
              </div>
            ) : (
              <button onClick={() => setEditRootOpen(true)}
                disabled={!device.online}
                className="w-full text-[12.5px] px-3 py-2 rounded-lg disabled:opacity-40"
                style={{ background: 'var(--surface-2)', border: '1px dashed var(--border)', color: 'var(--muted)' }}>
                Корень не задан · выбрать папку
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="p-5 flex flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setBrowseOpen(true)}
              disabled={!device.online}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] disabled:opacity-40"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <FolderOpen size={14} /> Файлы
            </button>
            {role === 'claude' ? (
              <button onClick={() => setIntent('fs-only')}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <Folder size={14} /> Сделать files-only
              </button>
            ) : (
              <button onClick={() => setIntent('claude')}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                🤖 Сделать claude
              </button>
            )}
            {device.intent && device.intent !== 'auto' && (
              <button onClick={() => setIntent('auto')}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12.5px]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                title="Определять автоматически по agent_logged_in">
                ↻ auto
              </button>
            )}
            <button onClick={deleteDevice}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px]"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              <Plug size={14} /> Отключить
            </button>
          </div>

          {/* Link to full settings */}
          <div className="p-5">
            <button onClick={() => { onClose(); onOpenSettings(); }}
              className="w-full flex items-center justify-center gap-2 text-[12.5px] py-1.5 rounded-lg"
              style={{ color: 'var(--muted)' }}>
              <SettingsIcon size={13} /> Все настройки (тема, invite-коды, аккаунт)
            </button>
          </div>
        </div>
      </div>

      {/* Nested modals */}
      {browseOpen && (
        <DeviceBrowser
          deviceId={device.id}
          deviceName={device.name}
          initialPath={device.root_path || null}
          onClose={() => setBrowseOpen(false)}
          onPick={(path) => {
            onCreateProject?.(device.id, path);
            setBrowseOpen(false);
            onClose();
          }}
        />
      )}
      {editRootOpen && (
        <DeviceBrowser
          deviceId={device.id}
          deviceName={`${device.name} · выбор корня`}
          initialPath={device.root_path || null}
          onClose={() => setEditRootOpen(false)}
          onPick={async (path) => {
            await setRoot(path);
            setEditRootOpen(false);
          }}
        />
      )}
      {installClaude && (
        <ClaudeInstallModal
          deviceId={device.id}
          deviceName={device.name}
          onClose={() => { setInstallClaude(false); onReload(); }}
          onInstalled={() => onReload()}
        />
      )}
      {loginClaude && (
        <ClaudeLoginModal
          deviceId={device.id}
          deviceName={device.name}
          onClose={() => { setLoginClaude(false); onReload(); }}
        />
      )}
      {setupGemini && (
        <GeminiSetupModal
          deviceId={device.id}
          deviceName={device.name}
          alreadyInstalled={geminiInstalled}
          alreadyLoggedIn={geminiLoggedIn}
          onClose={() => { setSetupGemini(false); onReload(); }}
        />
      )}
    </div>
  );
}
