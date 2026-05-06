'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, X, FolderOpen, FolderPlus, Loader2, ChevronRight } from 'lucide-react';
import DeviceBrowser from './DeviceBrowser';
import { effectiveIntent, type DeviceIntent } from '@/lib/device-intent';
import { MODELS, DEFAULT_MODEL, normalizeProvider, type Provider } from '@/lib/models';

interface Device {
  id: string; name: string; kind: string; online: boolean;
  root_path?: string | null;
  agent_logged_in?: boolean | null;
  intent?: DeviceIntent | null;
  preferred_agent?: Provider | null;
}
interface Props {
  devices: Device[];
  onClose: () => void;
  onCreated: (id: string) => void;
}

/**
 * ProjectCreateModal — двухшаговый wizard.
 *
 * Шаг 1 · «Где»     — выбор устройства (+ при fs-only: выбор claude-device).
 * Шаг 2 · «Что»     — действие: открыть существующую папку ИЛИ создать новую.
 *                     После этого открывается DeviceBrowser; для «new» —
 *                     третий скрин с вводом имени.
 *
 * Заголовок всегда показывает breadcrumb: `Новый проект · vpskz · Новая папка`,
 * слева ◀ для возврата на предыдущий шаг.
 */

type Step = 'device' | 'action' | 'pick-existing' | 'pick-parent' | 'name-new';

