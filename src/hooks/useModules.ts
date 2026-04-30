import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:9001/api'
    : ((import.meta as any).env?.VITE_API_URL || '/api');

export interface SystemModule {
  id: string;
  name: string;
  key: string;
  icon: string;
  description: string;
  route?: string | null;
  isActive: boolean;
  isSystem: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export const useModules = () => {
  const { user, token } = useAuth();
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadModules = async () => {
    try {
      setIsLoading(true);
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE_URL}/modules-catalog`, { headers });
      if (res.ok) {
        const data = await res.json();
        setModules(Array.isArray(data) ? data : (data.data ?? []));
      }
    } catch {
      // silently ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { modules, isLoading, reload: loadModules };
};
