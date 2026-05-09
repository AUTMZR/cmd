'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, X, FolderOpen, FolderPlus, Loader2, ChevronRight, Github, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

type Step = 'device' | 'action' | 'pick-existing' | 'pick-parent' | 'name-new'
  | 'pick-github-repo' | 'clone-progress';

interface GhRepo {
  id: number; full_name: string; name: string; private: boolean;
  description: string | null; clone_url: string; default_branch: string;
  language: string | null;
}

export default function ProjectCreateModal({ devices, onClose, onCreated }: Props) {
  const t = useTranslations('project');
  const tm = useTranslations('models');
  const modelKey = (id: string) => id.replace(/[.-]/g, '_');
  const [step, setStep] = useState<Step>('device');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [claudeDeviceId, setClaudeDeviceId] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // GitHub clone state — отдельная ветка wizard'а.
  const [ghLoading, setGhLoading] = useState(false);
  const [ghNeedConnect, setGhNeedConnect] = useState(false);
  const [ghRepos, setGhRepos] = useState<GhRepo[]>([]);
  const [ghQuery, setGhQuery] = useState('');
  const [ghPickedRepo, setGhPickedRepo] = useState<GhRepo | null>(null);
  const [cloneLog, setCloneLog] = useState('');
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneDonePath, setCloneDonePath] = useState<string | null>(null);

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
    else if (step === 'pick-existing' || step === 'pick-parent') {
      // pick-parent во время clone-flow ведёт обратно в repo-picker
      if (ghPickedRepo && step === 'pick-parent') { setStep('pick-github-repo'); return; }
      setStep('action');
    }
    else if (step === 'name-new') { setParentPath(null); setStep('pick-parent'); }
    else if (step === 'pick-github-repo') { setGhPickedRepo(null); setStep('action'); }
    else if (step === 'clone-progress') {
      // На clone-progress кнопка back закрывает stream — пользователь отменяет.
      setCloneLog(''); setCloneError(null); setCloneDonePath(null);
      setStep('pick-parent');
    }
  }

  async function loadGhRepos() {
    setGhLoading(true); setErr(''); setGhNeedConnect(false);
    try {
      const r = await fetch('/api/github/repos');
      if (r.status === 412) { setGhNeedConnect(true); return; }
      if (!r.ok) { setErr(`GitHub error ${r.status}`); return; }
      const j = await r.json();
      setGhRepos(j.repos || []);
    } catch (e: any) {
      setErr(e?.message || 'github fetch failed');
    } finally {
      setGhLoading(false);
    }
  }

  async function startClone(parent: string) {
    if (!ghPickedRepo || !deviceId) return;
    setStep('clone-progress');
    setCloneLog(''); setCloneError(null); setCloneDonePath(null);
    setBusy(true);

    const folderName = ghPickedRepo.name;
    const res = await fetch(`/api/devices/${deviceId}/git-clone`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_url: ghPickedRepo.clone_url.replace(/\.git$/, ''),
        parent_path: parent, folder_name: folderName,
        useGithubToken: ghPickedRepo.private,
      }),
    });
    if (!res.ok || !res.body) {
      setBusy(false);
      setCloneError(`HTTP ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let donePath: string | null = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const raw of lines) {
        const ln = raw.trim();
        if (!ln.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(ln.slice(5).trim());
          if (ev.type === 'out') setCloneLog(l => l + ev.text);
          else if (ev.type === 'done') donePath = ev.path;
          else if (ev.type === 'error') setCloneError(ev.message || 'clone failed');
        } catch {}
      }
    }
    setBusy(false);
    if (donePath) {
      setCloneDonePath(donePath);
      // Сразу создаём проект — clone уже сделал основную работу.
      const r = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName, device_id: deviceId, path: donePath,
          claude_device_id: needsClaudeDevice ? claudeDeviceId : null,
          default_model: defaultModel,
        }),
      });
      if (r.ok) { const j = await r.json(); onCreated(j.id); }
      else { const j = await r.json().catch(() => ({})); setCloneError(j.error || 'project create failed'); }
    }
  }

  async function createFromExisting(path: string) {
    if (needsClaudeDevice && !claudeDeviceId) { setErr(t('errPickClaude')); return; }
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
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || t('errGeneric')); return; }
    const j = await r.json();
    onCreated(j.id);
  }

  async function createNew() {
    setErr('');
    if (!parentPath || !newName.trim()) { setErr(t('errNeedName')); return; }
    if (!/^[\w.\- ]+$/.test(newName.trim())) { setErr(t('errBadChars')); return; }
    if (needsClaudeDevice && !claudeDeviceId) { setErr(t('errPickClaude')); return; }
    setBusy(true);
    const m = await fetch(`/api/devices/${deviceId}/mkdir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: parentPath, name: newName.trim() }),
    });
    if (!m.ok) {
      const j = await m.json().catch(() => ({})); setBusy(false); setErr(j.error || t('errCreateFolder')); return;
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
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || t('errGeneric')); return; }
    const j = await r.json();
    onCreated(j.id);
  }

  /* ============ BODY по шагам ============ */

  const stepTitle =
    step === 'device' ? t('stepDevice') :
    step === 'action' ? t('stepAction') :
    step === 'pick-existing' ? t('stepPickExisting') :
    step === 'pick-parent' ? t('stepPickParent') :
    step === 'pick-github-repo' ? t('stepPickGithubRepo') :
    step === 'clone-progress' ? t('stepClone') :
    t('stepName');

  const breadcrumb = [
    t('breadcrumbRoot'),
    selectedDevice?.name,
    step === 'pick-existing' ? t('breadcrumbOpenExisting') :
    (step === 'pick-parent' && !ghPickedRepo) || step === 'name-new' ? t('breadcrumbCreateNew') :
    step === 'pick-github-repo' || (step === 'pick-parent' && ghPickedRepo) || step === 'clone-progress'
      ? t('breadcrumbImportGithub') : null,
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
              style={{ color: 'var(--fg-2)' }} aria-label={t('back')}>
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
            style={{ color: 'var(--muted)' }} aria-label={t('close')}>
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
                  <div className="font-medium mb-1">{t('noDevices')}</div>
                  <div className="text-xs">{t('noDevicesHint')}</div>
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
                              {d.online ? t('deviceOnline') : t('deviceOffline')}
                            </span>
                            {' · '}
                            <span style={{ color: role === 'claude' ? 'var(--ok)' : 'var(--fg-2)' }}>
                              {role === 'claude' ? t('roleClaude') : t('roleFiles')}
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
                  <div className="text-[12.5px] font-medium">{t('fsOnlyTitle')}</div>
                  <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
                    {t('fsOnlyHint')}
                  </div>
                  {claudeCandidates.length === 0 ? (
                    <div className="text-xs px-2 py-2 rounded" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                      {t('fsOnlyNoCandidates')}
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
                  <div className="text-[14px] font-medium">{t('openExistingTitle')}</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    {t('openExistingBody')}
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
                  <div className="text-[14px] font-medium">{t('createNewTitle')}</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    {t('createNewBody')}
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
              </button>

              <button type="button" disabled={!proxyOk}
                onClick={() => { setStep('pick-github-repo'); loadGhRepos(); }}
                className="p-4 rounded-xl text-left flex items-start gap-3 disabled:opacity-40"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  minHeight: 80,
                }}>
                <Github size={22} />
                <div className="flex-1">
                  <div className="text-[14px] font-medium">{t('importGithubTitle')}</div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    {t('importGithubBody')}
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
              </button>

              {/* Селектор модели — для осознанного выбора «тяжёлая/лёгкая» под задачу */}
              {proxyOk && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                    {t('defaultModelLabel', { provider: provider === 'gemini-cli' ? 'Gemini' : provider === 'codex-cli' ? 'Codex' : 'Claude' })}
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
                            {tm(`${modelKey(m.id)}.tag`)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {defaultModel && (
                    <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                      {tm(`${modelKey(defaultModel)}.hint`)}
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
                  style={{ background: 'var(--accent-light)', color: 'var(--muted)' }}
                  dangerouslySetInnerHTML={{ __html: t('pickParentHint') }} />
              )}
              <DeviceBrowser
                deviceId={deviceId}
                deviceName={selectedDevice?.name || ''}
                initialPath={selectedDevice?.root_path || null}
                onClose={() => { /* back-arrow в header обрабатывает это */ }}
                onPick={(path) => {
                  if (step === 'pick-existing') createFromExisting(path);
                  else if (ghPickedRepo) { setParentPath(path); startClone(path); }
                  else { setParentPath(path); setStep('name-new'); }
                }}
                pickLabel={step === 'pick-parent' ? t('createHere') : t('pickFolder')}
                embedded
              />
            </>
          )}

          {/* === ШАГ 3b: ввод имени новой папки === */}
          {step === 'name-new' && parentPath && (
            <div className="p-3 rounded-xl flex flex-col gap-2" style={{ background: 'var(--accent-light)', border: '1px solid var(--border)' }}>
              <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{t('creatingIn')}</div>
              <div className="text-[12px] font-mono truncate" style={{ color: 'var(--fg)' }}>{parentPath}</div>
              <label className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>{t('folderNameLabel')}</label>
              <input value={newName} autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createNew(); }}
                placeholder="my-project"
                className="px-3 py-2.5 rounded-lg text-[14px] bg-[var(--bg)] outline-none font-mono"
                style={{ border: '1px solid var(--border)', color: 'var(--fg)', minHeight: 44 }}
              />
              <div className="text-[11px] font-mono truncate" style={{ color: 'var(--muted)' }}>
                → {parentPath}/<b>{newName || t('namePlaceholder')}</b>
              </div>
              <button onClick={createNew} disabled={busy || !newName.trim()}
                className="btn btn-primary mt-2 flex items-center justify-center gap-2">
                {busy && <Loader2 size={14} className="animate-spin" />}
                {t('createProject')}
              </button>
            </div>
          )}

          {/* === ШАГ 3c: выбор GitHub-репо === */}
          {step === 'pick-github-repo' && (
            <div className="flex flex-col gap-2">
              {ghNeedConnect ? (
                <div className="p-4 rounded-xl flex flex-col gap-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="text-[13px]">{t('connectGithubBody')}</div>
                  <a href="/api/auth/github" className="btn flex items-center justify-center gap-2"
                    style={{ background: '#24292f', color: '#fff' }}>
                    <Github size={14} /> {t('connectGithub')}
                  </a>
                </div>
              ) : (
                <>
                  <input value={ghQuery} onChange={(e) => setGhQuery(e.target.value)}
                    placeholder={t('repoSearchPlaceholder')}
                    className="px-3 py-2.5 rounded-lg text-[14px] bg-[var(--bg)] outline-none"
                    style={{ border: '1px solid var(--border)', color: 'var(--fg)' }} />
                  {ghLoading && (
                    <div className="flex items-center gap-2 px-2 py-3 text-[12.5px]" style={{ color: 'var(--muted)' }}>
                      <Loader2 size={14} className="animate-spin" />
                      {t('loadingRepos')}
                    </div>
                  )}
                  {!ghLoading && ghRepos.length === 0 && (
                    <div className="px-2 py-3 text-[12.5px]" style={{ color: 'var(--muted)' }}>
                      {t('noRepos')}
                    </div>
                  )}
                  <div className="flex flex-col gap-1 max-h-[50dvh] overflow-y-auto">
                    {ghRepos
                      .filter((r) => !ghQuery.trim() || r.full_name.toLowerCase().includes(ghQuery.toLowerCase()))
                      .map((r) => (
                        <button key={r.id} type="button"
                          onClick={() => { setGhPickedRepo(r); setStep('pick-parent'); }}
                          className="px-3 py-2.5 rounded-lg text-left flex items-start gap-2"
                          style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', minHeight: 44 }}>
                          {r.private ? <Lock size={14} style={{ color: 'var(--muted)' }} /> : <Github size={14} style={{ color: 'var(--muted)' }} />}
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium font-mono truncate">{r.full_name}</div>
                            {r.description && (
                              <div className="text-[11.5px] truncate mt-0.5" style={{ color: 'var(--muted)' }}>{r.description}</div>
                            )}
                          </div>
                          {r.language && (
                            <span className="text-[10px] font-mono shrink-0 mt-0.5" style={{ color: 'var(--muted)' }}>{r.language}</span>
                          )}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* === ШАГ 4: clone progress === */}
          {step === 'clone-progress' && ghPickedRepo && (
            <div className="flex flex-col gap-2">
              <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
                {cloneDonePath ? t('cloneDone') : cloneError ? t('cloneFailed') : t('cloning', { repo: ghPickedRepo.full_name })}
              </div>
              <pre className="font-mono text-[11px] p-3 rounded-lg whitespace-pre-wrap break-all max-h-60 overflow-y-auto"
                style={{ background: '#0a0a0a', color: '#e5e7eb', minHeight: 120 }}>
                {cloneLog || '...'}
              </pre>
              {cloneError && (
                <div className="text-[12.5px] px-3 py-2 rounded-lg" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  ✗ {cloneError}
                </div>
              )}
              {cloneDonePath && (
                <div className="text-[12.5px] px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: 'var(--accent-light)', color: 'var(--ok)' }}>
                  ✓ {t('cloneCreatedAt', { path: cloneDonePath })}
                </div>
              )}
              {busy && (
                <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--muted)' }}>
                  <Loader2 size={14} className="animate-spin" /> {t('working')}
                </div>
              )}
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
