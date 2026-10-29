import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LocalProjectError } from './errors.js';

export interface LiteProvider { base_url: string; model: string; max_turns: number; max_tokens: number }
export interface LiteCheck { name: string; command: string }
export const liteProvider = (): LiteProvider | null => {
  const path = join(homedir(), '.config/cimiloop/provider.json');
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, 'utf8')) as LiteProvider;
  const url = new URL(value.base_url);
  const config = { base_url: value.base_url.replace(/\/$/, ''), model: value.model, max_turns: value.max_turns ?? 30, max_tokens: value.max_tokens ?? 200000 };
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !config.model ||
    !Number.isSafeInteger(config.max_turns) || config.max_turns < 1 || !Number.isSafeInteger(config.max_tokens) || config.max_tokens < 1)
    throw new LocalProjectError('provider.json 配置无效', 'INVALID_COMMAND');
  return config;
};
export const liteCredential = (): string | undefined => {
  if (process.platform === 'darwin') {
    try {
      const key = execFileSync('security', ['find-generic-password', '-s', 'cimiloop-provider', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (key) return key;
    } catch { /* Environment is the documented fallback. */ }
  }
  return process.env.CIMILOOP_PROVIDER_API_KEY || undefined;
};
export const liteChecks = (dataDirectory: string): LiteCheck[] => {
  const path = join(dataDirectory, 'checks.json');
  const checks: LiteCheck[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as LiteCheck[] : [{ name: 'check', command: 'pnpm check' }];
  if (!Array.isArray(checks) || !checks.length || checks.some(check => !check.name || typeof check.command !== 'string' || !check.command.trim()) || new Set(checks.map(check => check.name)).size !== checks.length)
    throw new LocalProjectError('checks.json 需要非空的 name/command 列表', 'INVALID_COMMAND');
  return checks;
};

export type LiteMessage = { role: string; content: string | null; tool_calls?: LiteToolCall[]; tool_call_id?: string };
export interface LiteToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface LiteCompletion { choices: { message: LiteMessage }[]; usage?: { prompt_tokens: number; completion_tokens: number } }
export const liteCompletion = async (config: LiteProvider, key: string | undefined, messages: LiteMessage[], maxTokens: number, signal: AbortSignal, tools?: unknown[]): Promise<LiteCompletion> => {
  const response = await fetch(`${config.base_url}/chat/completions`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: config.model, messages, max_tokens: maxTokens, ...(tools ? { tools } : {}) })
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return await response.json() as LiteCompletion;
};
