# Versão 0.4.0 — outro login em sessão separada

- Adiciona Conta de acesso no topo e formulário de login/senha em Fontes de dados.
- Mantém a conta das abas normais e usa uma janela anônima/InPrivate para a conta alternativa. Exige habilitar a extensão no modo anônimo nos detalhes do navegador.
- Sempre autentica o login digitado, sem aproveitar silenciosamente a conta que já estava aberta.
- Usa RSA-OAEP/SHA-1 do protocolo nativo para o payload e HTTPS para o Syonet. A senha é limpa do formulário após a tentativa e não é gravada pela extensão.
- Confere ID e login antes de liberar a conta e antes de cada pedido dessa conexão. Falhas não acionam a conta normal como alternativa.
- Trocar de conta limpa dados, comparações e prévias; Desconectar do painel bloqueia a conta alternativa e fecha somente a aba privada criada pelo painel.
- O modo de conta normal ignora abas anônimas. A interface permanece em uma janela normal, inclusive ao abrir pelo ícone na janela privada.
- O domínio autorizado continua somente disbrava.syonet.com. Não há serviço auxiliar nem nova permissão de cookies.

Validação: 58 testes locais passaram, incluindo criptografia, identidade, falhas de login, fechamento da aba e isolamento. Interface validada com dados fictícios. O login com duas contas reais ainda precisa ser conferido após instalar a atualização e habilitar o modo anônimo. Nenhuma credencial real foi usada ou incluída no pacote.
