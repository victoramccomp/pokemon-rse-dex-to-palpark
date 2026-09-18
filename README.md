# EmeraldDexCheck

Controle de capturas da **Hoenn Pokédex** (Pokémon Ruby / Sapphire / Emerald) — as 202 criaturas
na ordem numérica original, cada uma com checkboxes embaixo. O que você marca é gravado num
arquivo JSON que funciona como banco de dados.

Cada criatura tem duas etapas:

| Etapa | Checkbox | Fundo do card |
| --- | --- | --- |
| 1ª | **Capturado** | verde claro |
| 2ª | **Enviado** | amarelo (sobrescreve o verde) |

O checkbox **"Enviado" só aparece depois que "Capturado" está marcado** — e desmarcar o
"Capturado" desfaz o envio junto, já que uma etapa depende da outra.

Feito só com **HTML, CSS e JavaScript** — sem frameworks, sem build, sem dependências.

## Como abrir

**Opção 1 — servidor local (recomendado):** dê dois cliques em `iniciar-servidor.bat`.
Ele sobe um servidor em `http://localhost:5178` e abre o navegador. Precisa do Python instalado.

**Opção 2 — direto no arquivo:** dê dois cliques em `index.html`. Funciona, mas o navegador
bloqueia a leitura automática de `dados/capturas.json` no modo `file://` (as marcações ficam
salvas no navegador normalmente).

## Como o JSON é atualizado

O banco de dados é o arquivo **`dados/capturas.json`**. Como uma página web não pode escrever no
disco sozinha (por segurança do navegador), existem três camadas:

| Camada | Quando age | Precisa de quê |
| --- | --- | --- |
| **Navegador (localStorage)** | Sempre, a cada clique | nada |
| **Gravação no `capturas.json`** | A cada clique, depois de conectar o arquivo | Chrome ou Edge |
| **Baixar / Importar JSON** | Manual, quando você quiser | qualquer navegador |

**Para ligar a gravação automática no arquivo:** clique em **"Conectar arquivo JSON"** e escolha
`dados/capturas.json` na pasta do projeto. A partir daí, todo checkbox marcado ou desmarcado
regrava o arquivo no disco na hora, e o rodapé do cabeçalho mostra a hora do último salvamento.
Essa autorização é pedida uma vez por navegador; ao reabrir a página, se o Chrome pedir de novo,
basta clicar em "Reconectar arquivo JSON".

Em navegadores sem essa API (Firefox, Safari), use **"Baixar JSON"** e substitua o arquivo da
pasta `dados` quando quiser atualizar o banco.

### Formato do arquivo

```json
{
  "jogo": "Pokémon Ruby / Sapphire / Emerald",
  "pokedex": "Hoenn",
  "total": 202,
  "capturados": 3,
  "enviados": 1,
  "atualizadoEm": "2026-09-18T15:41:36.119Z",
  "pokemon": [
    { "numero": 1, "nome": "Treecko", "capturado": true, "enviado": true },
    { "numero": 2, "nome": "Grovyle", "capturado": true, "enviado": false },
    { "numero": 3, "nome": "Sceptile", "capturado": false, "enviado": false }
  ]
}
```

Na importação também é aceito o formato enxuto
`{ "capturados": [1, 2, 4], "enviados": [1] }`. Em qualquer entrada, um `enviado: true` sem o
`capturado: true` é descartado — a regra das duas etapas vale também para o arquivo.

## Recursos da tela

- Contador e barra de progresso (`X / 202` e porcentagem), mais o total de enviados.
- Busca por nome ou número (`mudkip`, `007`, `150`).
- Filtros **Todos / Capturados / Enviados / A enviar / Faltando** ("A enviar" = capturado que
  ainda não foi enviado).
- **Limpar tudo** desmarca a Pokédex inteira, capturas e envios (com confirmação).
- Clicar no corpo do card (sprite, nome, tipos) marca/desmarca **Capturado**; as duas linhas de
  checkbox respondem cada uma pelo seu próprio estado.

## Estrutura

```
EmeraldDexCheck/
├── index.html             página única
├── css/estilo.css         estilo, cores por tipo, verde de capturado e amarelo de enviado
├── js/pokemons.js         os 202 Pokémon em ordem (nome + tipos)
├── js/app.js              estado, filtros e as três camadas de persistência
├── dados/capturas.json    banco de dados
├── sprites/               202 sprites (.png) baixados do pokemondb
└── iniciar-servidor.bat   atalho opcional para subir o servidor local (uso local, não no site)
```

## Créditos

Lista, ordem e sprites: [pokemondb.net](https://pokemondb.net/pokedex/game/ruby-sapphire-emerald).
Pokémon © Nintendo / Game Freak / The Pokémon Company. Projeto pessoal, sem fins comerciais.
