# Soroban — Prática de Cálculo

Jogo web do ábaco japonês (soroban) para prática de soma e subtração,
com ranking de pontuação. Ideia da Profª Joseana Fechine — UFCG,
Ciência da Computação.

## Estrutura do projeto

```
index.html          página principal (estrutura/HTML)
style.css            todo o visual do jogo
script.js             toda a lógica/interatividade do jogo
config.example.js    modelo de configuração do Firebase (vai pro git)
config.js             configuração REAL do Firebase (NÃO vai pro git)
.gitignore            garante que config.js nunca seja commitado
```

## Configurando o Firebase (ranking compartilhado)

O jogo funciona sem nenhuma configuração — nesse caso, cada aparelho
guarda sua própria pontuação, sem compartilhar com os demais.

Para ter um ranking único, compartilhado entre todos os jogadores:

1. Copie `config.example.js` para um novo arquivo chamado `config.js`.
2. Preencha `config.js` com os dados do seu projeto Firebase (Console
   do Firebase → Configurações do projeto → Seus apps → SDK).
3. No Console do Firebase, vá em **Build → Realtime Database → Regras**
   e publique:
   ```json
   {
     "rules": {
       "rankings": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```

Note que `config.js` já está preenchido neste projeto com os dados
reais fornecidos anteriormente — só confira se ainda são os corretos
antes de publicar.

### Sobre segurança do apiKey

O `apiKey` do Firebase para apps web não é um segredo como uma senha —
ele só identifica o projeto, e é normal que apareça no código do
navegador (qualquer visitante consegue vê-lo pelo DevTools, esteja ele
num arquivo separado ou não). A proteção de verdade contra uso indevido
são as **regras do Realtime Database** configuradas acima, não o fato
de `config.js` estar fora do git. Manter `config.js` fora do
repositório é uma boa prática de organização (evita vazar o arquivo
por engano em buscas do GitHub, undo de commits, etc.), mas não
substitui as regras do banco.

## Publicando no GitHub Pages

1. Suba todos os arquivos deste projeto para um repositório no GitHub
   (incluindo o `config.js` preenchido, já que o GitHub Pages precisa
   dele publicado para o site funcionar com o Firebase).
2. Vá em **Settings → Pages**, selecione a branch `main` e a pasta
   `/ (root)`, salve.
3. Acesse o link `https://seu-usuario.github.io/nome-do-repositorio/`.

Se preferir manter `config.js` fora do controle de versão mesmo assim
(por organização), lembre de fazer o upload dele manualmente sempre
que atualizar o repositório, ou usar uma GitHub Action que o gere a
partir de um "secret" do repositório antes do deploy.
