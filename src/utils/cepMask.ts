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
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data: AddressData = await response.json();
    if (data.erro) return null;
    return data;
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
    return null;
  }
}
