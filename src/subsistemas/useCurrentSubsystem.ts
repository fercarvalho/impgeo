import { useState, useEffect, useCallback } from 'react';
import {
  resolveCurrentSubsystem,
  setSubsystemOverride,
  clearSubsystemOverride,
  type SubsystemDefinition,
} from './manifest';

/**
 * Hook que devolve o subsistema atual e permite trocar (em localhost puro,
 * sem subdomínio). Re-renderiza quando o sessionStorage muda — útil quando
 * o Picker grava o slug ou quando o usuário sai do subsistema.
 *
 * Em ambiente com subdomínio (impgeo.local ou produção), o subsistema é
 * derivado do hostname e a função `setSubsystem` redireciona — quem chama
 * decide; este hook só expõe o ponto de entrada.
 */
export function useCurrentSubsystem(): {
  subsystem: SubsystemDefinition | null;
  setSubsystem: (slug: string | null) => void;
} {
  const [subsystem, setSubsystemState] = useState<SubsystemDefinition | null>(() =>
    resolveCurrentSubsystem()
  );

  // Re-resolve em cada storage event (outra aba muda o slug) e em mount.
  useEffect(() => {
    const onStorage = () => setSubsystemState(resolveCurrentSubsystem());
    window.addEventListener('storage', onStorage);
    // Eventos de sessionStorage não disparam 'storage' — usamos um custom
    window.addEventListener('subsystem:override-changed', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('subsystem:override-changed', onStorage);
    };
  }, []);

  const setSubsystem = useCallback((slug: string | null) => {
    if (slug) setSubsystemOverride(slug);
    else clearSubsystemOverride();
    window.dispatchEvent(new CustomEvent('subsystem:override-changed'));
    setSubsystemState(resolveCurrentSubsystem());
  }, []);

  return { subsystem, setSubsystem };
}
