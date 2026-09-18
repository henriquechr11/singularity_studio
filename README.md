# Singularity Studio

Site institucional em React 19 + Vite, com direção visual espacial, versões PT/EN e uma introdução cinematográfica em Three.js usando o modelo `black_hole.glb`.

## Desenvolvimento

```sh
npm install
npm run dev
```

O Vite mostra o endereço local no terminal. Para gerar os arquivos de publicação, execute `npm run build`; a saída fica em `dist/`. `npm run preview` serve esse build localmente.

## Configuração do contato

Copie `.env.example` para `.env.local` e substitua:

- `VITE_CONTACT_EMAIL`: e-mail real do estúdio. O endereço padrão é demonstrativo.
- `VITE_WHATSAPP_NUMBER`: número internacional completo, somente dígitos. Sem ele, o botão flutuante leva ao formulário.

O formulário valida os campos e abre um rascunho no aplicativo de e-mail com os interesses, dados e mensagem. Também permite copiar o briefing. Não há backend, banco de dados ou confirmação de envio: o visitante conclui o envio no aplicativo de e-mail. Variáveis `VITE_*` são públicas; não coloque segredos nelas.

Os textos e projetos ficam em `src/content.js`. Os quatro projetos estão explicitamente identificados como conceitos. Localização, ano de fundação e disponibilidade são dados de demonstração a ajustar para o cliente. Clientes, prêmios e perfis sociais não foram inventados; inclua apenas os dados reais quando estiverem disponíveis.

## Cena espacial

`src/CinematicIntro.jsx` controla o canvas fixo em tela cheia, o carregamento real do GLB e a entrada no site. `src/cinematic/createScene.js` monta a cena, o disco original do modelo, o horizonte opaco, o anel de fótons, as estrelas, o bloom e a lente gravitacional estilizada. Os efeitos são uma interpretação artística.

A abertura usa um trecho de scroll de `1000svh` (10 telas) no desktop e `850svh` (8,5 telas) no mobile. O conteúdo fica visualmente fixado atrás do canvas durante a travessia; depois volta ao fluxo normal da página. A abertura mostra somente a cena, sem textos, logotipo, botões ou indicadores. A rolagem permanece livre; PageDown/Espaço avançam pelo teclado e Escape leva diretamente ao site.

| Progresso | Câmera e transição |
| --- | --- |
| Antes de rolar | Close lateral junto aos anéis, com metade do horizonte cortada pela borda direita. Um ajuste sutil de quatro segundos estabiliza o enquadramento. |
| 0–48% | Afasta a câmera até revelar o disco inteiro e recentraliza o horizonte. A pose inicial é capturada no início do scroll; FOV passa de 28° a 44°. |
| 48–90% | Avança até o interior da singularidade; FOV aumenta de 44° a 76°. |
| 84–91% | Escurecimento gradual no horizonte de eventos. |
| 92–100% | Canvas desaparece e a hero surge com fade e escala suaves. |

As coordenadas ficam em `src/cinematic/cameraPath.js`. O progresso usa damping exponencial independente da taxa de quadros e limite de velocidade para suavizar rolagens bruscas; câmera, lente, blackout e hero compartilham esse progresso. Após o primeiro scroll, a câmera permanece sob controle da rolagem, inclusive ao retornar ao topo. A travessia é reversível. Links diretos, rolagem restaurada e Escape permitem chegar ao conteúdo sem exigir a sequência inteira. A lente acompanha o centro projetado da singularidade, inclusive durante o close lateral.

- Desktop: bloom, distorção radial, separação cromática e rastro na aproximação, DPR máximo de 1,5.
- Mobile, ponteiro de toque ou memória limitada: renderização direta sem pós-processamento, menos estrelas, DPR 1 e limite de 30 FPS. O desktop também reduz efeitos se detectar quadros lentos sustentados.
- Dispositivos com até 2 GB de memória ou dois processadores lógicos, economia de dados, WebGL indisponível, perda de contexto, erro de download/decodificação ou timeout de 22 segundos: entrada estática em CSS, sem impedir acesso ao site.
- `prefers-reduced-motion`: hero imediata, sem introdução, download do GLB ou animação de câmera. Mudanças dessa preferência durante a sessão também são respeitadas.
- A cena não renderiza depois da travessia ou com a aba oculta. Recursos WebGL, passes, texturas e workers Draco são liberados ao desmontar ou ativar o fallback.
- A hero e seus controles permanecem `inert` durante a introdução. Escape transfere o foco ao título. O link de acessibilidade do site só fica disponível após a travessia para manter a abertura sem elementos sobrepostos.

`src/BlackHole.jsx` mantém a ilustração procedural leve da hero e do diálogo de exploração, com interação pelo ponteiro, zoom, pausa e fallback estático. Ela só anima na hero depois da travessia. Lenis suaviza a rolagem; os diálogos nativos mantêm navegação por teclado e fechamento por Escape.

### Modelo e otimização

O original `src/assets/black_hole.glb` é preservado. A abertura carrega `src/assets/black_hole.draco.glb`, com **2,10 MB**, contra **31,30 MB** do original (redução de **93,3%**). Para regenerar o derivado:

```sh
npm run optimize:model
```

O script converte os materiais legados para metallic/roughness, remove o planeta distante, deduplica e simplifica a geometria, comprime texturas em WebP de até 1024 px e aplica Draco. O processo conserva a autoria e copia os decodificadores para `public/draco/`; o carregamento usa arquivos locais, sem CDN. O bundle Three.js é importado sob demanda e não é solicitado no modo estático inicial ou com movimento reduzido.

Modelo **Black Hole**, por **NestaEric**: [fonte no Sketchfab](https://sketchfab.com/3d-models/black-hole-e410da98b1e5445eae2acafaaa53587d), licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). A atribuição e a indicação de adaptação aparecem no rodapé e em `public/model-credits.txt`.

Fontes: Barlow Condensed, DM Sans e Space Mono via Google Fonts, com fontes de sistema como alternativa. As artes dos projetos são feitas em CSS, sem imagens remotas.

## Verificação

```sh
npm run lint
npm run build
npm run test:e2e
```

Os testes de navegador precisam do Google Chrome instalado. A configuração em `playwright.config.js` inicia o Vite na porta 5173 automaticamente ou reutiliza o servidor local existente.

Os testes cobrem o download e decodificação do GLB, o close lateral, a ausência de textos e controles na abertura, a trajetória lenta e reversão por scroll, revelação da hero, teclado, mobile e rotação de viewport, falhas de modelo/Draco/WebGL/contexto, economia de dados, movimento reduzido inicial e alterado durante a sessão, links diretos, navegação móvel, projetos, modais, acordeão, idioma persistido e briefing. Capturas das etapas ficam em `test-results/`, ignorado pelo Git.
