'use client';

import { useEffect, useState } from 'react';
import { LinkSimple, Plus, Trash } from '@phosphor-icons/react';
import { apiFetch, maskDocument } from '../_components/api';
import { Card, EmptyState, PageHeader, PlatformBadge, StatusBadge } from '../_components/DashboardChrome';

type Account = {
  id: string;
  nome: string;
  cpf_cnpj: string;
  platform: 'mercadolivre' | 'shopee' | 'tiktokshop';
  status: string;
  channel_ids?: Record<string, string>;
};

const emptyForm = { nome: '', cpf_cnpj: '', platform: 'mercadolivre' as Account['platform'] };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [channels, setChannels] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState('');

  async function load() {
    setAccounts(await apiFetch<Account[]>('/accounts'));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function createAccount() {
    await apiFetch('/accounts', { method: 'POST', body: JSON.stringify(form) });
    setForm(emptyForm);
    await load();
  }

  async function connect(account: Account) {
    const response = await apiFetch<{ url: string }>(`/accounts/${account.id}/auth/url`);
    window.open(response.url, '_blank', 'noopener,noreferrer');
  }

  async function saveChannels(account: Account) {
    await apiFetch(`/accounts/${account.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ channel_ids: { ...(account.channel_ids ?? {}), ...(channels[account.id] ?? {}) } }),
    });
    await load();
  }

  async function removeAccount(account: Account) {
    await apiFetch(`/accounts/${account.id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <>
      <PageHeader title="Contas" description="Gerencie CPFs/CNPJs, OAuth das plataformas e canais de publicação." />
      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
          <input className="input-glass" placeholder="Nome da conta" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
          <input className="input-glass" placeholder="CPF/CNPJ" value={form.cpf_cnpj} onChange={(event) => setForm({ ...form, cpf_cnpj: event.target.value })} />
          <select className="select" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value as Account['platform'] })}>
            <option value="mercadolivre">Mercado Livre</option>
            <option value="shopee">Shopee</option>
            <option value="tiktokshop">TikTok Shop</option>
          </select>
          <button className="btn-primary-sm justify-center" onClick={createAccount}>
            <Plus size={15} /> Adicionar
          </button>
        </div>
      </Card>

      {accounts.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{account.nome}</h2>
                  <p className="text-xs text-zinc-500">{maskDocument(account.cpf_cnpj)}</p>
                </div>
                <StatusBadge value={account.status} />
              </div>
              <div className="mt-3">
                <PlatformBadge value={account.platform} />
              </div>
              <div className="mt-4 grid gap-2">
                {['tiktok', 'youtube', 'instagram', 'instagram_user_id'].map((channel) => (
                  <input
                    key={channel}
                    className="input-glass"
                    placeholder={channel}
                    defaultValue={account.channel_ids?.[channel] ?? ''}
                    onChange={(event) =>
                      setChannels((current) => ({
                        ...current,
                        [account.id]: { ...(current[account.id] ?? {}), [channel]: event.target.value },
                      }))
                    }
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary-sm" onClick={() => connect(account)}>
                  <LinkSimple size={15} /> Conectar
                </button>
                <button className="btn-glass-pill" onClick={() => saveChannels(account)}>
                  Vincular canais
                </button>
                <button className="btn-glass-pill text-rose-300" onClick={() => removeAccount(account)}>
                  <Trash size={15} /> Remover
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Nenhuma conta cadastrada.</EmptyState>
      )}
    </>
  );
}
