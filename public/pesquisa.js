document.addEventListener('DOMContentLoaded', () => {
    // --- Mapeamento dos Elementos da Interface ---
    const btnPesquisar = document.getElementById('btn-pesquisar');
    const btnLimpar = document.getElementById('btn-limpar');
    const corpoTabela = document.getElementById('corpo-tabela-pesquisa');
    const qtdRegistros = document.getElementById('qtd-registros');
    const limitePagina = document.getElementById('limite-pagina');
    const controlesPaginacao = document.getElementById('controles-paginacao');

    // Filtros
    const inputTermo = document.getElementById('busca-term'); // Ajuste se o ID for sutilmente diferente
    const inputTermoGeral = document.getElementById('busca-termo') || inputTermo;
    const selectSetor = document.getElementById('filtro-setor');
    const selectLeitor = document.getElementById('filtro-leitor');
    const inputProduto = document.getElementById('busca-produto');
    const inputInterno = document.getElementById('busca-interno');
    const dataInicio = document.getElementById('data-inicio');
    const dataFim = document.getElementById('data-fim');

    // Painel de Detalhes (Direita)
    const detalheEan = document.getElementById('detalhe-ean');
    const detalheInterno = document.getElementById('detalhe-interno');
    const detalheNome = document.getElementById('detalhe-nome');
    const detalheDescricao = document.getElementById('detalhe-descricao');
    const detalheSetor = document.getElementById('detalhe-setor');
    const detalheValor = document.getElementById('detalhe-valor');
    const detalheData = document.getElementById('detalhe-data');
    const detalheBalanca = document.getElementById('detalhe-balanca');
    const btnCopiarEan = document.getElementById('btn-copiar-ean');

    // Estado da paginação local
    let paginaAtual = 1;
    let totalItens = 0;

    // --- FUNÇÃO: Buscar Dados do Servidor ---
    async function executarPesquisa() {
        const limite = parseInt(limitePagina.value) || 10;

        const filtros = {
            termo: inputTermoGeral ? inputTermoGeral.value.trim() : '',
            setor: selectSetor ? selectSetor.value : 'todos',
            leitor_id: selectLeitor ? selectLeitor.value : 'todos',
            produto_nome: inputProduto ? inputProduto.value.trim() : '',
            codigo_interno: inputInterno ? inputInterno.value.trim() : '',
            data_inicio: dataInicio ? dataInicio.value : '',
            data_fim: dataFim ? dataFim.value : '',
            limite: limite,
            pagina: paginaAtual
        };

        try {
            corpoTabela.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8;">Buscando registros...</td></tr>`;

            const response = await fetch('/api/pesquisar-leituras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filtros)
            });

            if (!response.ok) throw new Error('Erro na resposta do servidor');

            const dados = await response.json();

            totalItens = dados.total || 0;
            qtdRegistros.textContent = totalItens;

            renderizarTabela(dados.registros || []);
            renderizarPaginacao(limite);

        } catch (erro) {
            console.error('Erro ao buscar dados:', erro);
            corpoTabela.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #f87171;">Erro ao carregar dados da busca.</td></tr>`;
        }
    }

    // --- FUNÇÃO: Renderizar Linhas na Tabela HTML ---
    function renderizarTabela(registros) {
        corpoTabela.innerHTML = '';

        if (registros.length === 0) {
            corpoTabela.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8;">Nenhum registro encontrado para os filtros aplicados.</td></tr>`;
            return;
        }

        registros.forEach(reg => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';

            // CORREÇÃO: Verificação flexível (pega "açougue", "acougue", com ou sem acentos)
            const setorTexto = (reg.setor || '').toLowerCase();
            const classeBadge = (setorTexto.includes('acougue') || setorTexto.includes('açougue')) ? 'badge-acougue' : 'badge-frios';

            tr.innerHTML = `
                <td>${formatarData(reg.data_hora_pi || reg.data_hora)}</td>
                <td>${reg.codigo_barras || reg.codigo_ean || ''}</td>
                <td>${reg.codigo_interno || ''}</td>
                <td style="font-weight: 600;">${reg.produto_nome || ''}</td>
                <td style="text-align: center;"><span class="badge ${classeBadge}">${(reg.setor || '').toUpperCase()}</span></td>
                <td style="text-align: right; font-weight: 700;">${parseFloat(reg.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="text-align: center;">${reg.leitor_id || ''}</td>
            `;

            // Evento de Clique na Linha: Alimenta o Painel da Direita
            tr.addEventListener('click', () => {
                document.querySelectorAll('#corpo-tabela-pesquisa tr').forEach(r => r.classList.remove('linha-selecionada'));
                tr.classList.add('linha-selecionada');

                if (detalheEan) detalheEan.textContent = reg.codigo_barras || reg.codigo_ean || '---';
                if (detalheInterno) detalheInterno.textContent = reg.codigo_interno || '---';
                if (detalheNome) detalheNome.textContent = reg.produto_nome || '---';
                if (detalheDescricao) detalheDescricao.textContent = reg.produto_descricao || reg.produto_nome || '---';

                if (detalheSetor) {
                    detalheSetor.textContent = (reg.setor || '').toUpperCase();
                    detalheSetor.className = `badge ${classeBadge}`;
                }

                if (detalheValor) detalheValor.textContent = parseFloat(reg.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                if (detalheData) detalheData.textContent = formatarData(reg.data_hora_pi || reg.data_hora);
                if (detalheBalanca) detalheBalanca.textContent = reg.leitor_id || '---';
            });

            corpoTabela.appendChild(tr);
        });
    }

    // --- CORREÇÃO: FUNÇÃO DE PAGINAÇÃO DINÂMICA ---
    function renderizarPaginacao(limite) {
        if (!controlesPaginacao) return;
        controlesPaginacao.innerHTML = '';

        const totalPaginas = Math.ceil(totalItens / limite) || 1;

        // Se só tiver 1 página, não precisa exibir os botões
        if (totalPaginas <= 1) return;

        // Botão Voltar (<)
        const btnAnterior = document.createElement('button');
        btnAnterior.className = 'btn-pag';
        btnAnterior.innerHTML = '&lt;';
        btnAnterior.disabled = paginaAtual === 1;
        btnAnterior.addEventListener('click', () => {
            if (paginaAtual > 1) {
                paginaAtual--;
                executarPesquisa();
            }
        });
        controlesPaginacao.appendChild(btnAnterior);

        // Renderiza os botões numéricos
        for (let i = 1; i <= totalPaginas; i++) {
            // Limita a exibição se houver páginas demais (opcional, mostra até 5 páginas por vez)
            if (i < paginaAtual - 2 || i > paginaAtual + 2) continue;

            const btnNum = document.createElement('button');
            btnNum.className = `btn-pag ${i === paginaAtual ? 'ativo' : ''}`;
            btnNum.textContent = i;

            btnNum.addEventListener('click', () => {
                paginaAtual = i;
                executarPesquisa();
            });

            controlesPaginacao.appendChild(btnNum);
        }

        // Botão Avançar (>)
        const btnProximo = document.createElement('button');
        btnProximo.className = 'btn-pag';
        btnProximo.innerHTML = '&gt;';
        btnProximo.disabled = paginaAtual === totalPaginas;
        btnProximo.addEventListener('click', () => {
            if (paginaAtual < totalPaginas) {
                paginaAtual++;
                executarPesquisa();
            }
        });
        controlesPaginacao.appendChild(btnProximo);
    }

    // --- FUNÇÕES AUXILIARES ---
    function formatarData(dataString) {
        if (!dataString) return '---';
        try {
            const data = new Date(dataString);
            if (isNaN(data.getTime())) return dataString;
            return data.toLocaleString('pt-BR');
        } catch (e) {
            return dataString;
        }
    }

    function limparFormulario() {
        if (inputTermoGeral) inputTermoGeral.value = '';
        if (selectSetor) selectSetor.value = 'todos';
        if (selectLeitor) selectLeitor.value = 'todos';
        if (inputProduto) inputProduto.value = '';
        if (inputInterno) inputInterno.value = '';
        if (dataInicio) dataInicio.value = '';
        if (dataFim) dataFim.value = '';
        paginaAtual = 1;
        executarPesquisa();
    }

    // --- CORREÇÃO: Ação do Botão Copiar EAN (Compatível com IP de Rede Interna / Sem HTTPS) ---
    if (btnCopiarEan && detalheEan) {
        btnCopiarEan.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita qualquer comportamento estranho de clique

            const ean = detalheEan.textContent.trim();
            if (!ean || ean === '---') return;

            // Método 1: Tenta o padrão moderno (Se tiver HTTPS ou for localhost)
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(ean)
                    .then(() => darFeedbackVisual())
                    .catch(err => usarMetodoAntigo(ean));
            } else {
                // Método 2: Fallback para IP de rede (http://128.128.1.241:3000)
                usarMetodoAntigo(ean);
            }
        });
    }

    // Função de Fallback para garantir a cópia em conexões HTTP por IP
    function usarMetodoAntigo(texto) {
        try {
            const inputTemporario = document.createElement('textarea');
            inputTemporario.value = texto;
            // Joga o elemento para fora da tela para o operador não ver
            inputTemporario.style.position = 'fixed';
            inputTemporario.style.opacity = '0';
            document.body.appendChild(inputTemporario);

            inputTemporario.select();
            inputTemporario.setSelectionRange(0, 99999); // Para dispositivos móveis se necessário

            const copiou = document.execCommand('copy');
            document.body.removeChild(inputTemporario);

            if (copiou) {
                darFeedbackVisual();
            } else {
                console.error('Não foi possível copiar o texto automaticamente.');
            }
        } catch (err) {
            console.error('Erro no método de cópia alternativo:', err);
        }
    }

    // Controla o check verde rápido no botão para avisar que deu certo
    function darFeedbackVisual() {
        const iconeOriginal = btnCopiarEan.innerHTML;
        // Injeta um check verde sutil
        btnCopiarEan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        setTimeout(() => {
            btnCopiarEan.innerHTML = iconeOriginal;
        }, 1200);
    }

    // --- LISTENERS ---
    if (btnPesquisar) {
        btnPesquisar.addEventListener('click', () => {
            paginaAtual = 1;
            executarPesquisa();
        });
    }

    if (btnLimpar) btnLimpar.addEventListener('click', limparFormulario);

    if (limitePagina) {
        limitePagina.addEventListener('change', () => {
            paginaAtual = 1;
            executarPesquisa();
        });
    }

    // Inicializa a primeira busca automática
    executarPesquisa();
});