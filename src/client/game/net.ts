import type { ActionRequest, ApiResponse, CreateRequest, TableView } from '../../shared/types/api';

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  const json = (await res.json()) as ApiResponse<T> | { ok: false; error: string };
  if (!('ok' in json) || json.ok !== true) {
    throw new Error((json as any).error ?? 'Unknown error');
  }

  return json.data;
}

export const API = {
  create: (payload: CreateRequest) => request<TableView>('/create', payload),
  join: (code: string) => request<TableView>('/join', { code }),
  action: (payload: ActionRequest) => request<TableView>('/action', payload),
  poll: (sessionId: string) => request<TableView>('/poll', { sessionId }),
};
