# Demo Mock para GitHub Pages (IMPGEO)

Este kit habilita um **mock de API** em ambiente **estático** (GitHub Pages), para que o frontend funcione **sem backend**.

## Como usar no seu projeto
1) Copie a pasta `mock/` para a raiz do repositório.
2) No `main.tsx` (ou ponto de entrada), adicione:
```ts
if (import.meta.env.PROD && import.meta.env.VITE_USE_MOCK === 'true') {
  const { enableMock } = await import('./mock/enableMock.js');
  await enableMock();
}
```
3) Defina:
```
VITE_USE_MOCK=true
```
4) Garanta que as chamadas do front usem `/api/...` (o SW intercepta).

> É apenas para **demo**: os dados não persistem entre reloads.