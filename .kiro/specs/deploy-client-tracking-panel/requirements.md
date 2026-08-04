# Requirements Document

## Introduction

Evolução do Painel de Acompanhamento de Clientes da equipe de Deploy da DOit. O sistema atual é um arquivo HTML único com dados hardcoded e armazenamento local. O novo painel será uma aplicação web publicada no GitHub Pages com backend compartilhado (Firebase), importação de dados via Excel, visualização Kanban, exportação de relatórios e notificações semanais por e-mail. O time de 4 pessoas (Bruno Hideo Toyama, Isabela Soares, Henrique Puertas Stefano, Ana Paula) deve poder acessar e editar dados simultaneamente.

## Glossary

- **Painel**: Aplicação web de acompanhamento de clientes publicada no GitHub Pages
- **Cliente**: Empresa cadastrada na Listagem de Projetos do DOit com direito a 4 acompanhamentos
- **Acompanhamento**: Contato agendado entre um membro do time e um cliente, com registro de data, canal, retorno e status
- **Slot**: Uma das 4 posições de acompanhamento de cada cliente
- **Líder**: Membro do time de deploy responsável por um grupo de clientes
- **Fase**: Etapa atual do projeto do cliente ("Acompanhamento" ou "Produção")
- **Firebase**: Serviço de backend gratuito usado como banco de dados compartilhado em tempo real
- **Kanban**: Visualização em colunas que organiza clientes pelo estágio de progresso dos acompanhamentos
- **Importação**: Processo de carregar dados atualizados a partir de planilhas Excel exportadas do DOit
- **Planilha_Projetos**: Excel exportado do DOit contendo cadastro dos clientes e dados contratuais
- **Planilha_Eventos**: Excel exportado do DOit contendo eventos de acompanhamento registrados na agenda

## Requirements

### Requisito 1: Backend Compartilhado em Tempo Real

**User Story:** Como membro do time de deploy, eu quero que todos os 4 membros consigam acessar e editar os registros de acompanhamento online simultaneamente, para que o painel reflita sempre o estado mais atualizado sem depender de armazenamento local.

#### Critérios de Aceitação

1. THE Painel SHALL persistir todos os registros de acompanhamento no Firebase Realtime Database
2. WHEN um membro do time altera um registro de acompanhamento, THE Painel SHALL sincronizar a alteração para todos os outros usuários conectados em até 3 segundos
3. WHEN o Painel é aberto por qualquer membro do time, THE Painel SHALL carregar os dados mais recentes do Firebase antes de permitir edição, exibindo um indicador de carregamento durante a operação
4. THE Painel SHALL exibir a identificação do último membro que editou cada registro de acompanhamento
5. IF a conexão com o Firebase falhar por mais de 5 segundos, THEN THE Painel SHALL exibir um indicador visual de status offline e armazenar alterações localmente para sincronização posterior
6. WHEN a conexão com o Firebase for restabelecida após falha, THE Painel SHALL sincronizar automaticamente as alterações armazenadas localmente e resolver conflitos utilizando a estratégia last-write-wins baseada no timestamp da alteração
7. IF dois membros editarem o mesmo campo de acompanhamento simultaneamente, THEN THE Painel SHALL preservar a última alteração recebida pelo Firebase (last-write-wins) e notificar visualmente o membro cuja alteração foi sobrescrita

### Requisito 2: Importação de Dados via Excel

**User Story:** Como membro do time de deploy, eu quero importar planilhas Excel atualizadas do DOit para manter o cadastro de clientes e eventos sempre em dia, sem precisar alterar código.

#### Critérios de Aceitação

