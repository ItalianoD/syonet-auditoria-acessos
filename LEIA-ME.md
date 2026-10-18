# SYONET — Auditoria e Acessos · v0.4.0

Extensão independente do Painel SYONET — Usuários. Pode ser carregada ao lado da extensão anterior. Ambiente: **https://disbrava.syonet.com**.

## Instalar no Chrome ou Edge

1. Extraia o ZIP e mantenha a pasta `syonet-auditoria` no computador.
2. Abra `chrome://extensions` (Chrome) ou `edge://extensions` (Edge) e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
4. Clique no ícone da extensão para abrir o painel. Se necessário, fixe-o no menu de extensões.
5. Para usar a conta normal, faça login no Syonet no mesmo navegador e dê **F5 nessa aba após instalar/recarregar a extensão**. Para outra conta, use **Conta de acesso → Entrar com outro login e senha**, conforme as instruções abaixo. A extensão não grava a senha.

Não abra `app.html` por duplo clique para consultar o Syonet: a comunicação autenticada depende da extensão instalada. A prévia local serve para testar interface e arquivos.

Se já instalou uma versão anterior, extraia os arquivos atualizados na mesma pasta e clique em **Recarregar** no cartão da extensão em `chrome://extensions` ou `edge://extensions`. Feche a aba antiga do painel e abra novamente pelo ícone. Confira a versão **0.4.0** na lateral.

## 0.4.0 — entrar com outro login, mantendo as contas separadas

1. Atualize os arquivos, recarregue a extensão no Chrome/Edge e reabra o painel. Confira **0.4.0** na lateral.
2. Nos detalhes da extensão, habilite **Permitir em modo anônimo** (Chrome) ou **Permitir em InPrivate** (Edge). Essa autorização do navegador é necessária uma vez para a sessão separada.
3. Clique em **Conta de acesso**, no topo, ou abra **Fontes de dados → Conta usada pelo painel**.
4. Escolha **Entrar com outro login e senha**, preencha as credenciais da conta alternativa e clique em **Entrar com este login**.
5. O painel abre uma janela anônima do Syonet para essa conta. Mantenha-a aberta. Depois da confirmação, confira o login no topo e faça uma nova consulta.

**A conta das abas normais é mantida.** As consultas, a cópia de acessos e a inativação passam a usar a conta alternativa e suas lojas/permissões. O painel não troca a sessão normal para o usuário digitado. Se houver outra aba anônima do Syonet, feche-a antes: as janelas anônimas compartilham entre si a mesma sessão privada. Esta versão permite uma conta normal e uma conta alternativa por contexto privado do navegador.

O login digitado é sempre autenticado, mesmo que exista outra sessão aberta. O fluxo usa o protocolo nativo do projeto fornecido: chave pública do Syonet, RSA-OAEP/SHA-1 para o payload de login e envio por HTTPS. A resposta é conferida em **/api/sessao/usuario**; somente o usuário com ID e login correspondentes é aceito. A extensão não guarda senha, chave privada ou cookies. O campo de senha é limpo após a tentativa. Digite credenciais somente no formulário da extensão, nunca no chat.

Antes de cada pedido da conta alternativa, o script da aba confirma a identidade da sessão. Se a janela fechar, a sessão expirar ou a conta mudar, a operação é bloqueada. O painel **não muda silenciosamente para a conta normal**. Entrar de novo ou usar a conta normal exige uma escolha explícita. Contas que exigem fluxos exclusivos de SSO/MFA podem recusar a autenticação por login e senha; esses fluxos não são automatizados ou contornados.

Trocar de conta ou tentar novo login limpa os usuários, logs, comparações, prévias e relatórios carregados, para evitar mistura entre contas. Arquivos já exportados continuam no computador. **Limpar dados** apaga os dados carregados e mantém a escolha de conexão. **Desconectar do painel** bloqueia a conta alternativa e fecha somente a aba privada que o painel criou. A conta normal não é desconectada. O encerramento de outras janelas privadas pode ser necessário para o navegador descartar sua sessão privada por completo.

Para voltar à sessão normal, selecione **Usar conta da aba normal do Syonet**. Após atualizar a extensão, dê F5 nessa aba para carregar o script de conexão. O painel não seleciona abas anônimas para o modo normal.

