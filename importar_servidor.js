const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); 

// 🎯 ALTERADO: Agora aponta exatamente para o banco dos gráficos e do dashboard!
const dbPath = path.join(__dirname, 'central_automacao.db'); 
const db = new sqlite3.Database(dbPath);
const csvPath = path.join(__dirname, 'produtos_revisados.csv');

db.serialize(() => {
    // Cria a tabela nova com a coluna 'setor' para não misturar com as estruturas antigas
    db.run(`
        CREATE TABLE IF NOT EXISTS produtos_novos (
            codigo_interno TEXT PRIMARY KEY,
            nome TEXT,
            setor TEXT
        )
    `);

    console.log("Lendo arquivo CSV no servidor...");
    const conteudo = fs.readFileSync(csvPath, 'utf-8');
    const linhasCruas = conteudo.split(/\r?\n/);
    const linhasProcessadas = [];
    let buffer = "";

    for (let i = 0; i < linhasCruas.length; i++) {
        let linha = linhasCruas[i].trim();
        if (!linha) continue;
        if (buffer) { buffer += " " + linha; } else { buffer = linha; }
        const quantidadeAspas = (buffer.match(/"/g) || []).length;
        if (quantidadeAspas % 2 === 0) { linhasProcessadas.push(buffer); buffer = ""; }
    }

    const stmt = db.prepare(`
        INSERT INTO produtos_novos (codigo_interno, nome, setor) 
        VALUES (?, ?, ?)
        ON CONFLICT(codigo_interno) DO UPDATE SET nome=excluded.nome, setor=excluded.setor
    `);

    db.run("BEGIN TRANSACTION");

    for (let i = 1; i < linhasProcessadas.length; i++) {
        const partes = linhasProcessadas[i].split(';');
        if (partes.length < 3) continue;

        const codigo = partes[0].replace(/"/g, '').trim();
        const nome = partes[1].replace(/"/g, '').trim();
        let setor = partes[2].replace(/"/g, '').trim().toLowerCase();

        if (setor === 'açougue' || setor === 'acougue') setor = 'acougue';

        if (codigo && nome) {
            stmt.run(codigo, nome, setor);
        }
    }

    stmt.finalize();
    db.run("COMMIT", (err) => {
        if (err) console.error("Erro ao salvar:", err.message);
        else console.log(`🚀 Sucesso! 1510 produtos importados diretamente no central_automacao.db.`);
        db.close();
    });
});