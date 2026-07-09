document.addEventListener('DOMContentLoaded', () => {
    const btnConfrontar = document.getElementById('btn-confrontar');
    const btnLimpar = document.getElementById('btn-limpar-conf');
    const corpoTabela = document.getElementById('corpo-tabela-confronto');
    const qtdDivergencias = document.getElementById('qtd-divergencias');

    // Filtros
    const dataInicio = document.getElementById('conf-data-inicio');
    const dataFim = document.getElementById('conf-data-fim');
    const inputCodigo = document.getElementById('conf-codigo');
    const selectSetor = document.getElementById('conf-setor');

    // Inicializa as datas com o dia de hoje por padrão
    const hoje = new Date().toISOString().split('T')[0];
    if (dataInicio) dataInicio.value = hoje;
    if (dataFim) dataFim.value = hoje;

    // --- FUNÇÃO PRINCIPAL: Dispara a busca para o Servidor Node ---
    async function executarConfronto() {
        const filtros = {
            data_inicio: dataInicio.value,
            data_fim: dataFim.value,
            codigo: inputCodigo.value.trim(),
            setor: selectSetor.value
        };

        try {
            // Colspan alterado para 9 para cobrir as novas colunas financeiras
            corpoTabela.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 2rem;">Processando e cruzando dados com o estoque analítico da CISS...</td></tr>`;

            const response = await fetch('/api/confronto/processar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filtros)
            });

            if (!response.ok) throw new Error('Erro ao processar confronto no servidor.');

            const dados = await response.json();
            renderizarConfronto(dados.linhas || []);

        } catch (erro) {
            console.error('Erro na requisição de confronto:', erro);
            corpoTabela.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #f87171; padding: 2rem;">Erro ao carregar o confronto. Verifique os logs do servidor.</td></tr>`;
        }
    }

    // --- FUNÇÃO: Renderiza as linhas dinamicamente e calcula as quebras ---
    function renderizarConfronto(linhas) {
        corpoTabela.innerHTML = '';
        let contDivergencias = 0;

        if (linhas.length === 0) {
            corpoTabela.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 2rem;">Nenhum registro encontrado para o período/filtros aplicados.</td></tr>`;
            qtdDivergencias.textContent = 0;
            return;
        }

        linhas.forEach(item => {
            const tr = document.createElement('tr');
            
            // Quantidades de bipes/etiquetas (Inteiros)
            const balancaQtd = parseInt(item.qtd_balanca) || 0;
            const pdvQtd = parseInt(item.qtd_pdv) || 0;
            const diferencaQtd = pdvQtd - balancaQtd; // Negativo = Falta no PDV (perda)

            // Valores Financeiros (Monetários)
            const balancaVlr = parseFloat(item.vlr_balanca) || 0;
            const pdvVlr = parseFloat(item.vlr_pdv) || 0;
            const diferencaVlr = pdvVlr - balancaVlr;

            let statusClasse = 'status-igual';
            let statusTexto = 'OK';

            if (diferencaQtd < 0) {
                statusClasse = 'status-falta';
                statusTexto = 'FALTA NO PDV';
                contDivergencias++;
            } else if (diferencaQtd > 0) {
                statusClasse = 'status-sobra';
                statusTexto = 'SOBRA NO PDV';
                contDivergencias++;
            }

            // Cores dinâmicas baseadas no resultado das divergências
            const corDiferenca = diferencaQtd < 0 ? '#ef4444' : (diferencaQtd > 0 ? '#f59e0b' : '#10b981');
            
            // Formatações pt-BR para exibição limpa na tabela
            const formatBalancaQtd = balancaQtd.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            const formatPdvQtd = pdvQtd.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            const formatDifQtd = diferencaQtd.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

            const formatBalancaVlr = balancaVlr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const formatPdvVlr = pdvVlr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const formatDifVlr = diferencaVlr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            tr.innerHTML = `
                <td>${item.codigo_interno || '---'}</td>
                <td>${item.codigo_barras || '---'}</td>
                <td style="font-weight: 600;">${item.produto_nome || 'PRODUTO NÃO IDENTIFICADO'}</td>
                
                <!-- Colunas de Quantidades -->
                <td style="text-align: center; font-weight: 700;">${formatBalancaQtd}</td>
                <td style="text-align: center; font-weight: 700;">${formatPdvQtd}</td>
                <td style="text-align: center; font-weight: 700; color: ${corDiferenca};">${diferencaQtd > 0 ? '+' + formatDifQtd : formatDifQtd}</td>
                
                <!-- Novas Colunas Financeiras de Valores (R$) -->
                <td style="text-align: right; font-weight: 500; padding-right: 15px;">${formatBalancaVlr}</td>
                <td style="text-align: right; font-weight: 500; padding-right: 15px;">${formatPdvVlr}</td>
                <td style="text-align: right; font-weight: 700; padding-right: 15px; color: ${corDiferenca};">${diferencaVlr > 0 ? '+' + formatDifVlr : formatDifVlr}</td>
                
                <!-- Coluna do Status do Badge -->
                <td style="text-align: center;"><span class="badge-status ${statusClasse}">${statusTexto}</span></td>
            `;

            corpoTabela.appendChild(tr);
        });

        qtdDivergencias.textContent = contDivergencias;
    }

    function limpiarFiltros() {
        dataInicio.value = ServerHoje || hoje;
        dataFim.value = ServerHoje || hoje;
        inputCodigo.value = '';
        selectSetor.value = 'todos';
        corpoTabela.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 2rem;">Preencha os filtros ao lado e clique em Executar Confronto.</td></tr>`;
        qtdDivergencias.textContent = 0;
    }

    if (btnConfrontar) btnConfrontar.addEventListener('click', executarConfronto);
    if (btnLimpar) btnLimpar.addEventListener('click', limparFiltros);
});