Se o modo anônimo estiver bloqueado por uma política do navegador, não será possível usar duas contas separadas por este recurso. O painel explica a condição e não autentica por cima da sessão normal. Não há serviço auxiliar nem envio das credenciais a terceiros.

### Conexão e diagnóstico

Os pedidos passam por um script isolado na aba do Syonet, com cookies da própria origem. Cookies não são copiados por mensagens. As chamadas JSON solicitam JSON explicitamente. Erros HTTP incluem rota e status e mantêm a cobertura por loja para conferência. Fechar uma aba durante gravação pode deixar resultado incerto; a gravação não é repetida automaticamente.

## 1. Rastrear inatividade

Clique em **Consultar todas as lojas**. A extensão obtém as lojas autorizadas da sessão e consulta os usuários de **cada loja**, usando o mesmo serviço da tela nova do Syonet. Inclui ativos e inativos e reúne os cadastros pelo ID, contando uma única vez quem está em várias lojas. A consulta não depende da loja atual nem da visão selecionada na tela legada.

Abra **Cobertura por loja** para conferir cada loja, quantidade de usuários e eventuais falhas. É possível exportar essa cobertura. Uma falha de loja aparece como consulta parcial, sem ser tratada como lista vazia. Respostas com paginação inesperada também são sinalizadas. A extensão só alcança as lojas autorizadas na sua sessão; não presume acesso a lojas ocultas.

Cada linha mostra **nome completo + login**, ID como informação complementar e as lojas do usuário. O cadastro completo da API é consultado para recuperar nome e sobrenome. Se um dado não puder ser obtido, a linha recebe aviso; números de ID não são apresentados como nomes. A busca de comparação também consulta todas as lojas e os nomes do cadastro.

O último acesso vem da coluna **Data Acesso** do **Histórico de Acessos** de cada cadastro. A extensão seleciona a maior data de entrada retornada, sem usar a data de saída. O histórico observado retorna até 200 registros. A leitura usa até três usuários em paralelo. Se o histórico falhar, o usuário continua na lista, com data desconhecida e aviso.

- O limite inicial é **mais de 30 × 24 horas**, ajustável entre 1 e 3650 dias.
- Filtre por nome, login, ID, loja e situação. A busca de nomes desconsidera acentos.
- Contas já inativas ficam identificadas e não oferecem nova inativação.
- Data ausente, inválida ou futura não comprova inatividade e não habilita o botão.
- **Exportar CSV** inclui as linhas filtradas, lojas, avisos, limite, origem e instante da análise.
- Nenhuma empresa da sessão é trocada durante a varredura.

### Inativar uma conta no próprio Syonet

Nas contas **ativas**, consultadas online e acima do limite, aparece **Inativar…**. Clique para preparar a prévia, conferir nome completo, login, ID, lojas, último acesso e pendências. Digite a frase exibida, como **INATIVAR 90002**, e confirme. A inativação afeta o cadastro do usuário em todas as suas lojas.

O botão grava a situação **ativo = false** pela API de cadastro usada pelo próprio Syonet e relê o usuário para confirmar. Perfil, lojas, permissões e vínculos de equipe são mantidos no cadastro inativo. Não são feitas transferências de leads nem exclusões de equipes ou do cadastro.

A preparação consulta a validação nativa de dependências. Eventos/leads, distribuição de tipos de evento, gerência de áreas ou agendas pendentes bloqueiam a operação: resolva essas pendências no Syonet e prepare novamente. Consultas incompletas, ausência de acesso a alguma loja do usuário, conta própria e último acesso não confirmado também bloqueiam. Vínculos de equipe são informados e mantidos.

A prévia expira após cinco minutos. Imediatamente antes de gravar, o painel relê cadastro, sessão, histórico e dependências. Mudanças desde a prévia impedem a gravação. Cópias de acesso e inativações compartilham o bloqueio entre abas da mesma extensão. Não existe inativação automática ou em lote.

O resultado permite baixar um relatório. Em falha de rede ou resposta não confirmada, a gravação pode ter ocorrido: reconsulte a conta antes de tentar novamente. Não há repetição automática da gravação. Arquivos importados e demonstração não habilitam inativação real.

Também é possível importar usuários em JSON, JSONL, CSV ou TSV. CSV com vírgula, ponto e vírgula ou tabulação é reconhecido. Limites: 10 MB e 20.000 usuários. IDs repetidos geram erro para evitar contagens duplicadas.

