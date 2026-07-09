require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const ibmdb = require('ibm_db');

const app = express();
// Se não encontrar no .env, usa a 3000 como padrão
const PORT = process.env.PORT || 3000; 

// Middleware para entender JSON e servir seus arquivos HTML/CSS da pasta public
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Puxa a string de conexão direto e segura do arquivo .env
const connStrCISS = process.env.CONN_STR_CISS;


// ==========================================================================
// 1. CONEXÃO E ESTRUTURA DO BANCO DE DADOS CENTRAL (SQLite Local)
// ==========================================================================
const dbPath = path.join(__dirname, 'central_automacao.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Erro ao abrir SQLite Central:", err.message);
    } else {
        console.log("Banco de Dados SQLITE CENTRAL conectado com sucesso!");
    }
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS auditoria_leituras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loja_id TEXT,
            leitor_id TEXT,
            setor TEXT,
            codigo_interno TEXT,
            codigo_barras TEXT,
            produto_nome TEXT,
            preco REAL,
            data_hora_pi TEXT,
            data_hora_servidor DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// ==========================================================================
// 2. ROTAS DA API EXISTENTES
// ==========================================================================

app.get('/api/produtos', (req, res) => {
    db.all("SELECT codigo_interno, nome, departamento FROM produtos_mestre", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/sincronizar', (req, res) => {
    const { loja_id, leitor_id, setor, codigo_interno, codigo_barras, produto_nome, preco, data_hora } = req.body;
    const query = `INSERT INTO auditoria_leituras (loja_id, leitor_id, setor, codigo_interno, codigo_barras, produto_nome, preco, data_hora_pi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(query, [loja_id, leitor_id, setor, codigo_interno, codigo_barras, produto_nome, preco, data_hora], function (err) {
        if (err) {
            console.error("Erro ao inserir:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        console.log(`[Auditoria] Bip Computado -> Item: ${produto_nome} | R$ ${preco}`);
        res.json({ success: true, id_central: this.lastID });
    });
});

app.get('/api/dashboard/dados', async (req, res) => {
    const filtro = req.query.filtro || 'hoje';
    let filtroData = "date(data_hora_servidor, 'localtime') = date('now', 'localtime')";

    if (filtro === 'ontem') {
        filtroData = "date(data_hora_servidor, 'localtime') = date('now', '-1 day', 'localtime')";
    } else if (filtro === 'semana') {
        filtroData = "date(data_hora_servidor, 'localtime') >= date('now', '-7 days', 'localtime')";
    } else if (filtro === '15dias') {
        filtroData = "date(data_hora_servidor, 'localtime') >= date('now', '-15 days', 'localtime')";
    } else if (filtro === 'mes') {
        filtroData = "strftime('%Y-%m', data_hora_servidor, 'localtime') = strftime('%Y-%m', 'now', 'localtime')";
    } else if (filtro === '30dias') {
        filtroData = "date(data_hora_servidor, 'localtime') >= date('now', '-30 days', 'localtime')";
    }

    try {
        const rodarQuery = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        const cardsPromessa = rodarQuery(`SELECT COUNT(*) as total_geral, SUM(CASE WHEN lower(setor) LIKE '%acougue%' THEN 1 ELSE 0 END) as total_acougue, SUM(CASE WHEN lower(setor) LIKE '%frios%' THEN 1 ELSE 0 END) as total_frios FROM auditoria_leituras WHERE ${filtroData}`);
        const financeiroPromessa = rodarQuery(`SELECT SUM(CASE WHEN lower(setor) LIKE '%acougue%' THEN preco ELSE 0 END) as fat_acougue, AVG(CASE WHEN lower(setor) LIKE '%acougue%' THEN preco ELSE NULL END) as ticket_acougue, SUM(CASE WHEN lower(setor) LIKE '%frios%' THEN preco ELSE 0 END) as fat_frios, AVG(CASE WHEN lower(setor) LIKE '%frios%' THEN preco ELSE NULL END) as ticket_frios FROM auditoria_leituras WHERE ${filtroData}`);
        
        // CORREÇÃO AQUI: Mudamos o alias de quantity para quantidade para casar com o index.js
        const horasPromessa = rodarQuery(`
            SELECT 
                strftime('%H', data_hora_servidor, 'localtime') as hora, 
                COUNT(*) as quantidade 
            FROM auditoria_leituras 
            WHERE ${filtroData} 
            GROUP BY hora
        `);

        const topAcouguePromessa = rodarQuery(`SELECT produto_nome, codigo_interno, COUNT(*) as quantidade FROM auditoria_leituras WHERE ${filtroData} AND lower(setor) LIKE '%acougue%' GROUP BY codigo_interno, produto_nome ORDER BY quantidade DESC LIMIT 10`);
        const topFriosPromessa = rodarQuery(`SELECT produto_nome, codigo_interno, COUNT(*) as quantidade FROM auditoria_leituras WHERE ${filtroData} AND lower(setor) LIKE '%frios%' GROUP BY codigo_interno, produto_nome ORDER BY quantidade DESC LIMIT 10`);

        const [cards, financeiro, horasDoBanco, topAcougue, topFrios] = await Promise.all([cardsPromessa, financeiroPromessa, horasPromessa, topAcouguePromessa, topFriosPromessa]);

        // Preenchimento de horas zeradas para alimentar o array de 24 posições do frontend de forma contínua
        const mapaHoras = {};
        for (let i = 0; i < 24; i++) {
            const horaStr = String(i).padStart(2, '0');
            mapaHoras[horaStr] = 0;
        }

        if (horasDoBanco && horasDoBanco.length > 0) {
            horasDoBanco.forEach(item => {
                if (item.hora) {
                    mapaHoras[item.hora] = item.quantidade;
                }
            });
        }

        const graficoHorasFormatado = Object.keys(mapaHoras).sort().map(h => ({
            hora: h,
            quantidade: mapaHoras[h] // Nome da propriedade corrigido
        }));

        res.json({
            cards: cards[0] || { total_geral: 0, total_acougue: 0, total_frios: 0 },
            financeiro: financeiro[0] || { fat_acougue: 0, ticket_acougue: 0, fat_frios: 0, ticket_frios: 0 },
            graficoHoras: graficoHorasFormatado,
            top10Acougue: topAcougue,
            top10Frios: topFrios
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sincronizar-produtos', (req, res) => {
    db.all("SELECT codigo_interno, nome, setor FROM produtos_novos", [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows || []);
    });
});

app.post('/api/pesquisar-leituras', (req, res) => {
    const { termo, setor, leitor_id, produto_nome, codigo_interno, data_inicio, data_fim, limite, pagina } = req.body;
    const qtdeLimite = parseInt(limite) || 10;
    const paginaAtual = parseInt(pagina) || 1;
    const offset = (paginaAtual - 1) * qtdeLimite;

    let condicoes = [];
    let parametros = [];

    if (termo) { condicoes.push(`(codigo_barras LIKE ? OR produto_nome LIKE ?)`); parametros.push(`%${termo}%`, `%${termo}%`); }
    if (setor && setor !== 'todos') { condicoes.push(`lower(setor) = ?`); parametros.push(setor.toLowerCase()); }
    if (leitor_id && leitor_id !== 'todos') { condicoes.push(`leitor_id = ?`); parametros.push(leitor_id); }
    if (produto_nome) { condicoes.push(`produto_nome LIKE ?`); parametros.push(`%${produto_nome}%`); }
    if (codigo_interno) { condicoes.push(`codigo_interno = ?`); parametros.push(codigo_interno); }
    if (data_inicio) { condicoes.push(`date(data_hora_servidor, 'localtime') >= date(?)`); parametros.push(data_inicio); }
    if (data_fim) { condicoes.push(`date(data_hora_servidor, 'localtime') <= date(?)`); parametros.push(data_fim); }

    const clausulaWhere = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';
    const sqlTotal = `SELECT COUNT(*) as total FROM auditoria_leituras ${clausulaWhere}`;
    const sqlDados = `SELECT *, data_hora_servidor as data_hora FROM auditoria_leituras ${clausulaWhere} ORDER BY data_hora_servidor DESC LIMIT ? OFFSET ?`;

    db.get(sqlTotal, parametros, (err, rowTotal) => {
        if (err) return res.status(500).json({ error: err.message });
        const totalRegistros = rowTotal ? rowTotal.total : 0;
        const parametrosDados = [...parametros, qtdeLimite, offset];

        db.all(sqlDados, parametrosDados, (err, rowsDados) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ total: totalRegistros, registros: rowsDados || [] });
        });
    });
});

// ==========================================================================
// 3. ROTA DE CONFRONTO DINÂMICA: SQLITE VS IBM DB2 (CISS ERP)
// ==========================================================================
app.post('/api/confronto/processar', (req, res) => {
    const { data_inicio, data_fim, codigo, setor } = req.body;

    let condicoes = [];
    let parametros = [];

    if (data_inicio) { condicoes.push(`date(data_hora_servidor, 'localtime') >= date(?)`); parametros.push(data_inicio); }
    if (data_fim) { condicoes.push(`date(data_hora_servidor, 'localtime') <= date(?)`); parametros.push(data_fim); }
    if (codigo) { condicoes.push(`(codigo_barras = ? OR codigo_interno = ?)`); parametros.push(codigo, codigo); }
    if (setor && setor !== 'todos') { condicoes.push(`lower(setor) = ?`); parametros.push(setor.toLowerCase()); }

    const clausulaWhere = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

    const sqlBalança = `
        SELECT 
            codigo_interno, 
            codigo_barras, 
            produto_nome,
            COUNT(*) as total_balanca,
            SUM(preco) as valor_total_balanca
        FROM auditoria_leituras
        ${clausulaWhere}
        GROUP BY codigo_interno
        ORDER BY produto_nome ASC
    `;

    db.all(sqlBalança, parametros, (err, rowsBalança) => {
        if (err) {
            console.error("Erro ao ler dados do SQLite para confronto:", err.message);
            return res.status(500).json({ error: err.message });
        }

        if (!rowsBalança || rowsBalança.length === 0) {
            return res.json({ linhas: [] });
        }

        // Abre conexão com a CISS (IBM DB2)
        ibmdb.open(connStrCISS, (errDB2, conn) => {
            if (errDB2) {
                console.error("Erro ao conectar no IBM DB2 da CISS:", errDB2.message);
                return res.status(500).json({ error: "Erro na conexão com o banco do ERP" });
            }

            const listaEans = rowsBalança.map(item => `'${item.codigo_interno}'`).join(',');

            const sqlDB2 = `
    SELECT
        PRODUTOS_VIEW.IDCODBARPROD AS CODIGO_REDUZIDO,
        COUNT(*) AS TOTAL_ETIQUETAS,
        SUM(ESTOQUE_ANALITICO.VALTOTLIQUIDO) AS TOTAL_VALOR_ERP
    FROM NOTAS 
    JOIN ESTOQUE_ANALITICO ON (NOTAS.IDEMPRESA = ESTOQUE_ANALITICO.IDEMPRESA AND NOTAS.IDPLANILHA = ESTOQUE_ANALITICO.IDPLANILHA)
    JOIN PRODUTOS_VIEW ON (ESTOQUE_ANALITICO.IDPRODUTO = PRODUTOS_VIEW.IDPRODUTO AND ESTOQUE_ANALITICO.IDSUBPRODUTO = PRODUTOS_VIEW.IDSUBPRODUTO)
    WHERE ESTOQUE_ANALITICO.FLAGMOVSALDOPRO = 'T'
      AND ESTOQUE_ANALITICO.IDOPERACAO > 1000   
      AND ESTOQUE_ANALITICO.IDOPERACAO <> 1301  
      AND NOTAS.IDEMPRESA = 1
      AND PRODUTOS_VIEW.IDCODBARPROD IN (${listaEans})
      AND ESTOQUE_ANALITICO.DTMOVIMENTO BETWEEN '${data_inicio}' AND '${data_fim}'
    GROUP BY PRODUTOS_VIEW.IDCODBARPROD
`;

            conn.query(sqlDB2, (errQuery, rowsCISS) => {
                conn.close(); 

                if (errQuery) {
                    console.error("Erro ao executar query no DB2:", errQuery.message);
                    return res.status(500).json({ error: "Erro ao consultar dados analíticos no ERP" });
                }

                const erpMap = new Map();
                if (rowsCISS && rowsCISS.length > 0) {
                    rowsCISS.forEach(venda => {
                        const reduzido = String(venda.CODIGO_REDUZIDO || '').trim();
                        const qtd = venda.TOTAL_ETIQUETAS || 0;
                        const vlr = venda.TOTAL_VALOR_ERP || 0;
                        erpMap.set(reduzido, { qtd_pdv: parseFloat(qtd), vlr_pdv: parseFloat(vlr) });
                    });
                }

                const linesConfrontadas = rowsBalança.map(item => {
                    const idInternoBalança = String(item.codigo_interno).trim();
                    const dadosErp = erpMap.get(idInternoBalança) || { qtd_pdv: 0, vlr_pdv: 0 };

                    return {
                        codigo_interno: item.codigo_interno,
                        codigo_barras: item.codigo_barras,
                        produto_nome: item.produto_nome,
                        qtd_balanca: item.total_balanca,
                        qtd_pdv: dadosErp.qtd_pdv,
                        vlr_balanca: item.valor_total_balanca,
                        vlr_pdv: dadosErp.vlr_pdv
                    };
                });

                res.json({ linhas: linesConfrontadas });
            });
        });
    });
});

// ==========================================================================
// 4. INICIALIZAÇÃO DO SERVIDOR
// ==========================================================================
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`Servidor rodando e travado na Porta ${PORT}`);
    console.log(`Acesse no seu Chrome: http://128.128.1.241:3000`);
    console.log(`======================================================`);
});