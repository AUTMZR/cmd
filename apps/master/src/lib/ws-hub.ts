import type WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { AnyMessage } from '@autmzr/command-protocol';
import { query } from './db';

/**
 * WsHub — реестр активных WebSocket-подключений агентов.
 * Живёт в одном процессе (in-memory). Next.js API routes кладут сюда
 * отправку запросов агенту и получают стрим ответов.
 */

interface AgentConnection {
  deviceId: string;
  userId: string;
  ws: WebSocket;
  name: string;
  connectedAt: number;
}

/** Подписчик на события от агента с конкретным correlation_id. */
type Subscriber = (msg: AnyMessage) => void;

class WsHub {
  private agents = new Map<string, AgentConnection>(); // deviceId -> conn
  private subs = new Map<string, Subscriber>();        // correlationId -> sub

  register(deviceId: string, userId: string, name: string, ws: WebSocket): void {
    const existing = this.agents.get(deviceId);
    if (existing) {
      try { existing.ws.close(4001, 'Replaced by new connection'); } catch {}
    }
    this.agents.set(deviceId, { deviceId, userId, ws, name, connectedAt: Date.now() });
    query(`UPDATE pc.devices SET last_online = NOW() WHERE id = $1`, [deviceId]).catch(() => {});
  }

  unregister(deviceId: string): void {
    this.agents.delete(deviceId);
  }

  isOnline(deviceId: string): boolean {
    const conn = this.agents.get(deviceId);
    if (!conn) return false;
    return conn.ws.readyState === 1 /* OPEN */;
  }

  onlineDeviceIds(): string[] {
    return [...this.agents.entries()].filter(([, c]) => c.ws.readyState === 1).map(([id]) => id);
  }

  onlineAgentCount(): number {
    return this.onlineDeviceIds().length;
  }

  /**
   * Отправляет сообщение агенту, возвращает функцию отписки.
   * onMessage получает все сообщения с correlation_id = msg.id.
   */
  send(deviceId: string, userId: string, msg: AnyMessage & { id?: string }, onMessage?: Subscriber): () => void {
    const conn = this.agents.get(deviceId);
    if (!conn) throw new Error('Device offline');
    if (conn.userId !== userId) throw new Error('Device does not belong to user');
    if (conn.ws.readyState !== 1) throw new Error('Device connection not open');

    const id = msg.id ?? uuidv4();
    const withId = { ...msg, id } as AnyMessage;

    if (onMessage) this.subs.set(id, onMessage);
    conn.ws.send(JSON.stringify(withId));
    return () => { this.subs.delete(id); };
  }

  /** Вызывается ws-сервером когда пришло сообщение от агента. */
  dispatch(msg: AnyMessage): void {
    const cid = (msg as any).correlation_id;
    if (cid && this.subs.has(cid)) {
      this.subs.get(cid)!(msg);
    }
  }

  /**
   * Подписаться на сообщения с конкретным correlation_id БЕЗ инициирующего запроса.
   * Нужно для recap/replay — когда агент переиграет события закрытого job'а.
   */
  register_job_subscriber(correlationId: string, onMessage: Subscriber): void {
    this.subs.set(correlationId, onMessage);
  }
  unregister_job_subscriber(correlationId: string): void {
    this.subs.delete(correlationId);
  }

  /** Одноразовый запрос с ожиданием reply (для команд fs.* и status.request). */
  async request<Reply extends AnyMessage>(
    deviceId: string,
    userId: string,
    msg: AnyMessage & { id?: string },
    replyType: Reply['type'],
    timeoutMs = 30_000,
  ): Promise<Reply> {
    return new Promise<Reply>((resolve, reject) => {
      let done = false;
      const killer = setTimeout(() => {
        if (done) return;
        done = true;
        unsub();
        reject(new Error(`Timeout waiting for ${replyType}`));
      }, timeoutMs);

      const unsub = this.send(deviceId, userId, msg, (reply) => {
        if (done) return;
        if (reply.type === replyType) {
          done = true;
          clearTimeout(killer);
          unsub();
          resolve(reply as Reply);
        }
      });
    });
  }
}

declare global {
  var __pc_hub: WsHub | undefined;
}

export function hub(): WsHub {
  if (!globalThis.__pc_hub) globalThis.__pc_hub = new WsHub();
  return globalThis.__pc_hub;
}
