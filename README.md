# 🤖 Robot Warriors — Engine

**Motor de simulação e cérebro programável do [Robot Warriors](https://www.robotwarriors.app)**, um jogo de luta de robôs em que você monta o seu robô peça por peça e programa como ele luta.

> 🎮 **Jogue:** [robotwarriors.app](https://www.robotwarriors.app)
>
> Este repositório é uma **vitrine de código**: traz o núcleo do jogo (física, armas, arenas, IA e o interpretador do cérebro em blocos). A interface, o áudio, a loja e o backend ficam no repositório principal, que é privado.

![Duelo entre um cérebro programado e a IA da campanha](docs/duelo.png)

---

## A ideia

No Robot Warriors você não controla o robô na mão: você **programa o cérebro dele** com regras visuais do tipo *SE … ENTÃO …*, e ele luta sozinho contra outros robôs (IA contra IA).

![Editor de cérebro em blocos](docs/editor.png)

O robô lê as regras **de cima para baixo, 60 vezes por segundo**:
- a primeira regra válida que tem uma ação de movimento decide para onde ele anda;
- ataques e turbo de **todas** as regras válidas são somados;
- uma regra sem condição vale sempre e serve de plano padrão.

**19 sensores** (distância, ângulo e lado do inimigo, vida, energia, parede, espinho/fogo, linha de visão, alcance de cada arma…) e **9 ações** (ir até, fugir, circular, manter distância, sair do perigo, mirar, atacar, turbo…).

## O que tem aqui

```
src/
  engine.ts        simulação pura em passo fixo: física, colisões, armas, dano, armadilhas
  parts.ts         catálogo de peças (chassi, tração, blindagem, 8 armas), níveis e campanha
  arenas.ts        6 arenas em polígonos, obstáculos, espinhos, vents de fogo e geometria
  ai.ts            IA da campanha, parametrizada por dificuldade (0..1)
  brain-blocks.ts  cérebro programável: sensores, ações, interpretador, import/export
tests/             27 testes: balanço da campanha, arenas, tração, ré, cérebro em blocos
examples/duel.ts   duelo sem tela no terminal
```

## Decisões técnicas

- **Motor separado do render.** `engine.ts` não sabe que existe tela: recebe entradas e devolve estado + eventos de efeito (`drainFx()`). No jogo quem desenha é o PixiJS e o áudio 3D é feito com Web Audio; aqui o mesmo motor roda no terminal e nos testes.
- **Interpretador determinístico.** O cérebro em blocos não usa `Math.random` nem `Date.now`: os mesmos cérebros na mesma arena sempre dão o mesmo resultado. É isso que permite um **ranking** em que o servidor reproduz a luta para validar o resultado.
- **Programa = JSON puro.** Um cérebro é só dados. Vira um código compacto (`RWB2-…`) que viaja **no fragmento `#` da URL**, então dá para compartilhar por link sem nenhum servidor receber o conteúdo.
- **Entrada sempre sanitizada.** Todo programa importado passa por `sanitizeProgram()`: sensores e ações desconhecidos são descartados e o tamanho do programa é limitado antes de rodar.
- **Balanço testado por simulação.** Os testes rodam centenas de lutas IA contra IA para conferir que a campanha tem dificuldade crescente e que builds aleatórios nunca quebram a física.

## Rodar

Requer [Bun](https://bun.sh).

```bash
bun install
bun test                               # 27 testes
bun run duel                           # Lutador x Marreta na arena clássica
bun examples/duel.ts Toureiro 3 coliseu
```

Saída do duelo:

```
🤖 Lutador (cérebro em blocos) x Ferrugem (IA, dificuldade 0.25) — arena classica

t= 0s  Lutador    ████████████████████  Ferrugem      ████████████████████  ação: approach
t=10s  Lutador    █████████████░░░░░░░  Ferrugem      ████████░░░░░░░░░░░░  ação: approach
t=20s  Lutador    █████░░░░░░░░░░░░░░░  Ferrugem      ░░░░░░░░░░░░░░░░░░░░  ação: approach

🏁 Vencedor: Lutador em 20.1s
```

Parâmetros: `bun examples/duel.ts [modelo] [oponente 0-5] [arena]`
Modelos: `Lutador`, `Atirador`, `Toureiro`. Arenas: `classica`, `octogono`, `coliseu`, `cruz`, `fabrica`, `corredor`.

## O jogo completo

Além deste motor, o Robot Warriors em produção tem:

| Parte | Stack |
|---|---|
| Front-end | Next.js 16, React 19, PixiJS 8 (render vetorial e partículas), PWA offline-first |
| Áudio | Web Audio API sintetizado em tempo real: som 3D (HRTF), oclusão por parede, reverberação por arena, Doppler |
| Backend | Rotas de API do Next.js, Prisma 7, Postgres (Neon), Better Auth |
| Pagamentos | Compra de créditos via Pix (Asaas), webhooks, livro-razão de créditos e reconciliação por cron |
| Ranking | Ranking de cérebros por arena e por adversário, com validação no servidor |
| Infra | Vercel, git flow com ambiente `develop` e deploy de preview por PR, cada um com uma branch própria do banco |

## Autor

**Humberto Cruz**: desenvolvedor full-stack (Next.js, Node, Prisma).
[LinkedIn](https://www.linkedin.com/in/humbertocruz-dev/) · [robotwarriors.app](https://www.robotwarriors.app)

---

© 2026 Humberto Cruz. Código publicado para fins de portfólio: pode ler, rodar e estudar à vontade, mas não pode usar comercialmente nem redistribuir sem autorização.
