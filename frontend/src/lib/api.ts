/**
 * API client for KnowledgeHub backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Endpoints where a 401 means "the credentials you just submitted were
 * rejected" rather than "your session expired". Signing out and bouncing to
 * /login on these would throw away the very message the form needs to show.
 */
const CREDENTIAL_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

/**
 * Backoff for reads when the server cannot be reached at all.
 *
 * A dev server restarting on file change is unavailable for roughly a second
 * (measured: ~1.2s for this backend, which reloads its embedding model on
 * boot), and a laptop waking from sleep is similar. Retrying once after 400ms
 * landed inside that same window and failed again, surfacing an error the user
 * could do nothing about. These delays span ~2.7s in total.
 */
const READ_RETRY_DELAYS_MS = [300, 800, 1600];

/**
 * Ceiling on how long a single request may take before it is abandoned.
 *
 * A refused connection rejects immediately, but a server that accepts the
 * socket and never answers does not — `fetch` simply waits forever. That is
 * exactly what a stalled dev server looks like, and without a deadline the app
 * sits on its splash screen indefinitely rather than reporting anything.
 */
const REQUEST_TIMEOUT_MS = 60_000;
/** Streaming answers legitimately run for a minute; only the connection is bounded. */
const STREAM_CONNECT_TIMEOUT_MS = 60_000;
/**
 * Ingestion runs inside the upload request: parse, chunk, then embed every
 * chunk on the CPU. A single deck of ~60 chunks takes over a minute, and a
 * batch of files is processed one after another. Holding that to the default
 * deadline aborted the browser's request while the server was still working,
 * so the upload looked like a dead backend and then completed anyway.
 */
const INGEST_TIMEOUT_MS = 15 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isCredentialEndpoint(path: string) {
  return CREDENTIAL_ENDPOINTS.some((p) => path.startsWith(p));
}

/**
 * FastAPI returns `detail` as a string for HTTPException but as a list of
 * error objects for request-validation failures. Both have to end up as
 * something a human can read.
 */
function readDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((d) => (d && typeof d === 'object' ? (d as { msg?: string }).msg : null))
      .filter(Boolean);
    if (messages.length) return messages.join('. ');
  }
  return null;
}

