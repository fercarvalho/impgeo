export function applyCepMask(value: string): string {
  const numbers = value.replace(/\D/g, '').slice(0, 8);
  if (numbers.length <= 5) return numbers;
  return `${numbers.slice(0, 5)}-${numbers.slice(5)}`;
}

export function removeCepMask(value: string): string {
  return value.replace(/\D/g, '');
}

export function validateCepFormat(cep: string): { isValid: boolean; error?: string } {
  if (!cep || cep.trim() === '') return { isValid: true };
  const digits = removeCepMask(cep);
  if (digits.length !== 8) return { isValid: false, error: 'CEP deve ter 8 dígitos' };
  if (!/^\d+$/.test(digits)) return { isValid: false, error: 'CEP deve conter apenas números' };
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

export async function fetchAddressByCep(cep: string): Promise<AddressData | null> {
  const digits = removeCepMask(cep);
  if (digits.length !== 8) return null;

  try {
    // 1. Tentar BrasilAPI primeiro (mais estável)
    const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`);
    if (response.ok) {
      const data = await response.json();
      return {
        cep: data.cep,
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
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (response.ok) {
      const data: AddressData = await response.json();
      if (!data.erro) {
        return data;
      }
    }
  } catch (error) {
    console.error('ViaCEP também falhou:', error);
  }

  return null;
}
