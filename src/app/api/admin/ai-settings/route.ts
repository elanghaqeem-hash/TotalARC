import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import type { AiFeature, AiLevel, AiProvider } from '@/lib/ai/types';
import {
  AI_FEATURE_CATALOG,
  AI_LEVELS,
  AI_PROVIDER_DEFAULTS,
  aiKeyVaultReady,
  deleteAiAdminProviderConfig,
  environmentProviderConfigured,
  listAiAdminProviderConfigs,
  saveAiAdminProviderConfig,
  saveAiProviderOrder,
  testAiAdminProviderConfig
} from '@/lib/ai/admin-config';

export const dynamic = 'force-dynamic';

const PROVIDERS: AiProvider[] = ['openai', 'cloudflare', 'gemini', 'groq', 'openrouter'];

async function requireSystemAdmin(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution || context.profile.role !== 'SystemAdmin') return null;
  return context;
}

function providerValue(value: unknown): AiProvider | null {
  const provider = String(value || '') as AiProvider;
  return PROVIDERS.includes(provider) ? provider : null;
}

function levelValue(value: unknown): AiLevel {
  return ['FAST', 'STANDARD', 'ADVANCED'].includes(String(value || ''))
    ? (String(value) as AiLevel)
    : 'STANDARD';
}

function featureValues(value: unknown): AiFeature[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(AI_FEATURE_CATALOG.map(item => item.id));
  return Array.from(
    new Set(value.map(item => String(item)).filter(item => allowed.has(item as AiFeature)))
  ) as AiFeature[];
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'AI_ADMIN_ERROR';
  const messages: Record<string, [string, number]> = {
    AI_KEY_VAULT_NOT_CONFIGURED: [
      'Vault API key belum siap. Konfigurasikan AI_CONFIG_MASTER_KEY pada secret Cloudflare.',
      503
    ],
    AI_API_KEY_REQUIRED: [
      'API key wajib diisi saat provider eksternal pertama kali diaktifkan.',
      400
    ],
    AI_PROVIDER_CONFIG_NOT_FOUND: ['Konfigurasi provider tidak ditemukan.', 404],
    AI_PROVIDER_INVALID: ['Provider AI tidak valid.', 400],
    AI_PROVIDER_ORDER_INVALID: ['Urutan harus memuat setiap provider tepat satu kali.', 400]
  };
  const [message, status] = messages[code] || ['Konfigurasi AI tidak dapat diproses.', 500];
  if (status >= 500) console.error('AI administration failed:', error);
  return NextResponse.json({ error: message, code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  try {
    const context = await requireSystemAdmin(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const configs = await listAiAdminProviderConfigs(context.institution!.id);
    const configMap = new Map(configs.map(item => [item.provider, item]));
    const featureAssignments = AI_FEATURE_CATALOG.map(feature => {
      const candidates = configs
        .filter(item => item.enabled && item.features.includes(feature.id))
        .sort((a, b) => a.priority - b.priority);
      const primary = candidates[0] || null;
      return {
        ...feature,
        provider: primary?.provider || null,
        aiLevel: primary?.aiLevel || null,
        status: primary?.lastTestStatus || 'DEFAULT_GATEWAY',
        fallbacks: candidates.slice(1).map(item => item.provider)
      };
    });

    return NextResponse.json(
      {
        institution: { id: context.institution!.id, name: context.institution!.name },
        vaultReady: aiKeyVaultReady(),
        levels: AI_LEVELS,
        features: AI_FEATURE_CATALOG,
        providers: PROVIDERS.map(provider => ({
          provider,
          ...AI_PROVIDER_DEFAULTS[provider],
          environmentConfigured: environmentProviderConfigured(provider),
          config: configMap.get(provider) || null
        })),
        providerOrder: [...PROVIDERS].sort((a, b) =>
          (configMap.get(a)?.priority ?? (PROVIDERS.indexOf(a) + 1)) -
          (configMap.get(b)?.priority ?? (PROVIDERS.indexOf(b) + 1))),
        featureAssignments
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireSystemAdmin(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || 'SAVE').toUpperCase();
    if (action === 'REORDER') {
      const order = Array.isArray(body.order) ? body.order as AiProvider[] : [];
      const result = await saveAiProviderOrder(context.institution!.id, order, context.profile.email);
      return NextResponse.json({ ...result, message: 'Urutan penggunaan AI berhasil disimpan.' },
        { headers: { 'Cache-Control': 'no-store' } });
    }
    const provider = providerValue(body.provider);
    if (!provider) return NextResponse.json({ error: 'Provider AI tidak valid.' }, { status: 400 });

    if (action === 'TEST') {
      const result = await testAiAdminProviderConfig(context.institution!.id, provider);
      return NextResponse.json(result, {
        status: result.ok ? 200 : 422,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'DELETE') {
      return NextResponse.json(
        await deleteAiAdminProviderConfig(context.institution!.id, provider),
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (action !== 'SAVE') {
      return NextResponse.json({ error: 'Aksi tidak didukung.' }, { status: 400 });
    }

    const config = await saveAiAdminProviderConfig({
      institutionId: context.institution!.id,
      provider,
      enabled: body.enabled !== false,
      model: String(body.model || AI_PROVIDER_DEFAULTS[provider].model),
      aiLevel: levelValue(body.aiLevel),
      priority: Number(body.priority || 50),
      allowSensitive: provider === 'cloudflare' ? true : Boolean(body.allowSensitive),
      features: featureValues(body.features),
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : null,
      actor: context.profile.name || context.profile.email
    });

    return NextResponse.json(
      { config, message: 'Konfigurasi AI berhasil disimpan. Jalankan Test Koneksi sebelum digunakan.' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
