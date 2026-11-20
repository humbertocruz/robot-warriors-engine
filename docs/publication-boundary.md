# Publicação seletiva do motor — auditoria de escopo

**Situação:** análise de publicação, não autorização para espelhar todo o repositório privado.  
**Origem:** `humbertocruz/Robot-Warriors` (`src/game/`); **destino:** este repositório (`src/`, `tests/`).

## Critérios

1. O código deve ter valor demonstrável por si só: simulação determinística, algoritmos, testes ou exemplos.
2. Não incluir autenticação, pagamentos, API, banco de dados, telemetria de jogadores, segredos, configurações de produção nem artefatos com dados reais.
3. Evitar publicar regras comerciais sensíveis (preços, concessões de créditos, antifraude, campanhas e parâmetros de monetização). Mesmo código sem segredo pode revelar estratégias.
4. Não copiar arquivos cegamente: o snapshot público tem imports e estruturas diferentes. Toda mudança deve compilar, executar testes e preservar exemplos.
5. Revisar licença e direitos de distribuição de código, imagens, áudio e bibliotecas antes de adicionar novos materiais.

## Matriz de decisão

| Origem privada | Decisão | Justificativa / condição |
| --- | --- | --- |
| `src/game/processors.ts` | **Publicar, com revisão** | Algoritmos de capacidade e compatibilidade do firmware são demonstráveis. Separar preços de processadores se forem regras comerciais. |
| `src/game/firmware.ts` | **Publicar, após adaptação** | IA de direção/ataque/defesa é uma demonstração central; depende de engine, arenas, peças, cérebro e processors. |
| `src/game/hybrid-control.ts` | **Publicar, após adaptação** | Combinação de controle manual/automático, sem dependências de backend. |
| `src/game/minefield.ts`, `electric-zone.ts`, `moving-wall.ts` | **Publicar, após adaptação** | Algoritmos de hazards gerados por semente e estados de arena. |
| `src/game/ai.ts`, `engine.ts`, `brain-blocks.ts` | **Publicar apenas diff revisado** | Já existem versões públicas; integrar melhorias sem substituir o snapshot e quebrar os exemplos. |
| `src/game/arena-hazards.test.ts`, `firmware-safety.test.ts`, `firmware-escape.test.ts`, `combat-balance.test.ts` | **Publicar com módulos correspondentes** | Testes são evidência técnica, mas dependem das APIs novas; adaptar imports `src/game` → `src`/`tests`. |
| `src/game/technology.ts` | **Revisar antes de publicar** | Mistura progressão, desbloqueios e parâmetros de produto; extrair apenas a lógica genérica. |
| `src/game/story.ts`, `career-reward.test.ts`, `progression.test.ts` | **Revisar caso a caso** | Já existe exemplo público de Carreira, mas detalhes novos de recompensas/economia exigem avaliação comercial. |
| `src/game/ranking.ts` | **Manter snapshot, avaliar diferenças** | Versão pública já existe; não publicar configurações de temporada/serviço sem revisão. |
| `src/components/`, `src/app/`, `src/game/storage.ts` | **Não copiar** | UI comercial, fluxos da aplicação e persistência não são necessários para a vitrine de engine. |
| `prisma/`, `src/app/api/`, integrações Asaas/OAuth, `.env*`, Vercel, logs e dados | **Privado** | Superfície de segurança, dados pessoais e operações comerciais. |
| `public/sprites/`, scripts Blender, efeitos e áudio | **Fora do escopo por enquanto** | Exigem revisão de autoria/licenças e não são necessários para executar o motor sem interface. |

## Observações verificadas

- `src/firmware.ts`, `src/processors.ts` e `src/game/firmware.ts` **não existiam** neste snapshot público durante a inspeção.
- O firmware privado importa `./engine`, `./arenas`, `./processors`, `./parts` e `./brain-blocks`; publicar só esse arquivo não basta.
- `parts.ts`, `arenas.ts` e `ranking.ts` tinham o mesmo tamanho nas duas versões consultadas. **Tamanho igual não significa conteúdo igual**; conferir hashes/diffs antes de qualquer substituição.
- `engine.ts`, `ai.ts`, `brain-blocks.ts` e `story.ts` têm tamanhos diferentes; a sincronização requer diff e adaptação.
- A vitrine atual usa `src/` e `tests/`; a aplicação privada usa `src/game/`.

## Plano de integração sem exposição acidental

1. Criar branch dedicada para **código público** (separada desta auditoria).
2. Portar `processors.ts` (removendo ou isolando preços) e `hybrid-control.ts`, com testes independentes.
3. Portar geradores de hazards e respectivos testes; adaptar interfaces do motor público.
4. Portar firmware e melhorias de navegação com testes de segurança e simulação; revisar dependências transitivas.
5. Atualizar exemplos de duelo, documentação e contagem real de testes.
6. Executar `bun test` e `bun run typecheck`; conferir diff para segredos, dados privados e lógica comercial antes de merge.
7. Fazer revisão humana do PR público antes de integrar. **Não copiar em lote** o conteúdo de `src/game/`.

**Resultado esperado:** vitrine executável, educativa e tecnicamente fiel ao motor, sem divulgar a infraestrutura comercial do jogo.
