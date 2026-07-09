const net = require('net');
const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');
const path = require('path');
const axios = require('axios'); // Adicionado para enviar os dados para o Windows

// Carrega as variáveis do arquivo .env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DVR_IP = process.env.DVR_IP;
const DVR_PORT = parseInt(process.env.DVR_PORT, 10);
const LEITOR_ID = process.env.LEITOR_ID;
const LOJA_ID = process.env.LOJA_ID;
const SETOR_PADRAO = process.env.SETOR || 'AÇOUGUE';

// Configurações do Servidor Central (Windows)
const SERVIDOR_IP = process.env.SERVIDOR_CENTRAL_IP;
const SERVIDOR_PORT = process.env.SERVIDOR_CENTRAL_PORT;
const URL_SERVIDOR = `http://${SERVIDOR_IP}:${SERVIDOR_PORT}/api/sincronizar`;
// Nova rota para buscar os produtos revisados
const URL_PRODUTOS = `http://${SERVIDOR_IP}:${SERVIDOR_PORT}/api/sincronizar-produtos`;


// ==========================================================================
// 1. BANCO DE DADOS LOCAL (SQLITE) E SINCRONIZAÇÃO DIÁRIA
// ==========================================================================
const db = new sqlite3.Database(path.join(__dirname, 'dados_leituras.db'), (err) => {
    if (err) console.error("Erro ao abrir SQLite Local:", err.message);
});

// Função que puxa os 1.511 produtos do servidor e salva localmente no Pi 3
async function sincronizarProdutos() {
    console.log("🔄 [Sincronização] Buscando tabela de produtos no servidor central...");

    try {
        const resposta = await axios.get(URL_PRODUTOS);
        const produtosServidor = resposta.data;

        if (!Array.isArray(produtosServidor)) {
            throw new Error("Dados de produtos inválidos vindos do servidor.");
        }

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            // Como apagamos o arquivo, este comando vai criar a tabela perfeita com as 3 colunas
            db.run(`
                CREATE TABLE IF NOT EXISTS produtos (
                    codigo_interno TEXT PRIMARY KEY,
                    nome TEXT,
                    setor TEXT
                )
            `);

            const stmt = db.prepare("INSERT OR REPLACE INTO produtos (codigo_interno, nome, setor) VALUES (?, ?, ?)");

            produtosServidor.forEach(p => {
                stmt.run(p.codigo_interno, p.nome, p.setor);
            });

            stmt.finalize();

            db.run("COMMIT", (err) => {
                if (err) {
                    console.error("❌ [Sincronização] Erro ao salvar no banco local do Pi 3:", err.message);
                } else {
                    console.log(`✅ [Sincronização] Sucesso! ${produtosServidor.length} produtos atualizados no Pi 3.`);
                }
            });
        });

    } catch (error) {
        console.log("⚠️ [Sincronização] Servidor offline. Mantendo a base de dados local atual:", error.message);
    }
}

// Executa a sincronização assim que o Pi 3 liga
sincronizarProdutos();

// Agenda para rodar automaticamente a cada 24 horas
const VINTE_QUATRO_HORAS = 24 * 60 * 60 * 1000;
setInterval(sincronizarProdutos, VINTE_QUATRO_HORAS);


// ==========================================================================
// 2. FUNÇÃO PARA ENVIAR DADOS PARA O SERVIDOR CENTRAL (WINDOWS)
// ==========================================================================
function enviarParaServidorCentral(dadosLeitura) {
    console.log(`Enviando dados para o Servidor Central (${SERVIDOR_IP})...`);

    axios.post(URL_SERVIDOR, dadosLeitura)
        .then((response) => {
            if (response.data.success) {
                console.log(`[Servidor] Sincronizado com sucesso! ID Central: ${response.data.id_central}`);
            }
        })
        .catch((err) => {
            console.log(`[Servidor] Erro ao sincronizar (Normal se o Windows estiver desligado na bancada):`, err.message);
        });
}

