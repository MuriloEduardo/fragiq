/**
 * Um usuário novo cujo perfil está restrito, ou que ainda não jogou CS2,
 * cairia num 404 — o que parece defeito do site em vez de estado do dado.
 */
export function SemDados() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Ainda não encontramos seu Counter-Strike 2
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-ink-muted">
        Isso acontece quando o perfil da Steam está restrito. Em{" "}
        <strong className="font-medium text-ink">Perfil → Editar perfil → Privacidade</strong>,
        deixe <strong className="font-medium text-ink">Detalhes do jogo</strong> como
        público — é o que permite ler suas estatísticas. Depois clique em Sincronizar
        aqui em cima.
      </p>
      <p className="mt-4 max-w-xl text-sm text-ink-faint">
        Se o perfil já estiver público e a mensagem continuar, pode ser que a conta
        ainda não tenha partidas registradas de CS2.
      </p>
    </main>
  );
}
