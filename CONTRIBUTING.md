# Padrao de codigo

- TypeScript estrito; tipos compartilhados para contratos entre API e interface.
- Prettier define a formatacao: dois espacos, aspas simples e linhas de ate 100 colunas.
- Funcoes com nomes descritivos e uma responsabilidade; evitar instrucoes comprimidas e JSX monolitico.
- Telas coordenam componentes. Hooks concentram consultas e conexao. Componentes visuais nao acessam Docker.
- A API valida entradas. O gerenciador serializa operacoes. Repositorios persistem dados; o adaptador Docker controla apenas o container Socius.
- Tailwind define os estilos. Tokens ficam no tema; classes condicionais usam variantes completas e explicitas.
- Comentarios explicam decisoes ou invariantes, sem repetir o codigo.

Antes de entregar: npm run format:check, npm run lint, npm test e npm run build.