1. THE Painel SHALL disponibilizar um botão "Importar Projetos" para upload da Planilha_Projetos (formato .xlsx com colunas obrigatórias: código, nome, cliente, email, telefone, líder, cidade, UF, contrato, status_projeto, inicio_capacitacao, fim_capacitacao)
2. THE Painel SHALL disponibilizar um botão "Importar Eventos" para upload da Planilha_Eventos (formato .xlsx com colunas obrigatórias: data, nome_evento, dono)
3. WHEN a Planilha_Projetos é importada, THE Painel SHALL adicionar clientes novos e atualizar dados de clientes existentes (identificados pelo campo código) sem apagar registros de acompanhamento já preenchidos pelo time
4. WHEN a Planilha_Eventos é importada, THE Painel SHALL atualizar os eventos de agenda de cada cliente e pré-preencher slots de acompanhamento com dados detectados, exibindo resumo com número de eventos vinculados, novos e ignorados
5. THE Painel SHALL registrar e exibir a data e hora da última importação realizada para cada tipo de planilha no formato "DD/MM/AAAA HH:mm"
6. IF o arquivo importado não possuir extensão .xlsx ou não contiver as colunas obrigatórias esperadas, THEN THE Painel SHALL exibir uma mensagem de erro listando as colunas ausentes sem alterar os dados existentes
7. WHEN uma importação de projetos é realizada, THE Painel SHALL exibir um resumo com o número de clientes adicionados, atualizados e inalterados
8. IF uma linha do arquivo importado contiver dados inválidos (campos obrigatórios em branco ou formato incorreto), THEN THE Painel SHALL ignorar apenas a linha com erro e incluir o número da linha no relatório de erros

### Requisito 3: Visualização Kanban

**User Story:** Como membro do time de deploy, eu quero visualizar os clientes em um quadro Kanban organizado por estágio de progresso, para ter uma visão mais clara do pipeline de acompanhamento.

#### Critérios de Aceitação

1. THE Painel SHALL exibir uma aba "Kanban" como opção de visualização junto às abas existentes ("Por cliente" e "Agenda de contatos")
2. THE Painel SHALL organizar os clientes em 5 colunas no Kanban: "Sem contato", "1º acompanhamento", "2º acompanhamento", "3º acompanhamento" e "Completo (4/4)", e SHALL exibir a contagem de clientes no cabeçalho de cada coluna
3. WHEN um registro de acompanhamento é atualizado como "ocorreu", THE Painel SHALL posicionar o card do cliente na coluna correspondente ao número total de acompanhamentos com status "ocorreu": 0 ocorridos = "Sem contato", 1 ocorrido = "1º acompanhamento", 2 ocorridos = "2º acompanhamento", 3 ocorridos = "3º acompanhamento", 4 ocorridos = "Completo (4/4)"
4. THE Painel SHALL exibir em cada card do Kanban: nome do cliente, nome do líder responsável, número de dias até o próximo contato previsto (positivo para futuro, negativo para atrasado) e um indicador de urgência conforme as faixas: verde para data prevista a mais de 7 dias, amarelo para data prevista em até 7 dias, vermelho para data prevista ultrapassada
5. WHEN um card do Kanban é clicado, THE Painel SHALL abrir os detalhes do cliente com seus slots de acompanhamento
6. IF a data prevista do próximo acompanhamento pendente de um cliente já tiver sido ultrapassada, THEN THE Painel SHALL destacar o card desse cliente com borda na cor de alerta (vermelho)
7. IF um cliente não possuir datas previstas de acompanhamento (capacitação não iniciada), THEN THE Painel SHALL posicionar o card na coluna "Sem contato" e exibir a indicação "Sem data prevista" no lugar dos dias até o próximo contato

### Requisito 4: Dashboard Visual com Cards de Resumo

**User Story:** Como membro do time de deploy, eu quero ver métricas visuais consolidadas no topo do painel, para ter visibilidade rápida do progresso geral do time.

#### Critérios de Aceitação

1. THE Painel SHALL exibir cards de resumo no topo contendo: total de clientes, quantidade de clientes "não iniciados" (0 acompanhamentos ocorridos e 0 contatos realizados), quantidade "em andamento" (ao menos 1 contato ou acompanhamento registrado, mas menos de 4 ocorridos), quantidade "completos" (4 acompanhamentos com status "ocorreu") e total de acompanhamentos realizados no formato "X/Y" onde Y é o número total de clientes multiplicado por 4
2. THE Painel SHALL exibir um card com a distribuição de clientes por líder, mostrando o nome de cada líder e a contagem de clientes atribuídos a ele
3. THE Painel SHALL exibir um card com o número de acompanhamentos atrasados, sendo considerado atrasado todo acompanhamento cuja data prevista seja anterior à data atual e cujo status não seja "ocorreu"
4. WHEN o usuário altera qualquer campo de acompanhamento de um cliente (status de contato, canal, ocorrência ou data), THE Painel SHALL recalcular e atualizar todos os cards de resumo sem necessidade de recarregar a página, em no máximo 1 segundo após a interação
5. THE Painel SHALL exibir um indicador visual de progresso geral que represente graficamente a proporção de acompanhamentos com status "ocorreu" sobre o total de acompanhamentos previstos (total de clientes × 4), exibindo o valor numérico correspondente junto ao elemento gráfico