class ApiClient {
  /** Guards the refresh call so concurrent 401s trigger exactly one refresh. */
  private refreshInFlight: Promise<boolean> | null = null;

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  }

  private clearSession() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    // Already on the login screen: a hard navigation would only reload the
    // page and wipe the error the form is about to display.
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  /**
   * Access tokens are short-lived (30 minutes). Rather than dropping the user
   * at the login screen the moment one expires, trade the refresh token for a
   * new pair once and let the caller retry.
   */
  private async refreshSession(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    if (!this.refreshInFlight) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) return false;

      this.refreshInFlight = (async () => {
        try {
          const response = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (!response.ok) return false;
          const tokens = await response.json();
          if (!tokens?.access_token) return false;
          localStorage.setItem('access_token', tokens.access_token);
          if (tokens.refresh_token) {
            localStorage.setItem('refresh_token', tokens.refresh_token);
          }
          return true;
        } catch {
          return false;
        } finally {
          // Cleared on the next tick so callers awaiting this same promise all
          // observe the result before a new attempt can start.
          setTimeout(() => {
            this.refreshInFlight = null;
          }, 0);
        }
      })();
    }

    return this.refreshInFlight;
  }

  private buildHeaders(path: string, options: RequestInit): Record<string, string> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Signing in must not depend on — or be confused by — a stale session.
    const token = isCredentialEndpoint(path) ? null : this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // The browser has to set its own multipart boundary for FormData.
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    {
      allowRefresh = true,
      timeoutMs = REQUEST_TIMEOUT_MS,
    }: { allowRefresh?: boolean; timeoutMs?: number } = {}
  ): Promise<T> {
    const send = () =>
      fetch(`${API_BASE}${path}`, {
        ...options,
        headers: this.buildHeaders(path, options),
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      });

    // Reads are safe to repeat, so a restarting server is ridden out rather
    // than reported. Writes get one attempt: a dropped connection does not
    // prove the request was never received, and silently repeating an upload
    // or a delete is worse than showing an error.
    const method = (options.method ?? 'GET').toUpperCase();
    const delays = method === 'GET' ? READ_RETRY_DELAYS_MS : [];

    let response: Response | null = null;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        response = await send();
        break;
      } catch (err) {
        // A timeout and a refused connection are reported differently: one
        // means the server is up but not answering, the other that nothing is
        // listening. Telling them apart is the difference between "restart it"
        // and "it is wedged".
        const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
        // A refused connection means the server is restarting, and retrying
        // rides it out. A timeout means it is up but not answering — retrying
        // just costs another full deadline before saying the same thing.
        if (timedOut || attempt === delays.length) {
          throw new Error(
            timedOut
              ? `The server at ${API_BASE} accepted the connection but did not respond within ${Math.round(timeoutMs / 1000)}s. It may still be working, or it may be stuck.`
              : `Could not reach the server at ${API_BASE}. Check that the backend is running.`
          );
        }
        await sleep(delays[attempt]);
      }
    }

    if (!response) {
      throw new Error(
        `Could not reach the server at ${API_BASE}. Check that the backend is running.`
      );
    }

    if (response.ok) {
      // 204s and empty bodies are valid responses with nothing to parse.
      if (response.status === 204) return undefined as T;
      return (await response.json().catch(() => undefined)) as T;
    }

    const payload = await response.json().catch(() => null);
    const detail = readDetail(payload);

    if (response.status === 401) {
      // A rejected sign-in: hand the reason back so the form can show it.
      if (isCredentialEndpoint(path)) {
        throw new Error(detail || 'Invalid email or password');
      }

      // An expired session: try to renew it once, then replay the request.
      if (allowRefresh && (await this.refreshSession())) {
        return this.request<T>(path, options, { allowRefresh: false, timeoutMs });
      }

      this.clearSession();
      throw new Error(detail || 'Your session has expired. Please sign in again.');
    }

    if (response.status === 429) {
      throw new Error(detail || 'Too many attempts. Wait a moment and try again.');
    }

    throw new Error(detail || `Request failed (${response.status})`);
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<{
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, password: string, display_name: string) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name }),
    });
  }

  async getMe() {
    return this.request<{
      id: string;
      tenant_id: string;
      email: string;
      display_name: string;
      status: string;
      roles: string[];
    }>('/api/auth/me');
  }

  // Knowledge
  async listSources() {
    return this.request<any[]>('/api/knowledge/sources');
  }

  async createSource(name: string, description?: string) {
    return this.request<{ id: string; [key: string]: any }>('/api/knowledge/sources', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async getSource(id: string) {
    return this.request<any>(`/api/knowledge/sources/${id}`);
  }

  async uploadFiles(sourceId: string, files: File[]) {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return this.request<any>(
      `/api/knowledge/sources/${sourceId}/upload`,
      { method: 'POST', body: formData },
      { timeoutMs: INGEST_TIMEOUT_MS }
    );
  }

  async deleteSource(id: string) {
    return this.request<{ message: string }>(`/api/knowledge/sources/${id}`, { method: 'DELETE' });
  }

  async deleteDocument(sourceId: string, documentId: string) {
    return this.request<{ message: string }>(`/api/knowledge/sources/${sourceId}/documents/${documentId}`, {
      method: 'DELETE',
    });
  }

  // Agents
  async listAgents(status?: string) {
    const params = status ? `?status=${status}` : '';
    return this.request<any[]>(`/api/agents${params}`);
  }

  async getAgent(id: string) {
    return this.request<any>(`/api/agents/${id}`);
  }

  async createAgent(data: any) {
    return this.request<{ id: string; [key: string]: any }>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAgent(id: string, data: any) {
    return this.request<{ message: string; id: string }>(`/api/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async publishAgent(id: string) {
    return this.request<{ message: string; id: string }>(`/api/agents/${id}/publish`, { method: 'POST' });
  }

  async archiveAgent(id: string) {
    return this.request<{ message: string; id: string }>(`/api/agents/${id}/archive`, { method: 'POST' });
  }

  async generateAgent(description: string) {
    return this.request<any>('/api/agent-builder/generate', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  // Chat
  async chat(agentId: string, message: string, conversationId?: string) {
    return this.request<any>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: agentId,
        message,
        conversation_id: conversationId,
      }),
    });
  }

  /**
   * Streaming bypasses `request` because the caller consumes the raw SSE body,
   * so the expired-session handling has to be repeated here.
   */
  async chatStream(agentId: string, message: string, conversationId?: string) {
    const url = `${API_BASE}/api/chat/stream`;
    const body = JSON.stringify({
      agent_id: agentId,
      message,
      conversation_id: conversationId,
    });

    const send = () =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(STREAM_CONNECT_TIMEOUT_MS),
      });

    let response = await send();
    if (response.status === 401 && (await this.refreshSession())) {
      response = await send();
    }
    if (response.status === 401) this.clearSession();
    return response;
  }

  // Conversations
  async listConversations() {
    return this.request<any[]>('/api/conversations');
  }

  async getMessages(conversationId: string) {
    return this.request<any[]>(`/api/conversations/${conversationId}/messages`);
  }

  // Voice
  async transcribe(audioBlob: Blob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    return this.request<{ text: string }>('/api/voice/transcribe', {
      method: 'POST',
      body: formData,
    });
  }

  // Admin
  async getOverview() {
    return this.request<any>('/api/admin/analytics/overview');
  }

  async getQueryAnalytics() {
    return this.request<any>('/api/admin/analytics/queries');
  }

  async getKnowledgeAnalytics() {
    return this.request<any>('/api/admin/analytics/knowledge');
  }

  async getSecurityAnalytics() {
    return this.request<any>('/api/admin/analytics/security');
  }

  async getAuditLogs(page = 1, pageSize = 25) {
    return this.request<any>(`/api/admin/audit?page=${page}&page_size=${pageSize}`);
  }

  async listUsers() {
    return this.request<any[]>('/api/admin/users');
  }
}

export const api = new ApiClient();
