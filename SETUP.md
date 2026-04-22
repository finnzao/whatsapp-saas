# Fix de autenticação — versão com debug logs

Essa versão adiciona logs `[auth]` e `[api]` no console do browser para diagnosticar o loop.

## Aplicando

1. Extraia o zip
2. O frontend (Next) faz hot reload automático, mas pra ter certeza:
   - Pare o `npm run dev`
   - `localStorage.clear()` no console do browser
   - Feche a aba
   - Suba `npm run dev`
   - Abra aba nova em `http://localhost:3000/login`

## Como debugar

Depois de aplicar, abra o DevTools (F12) → aba **Console**, faça login e observe a sequência de logs:

### Cenário esperado (funcionando)

```
[auth] rehydrate OK { hasToken: false }
[auth] hydrated { hasToken: false }

-- depois do submit --
[auth] setAuth { email: "admin@loja.com" }
[auth] hardRedirect → /conversas

-- nova página --
[auth] rehydrate OK { hasToken: true }
[auth] hydrated { hasToken: true }
```

### Cenário com bug — cada tipo aponta causa diferente

**Se aparecer:**
```
[auth] clearAuth (stack)
  at ... algum arquivo
```
O `clearAuth` está sendo chamado indevidamente. O `stack` aponta quem chamou. Me mande os logs.

**Se aparecer:**
```
[api] 401 { url: "/conversations", hadToken: true, hydrated: false }
```
Alguma requisição está saindo antes da hidratação terminar. Agora o interceptor não redireciona nesse caso.

**Se aparecer:**
```
[auth] rehydrate OK { hasToken: true }
[auth] hydrated { hasToken: true }
[AuthGuard] sem auth após hidratação, redirect → /login
```
Race entre a hidratação e os seletores do Zustand. Raro, mas possível com Fast Refresh.

## Mudanças técnicas

1. **Redirect via `window.location.assign()`** em vez de `router.push()`. Mais agressivo — força navegação completa, evita estados fantasma do Next.

2. **Guard no submit do login** — `if (login.isPending || login.isSuccess) return;` evita re-submit mesmo se o form remontar.

3. **Botão desabilitado** enquanto pending ou success — extra proteção contra duplo clique.

4. **LoginPage redireciona se já autenticado** — se você cair em `/login` com token válido, vai direto pra `/conversas`.

5. **Interceptor mais conservador** — só redireciona para login se `_hydrated && token && !isAuthRoute`. Se não tem token ainda ou não hidratou, deixa o 401 passar como erro normal.

6. **AuthGuard com duplo render** — `!hydrated` mostra "Carregando...", `!isAuthenticated` mostra "Redirecionando para login..." e chama `window.location.assign()`.

## Próximo passo

Me mande os logs do console após uma tentativa de login. Com os logs conseguimos identificar o momento exato onde o loop acontece.
