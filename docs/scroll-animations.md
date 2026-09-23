# Animações de scroll

## Projeto analisado

React declarado como `^19.2.8` (lockfile resolve 19.3.0), Vite 8.3.0, JavaScript/JSX,
npm e CSS próprio. A aplicação usa `createRoot`, sem SSR/hydration ou roteador.
Framer Motion 13.4.0 e GSAP 3.15.0 foram adicionados ao package.json e lockfile.
Lenis 1.3.26, Three.js, os efeitos CSS decorativos e a introdução 3D foram reaproveitados.

Página principal: introdução cinematográfica, hero, marquee, projetos, estúdio,
metodologia, sinal e footer. Contato e FAQ continuam ocultos pelo CSS existente.
PULSAR tem hero, modelo interativo, estatísticas e fechamento, tanto no modal
quanto no arquivo independente `/pulsar.html`.

## Arquivos e responsabilidades

| Arquivo | Implementação |
| --- | --- |
| `src/animations/gsap.js` | Registro único do ScrollTrigger e exports compartilhados. |
| `src/animations/motionContext.js` | Estado compartilhado de disponibilidade e pausa. |
| `src/animations/ScrollMotion.jsx` | Provider, reveal, cascata, entrada da hero, hover/tap, palavras e progresso com `useScroll`/`useSpring`. |
| `src/animations/animations.css` | Indicador fixo de 2 px e regras que evitam concorrência com hover CSS. |
| `src/animations/useSiteScroll.js` | Parallax desktop, texto do estúdio e máscaras das artes; contexto, media queries e atualização de medidas. |
| `src/App.jsx` | Aplicação dos componentes nas tags existentes; Lenis notifica ScrollTrigger, sem segundo RAF. |
| `src/App.css` | Remoção dos reveals CSS substituídos pelo Motion. |
| `src/CinematicIntro.css` | Remoção da entrada CSS do texto/CTA assumida pelo Motion; demais efeitos preservados. |
| `src/pulsar/scrollAnimations.js` | Entrada, cascata, parallax e contadores da landing imperativa, com scroller do modal ou janela. |
| `src/pulsar/landing.js` | Conexão da landing e dos controles de pausa; marcação acessível dos contadores. |
| `src/pulsar/pulsar.css` | Reserva de espaço para os números e remoção dos reveals concorrentes. |
| `public/pulsar.html` | Export regenerado pelo build a partir da mesma implementação. |
| `tests/scroll-animations.spec.js` | Verificação de scroll, progresso, parallax, máscaras, idioma, expansão, pausa, mobile e cleanup. |
| `tests/site.spec.js`, `tests/cinematic.spec.js` | Regressões das interações existentes, handoff e seções atualmente visíveis. |

## Ajustes

Em `ScrollMotion.jsx`, `reveal` controla deslocamento (22 px), duração (0,6 s) e
easing; `cascade` controla o intervalo (0,1 s) dos pilares e serviços. O viewport
usa `once: true` e `amount: 0.3`. Os projetos observam cada card individualmente,
com atraso de 0/0,1 s por coluna, para funcionar também em grades maiores que a
viewport. A hero termina sua cascata dentro da retenção existente de um segundo.

Em `useSiteScroll.js`, ajuste os deslocamentos `-44` da cena da hero e `18/-18`
da marca do estúdio, os intervalos `start`/`end` e a máscara de 10% das artes.
Motion controla a entrada/hover dos cards; GSAP controla apenas o `clip-path`
do botão interno. O hover CSS continua controlando a escala da arte interna.
A introdução continua sendo responsável pelo transform de `.site-shell` e
`.hero-copy`. Nenhuma propriedade do mesmo elemento é disputada pelas bibliotecas.

Em `src/pulsar/scrollAnimations.js`, ajuste o parallax de 45 px, a duração de
1,25 s dos contadores e os intervalos de entrada. Só os valores existentes de
20 km e 30 rotações/s contam; ano de descoberta, números de seção e relógio
permanecem intactos. O valor final acessível ocupa o espaço original; a cópia
animada é ignorada por leitores de tela.

## Comportamento e manutenção

- Não foram adicionados pin ou scroll horizontal, pois mudariam o fluxo do layout.
- Não há transição de rota a configurar: a aplicação não usa roteamento.
- A barra mede somente o site após a introdução, sem ocupar espaço no layout.
- A pausa exibe o conteúdo final e desativa os novos efeitos. Movimento reduzido
  também elimina parallax/scrub, inclusive quando alterado durante a sessão.
- `gsap.context().revert()` libera animações e triggers. Observers, listeners e
  RAFs de atualização são removidos ao desmontar. PULSAR tem contexto próprio.
- Medidas são atualizadas após mudanças de dimensões, fontes, idioma, projetos
  e accordions. Não se altera o ciclo RAF existente do Lenis.
- `npm run build` também regenera a landing independente; não editar o HTML
  gerado manualmente. `npm run lint` e `npm run test:e2e` validam o projeto.

Referências de implementação: [contexto GSAP](https://gsap.com/docs/v3/GSAP/gsap.context()/),
[media queries GSAP](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/) e
[scroll no Motion](https://motion.dev/docs/react-scroll-animations).
