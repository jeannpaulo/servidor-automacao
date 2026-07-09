// Variáveis globais para armazenar as instâncias dos gráficos e podermos resetá-los
let chartLinha = null;
let chartDonut = null;

// Executa assim que a página carrega
document.addEventListener("DOMContentLoaded", () => {
    // Escuta alterações nos botões de filtros da tela
    document.getElementById("chart-filter").addEventListener("change", (e) => carregarDadosDashboard(e.target.value));
    document.getElementById("donut-filter").addEventListener("change", (e) => sincronizarFiltros(e.target.value));
    document.getElementById("financial-filter").addEventListener("change", (e) => sincronizarFiltros(e.target.value));

    // Carga inicial (Padrão: Hoje)
    carregarDadosDashboard("hoje");
});

// Mantém todos os seletores com o mesmo período selecionado para fazer sentido visual
function sincronizarFiltros(periodo) {
    document.getElementById("chart-filter").value = periodo;
    document.getElementById("donut-filter").value = periodo;
    document.getElementById("financial-filter").value = periodo;
    carregarDadosDashboard(periodo);
}

// Busca os dados do SQLite via API do servidor Node
async function carregarDadosDashboard(periodo) {
    try {
        const resposta = await fetch(`/api/dashboard/dados?filtro=${periodo}`);
        if (!resposta.ok) throw new Error("Erro na requisição da API");
        
        const dados = await resposta.json();
        
        // 1. Atualiza Cards de Quantidade (Topo)
        document.querySelector(".card.blue .card-value").innerText = dados.cards.total_geral || 0;
        document.querySelector(".card.red .card-value").innerText = dados.cards.total_acougue || 0;
        document.querySelector(".card.dark-blue .card-value").innerText = dados.cards.total_frios || 0;

        // Calcula as porcentagens de participação de forma segura
        const percAcougue = dados.cards.total_geral ? ((dados.cards.total_acougue / dados.cards.total_geral) * 100).toFixed(1) : 0;
        const percFrios = dados.cards.total_geral ? ((dados.cards.total_frios / dados.cards.total_geral) * 100).toFixed(1) : 0;
        
        document.querySelector(".card.red .card-subtitle").innerText = `${percAcougue}% do total`;
        document.querySelector(".card.dark-blue .card-subtitle").innerText = `${percFrios}% do total`;

        // 2. Atualiza Bloco Financeiro (Faturamento e Ticket Médio)
        const formatarMoeda = (valor) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        document.getElementById("fat-acougue").innerText = formatarMoeda(dados.financeiro.fat_acougue);
        document.getElementById("ticket-acougue").innerText = formatarMoeda(dados.financeiro.ticket_acougue);
        document.getElementById("fat-frios").innerText = formatarMoeda(dados.financeiro.fat_frios);
        document.getElementById("ticket-frios").innerText = formatarMoeda(dados.financeiro.ticket_frios);

        // 3. Atualiza as Tabelas de TOP 10
        renderizarTabela("lista-acougue", dados.top10Acougue);
        renderizarTabela("lista-frios", dados.top10Frios);

        // 4. Renderiza / Atualiza Gráficos (Linha e Donut)
        renderizarGraficoLinha(dados.graficoHoras);
        renderizarGraficoDonut(dados.cards.total_acougue, dados.cards.total_frios, dados.cards.total_geral);

    } catch (erro) {
        console.error("Erro ao alimentar o dashboard:", erro);
    }
}

// Injeta as linhas dinamicamente no TBODY das tabelas
function renderizarTabela(idElemento, listaProdutos) {
    const tbody = document.getElementById(idElemento);
    tbody.innerHTML = ""; // Limpa os exemplos estáticos

    if (!listaProdutos || listaProdutos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Nenhuma etiqueta emitida neste período.</td></tr>`;
        return;
    }

    listaProdutos.forEach((prod, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${prod.produto_nome}</td>
                <td>${prod.codigo_interno}</td>
                <td style="text-align: right; font-weight: 700;">${prod.quantidade}</td>
            </tr>
        `;
    });
}

// Configuração dinâmica do Gráfico de Linhas (Etiquetas por hora)
// Configuração dinâmica do Gráfico de Linhas (Garante renderização vazia)
function renderizarGraficoLinha(dadosHoras) {
    const canvas = document.getElementById('barChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const listaCompletaHoras = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const valoresHoras = Array(24).fill(0);

    if (dadosHoras && dadosHoras.length > 0) {
        dadosHoras.forEach(d => {
            const idx = listaCompletaHoras.indexOf(d.hora);
            if (idx !== -1) valoresHoras[idx] = d.quantidade;
        });
    }

    if (chartLinha) chartLinha.destroy();

    chartLinha = new Chart(ctx, {
        type: 'line',
        data: {
            labels: listaCompletaHoras,
            datasets: [{
                label: 'Etiquetas',
                data: valoresHoras,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#2563eb',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#2d3f47' }, ticks: { color: '#94a3b8', stepSize: 1 } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

// Configuração dinâmica do Gráfico Donut (Mostra cinza se estiver zerado)
function renderizarGraficoDonut(acougue, frios, totalGeral) {
    const canvas = document.getElementById('donutChart');
    if (!canvas) return;
    const donutCtx = canvas.getContext('2d');
    
    if (chartDonut) chartDonut.destroy();

    document.getElementById('donut-percentage').innerText = (totalGeral || 0).toLocaleString('pt-BR');
    document.getElementById('donut-label').innerText = "Total Itens";

    // Pulo do gato: Se não houver dados, mostra um gráfico cinza de "Sem dados"
    const temDados = (acougue + frios) > 0;
    const dataData = temDados ? [acougue, frios] : [1];
    const dataCores = temDados ? ['#f87171', '#38bdf8'] : ['#2d3f47'];
    const dataLabels = temDados ? ['Açougue', 'Frios'] : ['Sem dados'];

    chartDonut = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
            labels: dataLabels,
            datasets: [{
                data: dataData,
                backgroundColor: dataCores,
                borderWidth: 0,
                hoverOffset: temDados ? 4 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#f1f5f9',
                        boxWidth: 12,
                        font: { size: 12, weight: '600' },
                        padding: 15
                    }
                }
            }
        }
    });
}