### Requisito 5: Exportação para Excel

**User Story:** Como membro do time de deploy, eu quero exportar os dados de acompanhamento para Excel, para gerar relatórios e compartilhar informações com gestores.

#### Critérios de Aceitação

1. THE Painel SHALL disponibilizar um botão "Exportar para Excel" visível na área de ações da tela de listagem de clientes
2. WHEN o botão de exportação é acionado, THE Painel SHALL gerar um arquivo Excel com uma planilha contendo uma linha de cabeçalho e uma linha por cliente com as colunas: nome do cliente, líder responsável, fase, telefone, e-mail, cidade, estado, e para cada um dos 4 slots de acompanhamento: data, canal, ocorrência (sim/não) e retorno
3. WHEN filtros estiverem ativos no momento da exportação, THE Painel SHALL exportar apenas os clientes que atendem aos filtros aplicados
4. THE Painel SHALL incluir no nome do arquivo exportado a data atual no formato "acompanhamento_YYYY-MM-DD.xlsx"
5. IF a exportação for acionada e não houver nenhum cliente visível após aplicação dos filtros, THEN THE Painel SHALL exibir uma mensagem informando que não há dados para exportar e não gerar o arquivo
6. IF a geração do arquivo Excel falhar, THEN THE Painel SHALL exibir uma mensagem de erro indicando a falha na exportação sem perda de dados na tela

### Requisito 6: Notificações Semanais por E-mail

**User Story:** Como membro do time de deploy, eu quero receber um resumo semanal por e-mail dos acompanhamentos pendentes, para não esquecer de realizar os contatos programados.

#### Critérios de Aceitação

1. THE Painel SHALL enviar um e-mail semanal toda segunda-feira às 08:00 horário de Brasília para implantacao@doit.com.br
2. THE Painel SHALL incluir no e-mail: lista de clientes com acompanhamento atrasado (com nome do cliente, líder responsável e quantidade de dias em atraso), lista de acompanhamentos previstos para a semana corrente (segunda a sexta), e o progresso geral do time expresso como proporção de acompanhamentos realizados sobre o total (ex: "48/120 acompanhamentos realizados")
3. THE Painel SHALL agrupar no e-mail os clientes por líder responsável para facilitar a distribuição de tarefas
4. IF não houver acompanhamentos atrasados nem previstos na semana corrente, THEN THE Painel SHALL enviar um e-mail confirmando que não há pendências, contendo apenas o progresso geral do time
5. IF o envio do e-mail semanal falhar, THEN THE Painel SHALL registrar a falha no console do Firebase e realizar até 3 tentativas de reenvio com intervalo de 10 minutos entre cada tentativa

### Requisito 7: Filtros e Busca Aprimorados

**User Story:** Como membro do time de deploy, eu quero filtrar e buscar clientes de forma mais completa, para encontrar rapidamente as informações que preciso.

#### Critérios de Aceitação

1. THE Painel SHALL manter os filtros existentes: por urgência, A-Z, por líder, por fase e por status de progresso
2. THE Painel SHALL permitir filtrar clientes por líder específico usando botões dedicados para cada membro do time (Bruno Hideo Toyama, Isabela Soares, Henrique Puertas Stefano, Ana Paula)
3. THE Painel SHALL permitir busca por nome do cliente, nome do projeto, líder, cidade ou estado, aplicando correspondência parcial case-insensitive com atualização dos resultados em no máximo 300ms após parada de digitação
4. WHEN filtros são aplicados em combinação, THE Painel SHALL utilizar lógica AND entre categorias diferentes (fase + líder + status) e lógica OR dentro de uma mesma categoria, atualizando simultaneamente todas as visualizações (lista, kanban, agenda)
5. THE Painel SHALL persistir os filtros selecionados durante a sessão do usuário usando sessionStorage
6. IF nenhum cliente corresponder aos filtros e busca aplicados, THEN THE Painel SHALL exibir uma mensagem "Nenhum cliente encontrado" com sugestão para limpar os filtros

### Requisito 8: Layout Responsivo e Design Visual Atualizado

