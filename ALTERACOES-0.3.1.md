# Versão 0.3.1 — conexão autenticada e correção do HTTP 404

- Chamadas passam pela aba autenticada do Syonet, com cookies da própria origem; a extensão não copia cookies nem pede senha.
- API solicita application/json; páginas legadas solicitam text/html. O cabeçalho misto foi removido.
- A conexão é exclusiva com o domínio Disbrava e com mensagens internas da própria extensão; não recebe comandos da página.
- Leituras, cópia de acessos e inativação usam a mesma conexão. Rotas de gravação permanecem restritas e não são repetidas em falhas.
- Mensagens de conexão orientam abrir/login/F5 no Syonet. Erros HTTP incluem rota. Falhas em todas as lojas mantêm a tabela de cobertura para conferência.

**Ao atualizar:** recarregue a extensão e dê F5 na aba do Syonet. Mantenha essa aba aberta e reabra o painel. Confira 0.3.1 na lateral.

Validação: rota de listagem conferida em sessão autenticada, sem gravação em conta real. Nenhum dado consultado foi incluído no projeto. A extensão instalada e o primeiro login real ainda precisam ser conferidos no navegador do usuário.

44 testes locais passaram, incluindo o fluxo de mensagens e os bloqueios, além dos leitores de HTML já verificados no navegador. Os dados de testes são fictícios; nenhum cadastro real foi incluído nos arquivos da extensão.
