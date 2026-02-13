export function getUserInitials(firstName?: string, lastName?: string, username: string = ''): string {
  if (firstName && lastName) {
    return `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;
  }

  if (firstName) {
    const initials = firstName.substring(0, 2).toUpperCase();
    return initials.length === 1 ? `${initials}${initials}` : initials;
  }

  if (lastName) {
    const initials = lastName.substring(0, 2).toUpperCase();
    return initials.length === 1 ? `${initials}${initials}` : initials;
  }

  if (username) {
    const initials = username.substring(0, 2).toUpperCase();
    return initials.length === 1 ? `${initials}${initials}` : initials;
  }

  return '??';
}

export function getAvatarUrl(photoUrl?: string): string | null {
  if (!photoUrl) return null;
  if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) return photoUrl;
  if (photoUrl.startsWith('/api/avatars')) return photoUrl;
  return `/api/avatars/${photoUrl}`;
}

export function getAvatarColor(username: string): string {
  const colors = [
    '#3B82F6', '#2563EB', '#4F46E5', '#0EA5E9', '#0284C7',
    '#06B6D4', '#14B8A6', '#64748B', '#334155', '#1D4ED8'
  ];
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = username.charCodeAt(index) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