**User Story:** Como membro do time de deploy, eu quero um design mais visual e moderno com boa experiência em diferentes dispositivos, para usar o painel tanto no computador quanto no celular.

#### Critérios de Aceitação

1. THE Painel SHALL utilizar um layout com sidebar de navegação em telas com largura maior que 1024px e menu hamburguer em telas com largura igual ou inferior a 1024px
2. WHILE a largura da tela for igual ou inferior a 768px, THE Painel SHALL adaptar a visualização Kanban para scroll horizontal, exibindo uma coluna por vez com possibilidade de deslizar entre colunas
3. THE Painel SHALL manter a paleta de cores editorial existente (--forest, --clay, --gold) como identidade visual
4. THE Painel SHALL utilizar cards com sombra de no máximo 4px de blur e espaçamento interno (padding) mínimo de 16px entre os elementos dos cards para garantir hierarquia visual
5. THE Painel SHALL exibir indicadores de urgência com cores consistentes: vermelho (--bad) para acompanhamentos cuja data prevista já passou, amarelo (--warn) para acompanhamentos cuja data prevista está dentro dos próximos 7 dias, e verde (--ok) para acompanhamentos cuja data prevista está a mais de 7 dias
6. THE Painel SHALL garantir que todos os elementos interativos (botões, links, campos) possuam área de toque mínima de 44x44px em telas com largura igual ou inferior a 768px

### Requisito 9: Publicação no GitHub Pages

**User Story:** Como membro do time de deploy, eu quero que o painel esteja publicado online no GitHub Pages, para que todos acessem sem precisar abrir arquivos locais.

#### Critérios de Aceitação

1. THE Painel SHALL ser publicável como site estático no GitHub Pages a partir do branch principal do repositório, com deploy automático via GitHub Actions a cada push no branch main
2. THE Painel SHALL funcionar integralmente como Single Page Application sem necessidade de servidor backend próprio (usando Firebase como serviço externo), incluindo tratamento de rotas via fallback 404.html para compatibilidade com GitHub Pages
3. THE Painel SHALL atingir First Contentful Paint em menos de 3 segundos em conexão de 10 Mbps, verificável via Lighthouse ou DevTools Network throttling
4. THE Painel SHALL ser acessível via URL pública do GitHub Pages para todos os membros do time, retornando HTTP 200 e renderizando o conteúdo principal sem erros no console
5. IF algum recurso externo (Firebase SDK, bibliotecas CDN) falhar ao carregar, THEN THE Painel SHALL exibir mensagem de fallback informando o problema de conectividade sem quebrar a renderização da interface

### Requisito 10: Registro de Acompanhamento

**User Story:** Como membro do time de deploy, eu quero registrar os detalhes de cada acompanhamento realizado, para manter histórico das interações com clientes.

#### Critérios de Aceitação

1. THE Painel SHALL permitir registrar para cada slot de acompanhamento: data do contato (formato DD/MM/AAAA), se o contato foi realizado (sim/não), canal utilizado (WhatsApp, E-mail ou Intercom), retorno do cliente em texto livre com no máximo 500 caracteres e se o acompanhamento ocorreu (sim/não)
2. WHEN um acompanhamento é marcado como "ocorreu", THE Painel SHALL atualizar o progresso do cliente em todas as visualizações (lista, kanban, dashboard) em até 3 segundos
3. THE Painel SHALL exibir a data prevista para cada acompanhamento calculada pela regra: 1º acompanhamento 7 dias após a data de fim da capacitação registrada no cadastro do cliente, seguintes a cada 30 dias corridos a partir do acompanhamento anterior
4. WHEN um registro de acompanhamento é alterado, THE Painel SHALL salvar automaticamente após 2 segundos de inatividade no campo editado e exibir um indicador visual de "salvo" confirmando a gravação
5. IF um acompanhamento foi detectado na agenda (via importação de eventos), THEN THE Painel SHALL pré-preencher o slot com data do contato e canal utilizados no evento importado, e exibir selo "detectado na agenda"
6. IF a data de fim da capacitação não estiver disponível no cadastro do cliente, THEN THE Painel SHALL exibir a data prevista como "pendente" e permitir que o membro do time informe manualmente a data de referência para cálculo
7. IF o campo "acompanhamento ocorreu" for marcado como "sim" e o campo "contato foi realizado" estiver marcado como "não", THEN THE Painel SHALL exibir alerta solicitando confirmação antes de salvar o registro
