import type { FixedProviderId } from '@imagen-ps/providers';
import { getProviderAccountRepository, getSecretStorageAdapter } from '../runtime.js';
import type { CommandResult, ProviderAccount } from './types.js';

/** 查询固定 provider 的单账号状态，不返回 secret value。 */
export async function listProviderAccounts(): Promise<CommandResult<readonly ProviderAccount[]>> {
  try { return { ok: true, value: await getProviderAccountRepository().list() }; }
  catch (error) { return { ok: false, error: new Error(error instanceof Error ? error.message : 'Failed to list provider accounts.') as never }; }
}

/** 保存固定 provider 的单账号 secret reference。 */
export async function saveProviderAccount(input: { readonly providerId: FixedProviderId; readonly displayName: string; readonly secretRef?: string; readonly apiKey?: string; readonly baseUrl?: string }): Promise<CommandResult<ProviderAccount>> {
  const displayName = input.displayName.trim();
  if (!displayName) return { ok: false, error: new Error('Provider account displayName must not be empty.') as never };
  const secretRef = input.secretRef ?? `secret:provider-account:${input.providerId}:apiKey`;
  if (input.apiKey !== undefined) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) return { ok: false, error: new Error('API Key must not be empty.') as never };
    await getSecretStorageAdapter().setSecret(secretRef, apiKey);
  }
  const baseUrl = input.baseUrl?.trim();
  if (baseUrl) {
    try { const parsed = new URL(baseUrl); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(); }
    catch { return { ok: false, error: new Error('Base URL must be a valid HTTP(S) URL without credentials, query or fragment.') as never }; }
  }
  const account: ProviderAccount = { providerId: input.providerId, displayName, secretRef, ...(baseUrl ? { baseUrl } : {}), updatedAt: new Date().toISOString() };
  try { await getProviderAccountRepository().save(account); return { ok: true, value: account }; }
  catch (error) { return { ok: false, error: new Error(error instanceof Error ? error.message : 'Failed to save provider account.') as never }; }
}
