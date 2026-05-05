export function getUserInitials(firstName?: string, lastName?: string, username: string = ''): string {
  const first = firstName?.trim();
  const last = lastName?.trim();
  const user = username.trim();

  if (first && last) {
    return `${[...first][0].toUpperCase()}${[...last][0].toUpperCase()}`;
  }

  if (first) {
    const chars = [...first].slice(0, 2).join('').toUpperCase();
    return chars.length === 1 ? `${chars}${chars}` : chars;
  }

  if (last) {
    const chars = [...last].slice(0, 2).join('').toUpperCase();
    return chars.length === 1 ? `${chars}${chars}` : chars;
  }

  if (user) {
    const chars = [...user].slice(0, 2).join('').toUpperCase();
    return chars.length === 1 ? `${chars}${chars}` : chars;
  }

  return '?';
}

export function getAvatarUrl(photoUrl?: string): string | null {
  const url = photoUrl?.trim();
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/avatars')) return url;
  return `/api/avatars/${url}`;
}

export function getAvatarColor(username?: string): string {
  const colors = [
    '#3B82F6', '#2563EB', '#4F46E5', '#0EA5E9', '#0284C7',
    '#06B6D4', '#14B8A6', '#64748B', '#334155', '#1D4ED8'
  ];
  if (!username) return colors[0];
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = username.charCodeAt(index) + ((hash << 5) - hash);
    hash = hash >>> 0; // garante inteiro de 32 bits sem sinal, evitando overflow e valores negativos
  }
  return colors[hash % colors.length];
}