## 2. Transformar logs em frases

Conforme combinado, esta versão começa com **importação de arquivos de logs de alterações**. Abra **Logs legíveis → Importar logs** e selecione JSON, JSONL, CSV ou TSV (até 10 MB / 50.000 registros).

Exemplo de entrada:

```json
{
  "usuario": "Pessoa de exemplo",
  "acao": "UPDATE",
  "entidade": "Configuração da loja",
  "idEmpresa": 9,
  "dataHora": "2026-10-17T10:00:00-03:00",
  "campo": "Horário de atendimento",
  "valorAnterior": "18:00",
  "valorNovo": "19:00"
}
```

Gera uma frase informando quem alterou o campo, loja, data e valores anterior/novo. Aceita ações como UPDATE/ALTERACAO, CREATE/INSERT/INCLUSAO, DELETE/EXCLUSAO e LOGIN/LOGOUT. Ações desconhecidas recebem sinalização; a extensão não inventa seu significado.

Cada frase permite abrir o registro de origem e exportar um CSV legível. A tradução é feita por regras locais, sem IA, chave de API ou serviço externo. Formatos de texto livre `.log` sem colunas/chaves precisam de um adaptador a partir de uma amostra; esta versão aceita os formatos estruturados acima.

Os aliases reconhecidos estão em `lib/logs.js` (`FIELDS`). Caso o arquivo tenha nomes diferentes dos aliases, renomeie as colunas ou adapte esse mapa. Para arquivos JSON com uma lista dentro de outro objeto, informe o caminho em **Fontes de dados → Caminho da lista de logs no JSON**. Exemplo: `resultado.registros`.

Uma rota JSON opcional pode ser configurada depois, mas a extensão não pressupõe nem tenta adivinhar um endpoint de auditoria de alterações.

## 3. Comparar permissões

Em **Comparar acessos**, escolha duas pessoas da lista carregada ou busque por nome, login ou ID no Syonet. Os cadastros de pessoas da consulta online são relidos antes de comparar.

A comparação apresenta perfil/grupo, diferenças de lojas retornadas pelo cadastro e permissões por **código, categoria e escopo**. Na tela legada observada, o Syonet inclui uma matriz com quatro bits por objeto: visualizar, incluir, alterar e excluir. A extensão lê os literais dessa matriz, sem executar scripts da página. O número de objetos pode variar por ambiente.

- **Somente A/B** exige que ambos os lados informem o estado da mesma permissão: permitido em um, não permitido no outro.
- Se um lado não informar um código, o resultado é **Não confirmado**.
- Uma matriz ausente, inválida ou com códigos repetidos não produz uma conclusão de igualdade completa.
- Perfis iguais não comprovam acesso efetivo igual. Equipes, horários, políticas de acesso e regras de distribuição não fazem parte desta comparação.
- A exportação JSON contém os estados consultados e as ressalvas de cobertura.

Para comparar arquivos importados, use `permissoes` em cada usuário, conforme `exemplos/usuarios-ficticios.json`. Strings de nomes de permissões sem estado explícito não são consideradas suficientes.

## 4. Copiar permissões, perfil, lojas e equipes

Em **Comparar acessos**, selecione dois usuários consultados online. Depois, use **Copiar acessos entre os usuários**:

1. Escolha **A → B** ou **B → A**. A referência é lida; o destino recebe as alterações.
2. Marque os escopos desejados. As quatro opções começam selecionadas: permissões, perfil (grupo), lojas e equipes.
3. Escolha **Somar** ou **Espelhar** para lojas e equipes.
4. Clique em **Preparar prévia da cópia**. Confira o login e o ID do destino, o perfil, as lojas e os papéis das equipes. A lista de estados de permissão pode ser expandida.
5. Baixe os acessos atuais. O JSON contém o estado anterior do destino e a referência, sem senha nem dados completos do cadastro. É uma cópia para conferência e recuperação **manual**, não um botão de restauração.
6. Marque que guardou os acessos e conferiu os usuários. Digite a frase mostrada, como **APLICAR 90002**, e clique no botão que identifica o destino.
7. Aguarde o resultado. Baixe o relatório da aplicação e confira qualquer aviso ou resultado parcial.

