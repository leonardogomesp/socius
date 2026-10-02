import { chromium } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
const executablePath = process.env.BROWSER_PATH;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath
    ? { executablePath }
    : process.platform === 'win32'
      ? { channel: 'msedge' }
      : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const url = process.env.PANEL_URL || 'http://127.0.0.1:3000';
const output = path.resolve('docs/screenshots');
await fs.mkdir(output, { recursive: true });
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page
    .locator('.connection')
    .filter({ hasText: 'Tempo real conectado' })
    .waitFor({ timeout: 20000 });
  await page.getByRole('heading', { name: 'Um lugar para voltar.' }).waitFor();
  if (await page.getByText('Seu mundo', { exact: true }).count())
    throw new Error('O estado real do servidor nao carregou.');
  // The screenshots are public artifacts; hide the live join code in the DOM.
  await page
    .locator('.join-code strong')
    .evaluateAll((elements) => elements.forEach((element) => (element.textContent = '••••••')));
  await page.screenshot({ path: path.join(output, 'overview-desktop.png'), fullPage: true });
  const session = await (await page.request.get(url + '/api/session')).json();
  const headers = { 'x-manager-token': session.token };
  const catalog = await (await page.request.get(url + '/api/worlds', { headers })).json();
  await page.getByRole('button', { name: 'Mundos', exact: true }).click();
  await page.getByRole('heading', { name: 'Cada mundo, sua aventura.' }).waitFor();
  const activeProfile = catalog.profiles.find((profile) => profile.id === catalog.activeProfileId);
  if (activeProfile) {
    if ((await page.getByLabel('Nome do servidor').inputValue()) !== activeProfile.serverName)
      throw new Error('Nome salvo nao carregou.');
    if ((await page.getByLabel('Porta UDP principal').inputValue()) !== String(activeProfile.port))
      throw new Error('Porta salva nao carregou.');
    if ((await page.getByLabel('Substituir senha').inputValue()) !== '')
      throw new Error('Senha foi preenchida sem acao explicita.');
    await page.getByRole('button', { name: 'Mostrar senha', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'worlds-desktop.png'), fullPage: true });
    const otherProfile = catalog.profiles.find((profile) => profile.id !== catalog.activeProfileId);
    if (otherProfile) {
      await page.getByRole('button').filter({ hasText: otherProfile.worldName }).first().click();
      if ((await page.getByLabel('Nome do servidor').inputValue()) !== otherProfile.serverName)
        throw new Error('Configuracoes do perfil selecionado incorretas.');
      const after = await (await page.request.get(url + '/api/worlds', { headers })).json();
      if (after.activeProfileId !== catalog.activeProfileId)
        throw new Error('Selecionar perfil mudou o servidor.');
      await page.getByRole('button').filter({ hasText: activeProfile.worldName }).first().click();
    }
    const snapshot = await (await page.request.get(url + '/api/snapshot', { headers })).json();
    if (!snapshot.busy && ['ready', 'starting', 'unhealthy'].includes(snapshot.server.state)) {
      await page.getByRole('button', { name: 'Salvar configuracoes', exact: true }).click();
      await page.getByRole('alertdialog').waitFor();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    }
  }
  await page.getByRole('button', { name: 'Criar novo mundo', exact: true }).click();
  await page.getByRole('heading', { name: 'Um novo mundo', exact: true }).waitFor();
  await page.getByLabel('Nome do mundo').fill('Rascunho nao salvo');
  await page.getByLabel('Senha', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Criar mundo', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Backups/ }).click();
  await page.getByRole('heading', { name: 'Seu progresso, protegido.' }).waitFor();
  const restore = page.getByRole('button', { name: 'Restaurar', exact: true });
  if ((await restore.count()) && (await restore.first().isEnabled())) {
    await restore.first().click();
    await page.getByRole('alertdialog').waitFor();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    if (await page.getByRole('alertdialog').count()) throw new Error('Confirmacao nao fechou.');
  }
  await page.screenshot({ path: path.join(output, 'backups-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Console', exact: true }).click();
  await page.getByRole('heading', { name: 'Por dentro do servidor.' }).waitFor();
  await page.getByRole('textbox', { name: 'Filtrar logs' }).fill('nonexistent-log-line');
  await page.getByRole('textbox', { name: 'Filtrar logs' }).fill('');
  await page.getByRole('button', { name: 'Atividade', exact: true }).click();
  await page.getByRole('heading', { name: 'Tudo que aconteceu.' }).waitFor();
  // Verify the client reconnects after a brief loss of network.
  await context.setOffline(true);
  await page
    .locator('.connection')
    .filter({ hasText: 'Atualizacao por consulta' })
    .waitFor({ timeout: 10000 });
  await context.setOffline(false);
  await page
    .locator('.connection')
    .filter({ hasText: 'Tempo real conectado' })
    .waitFor({ timeout: 20000 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Visao geral', exact: true }).click();
  await page
    .locator('.join-code strong')
    .evaluateAll((elements) => elements.forEach((element) => (element.textContent = '••••••')));
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    throw new Error('Overflow horizontal no desktop.');
  await page.screenshot({
    path: path.join(output, 'overview-compact-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Mundos', exact: true }).click();
  await page.getByRole('heading', { name: 'Cada mundo, sua aventura.' }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    throw new Error('Overflow horizontal na tela Mundos.');
  await page.screenshot({ path: path.join(output, 'worlds-compact-desktop.png'), fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'Interface verificada: desktop em 1440 e 1280 pixels, perfis, formularios, confirmacoes e reconexao.',
  );
} finally {
  await browser.close();
}
