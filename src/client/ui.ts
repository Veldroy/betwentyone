// src/client/ui.ts
export function installUI(handlers: {
  onSolo: () => Promise<void>;
  onQuick: () => Promise<void>;
  onJoin: (code: string) => Promise<void>;
  onAction: (action: 'bet'|'hit'|'stand'|'double'|'split'|'surrender'|'next') => Promise<void>;
}) {
  const solo = document.getElementById('solo')!;
  const quick = document.getElementById('quick')!;
  const join = document.getElementById('join')!;
  const code = document.getElementById('codeInput') as HTMLInputElement;
  const actions = document.getElementById('actions')!;
  solo.addEventListener('click', () => handlers.onSolo());
  quick.addEventListener('click', () => handlers.onQuick());
  join.addEventListener('click', () => handlers.onJoin(code.value.trim().toUpperCase()));

  actions.querySelectorAll('button[data-a]').forEach(b=>{
    b.addEventListener('click', ()=> handlers.onAction((b as HTMLButtonElement).dataset.a as any));
  });
}