**Somar** mantém as lojas e os papéis de equipe adicionais do destino e inclui os da referência. Mantém também a empresa padrão do destino. **Espelhar** pode retirar lojas e papéis adicionais e copia a empresa padrão da referência. A retirada de lojas depende da validação de vínculos do Syonet; leads, agendas ou outras dependências podem impedir essa retirada.

Nos dois modos, **perfil e permissões selecionados são copiados exatamente da referência**. Isso inclui estados que representam restrições, não apenas permissões liberadas. O perfil corresponde a `idGrupo`; nível, função, dados pessoais e responsabilidades de gerente não são copiados. A cópia de equipes trata **membro e visualizador separadamente**, preservando os demais participantes.

A cópia de equipes cobre as áreas Disbrava configuradas no catálogo herdado do projeto anterior e as novas equipes validadas nessas áreas. A preparação cruza as lojas dos dois usuários com as lojas autorizadas da sessão, valida os formulários e procura vínculos fora do catálogo. Áreas não configuradas, identidades divergentes ou consultas incompletas bloqueiam a cópia quando identificadas. Novas áreas globais podem exigir atualização do catálogo.

A extensão usa o botão nativo **Aplicar Alteração** da aba Permissões, por área Menu/Interface/Relatórios. Objetos divergentes que não possuam controles de edição nessa tela bloqueiam a cópia de permissões antes da gravação. A cópia não executa os scripts das páginas recebidas.

A prévia expira em dez minutos. Antes da primeira gravação de acesso, a extensão relê referência e destino e compara seus acessos com a prévia. Duas cópias simultâneas em abas da mesma extensão são bloqueadas. Durante as etapas de equipe, a empresa da sessão pode ser selecionada temporariamente; o painel tenta restaurar a empresa anterior e informa falhas de restauração. Evite trocar a empresa em outra aba enquanto a cópia estiver em andamento.

**A aplicação tem várias etapas e não é uma transação única.** Uma falha pode deixar perfil, permissões ou algumas equipes já alterados. A extensão interrompe as próximas etapas, não repete gravações e não desfaz alterações automaticamente. Em caso de timeout, o servidor pode ter aplicado a etapa mesmo sem retornar a resposta. Consulte o relatório, releia o destino e prepare uma nova prévia antes de tentar novamente.

Os arquivos importados e a demonstração permanecem disponíveis para comparação, mas não habilitam aplicação em contas reais. Referência e destino precisam ser consultados online e estar ativos.

## Campos e datas

Os campos comuns são reconhecidos automaticamente. Os nomes de coluna e caminhos com ponto podem ser ajustados em **Fontes de dados**, sem editar código. As configurações valem apenas para a aba atual.

Datas: `17/10/2026 15:00`, `2026-10-17T15:00:00-03:00`, ISO com `Z` e timestamps Unix em segundos ou milissegundos. Datas sem fuso usam **UTC−03:00**; o relatório exibe datas em `America/Araguaina`.

Em **Fontes de dados → Consultar lista personalizada**, consultas JSON personalizadas carregam **uma resposta**. Essa opção é independente da varredura de todas as lojas. Quando uma API é paginada, exporte todos os registros pelo Syonet ou adapte a consulta; a extensão não apresenta essa resposta como uma varredura completa.

## Privacidade e operação

Os usuários e logs ficam somente na memória da aba. Recarregar, fechar ou usar **Limpar dados** descarta esses dados. A escolha de conexão e os metadados de identidade (ID, nome, login e aba) ficam no sessionStorage da própria aba para preservar a escolha após recarga; senha e cookies não são gravados nesse armazenamento. Arquivos que você exportou permanecem no computador.

As consultas usam GET. Desde a versão 0.2.0, a aplicação explicitamente confirmada da cópia usa PATCH do cadastro e POST dos formulários nativos de permissões e equipes. Desde a versão 0.3.0, a confirmação individual de inativação também usa PATCH do cadastro. Não há exclusão de usuários. O uso de cookies e das regras de cabeçalho segue a integração do projeto de referência. Não há telemetria, bibliotecas remotas ou envio dos arquivos importados.

Campos estruturados de senha, token, segredo, cookie e CPF são mascarados na visualização de origem dos logs. Isso não substitui uma revisão dos arquivos: textos livres e outros dados pessoais podem permanecer. Os relatórios devem ser guardados de acordo com a rotina da TI.

