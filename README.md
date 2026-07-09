# MBI - Monitoramento de Balanças e Integração ERP

![Node.js](https://img.shields.io/badge/Node.js-v24.18.0-green.svg)
![SQLite](https://img.shields.io/badge/SQLite-3-blue.svg)
![IBM DB2](https://img.shields.io/badge/IBM_DB2-CISS_ERP-blueviolet.svg)
![Windows Service](https://img.shields.io/badge/Windows_Service-Configurado-orange.svg)

O **MBI** é um sistema de Business Intelligence (B.I.) e auditoria interna em tempo real desenvolvido para monitorar a emissão de etiquetas e o comportamento de balanças automatizadas em redes de supermercados (focado nos setores de Açougue e Frios). 

O sistema realiza o cruzamento dinâmico (confronto) entre os bipes computados localmente nas balanças e as vendas analíticas registradas no banco de dados **IBM DB2** do ERP **CISS**, permitindo identificar perdas, picos de movimentação e inconsistências financeiras de forma imediata.

---

## 🏗️ Arquitetura do Sistema

O projeto adota uma arquitetura descentralizada de alta disponibilidade:

1. **Client-Side (Raspberry Pi 3):** Dispositivos espalhados nos setores operacionais (Açougue/Frios) monitoram a atividade das balanças. Assim que uma etiqueta é emitida ou um produto é bipado, o Raspberry Pi processa a informação e realiza uma requisição `POST` para o servidor central.
2. **Server-Side (Node.js + Express):** Um servidor robusto centraliza o recebimento dos logs através de uma API REST, persistindo os dados em um banco local de alta velocidade.
3. **Database Layer:** * **SQLite (Local):** Utilizado para auditoria interna, garantindo histórico contínuo, preenchimento de métricas de tempo e performance para o Dashboard (mesmo se a conexão externa falhar).
   * **IBM DB2 (CISS ERP):** Conexão analítica integrada via driver `ibm_db` para extração de dados fiscais e de PDV em tempo real.

---

## 📊 Funcionalidades Principais

* **Dashboard de Performance Operacional:** Gráfico de linha contínuo (24 horas) mapeando o volume de bipes por faixa horária.
* **Métricas de B.I. nativas:** Cálculo de faturamento acumulado por setor e Ticket Médio operacional.
* **Módulo de Confronto Automático:** Cruzamento de dados de pesagem contra o Estoque Analítico do ERP CISS para auditoria de quebras.
* **Resiliência de Produção:** Configurado nativamente como um **Serviço do Windows**, garantindo inicialização automática após reinicializações inesperadas da máquina host.

---

## 🛠️ Tecnologias Utilizadas

* **Backend:** Node.js (Express)
* **Frontend:** HTML5, CSS3 Customizado (Dark Mode), JavaScript (Vanilla / Integração de Gráficos)
* **Bancos de Dados:** SQLite3 & IBM DB2 (`ibm_db`)
* **Gerenciamento de Serviço:** `node-windows` (Integração nativa com `services.msc`)
* **Segurança:** `dotenv` para isolamento de strings de conexão de produção.

---

## ⚙️ Como Executar o Projeto

### Pré-requisitos
* Node.js instalado no servidor.
* Git configurado.

### Instalação no Servidor Central
1. Clone o repositório:
   ```bash
   git clone [https://github.com/jeannpaulo/servidor-automacao.git](https://github.com/jeannpaulo/servidor-automacao.git)
   cd servidor-automacao