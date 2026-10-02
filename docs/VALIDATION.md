# Validacao local — 2 de outubro de 2026

Ambiente de validacao: Windows 11 Pro, 16 GB de RAM, WSL 2 e Docker Desktop com containers Linux. Socius para PC, acessivel somente no computador que hospeda o painel. Dados em pasta externa ao repositorio, definida por DATA_DIR.

## Versao com perfis e Tailwind

- 40 testes Vitest aprovados, incluindo migracao repetivel, isolamento, configuracoes lembradas, concorrencia, falhas de copia, falha no commit de credenciais, confirmacoes e API local.
- Prettier, ESLint, TypeScript e build de producao aprovados.
- Migracao real do mundo 123123123 concluida: encerramento gracioso, recuperacao previa, copias verificadas e retomada. Senha e configuracoes preservadas; estruturas antigas mantidas.
- .env da instalacao deixou de conter mundo, senha e configuracoes do servidor. Perfis e credenciais ficam em arquivos separados na pasta de dados.
- Um mundo temporario novo foi criado pela API, ativado e gerado pelo Valheim. O servidor ficou pronto nesse mundo.
- Enquanto o mundo temporario rodava, os 214 arquivos do mundo pessoal permaneceram identicos, byte a byte.
- A troca de volta fez backup do temporario e retornou ao 123123123. A comparacao imediata encontrou os mesmos 214 arquivos, sem diferenca de tamanho ou SHA-256.
- O mundo temporario foi arquivado em validation dentro da pasta de dados e removido do catalogo ativo. O mundo pessoal permaneceu selecionado e voltou a ficar pronto.
- O backup diario do mundo pessoal tambem concluiu e retomou o servidor durante a validacao.
- O painel foi reiniciado sem interromper o container; configuracoes do perfil foram carregadas novamente.
- Interface real verificada no Edge em desktop de 1440 e 1280 pixels: navegacao, formularios, preenchimento de nome/porta, senha sem preenchimento automatico, confirmacoes canceladas, filtro de logs e reconexao.
- Com dois perfis presentes, selecionar outro na interface exibiu suas configuracoes sem alterar o servidor ativo.
- Capturas reais em screenshots ocultam o codigo de entrada e nao mostram senhas.

A leitura da senha so ocorre em uma acao explicita na tela Mundos. Testes verificam que catalogo e snapshot nao publicam credenciais, e que a rota de consulta exige token.

## Verificacoes anteriores preservadas

WSL/Docker executaram hello-world. Importacao de uma copia do mundo, backup manual e restauracao reais foram verificados antes da migracao para perfis. O usuario confirmou que conseguiu entrar no servidor e que funcionou.

A pasta original do Valheim nao e alterada pelo Socius. Uma comparacao anterior encontrou os 105 arquivos ainda presentes com hashes iguais ao primeiro backup; quatro caches do minimapa presentes na importacao ja nao estavam na origem naquela conferência.

## Validacao humana pendente

- Conferir construcoes, inventarios e progresso no jogo apos a migracao.
- Conectar o dono e os tres amigos; medir CPU/RAM durante uma partida real.
- Fechar o cliente do dono enquanto um amigo permanece conectado.
- Criar progresso identificavel, fazer backup e comprovar a restauracao dentro do jogo.

O estado pronto e a integridade dos arquivos nao substituem essas verificacoes. A observacao sem jogadores ficou proxima de 1,8 GiB de RAM, sem representar o consumo de uma partida com quatro pessoas. O PC deve permanecer ligado e sem suspensao; o painel precisa estar aberto para os backups diarios.