// ==========================================================================
// 3. FUNÇÃO PARA ENVIAR TEXTO FORMATADO PARA O DVR
// ==========================================================================
function enviarParaDVR(texto) {
    console.log("Enviando dados para o DVR...");
    const client = new net.Socket();
    client.setTimeout(2000);

    client.connect(DVR_PORT, DVR_IP, () => {
        client.write(texto);
        setTimeout(() => { client.end(); client.destroy(); }, 300);
    });

    client.on('error', (err) => {
        console.log("Erro DVR (Normal em Bancada):", err.message);
        client.destroy();
    });
}

// ==========================================================================
// 4. TRATAMENTO E TRADUÇÃO DO CÓDIGO (PADRÃO PRIX 4)
// ==========================================================================
function processarCodigo(codigo) {
    const codigoLimpo = codigo.trim();

    console.log("\n-------------------------------------------");
    console.log("Código capturado pelo leitor:", codigoLimpo);

    if (!/^\d{13}$/.test(codigoLimpo)) {
        console.log("Código inválido descartado (Não possui 13 dígitos)");
        return;
    }

    // 1. Extrai os 4 dígitos do produto (Ex: de '20763...' pega '0763')
    const codBruto = codigoLimpo.substring(1, 5);
    const codProduto = String(parseInt(codBruto, 10));

    // 2. Extrai o preço baseado na sua estrutura (Do dígito 7 ao 12)
    const valorBruto = codigoLimpo.substring(7, 12);
    const valorCentavos = parseInt(valorBruto, 10);
    const valor = (valorCentavos / 100).toFixed(2);

    // Busca no banco local trazendo o Nome e o Setor do produto cadastrado
    db.get("SELECT nome, setor FROM produtos WHERE codigo_interno = ? OR codigo_interno = ?", [codProduto, codBruto], (err, row) => {
        let nomeProduto = `PRODUTO ${codProduto}`;
        let setorDinamico = SETOR_PADRAO.toLowerCase(); // Fallback caso o produto não exista no banco ainda

        if (row) {
            nomeProduto = row.nome;
            // Se o produto tiver setor cadastrado, assume ele (Ex: 'acougue', 'frios', 'padaria')
            if (row.setor) setorDinamico = row.setor;
        }

        console.log(`Resultado -> Produto: ${nomeProduto} | Preço: R$ ${valor} | Setor Detectado: ${setorDinamico}`);

        // Data e hora em formato ISO
        const dataHoraAgora = new Date().toISOString();

        // Prepara os dados limpos para o Servidor Central com o SETOR DINÂMICO
        const dadosParaSincronizar = {
            loja_id: LOJA_ID,
            leitor_id: LEITOR_ID,
            setor: setorDinamico,
            codigo_interno: codProduto,
            codigo_barras: codigoLimpo,
            produto_nome: nomeProduto,
            preco: parseFloat(valor),
            data_hora: dataHoraAgora
        };

        // A. Dispara para a Máquina Windows
        enviarParaServidorCentral(dadosParaSincronizar);

        // B. Envia para o DVR da câmera (Formatando o setor bonitinho em maiúsculo na tela)
        const textoDVR = `${setorDinamico.toUpperCase()}\n\n${nomeProduto}\n\nR$ ${valor}`;
        enviarParaDVR(textoDVR);
    });
}

// ==========================================================================
// 5. INTERCEPTADOR DE ENTRADA PADRÃO (READLINE) - FOCO NO TERMINAL FÍSICO
// ==========================================================================

// Configura a interface para ler o fluxo de entrada do terminal (stdin)
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

console.log(`\n======================================================`);
console.log(`Sistema Inicializado! Escutando Balança no Setor Padrão: ${SETOR_PADRAO}`);
console.log(`Aguardando bips do leitor USB (Simulação de Teclado)...`);
console.log(`======================================================`);

// Escuta cada linha enviada pelo leitor (quando ele manda o 'Enter' no final)
rl.on('line', (linha) => {
    const codigoLimpo = linha.trim();

    if (codigoLimpo.length > 0) {
        // Dispara a lógica de busca e geração do arquivo da balança
        processarCodigo(codigoLimpo);
    }
});

// Trata possíveis erros na interface de leitura
rl.on('error', (erro) => {
    console.error('❌ Erro na interface do readline:', erro);
});

console.log(`\n======================================================`);
console.log(`Sistema Inicializado! Escutando Balança no Setor Padrão: ${SETOR_PADRAO}`);
console.log(`======================================================`);
