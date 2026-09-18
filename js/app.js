/* ==========================================================================
   EmeraldDexCheck — controle de capturas da Hoenn Pokédex (Ruby/Sapphire/Emerald)

   Como os dados são guardados:
   1. localStorage  -> sempre, salvamento instantâneo (rede de segurança).
   2. dados/capturas.json -> "banco de dados" em arquivo. Ao conectar o arquivo
      pelo botão "Conectar arquivo JSON", cada clique no checkbox regrava o
      arquivo no disco automaticamente (File System Access API, Chrome/Edge).
   3. Baixar / Importar JSON -> alternativa manual em qualquer navegador.
   ========================================================================== */

(function () {
  'use strict';

  var LISTA = window.POKEDEX_HOENN;
  var TOTAL = LISTA.length;
  var CHAVE_LOCAL = 'emeralddexcheck:capturas';
  var CAMINHO_JSON = 'dados/capturas.json';
  var NOME_ARQUIVO = 'capturas.json';

  // Prazo para enviar todas as criaturas (mês começa em 0: 1 = fevereiro).
  var DATA_LIMITE = new Date(2027, 1, 20);
  var UM_DIA = 24 * 60 * 60 * 1000;

  var TIPOS_PT = {
    Normal: 'Normal', Fire: 'Fogo', Water: 'Água', Grass: 'Planta',
    Electric: 'Elétrico', Ice: 'Gelo', Fighting: 'Lutador', Poison: 'Veneno',
    Ground: 'Terra', Flying: 'Voador', Psychic: 'Psíquico', Bug: 'Inseto',
    Rock: 'Pedra', Ghost: 'Fantasma', Dragon: 'Dragão', Dark: 'Sombrio',
    Steel: 'Aço',
  };

  var capturados = new Set();   // números da Pokédex já capturados
  var enviados = new Set();     // 2ª etapa: só vale para quem já está capturado
  var filtroAtual = 'todos';
  var termoBusca = '';
  var arquivoDB = null;         // FileSystemFileHandle do capturas.json, se conectado
  var temporizadorGravacao = null;

  var el = {
    grade: document.getElementById('grade'),
    vazio: document.getElementById('vazio'),
    contador: document.getElementById('contador'),
    porcentagem: document.getElementById('porcentagem'),
    contadorEnviados: document.getElementById('contador-enviados'),
    prazo: document.querySelector('.prazo'),
    prazoData: document.getElementById('prazo-data'),
    prazoDias: document.getElementById('prazo-dias'),
    prazoEnviados: document.getElementById('prazo-enviados'),
    prazoPorDia: document.getElementById('prazo-por-dia'),
    prazoDetalhe: document.getElementById('prazo-detalhe'),
    barra: document.getElementById('barra'),
    status: document.getElementById('status'),
    busca: document.getElementById('busca'),
    btnConectar: document.getElementById('btn-conectar'),
    btnBaixar: document.getElementById('btn-baixar'),
    btnImportar: document.getElementById('btn-importar'),
    btnLimpar: document.getElementById('btn-limpar'),
    inputArquivo: document.getElementById('arquivo-importar'),
  };

  var cartoes = {};             // numero -> { cartao, checkbox }

  /* ---------- Utilidades --------------------------------------------------- */

  function tresDigitos(n) {
    return String(n).padStart(3, '0');
  }

  function avisar(texto, erro) {
    el.status.textContent = texto;
    el.status.classList.toggle('erro', !!erro);
  }

  var suportaArquivo = typeof window.showOpenFilePicker === 'function';

  /* ---------- Formato do "banco de dados" JSON ------------------------------ */

  function montarJSON() {
    return {
      jogo: 'Pokémon Ruby / Sapphire / Emerald',
      pokedex: 'Hoenn',
      total: TOTAL,
      capturados: capturados.size,
      enviados: enviados.size,
      atualizadoEm: new Date().toISOString(),
      pokemon: LISTA.map(function (p) {
        return {
          numero: p.numero,
          nome: p.nome,
          capturado: capturados.has(p.numero),
          enviado: enviados.has(p.numero),
        };
      }),
    };
  }

  function aplicarJSON(dados) {
    if (!dados) return false;
    var novosCapturados = new Set();
    var novosEnviados = new Set();

    if (Array.isArray(dados.pokemon)) {
      dados.pokemon.forEach(function (p) {
        if (!p) return;
        if (p.capturado) novosCapturados.add(Number(p.numero));
        if (p.enviado) novosEnviados.add(Number(p.numero));
      });
    } else if (Array.isArray(dados.capturados)) {
      // aceita também o formato enxuto: { "capturados": [1, 4], "enviados": [1] }
      dados.capturados.forEach(function (n) { novosCapturados.add(Number(n)); });
      if (Array.isArray(dados.enviados)) {
        dados.enviados.forEach(function (n) { novosEnviados.add(Number(n)); });
      }
    } else {
      return false;
    }

    capturados = novosCapturados;
    enviados = podarEnviados(novosEnviados);
    return true;
  }

  // Regra: "enviado" é etapa seguinte de "capturado" — nunca existe sozinho.
  function podarEnviados(conjunto) {
    var limpo = new Set();
    conjunto.forEach(function (n) { if (capturados.has(n)) limpo.add(n); });
    return limpo;
  }

  /* ---------- Camada 1: localStorage --------------------------------------- */

  function salvarLocal() {
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify({
        capturados: Array.from(capturados),
        enviados: Array.from(enviados),
      }));
    } catch (e) {
      /* modo anônimo ou armazenamento bloqueado: segue sem localStorage */
    }
  }

  function carregarLocal() {
    try {
      var bruto = localStorage.getItem(CHAVE_LOCAL);
      if (!bruto) return false;
      var dados = JSON.parse(bruto);

      if (Array.isArray(dados)) {
        // formato antigo (só a lista de capturados), de antes do "Enviado"
        capturados = new Set(dados.map(Number));
        enviados = new Set();
        return true;
      }

      if (!dados || !Array.isArray(dados.capturados)) return false;
      capturados = new Set(dados.capturados.map(Number));
      enviados = podarEnviados(new Set((dados.enviados || []).map(Number)));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Camada 2: arquivo JSON no disco ------------------------------- */
  /* O handle do arquivo é guardado no IndexedDB para reconectar após recarregar. */

  function abrirBanco() {
    return new Promise(function (ok, falha) {
      var req = indexedDB.open('emeralddexcheck', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('handles'); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { falha(req.error); };
    });
  }

  function guardarHandle(handle) {
    return abrirBanco().then(function (db) {
      return new Promise(function (ok) {
        var tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'capturas');
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { ok(); };
      });
    }).catch(function () { /* IndexedDB indisponível: sem reconexão automática */ });
  }

  function lerHandleGuardado() {
    return abrirBanco().then(function (db) {
      return new Promise(function (ok) {
        var req = db.transaction('handles', 'readonly').objectStore('handles').get('capturas');
        req.onsuccess = function () { ok(req.result || null); };
        req.onerror = function () { ok(null); };
      });
    }).catch(function () { return null; });
  }

  function esquecerHandle() {
    return abrirBanco().then(function (db) {
      var tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete('capturas');
    }).catch(function () {});
  }

  function gravarArquivo() {
    if (!arquivoDB) return Promise.resolve();
    return arquivoDB.createWritable()
      .then(function (fluxo) {
        return fluxo.write(JSON.stringify(montarJSON(), null, 2)).then(function () { return fluxo.close(); });
      })
      .then(function () {
        avisar('Salvo em ' + NOME_ARQUIVO + ' às ' + new Date().toLocaleTimeString('pt-BR') + '.');
      })
      .catch(function (e) {
        avisar('Não consegui gravar o arquivo (' + e.message + '). Os dados continuam salvos no navegador.', true);
      });
  }

  function agendarGravacao() {
    if (!arquivoDB) return;
    clearTimeout(temporizadorGravacao);
    temporizadorGravacao = setTimeout(gravarArquivo, 300);
  }

  function conectarArquivo() {
    if (!suportaArquivo) {
      avisar('Este navegador não permite gravar arquivos direto do disco. Use "Baixar JSON" / "Importar JSON" (funciona no Chrome e no Edge).', true);
      return;
    }

    window.showOpenFilePicker({
      id: 'emeralddexcheck',
      multiple: false,
      types: [{ description: 'Banco de dados JSON', accept: { 'application/json': ['.json'] } }],
    }).then(function (handles) {
      arquivoDB = handles[0];
      return guardarHandle(arquivoDB).then(function () { return arquivoDB.getFile(); });
    }).then(function (arquivo) {
      return arquivo.text();
    }).then(function (texto) {
      var importou = false;
      try {
        importou = aplicarJSON(JSON.parse(texto));
      } catch (e) {
        importou = false;
      }
      if (importou) {
        salvarLocal();
        atualizarTudo();
        avisar('Conectado a ' + arquivoDB.name + '. Dados carregados do arquivo; cada clique grava nele.');
      } else {
        avisar('Conectado a ' + arquivoDB.name + '. O arquivo estava vazio/ilegível — ele será regravado com o que está marcado aqui.');
        gravarArquivo();
      }
      marcarBotaoConectado();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;      // usuário cancelou a janela
      avisar('Não foi possível conectar o arquivo: ' + e.message, true);
    });
  }

  function marcarBotaoConectado() {
    el.btnConectar.classList.add('conectado');
    el.btnConectar.textContent = 'JSON conectado ✓';
  }

  function reconectarArquivo() {
    if (!suportaArquivo) return Promise.resolve(false);

    return lerHandleGuardado().then(function (handle) {
      if (!handle) return false;
      return handle.queryPermission({ mode: 'readwrite' }).then(function (permissao) {
        if (permissao !== 'granted') {
          // O navegador exige um clique do usuário para devolver a permissão.
          el.btnConectar.textContent = 'Reconectar arquivo JSON';
          return false;
        }
        arquivoDB = handle;
        marcarBotaoConectado();
        return handle.getFile().then(function (a) { return a.text(); }).then(function (texto) {
          try { return aplicarJSON(JSON.parse(texto)); } catch (e) { return false; }
        });
      });
    }).catch(function () { return false; });
  }

  /* ---------- Camada 3: baixar / importar manualmente ----------------------- */

  function baixarJSON() {
    var blob = new Blob([JSON.stringify(montarJSON(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = NOME_ARQUIVO;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    avisar('Arquivo ' + NOME_ARQUIVO + ' baixado. Substitua o da pasta "dados" para manter o banco atualizado.');
  }

  function importarJSON(arquivo) {
    arquivo.text().then(function (texto) {
      var ok = false;
      try { ok = aplicarJSON(JSON.parse(texto)); } catch (e) { ok = false; }
      if (!ok) {
        avisar('Arquivo inválido: esperava um JSON com a lista "pokemon" ou "capturados".', true);
        return;
      }
      salvarLocal();
      agendarGravacao();
      atualizarTudo();
      avisar('Importado de ' + arquivo.name + ': ' + capturados.size + ' capturados, ' + enviados.size + ' enviados.');
    });
  }

  /* ---------- Montagem da grade -------------------------------------------- */

  function criarCartao(p) {
    // O cartão é uma <div> (e não um <label>): com dois checkboxes dentro, um
    // <label> mandaria todo clique para o primeiro deles. O clique no corpo do
    // cartão é tratado à mão em ligarEventos(); cada linha de marcação é o seu
    // próprio <label>.
    var cartao = document.createElement('div');
    cartao.className = 'cartao';
    cartao.dataset.numero = p.numero;

    var numero = document.createElement('span');
    numero.className = 'numero';
    numero.textContent = '#' + tresDigitos(p.numero);

    var img = document.createElement('img');
    img.src = p.sprite;
    img.alt = p.nome;
    img.loading = 'lazy';
    img.width = 80;
    img.height = 80;

    var nome = document.createElement('span');
    nome.className = 'nome';
    nome.textContent = p.nome;

    var tipos = document.createElement('span');
    tipos.className = 'tipos';
    p.tipos.forEach(function (t) {
      var etiqueta = document.createElement('span');
      etiqueta.className = 'tipo t-' + t.toLowerCase();
      etiqueta.textContent = TIPOS_PT[t] || t;
      tipos.appendChild(etiqueta);
    });

    var marcador = criarMarcador(p, 'capturado', 'Capturado', 'Capturei ' + p.nome);
    var marcadorEnviado = criarMarcador(p, 'enviado', 'Enviado', 'Enviei ' + p.nome);
    marcadorEnviado.classList.add('marcador-enviado');

    cartao.append(numero, img, nome, tipos, marcador, marcadorEnviado);

    cartoes[p.numero] = {
      cartao: cartao,
      caixa: marcador.querySelector('input'),
      caixaEnviado: marcadorEnviado.querySelector('input'),
    };
    return cartao;
  }

  function criarMarcador(p, campo, rotulo, descricao) {
    var marcador = document.createElement('label');
    marcador.className = 'marcador';

    var caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.dataset.numero = p.numero;
    caixa.dataset.campo = campo;
    caixa.setAttribute('aria-label', descricao);

    var texto = document.createElement('span');
    texto.textContent = rotulo;

    marcador.append(caixa, texto);
    return marcador;
  }

  function montarGrade() {
    var fragmento = document.createDocumentFragment();
    LISTA.forEach(function (p) { fragmento.appendChild(criarCartao(p)); });
    el.grade.appendChild(fragmento);
  }

  /* ---------- Atualização de tela ------------------------------------------ */

  function aplicarEstadoNoCartao(numero) {
    var ref = cartoes[numero];
    if (!ref) return;
    var capturado = capturados.has(numero);
    var enviado = enviados.has(numero);

    ref.caixa.checked = capturado;
    ref.caixaEnviado.checked = enviado;
    ref.cartao.classList.toggle('capturado', capturado);
    ref.cartao.classList.toggle('enviado', enviado);
  }

  function atualizarProgresso() {
    var qtd = capturados.size;
    var pct = Math.round((qtd / TOTAL) * 100);
    el.contador.textContent = qtd + ' / ' + TOTAL;
    el.porcentagem.textContent = pct + '%';
    el.barra.style.width = pct + '%';
    el.contadorEnviados.textContent = enviados.size
      ? enviados.size + (enviados.size === 1 ? ' enviado' : ' enviados')
      : '';
    atualizarPrazo();
  }

  /* ---------- Meta de envio até a data limite ------------------------------ */

  // Dias de calendário entre hoje e a data limite (0 = hoje é o último dia).
  function diasAteLimite() {
    var agora = new Date();
    var hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    return Math.round((DATA_LIMITE - hoje) / UM_DIA);
  }

  function atualizarPrazo() {
    var dias = diasAteLimite();
    var restantes = TOTAL - enviados.size;

    el.prazoData.textContent = DATA_LIMITE.toLocaleDateString('pt-BR');
    el.prazoEnviados.textContent = enviados.size + ' / ' + restantes;
    el.prazo.classList.remove('encerrado', 'concluido');

    if (restantes === 0) {
      el.prazo.classList.add('concluido');
      el.prazoDias.textContent = dias >= 0 ? dias + (dias === 1 ? ' dia' : ' dias') : 'Encerrado';
      el.prazoPorDia.textContent = 'Meta batida!';
      el.prazoDetalhe.textContent = 'todas as ' + TOTAL + ' enviadas';
      return;
    }

    if (dias < 0) {
      el.prazo.classList.add('encerrado');
      el.prazoDias.textContent = 'Encerrado';
      el.prazoPorDia.textContent = '—';
      el.prazoDetalhe.textContent = 'prazo vencido com ' + restantes + ' por enviar';
      return;
    }

    // No próprio dia limite ainda sobra hoje: divide por 1 em vez de 0.
    var diasParaDividir = Math.max(dias, 1);
    var mediaExata = restantes / diasParaDividir;

    el.prazoDias.textContent = dias === 0 ? 'Último dia' : dias + (dias === 1 ? ' dia' : ' dias');
    el.prazoPorDia.textContent = Math.ceil(mediaExata);
    el.prazoDetalhe.textContent = 'média exata: ' + mediaExata.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' por dia';
  }

  // Se a página ficar aberta de um dia para o outro, a contagem vira sozinha.
  function vigiarVirada() {
    var ultimoDia = new Date().toDateString();
    setInterval(function () {
      var hoje = new Date().toDateString();
      if (hoje !== ultimoDia) {
        ultimoDia = hoje;
        atualizarPrazo();
      }
    }, 60 * 1000);
  }

  function aplicarFiltros() {
    var termo = termoBusca.trim().toLowerCase();
    var visiveis = 0;

    LISTA.forEach(function (p) {
      var ref = cartoes[p.numero];
      var capturado = capturados.has(p.numero);
      var enviado = enviados.has(p.numero);

      var passaFiltro = filtroAtual === 'todos'
        || (filtroAtual === 'capturados' && capturado)
        || (filtroAtual === 'enviados' && enviado)
        || (filtroAtual === 'a-enviar' && capturado && !enviado)
        || (filtroAtual === 'faltando' && !capturado);

      var passaBusca = !termo
        || p.nome.toLowerCase().includes(termo)
        || tresDigitos(p.numero).includes(termo)
        || String(p.numero) === termo;

      var mostrar = passaFiltro && passaBusca;
      ref.cartao.hidden = !mostrar;
      if (mostrar) visiveis++;
    });

    el.vazio.hidden = visiveis > 0;
  }

  function atualizarTudo() {
    LISTA.forEach(function (p) { aplicarEstadoNoCartao(p.numero); });
    atualizarProgresso();
    aplicarFiltros();
  }

  /* ---------- Eventos ------------------------------------------------------ */

  function alternar(numero, campo, marcado) {
    if (campo === 'enviado') {
      // Só é possível enviar o que já foi capturado.
      if (marcado && capturados.has(numero)) enviados.add(numero);
      else enviados.delete(numero);
    } else if (marcado) {
      capturados.add(numero);
    } else {
      capturados.delete(numero);
      enviados.delete(numero);   // desfazer a captura desfaz o envio junto
    }

    aplicarEstadoNoCartao(numero);
    atualizarProgresso();
    salvarLocal();
    agendarGravacao();

    if (filtroAtual !== 'todos') aplicarFiltros();
    if (!arquivoDB) {
      avisar('Salvo no navegador. Conecte o ' + NOME_ARQUIVO + ' para gravar também em arquivo.');
    }
  }

  function ligarEventos() {
    el.grade.addEventListener('change', function (evento) {
      var caixa = evento.target;
      if (caixa.type !== 'checkbox') return;
      alternar(Number(caixa.dataset.numero), caixa.dataset.campo, caixa.checked);
    });

    // Clique no corpo do cartão (sprite, nome, tipos) marca/desmarca "Capturado".
    el.grade.addEventListener('click', function (evento) {
      if (evento.target.closest('.marcador')) return;   // as linhas cuidam de si
      var cartao = evento.target.closest('.cartao');
      if (!cartao) return;
      var numero = Number(cartao.dataset.numero);
      alternar(numero, 'capturado', !capturados.has(numero));
    });

    el.busca.addEventListener('input', function () {
      termoBusca = el.busca.value;
      aplicarFiltros();
    });

    document.querySelectorAll('.filtro').forEach(function (botao) {
      botao.addEventListener('click', function () {
        document.querySelectorAll('.filtro').forEach(function (b) { b.classList.remove('ativo'); });
        botao.classList.add('ativo');
        filtroAtual = botao.dataset.filtro;
        aplicarFiltros();
      });
    });

    el.btnConectar.addEventListener('click', conectarArquivo);
    el.btnBaixar.addEventListener('click', baixarJSON);
    el.btnImportar.addEventListener('click', function () { el.inputArquivo.click(); });

    el.inputArquivo.addEventListener('change', function () {
      if (el.inputArquivo.files[0]) importarJSON(el.inputArquivo.files[0]);
      el.inputArquivo.value = '';
    });

    el.btnLimpar.addEventListener('click', function () {
      if (!capturados.size) return;
      if (!confirm('Desmarcar todas as ' + capturados.size + ' criaturas capturadas (e seus envios)?')) return;
      capturados.clear();
      enviados.clear();
      salvarLocal();
      agendarGravacao();
      atualizarTudo();
      avisar('Tudo desmarcado.');
    });
  }

  /* ---------- Início ------------------------------------------------------- */

  function iniciar() {
    montarGrade();
    ligarEventos();
    atualizarPrazo();
    vigiarVirada();

    // Ordem de prioridade: arquivo conectado > localStorage > dados/capturas.json
    reconectarArquivo().then(function (veioDoArquivo) {
      if (veioDoArquivo) {
        salvarLocal();
        atualizarTudo();
        avisar('Reconectado ao ' + NOME_ARQUIVO + ': ' + capturados.size + ' de ' + TOTAL + ' capturados.');
        return;
      }

      if (carregarLocal()) {
        atualizarTudo();
        avisar(suportaArquivo
          ? 'Dados carregados do navegador. Clique em "Conectar arquivo JSON" e escolha dados/capturas.json para gravar em arquivo a cada clique.'
          : 'Dados carregados do navegador. Use "Baixar JSON" para exportar o banco.');
        return;
      }

      // Primeira visita: tenta ler o JSON que vem na pasta (precisa de servidor local).
      fetch(CAMINHO_JSON, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (dados) { if (dados) aplicarJSON(dados); })
        .catch(function () { /* aberto via file:// — começa zerado, sem problema */ })
        .then(function () {
          atualizarTudo();
          avisar(suportaArquivo
            ? 'Pronto! Marque o que já pegou. Para gravar no arquivo, clique em "Conectar arquivo JSON" e escolha dados/capturas.json.'
            : 'Pronto! Marque o que já pegou. Use "Baixar JSON" para salvar o banco em arquivo.');
        });
    });
  }

  iniciar();
})();
