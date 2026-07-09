const Service = require('node-windows').Service;
const path = require('path');

// Cria um novo objeto de serviço do Windows
const svc = new Service({
  name: 'MBI - Monitoramento de Balancas', // Nome que vai aparecer nos Serviços do Windows
  description: 'Servico Node.js para monitoramento de etiquetas e balancas do supermercado.',
  script: path.join(__dirname, 'server.js'), // Caminho absoluto para o seu script principal
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    }
  ]
});

// Escuta o evento de "install", que indica que o serviço foi criado
svc.on('install', function() {
  console.log('Serviço instalado com sucesso!');
  console.log('Iniciando o serviço...');
  svc.start();
});

// Se o serviço já existir, avisa no console
svc.on('alreadyinstalled', function() {
  console.log('Este serviço já está instalado.');
});

// Instala o serviço
svc.install();