export default function ProjectCreateModal({ devices, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>('device');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [claudeDeviceId, setClaudeDeviceId] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedDevice = devices.find(d => d.id === deviceId);
  const needsClaudeDevice = !!selectedDevice && effectiveIntent(selectedDevice) === 'fs-only';
  const claudeCandidates = devices.filter(d => d.id !== deviceId && d.online && effectiveIntent(d) === 'claude');
  const proxyOk = !needsClaudeDevice || !!claudeDeviceId;

  // Провайдер = preferred_agent устройства которое будет крутить AI
  // (claude-device в proxy-режиме, иначе — само устройство)
  const runningDeviceId = needsClaudeDevice ? claudeDeviceId : deviceId;
  const runningDevice = devices.find(d => d.id === runningDeviceId);
  const provider: Provider = normalizeProvider(runningDevice?.preferred_agent);
  const availableModels = MODELS[provider];

  // Автовыбор balanced-модели провайдера при смене провайдера
  useEffect(() => {
    if (!defaultModel || !availableModels.find(m => m.id === defaultModel)) {
      setDefaultModel(DEFAULT_MODEL[provider]);
    }
  }, [provider]); // eslint-disable-line

  // Автовыбор первого claude-кандидата при смене device
  useEffect(() => {
    if (needsClaudeDevice && !claudeDeviceId && claudeCandidates.length > 0) {
      setClaudeDeviceId(claudeCandidates[0].id);
    }
  }, [deviceId, needsClaudeDevice]); // eslint-disable-line

  function basename(path: string): string {
    return path.split('/').filter(Boolean).pop() || 'project';
  }

  function goBack() {
    setErr('');
    if (step === 'action') setStep('device');
    else if (step === 'pick-existing' || step === 'pick-parent') setStep('action');
    else if (step === 'name-new') { setParentPath(null); setStep('pick-parent'); }
  }

  async function createFromExisting(path: string) {
    if (needsClaudeDevice && !claudeDeviceId) { setErr('Выбери устройство с Claude'); return; }
    setErr(''); setBusy(true);
    const r = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: basename(path), device_id: deviceId, path,
        claude_device_id: needsClaudeDevice ? claudeDeviceId : null,
        default_model: defaultModel,
      }),
    });
    setBusy(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'ошибка'); return; }
    const j = await r.json();
    onCreated(j.id);
  }

  async function createNew() {
    setErr('');
    if (!parentPath || !newName.trim()) { setErr('Нужно имя папки'); return; }
    if (!/^[\w.\- ]+$/.test(newName.trim())) { setErr('Недопустимые символы в имени'); return; }
    if (needsClaudeDevice && !claudeDeviceId) { setErr('Выбери устройство с Claude'); return; }
    setBusy(true);
    const m = await fetch(`/api/devices/${deviceId}/mkdir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: parentPath, name: newName.trim() }),
    });
    if (!m.ok) {
      const j = await m.json().catch(() => ({})); setBusy(false); setErr(j.error || 'Не удалось создать папку'); return;
    }
    const md = await m.json();
    const r = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(), device_id: deviceId, path: md.path,
        claude_device_id: needsClaudeDevice ? claudeDeviceId : null,
        default_model: defaultModel,
      }),
    });
    setBusy(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'ошибка'); return; }
    const j = await r.json();
    onCreated(j.id);
  }

  /* ============ BODY по шагам ============ */

  const stepTitle =
    step === 'device' ? 'Выбери устройство' :
    step === 'action' ? 'Что будем делать?' :
    step === 'pick-existing' ? 'Выбери папку' :
    step === 'pick-parent' ? 'Где создать новую папку?' :
    'Имя новой папки';

  const breadcrumb = [
    'Новый проект',
    selectedDevice?.name,
    step === 'pick-existing' ? 'Открыть существующую' :
    step === 'pick-parent' || step === 'name-new' ? 'Создать новую' :
    null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl flex flex-col overflow-hidden max-h-[90dvh]"
        style={{ background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header с breadcrumb + ◀ Назад (только если не на первом шаге) */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          {step !== 'device' ? (
            <button onClick={goBack} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-[var(--surface-2)]"
              style={{ color: 'var(--fg-2)' }} aria-label="Назад">
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="w-8" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold truncate">{stepTitle}</div>
            <div className="font-mono text-[10.5px] truncate" style={{ color: 'var(--muted)' }}>
              {breadcrumb}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--muted)' }} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

          {/* === ШАГ 1: выбор устройства === */}
          {step === 'device' && (
            <>
              {devices.length === 0 ? (
                <div className="text-sm px-4 py-8 text-center rounded-xl"
                  style={{ background: 'var(--accent-light)', color: 'var(--muted)' }}>
                  <div className="text-2xl mb-2">📱</div>
                  <div className="font-medium mb-1">Нет устройств</div>
                  <div className="text-xs">Подключи первое — вкладка «Устройства» внизу</div>
                </div>
              ) : (
                <>
                  {devices.map(d => {
                    const role = effectiveIntent(d);
                    const active = deviceId === d.id;
                    return (
                      <button key={d.id} type="button"
                        disabled={!d.online}
                        onClick={() => {
                          setDeviceId(d.id);
                          setClaudeDeviceId(null);
                          setParentPath(null);
                          // Автопереход на шаг action через 150мс для визуального ответа
                          setTimeout(() => setStep('action'), 120);
                        }}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl text-left disabled:opacity-40"
                        style={{
                          minHeight: 64,
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'var(--accent-light)' : 'var(--surface-2)',
                        }}>
                        <span style={{ fontSize: 22 }}>{role === 'claude' ? '🤖' : '📂'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-medium truncate">{d.name}</div>
                          <div className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                            <span style={{ color: d.online ? 'var(--ok)' : 'var(--danger)' }}>
                              {d.online ? 'онлайн' : 'оффлайн'}
                            </span>
                            {' · '}
                            <span style={{ color: role === 'claude' ? 'var(--ok)' : 'var(--fg-2)' }}>
                              {role === 'claude' ? 'claude' : 'только файлы'}
                            </span>
                          </div>
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* === ШАГ 2: выбор действия (+ при необходимости — claude-device) === */}
          {step === 'action' && (
            <>
              {/* Для fs-only устройств — селектор «где запускать Claude» */}
              {needsClaudeDevice && (
                <div className="p-3 rounded-xl flex flex-col gap-2" style={{ background: 'var(--accent-tint)', border: '1px solid var(--border)' }}>
                  <div className="text-[12.5px] font-medium">Это устройство только для файлов</div>
                  <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    Выбери где запускать Claude:
                  </div>
                  {claudeCandidates.length === 0 ? (
                    <div className="text-xs px-2 py-2 rounded" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                      Нет онлайн-устройств с Claude. Подключи хотя бы одно.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {claudeCandidates.map(d => (
                        <button key={d.id} type="button"
                          onClick={() => setClaudeDeviceId(d.id)}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm"
                          style={{
                            minHeight: 40,
                            border: `1px solid ${claudeDeviceId === d.id ? 'var(--accent)' : 'var(--border)'}`,
                            background: claudeDeviceId === d.id ? 'var(--surface)' : 'transparent',
                          }}>
                          <span>{d.kind === 'laptop' ? '💻' : '🖥'}</span>
                          <span className="flex-1">{d.name}</span>
                          <span className="font-mono text-[10px]" style={{ color: 'var(--ok)' }}>claude ✓</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Две кнопки-действия (disabled если fs-only и не выбран claude) */}
              <button type="button" disabled={!proxyOk}
                onClick={() => setStep('pick-existing')}
                className="p-4 rounded-xl text-left flex items-start gap-3 disabled:opacity-40"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  minHeight: 80,
                }}>
                <FolderOpen size={22} style={{ color: 'var(--accent)' }} />
                <div className="flex-1">
                  <div className="text-[14px] font-medium">Открыть существующую папку</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    Например, уже клонированный репозиторий
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
              </button>
              <button type="button" disabled={!proxyOk}
                onClick={() => { setParentPath(null); setStep('pick-parent'); }}
                className="p-4 rounded-xl text-left flex items-start gap-3 disabled:opacity-40"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  minHeight: 80,
                }}>
                <FolderPlus size={22} style={{ color: 'var(--vibrant)' }} />
                <div className="flex-1">
                  <div className="text-[14px] font-medium">Создать новую папку</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    Выберешь где, впишешь имя
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
              </button>

              {/* Селектор модели — для осознанного выбора «тяжёлая/лёгкая» под задачу */}
              {proxyOk && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                    Модель по умолчанию ({provider === 'gemini-cli' ? 'Gemini' : provider === 'codex-cli' ? 'Codex' : 'Claude'})
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {availableModels.map(m => {
                      const active = defaultModel === m.id;
                      return (
                        <button key={m.id} type="button"
                          onClick={() => setDefaultModel(m.id)}
                          className="flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg text-left"
                          style={{
                            minHeight: 62,
                            border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                            background: active ? 'var(--accent-light)' : 'var(--surface-2)',
                          }}>
                          <div className="flex items-center gap-1 w-full">
                            <span style={{ fontSize: 14 }}>{m.icon}</span>
                            <span className="text-[12.5px] font-medium truncate flex-1">{m.label}</span>
                          </div>
                          <div className="text-[10px] font-mono truncate w-full" style={{ color: 'var(--muted)' }}>
                            {m.tags[0]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {defaultModel && (
                    <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                      {availableModels.find(m => m.id === defaultModel)?.hint}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* === ШАГ 3a: выбор существующей папки === */}
          {(step === 'pick-existing' || step === 'pick-parent') && deviceId && (
            <>
              {step === 'pick-parent' && (
                <div className="text-[12px] px-3 py-2 rounded-lg"
                  style={{ background: 'var(--accent-light)', color: 'var(--muted)' }}>
                  Выбери <b>родительскую</b> папку. Имя новой введёшь на следующем шаге.
                </div>
              )}
              <DeviceBrowser
                deviceId={deviceId}
                deviceName={selectedDevice?.name || ''}
                initialPath={selectedDevice?.root_path || null}
                onClose={() => { /* back-arrow в header обрабатывает это */ }}
                onPick={(path) => {
                  if (step === 'pick-existing') createFromExisting(path);
                  else { setParentPath(path); setStep('name-new'); }
                }}
                pickLabel={step === 'pick-parent' ? 'Создать здесь →' : 'Выбрать эту папку'}
                embedded
              />
            </>
          )}

          {/* === ШАГ 3b: ввод имени новой папки === */}
          {step === 'name-new' && parentPath && (
            <div className="p-3 rounded-xl flex flex-col gap-2" style={{ background: 'var(--accent-light)', border: '1px solid var(--border)' }}>
              <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Создаю в папке:</div>
              <div className="text-[12px] font-mono truncate" style={{ color: 'var(--fg)' }}>{parentPath}</div>
              <label className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>Имя папки</label>
              <input value={newName} autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createNew(); }}
                placeholder="my-project"
                className="px-3 py-2.5 rounded-lg text-[14px] bg-[var(--bg)] outline-none font-mono"
                style={{ border: '1px solid var(--border)', color: 'var(--fg)', minHeight: 44 }}
              />
              <div className="text-[11px] font-mono truncate" style={{ color: 'var(--muted)' }}>
                → {parentPath}/<b>{newName || 'имя'}</b>
              </div>
              <button onClick={createNew} disabled={busy || !newName.trim()}
                className="btn btn-primary mt-2 flex items-center justify-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin" />}
                Создать проект
              </button>
            </div>
          )}

          {err && (
            <div className="text-[12.5px] px-3 py-2 rounded-lg flex items-start gap-2"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              ⚠ {err}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