## Verificações e limites desta entrega

- Foi possível navegar no ambiente Disbrava, confirmar a leitura GET do cadastro, o histórico embutido e a matriz de 415 objetos no usuário observado. Nenhuma alteração de cadastro foi salva.
- Os leitores, cálculos, estados desconhecidos, filtros, importação, comparação e exportação possuem verificações locais. Dados dos exemplos e dos testes são fictícios.
- A instalação da extensão e uma varredura completa autenticada no Chrome/Edge do usuário ainda devem ser conferidas após carregar o pacote. Não foi executada uma varredura de produção em massa.
- O novo fluxo de cópia foi testado localmente nos modos Somar e Espelhar, incluindo preservação de terceiros, confirmação do destino, prévia vencida, alteração concorrente e falhas parciais. O botão e os parâmetros do formulário nativo foram inspecionados no ambiente Disbrava. **Nenhuma cópia foi aplicada em uma conta real durante o desenvolvimento**; a primeira gravação real ainda precisa ser validada em um destino apropriado.
- A rota de listagem foi conferida em sessão autenticada. Nenhum cadastro, relatório ou histórico real acompanha este repositório. Essa conferência não substitui a validação da extensão instalada e do novo login em uma conta apropriada.
- A versão 0.4.0 passou em **58 testes locais**, incluindo criptografia conferida por descriptografia, autenticação obrigatória do login escolhido, conta divergente, senha recusada, criação/fechamento de sessão privada, manutenção da aba normal, restrições de mensagens, conferência de identidade antes de pedidos e ausência de senha/cookies no armazenamento. A interface foi conferida no navegador com dados e senha fictícios, incluindo limpeza do campo após tentativa. As 12 verificações de leitores HTML continuam disponíveis.
- **O novo login não foi executado com credenciais reais nem instalado em Chrome/Edge com duas contas reais durante o desenvolvimento.** Essa conferência deve ser feita após atualizar o pacote e habilitar a extensão no modo anônimo. Nenhuma conta real foi inativada ou teve seus acessos alterados.
- Os logs de alterações começam por arquivo, conforme a escolha do usuário. Não foi validado endpoint de auditoria de alterações.
- Mudanças futuras no HTML do Syonet podem exigir ajuste do leitor. Erros de cadastro/permissão retornam falha ou resultado parcial, sem converter falta de dados em permissão negada ou inatividade comprovada.

## Desenvolvimento

Não há dependências de execução nem etapa de compilação. Os módulos da extensão são JavaScript local.

```text
node --test tests/core.test.js tests/copy.test.js tests/directory.test.js tests/deactivate.test.js tests/session.test.js tests/auth.test.js
```

O teste `tests/browser.html` verifica os leitores com DOMParser em navegador, usando somente HTML fictício. Sirva a pasta em um servidor HTTP local para abrir esse teste e a prévia do painel. Os testes não consultam o Syonet real.

Novos módulos: `lib/directory.js` (varredura por loja), `lib/deactivate.js` (inativação conferida) e `lib/deactivate-ui.js` (prévia e relatório).

Principais arquivos: `lib/api.js` (consultas), `lib/portal.js` (leitor do cadastro), `lib/data.js` (arquivos/datas/inatividade), `lib/permissions.js` (comparação), `lib/logs.js` (tradução), `lib/copy-plan.js` (prévia), `lib/access-copy.js` (aplicação e releitura) e `lib/access-write.js` (operações de gravação restritas).

Para outro domínio, ajuste conjuntamente `config.js`, `manifest.json`, `rules.json` e o link de login em `app.html`. Esta entrega está configurada somente para Disbrava.

## Referências técnicas da conexão

A conexão segue a separação documentada pelo Chrome entre [requisições de extensão e de content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) e [mensagens para abas](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-sendMessage). O script é carregado somente no portal Disbrava. Não há escuta de mensagens da página nem conexão com outros domínios.

A separação usa o [modo spanning de extensões](https://developer.chrome.com/docs/extensions/reference/manifest/incognito), com a interface na janela normal e a conexão na aba privada. O acesso ao modo anônimo depende da [autorização nos detalhes da extensão](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions#allow-access), conforme a documentação do Chrome. Não foram adicionados outros domínios às permissões.
