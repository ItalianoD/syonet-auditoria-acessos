# Versão 0.3.0

- Consulta cada loja autorizada por /api/usuario?idEmpresa=ID, sem usar a lista lateral nem trocar a empresa atual.
- Inclui ativos e inativos e deduplica por ID; mostra cobertura e falhas por loja, com exportação.
- Consulta o cadastro completo para nome + sobrenome e login; ID fica como detalhe.
- Mantém cadastros mesmo quando o histórico falha; data desconhecida não permite inativação.
- Acrescenta lojas, filtro por loja, busca sem acentos e avisos na tabela/CSV.
- Busca de comparação procura nome completo ou login em todas as lojas autorizadas.
- Adiciona Inativar… por usuário ativo acima do limite, com prévia, confirmação, verificação de pendências, releitura antes/depois e relatório.
- Inativação usa PATCH do próprio Syonet, preservando perfil, lojas, permissões e equipes. Conta própria, lojas inacessíveis, consultas incompletas e pendências operacionais impedem a ação.
- Lista JSON personalizada passa a ter botão separado, sem substituir a varredura de todas as lojas.

Validação: 35 testes de lógica e 12 verificações de leitores HTML passaram. Interface validada com dados fictícios em três lojas, incluindo falhas parciais e respostas de gravação sem efeito. Nenhuma conta real foi alterada; nova varredura completa e gravação real não foram executadas nesta entrega.
