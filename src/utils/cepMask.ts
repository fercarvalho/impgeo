export function applyCepMask(value: string): string {
  if (!value) return '';
  const numbers = value.replace(/\D/g, '').slice(0, 8);
  if (numbers.length <= 5) return numbers;
  return `${numbers.slice(0, 5)}-${numbers.slice(5)}`;
}

export function removeCepMask(value: string): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

export function validateCepFormat(cep: string): { isValid: boolean; error?: string } {
  if (!cep || cep.trim() === '') return { isValid: true };
  const digits = removeCepMask(cep);
  if (digits.length !== 8) return { isValid: false, error: 'CEP deve ter 8 dígitos' };
  return { isValid: true };
}

export interface AddressData {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

const FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

export async function fetchAddressByCep(cep: string): Promise<AddressData | null> {
  if (!cep) return null;
  const digits = removeCepMask(cep);
  if (digits.length !== 8) return null;

  try {
    // 1. Tentar BrasilAPI primeiro (mais estável)
    const response = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v1/${digits}`);
    if (response.ok) {
      const data = await response.json();
      return {
        cep: data.cep ? String(data.cep).replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2') : digits,
        logradouro: data.street || '',
        complemento: '',
        bairro: data.neighborhood || '',
        localidade: data.city || '',
        uf: data.state || ''
      };
    }
  } catch (error) {
    console.warn('BrasilAPI falhou, tentando ViaCEP...', error);
  }

  try {
    // 2. Fallback para ViaCEP
    const response = await fetchWithTimeout(`https://viacep.com.br/ws/${digits}/json/`);
    if (response.ok) {
      const raw = await response.json();
      if (!raw.erro) {
        const data: AddressData = {
          cep: raw.cep || digits,
          logradouro: raw.logradouro || '',
          complemento: raw.complemento || '',
          bairro: raw.bairro || '',
          localidade: raw.localidade || '',
          uf: raw.uf || ''
        };
        return data;
      }
    }
  } catch (error) {
    console.error('ViaCEP também falhou:', error);
  }

  return null;
}
